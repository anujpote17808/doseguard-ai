import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ENV } from '../lib/aws';
import { listActiveCaregiversForPatient, recordAuditEvent } from '../lib/caregiverAuth';
import { logger } from '../lib/http';
import { dispatchIdempotentNotification } from '../lib/notificationService';
import { DoseRecord } from '../types/models';
import { ReminderWorkflowResult } from './reminderWorkflowHandler';

export interface WorkflowStatusCheckOutcome {
  outcome: 'CONFIRMED_IN_TIME' | 'ESCALATED_TO_CAREGIVERS';
  patientId: string;
  medicationId: string;
  doseId: string;
  caregiversNotified: number;
  checkedAt: string;
}

export const handler = async (
  event: ReminderWorkflowResult
): Promise<WorkflowStatusCheckOutcome> => {
  if (!event?.patientId || !event?.doseId) {
    throw new Error('INVALID_STATUS_CHECK_INPUT: patientId and doseId are required.');
  }

  const nowIso = new Date().toISOString();

  // Step 8: Check the dose status in DynamoDB after the Wait window
  const doseRes = await ddb.send(
    new GetCommand({
      TableName: ENV.DOSES_TABLE,
      Key: {
        patientId: event.patientId,
        doseId: event.doseId,
      },
    })
  );

  const dose = doseRes.Item as DoseRecord | undefined;

  // Step 9: If taken during the response window, record successful completion and prevent escalation
  if (dose && dose.status === 'TAKEN') {
    await ddb.send(
      new UpdateCommand({
        TableName: ENV.DOSES_TABLE,
        Key: {
          patientId: event.patientId,
          doseId: event.doseId,
        },
        UpdateExpression: 'SET workflowStatus = :wfStatus, updatedAt = :now',
        ExpressionAttributeValues: {
          ':wfStatus': 'CONFIRMED_IN_TIME',
          ':now': nowIso,
        },
      })
    );

    await recordAuditEvent({
      actorUserId: 'STEP_FUNCTIONS_WORKFLOW',
      patientId: event.patientId,
      action: 'WORKFLOW_COMPLETED_DOSE_CONFIRMED',
      resourceId: event.doseId,
    });

    logger('INFO', 'WORKFLOW_DOSE_CONFIRMED_ESCALATION_PREVENTED', {
      patientId: event.patientId,
      doseId: event.doseId,
    });

    return {
      outcome: 'CONFIRMED_IN_TIME',
      patientId: event.patientId,
      medicationId: event.medicationId,
      doseId: event.doseId,
      caregiversNotified: 0,
      checkedAt: nowIso,
    };
  }

  // Step 10: If not taken, mark as MISSED (unless already TAKEN via race condition) and notify connected caregivers
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: ENV.DOSES_TABLE,
        Key: {
          patientId: event.patientId,
          doseId: event.doseId,
        },
        UpdateExpression:
          'SET #status = :missed, missedAt = :now, workflowStatus = :wfStatus, updatedAt = :now',
        ConditionExpression: '#status <> :taken',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':missed': 'MISSED',
          ':taken': 'TAKEN',
          ':wfStatus': 'ESCALATED',
          ':now': nowIso,
        },
      })
    );
  } catch (err: unknown) {
    const errName = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
    if (errName === 'ConditionalCheckFailedException') {
      // Patient confirmed right at the boundary
      return {
        outcome: 'CONFIRMED_IN_TIME',
        patientId: event.patientId,
        medicationId: event.medicationId,
        doseId: event.doseId,
        caregiversNotified: 0,
        checkedAt: nowIso,
      };
    }
    throw err;
  }

  const activeCaregivers = await listActiveCaregiversForPatient(event.patientId);
  const medLabel = event.medicationName || dose?.medicationName || 'Scheduled Medication';
  const dosageLabel = event.dosageDescription || dose?.dosageDescription || '';

  // Also record a missed-dose alert on the patient's own notification feed
  await dispatchIdempotentNotification({
    idempotencyKey: `missed-patient#${event.doseId}#${event.patientId}`,
    recipientUserId: event.patientId,
    patientId: event.patientId,
    doseId: event.doseId,
    medicationId: event.medicationId,
    type: 'CAREGIVER_MISSED_DOSE_ALERT',
    title: `Missed Dose Escalated (${event.scheduledTime})`,
    message: `Your scheduled dose of ${medLabel} (${dosageLabel}) was not confirmed within the response window. Connected caregivers (${activeCaregivers.length}) have been notified.`,
    sendExternalAlert: false,
  });

  // Notify each active caregiver idempotently (retries will not duplicate notifications)
  for (const caregiver of activeCaregivers) {
    await dispatchIdempotentNotification({
      idempotencyKey: `missed#${event.doseId}#${caregiver.caregiverId}`,
      recipientUserId: caregiver.caregiverId,
      patientId: event.patientId,
      doseId: event.doseId,
      medicationId: event.medicationId,
      type: 'CAREGIVER_MISSED_DOSE_ALERT',
      title: `Caregiver Escalation: ${caregiver.patientName} Missed Dose`,
      message: `${caregiver.patientName} did not confirm their scheduled ${event.scheduledTime} dose of ${medLabel} (${dosageLabel}). Please check in with them.`,
      sendExternalAlert: true,
    });
  }

  await recordAuditEvent({
    actorUserId: 'STEP_FUNCTIONS_WORKFLOW',
    patientId: event.patientId,
    action: 'WORKFLOW_MISSED_DOSE_ESCALATED',
    resourceId: event.doseId,
    metadata: { caregiversNotified: activeCaregivers.length },
  });

  logger('INFO', 'WORKFLOW_MISSED_DOSE_ESCALATED', {
    patientId: event.patientId,
    doseId: event.doseId,
    caregiversNotified: activeCaregivers.length,
  });

  return {
    outcome: 'ESCALATED_TO_CAREGIVERS',
    patientId: event.patientId,
    medicationId: event.medicationId,
    doseId: event.doseId,
    caregiversNotified: activeCaregivers.length,
    checkedAt: nowIso,
  };
};

