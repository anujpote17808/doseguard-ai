import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ENV } from '../lib/aws';
import { recordAuditEvent } from '../lib/caregiverAuth';
import { logger } from '../lib/http';
import { dispatchIdempotentNotification } from '../lib/notificationService';
import { buildDoseId, getTodayDateInTimezone } from './doseHandler';
import { DoseRecord, Medication, ReminderWorkflowEvent } from '../types/models';

export interface ReminderWorkflowResult {
  action: 'SKIPPED_INACTIVE' | 'ALREADY_TAKEN' | 'REMINDER_SENT';
  patientId: string;
  medicationId: string;
  doseId: string;
  scheduledDate: string;
  scheduledTime: string;
  responseWindowSeconds: number;
  medicationName?: string;
  dosageDescription?: string;
}

export const handler = async (
  event: ReminderWorkflowEvent
): Promise<ReminderWorkflowResult> => {
  if (!event?.patientId || !event?.medicationId) {
    throw new Error('INVALID_WORKFLOW_EVENT: patientId and medicationId are required.');
  }

  const medRes = await ddb.send(
    new GetCommand({
      TableName: ENV.MEDICATIONS_TABLE,
      Key: {
        patientId: event.patientId,
        medicationId: event.medicationId,
      },
    })
  );

  const medication = medRes.Item as Medication | undefined;
  const scheduledDate =
    event.scheduledDate || getTodayDateInTimezone(medication?.timezone || 'Asia/Kolkata');
  const scheduledTime = event.scheduledTime || medication?.scheduleTime || '08:00';
  const doseId = buildDoseId(event.medicationId, scheduledDate, scheduledTime);
  const responseWindowSeconds =
    typeof event.responseWindowSeconds === 'number' && event.responseWindowSeconds > 0
      ? event.responseWindowSeconds
      : 900; // Default 15 minutes (900s)

  // Step 3: Verify that the medication remains active
  if (!medication || !medication.active) {
    logger('INFO', 'WORKFLOW_SKIPPED_INACTIVE_MEDICATION', {
      patientId: event.patientId,
      medicationId: event.medicationId,
      doseId,
    });
    return {
      action: 'SKIPPED_INACTIVE',
      patientId: event.patientId,
      medicationId: event.medicationId,
      doseId,
      scheduledDate,
      scheduledTime,
      responseWindowSeconds,
    };
  }

  // Step 4: Check whether the dose has already been confirmed in DynamoDB
  const existingDoseRes = await ddb.send(
    new GetCommand({
      TableName: ENV.DOSES_TABLE,
      Key: {
        patientId: event.patientId,
        doseId,
      },
    })
  );

  const nowIso = new Date().toISOString();
  let doseRecord = existingDoseRes.Item as DoseRecord | undefined;

  if (!doseRecord) {
    doseRecord = {
      doseId,
      patientId: event.patientId,
      medicationId: medication.medicationId,
      medicationName: medication.name,
      dosageDescription: medication.dosageDescription,
      scheduledDate,
      scheduledTime,
      scheduledTimestampIso: `${scheduledDate}T${scheduledTime}:00Z`,
      status: 'PENDING',
      workflowStatus: 'REMINDER_SENT',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await ddb.send(
        new PutCommand({
          TableName: ENV.DOSES_TABLE,
          Item: doseRecord,
          ConditionExpression: 'attribute_not_exists(patientId) AND attribute_not_exists(doseId)',
        })
      );
    } catch (err: unknown) {
      const errName = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
      if (errName === 'ConditionalCheckFailedException') {
        const refetched = await ddb.send(
          new GetCommand({
            TableName: ENV.DOSES_TABLE,
            Key: { patientId: event.patientId, doseId },
          })
        );
        doseRecord = refetched.Item as DoseRecord;
      } else {
        throw err;
      }
    }
  }

  // Step 5: If already taken, finish successfully without sending redundant reminder
  if (doseRecord && doseRecord.status === 'TAKEN') {
    logger('INFO', 'WORKFLOW_DOSE_ALREADY_TAKEN_BEFORE_REMINDER', {
      patientId: event.patientId,
      doseId,
    });
    return {
      action: 'ALREADY_TAKEN',
      patientId: event.patientId,
      medicationId: medication.medicationId,
      doseId,
      scheduledDate,
      scheduledTime,
      responseWindowSeconds,
      medicationName: medication.name,
      dosageDescription: medication.dosageDescription,
    };
  }

  // Step 6: If not taken, send an idempotent patient reminder and update workflowStatus
  await ddb.send(
    new UpdateCommand({
      TableName: ENV.DOSES_TABLE,
      Key: {
        patientId: event.patientId,
        doseId,
      },
      UpdateExpression: 'SET workflowStatus = :wfStatus, updatedAt = :now',
      ExpressionAttributeValues: {
        ':wfStatus': 'REMINDER_SENT',
        ':now': nowIso,
      },
    })
  );

  await dispatchIdempotentNotification({
    idempotencyKey: `reminder#${doseId}#${event.patientId}`,
    recipientUserId: event.patientId,
    patientId: event.patientId,
    doseId,
    medicationId: medication.medicationId,
    type: 'PATIENT_REMINDER',
    title: `Scheduled Medication Reminder (${scheduledTime})`,
    message: `Please take your scheduled dose of ${medication.name} (${medication.dosageDescription}) and confirm it in DoseGuard AI within ${Math.round(
      responseWindowSeconds / 60
    )} minute(s).`,
    sendExternalAlert: true,
  });

  await recordAuditEvent({
    actorUserId: 'STEP_FUNCTIONS_WORKFLOW',
    patientId: event.patientId,
    action: 'PATIENT_REMINDER_DISPATCHED',
    resourceId: doseId,
    metadata: { responseWindowSeconds },
  });

  logger('INFO', 'WORKFLOW_REMINDER_DISPATCHED', {
    patientId: event.patientId,
    medicationId: medication.medicationId,
    doseId,
    responseWindowSeconds,
  });

  return {
    action: 'REMINDER_SENT',
    patientId: event.patientId,
    medicationId: medication.medicationId,
    doseId,
    scheduledDate,
    scheduledTime,
    responseWindowSeconds,
    medicationName: medication.name,
    dosageDescription: medication.dosageDescription,
  };
};

