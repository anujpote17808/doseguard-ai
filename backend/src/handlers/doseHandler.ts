import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { StartExecutionCommand } from '@aws-sdk/client-sfn';
import { ddb, ENV, sfn } from '../lib/aws';
import { assertPatientAccess, listActiveCaregiversForPatient, recordAuditEvent } from '../lib/caregiverAuth';
import { AppError, extractAuthPrincipal, handleError, jsonResponse, logger, parseJsonBody } from '../lib/http';
import { dispatchIdempotentNotification } from '../lib/notificationService';
import { ConfirmDoseSchema, TriggerDemoWorkflowSchema } from '../schemas/validation';
import { DoseRecord, Medication } from '../types/models';

export function buildDoseId(medicationId: string, scheduledDate: string, scheduledTime: string): string {
  return `${medicationId}#${scheduledDate}#${scheduledTime}`;
}

export function getTodayDateInTimezone(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date()); // Returns YYYY-MM-DD in en-CA
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Ensures today's scheduled dose records exist in DynamoDB for active medications,
 * using idempotent conditional PutItem (`attribute_not_exists(doseId)`).
 * Never automatically marks a dose as TAKEN.
 */
export async function materializeTodayDosesForPatient(patientId: string): Promise<DoseRecord[]> {
  const medsRes = await ddb.send(
    new QueryCommand({
      TableName: ENV.MEDICATIONS_TABLE,
      KeyConditionExpression: 'patientId = :pid',
      ExpressionAttributeValues: {
        ':pid': patientId,
      },
    })
  );

  const medications = ((medsRes.Items || []) as Medication[]).filter((m) => m.active);
  const nowIso = new Date().toISOString();

  for (const med of medications) {
    const todayDate = getTodayDateInTimezone(med.timezone || 'Asia/Kolkata');
    if (med.startDate && todayDate < med.startDate) continue;
    if (med.endDate && todayDate > med.endDate) continue;

    const times = [med.scheduleTime];
    if (med.frequency === 'TWICE_DAILY' && med.secondaryScheduleTime) {
      times.push(med.secondaryScheduleTime);
    }

    for (const timeStr of times) {
      const doseId = buildDoseId(med.medicationId, todayDate, timeStr);
      const record: DoseRecord = {
        doseId,
        patientId,
        medicationId: med.medicationId,
        medicationName: med.name,
        dosageDescription: med.dosageDescription,
        scheduledDate: todayDate,
        scheduledTime: timeStr,
        scheduledTimestampIso: `${todayDate}T${timeStr}:00Z`,
        status: 'PENDING',
        workflowStatus: 'SCHEDULED',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      try {
        await ddb.send(
          new PutCommand({
            TableName: ENV.DOSES_TABLE,
            Item: record,
            ConditionExpression: 'attribute_not_exists(patientId) AND attribute_not_exists(doseId)',
          })
        );
      } catch (err: unknown) {
        const errName = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
        if (errName !== 'ConditionalCheckFailedException') {
          throw err;
        }
      }
    }
  }

  const dosesRes = await ddb.send(
    new QueryCommand({
      TableName: ENV.DOSES_TABLE,
      KeyConditionExpression: 'patientId = :pid',
      ExpressionAttributeValues: {
        ':pid': patientId,
      },
      Limit: 200,
    })
  );

  return (dosesRes.Items || []) as DoseRecord[];
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const requestId = event.requestContext?.requestId;
  try {
    const principal = extractAuthPrincipal(event);
    const method = event.requestContext?.http?.method || 'GET';
    const rawPath = event.rawPath || '';
    const requestedPatientId = event.queryStringParameters?.patientId || principal.userId;

    // 1. GET /api/v1/doses/today
    if (method === 'GET' && rawPath.endsWith('/doses/today')) {
      await assertPatientAccess(principal.userId, requestedPatientId, 'VIEW_ONLY');

      const allDoses = await materializeTodayDosesForPatient(requestedPatientId);
      const todayUtc = new Date().toISOString().slice(0, 10);
      const todayIst = getTodayDateInTimezone('Asia/Kolkata');

      const todayDoses = allDoses
        .filter((d) => d.scheduledDate === todayUtc || d.scheduledDate === todayIst)
        .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

      return jsonResponse(200, {
        doses: todayDoses,
        patientId: requestedPatientId,
      });
    }

    // 2. GET /api/v1/doses/history
    if (method === 'GET' && rawPath.endsWith('/doses/history')) {
      await assertPatientAccess(principal.userId, requestedPatientId, 'VIEW_ONLY');

      const allDoses = await materializeTodayDosesForPatient(requestedPatientId);
      const sorted = allDoses.sort((a, b) =>
        `${b.scheduledDate}T${b.scheduledTime}`.localeCompare(`${a.scheduledDate}T${a.scheduledTime}`)
      );

      return jsonResponse(200, {
        doses: sorted,
        patientId: requestedPatientId,
      });
    }

    // 3. POST /api/v1/doses/{id}/confirm
    if (method === 'POST' && rawPath.endsWith('/confirm')) {
      const rawDoseId = decodeURIComponent(event.pathParameters?.id || '');
      if (!rawDoseId) {
        throw new AppError(400, 'MISSING_DOSE_ID', 'Dose identifier is required.');
      }

      // Only the patient themselves or an authorized caregiver with MANAGE_MEDICATIONS can confirm a dose
      await assertPatientAccess(principal.userId, requestedPatientId, 'MANAGE_MEDICATIONS');
      ConfirmDoseSchema.parse(parseJsonBody(event.body));

      const existingRes = await ddb.send(
        new GetCommand({
          TableName: ENV.DOSES_TABLE,
          Key: {
            patientId: requestedPatientId,
            doseId: rawDoseId,
          },
        })
      );

      if (!existingRes.Item) {
        throw new AppError(404, 'DOSE_NOT_FOUND', 'Scheduled dose record not found.');
      }

      const existing = existingRes.Item as DoseRecord;

      // Idempotent behavior: if already TAKEN, return 200 with idempotent flag
      if (existing.status === 'TAKEN') {
        return jsonResponse(200, {
          dose: existing,
          idempotent: true,
          message: 'Dose was already confirmed as taken.',
        });
      }

      const now = new Date().toISOString();
      const updateRes = await ddb.send(
        new UpdateCommand({
          TableName: ENV.DOSES_TABLE,
          Key: {
            patientId: requestedPatientId,
            doseId: rawDoseId,
          },
          UpdateExpression:
            'SET #status = :taken, confirmedAt = :now, confirmedBy = :actor, workflowStatus = :wfStatus, updatedAt = :now',
          ConditionExpression: 'attribute_exists(doseId)',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':taken': 'TAKEN',
            ':now': now,
            ':actor': principal.userId,
            ':wfStatus': 'CONFIRMED_IN_TIME',
          },
          ReturnValues: 'ALL_NEW',
        })
      );

      await recordAuditEvent({
        actorUserId: principal.userId,
        patientId: requestedPatientId,
        action: 'DOSE_CONFIRMED_TAKEN',
        resourceId: rawDoseId,
      });

      logger('INFO', 'DOSE_CONFIRMED_TAKEN', {
        patientId: requestedPatientId,
        doseId: rawDoseId,
        confirmedBy: principal.userId,
      });

      return jsonResponse(200, {
        dose: updateRes.Attributes as DoseRecord,
        idempotent: false,
      });
    }

    // 4. POST /api/v1/doses/{id}/mark-missed
    if (method === 'POST' && rawPath.endsWith('/mark-missed')) {
      const rawDoseId = decodeURIComponent(event.pathParameters?.id || '');
      if (!rawDoseId) {
        throw new AppError(400, 'MISSING_DOSE_ID', 'Dose identifier is required.');
      }

      await assertPatientAccess(principal.userId, requestedPatientId, 'MANAGE_MEDICATIONS');

      const existingRes = await ddb.send(
        new GetCommand({
          TableName: ENV.DOSES_TABLE,
          Key: {
            patientId: requestedPatientId,
            doseId: rawDoseId,
          },
        })
      );

      if (!existingRes.Item) {
        throw new AppError(404, 'DOSE_NOT_FOUND', 'Scheduled dose record not found.');
      }

      const existing = existingRes.Item as DoseRecord;
      if (existing.status === 'MISSED') {
        return jsonResponse(200, {
          dose: existing,
          idempotent: true,
        });
      }

      const now = new Date().toISOString();
      const updateRes = await ddb.send(
        new UpdateCommand({
          TableName: ENV.DOSES_TABLE,
          Key: {
            patientId: requestedPatientId,
            doseId: rawDoseId,
          },
          UpdateExpression:
            'SET #status = :missed, missedAt = :now, workflowStatus = :wfStatus, updatedAt = :now',
          ConditionExpression: 'attribute_exists(doseId)',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':missed': 'MISSED',
            ':now': now,
            ':wfStatus': 'ESCALATED',
          },
          ReturnValues: 'ALL_NEW',
        })
      );

      // Notify connected caregivers idempotently
      const activeCaregivers = await listActiveCaregiversForPatient(requestedPatientId);
      for (const cg of activeCaregivers) {
        await dispatchIdempotentNotification({
          idempotencyKey: `missed#${rawDoseId}#${cg.caregiverId}`,
          recipientUserId: cg.caregiverId,
          patientId: requestedPatientId,
          doseId: rawDoseId,
          medicationId: existing.medicationId,
          type: 'CAREGIVER_MISSED_DOSE_ALERT',
          title: `Missed Dose Escalation for ${cg.patientName}`,
          message: `Scheduled dose (${existing.medicationName} - ${existing.dosageDescription}) at ${existing.scheduledTime} on ${existing.scheduledDate} was marked as MISSED.`,
          sendExternalAlert: true,
        });
      }

      await recordAuditEvent({
        actorUserId: principal.userId,
        patientId: requestedPatientId,
        action: 'DOSE_MARKED_MISSED',
        resourceId: rawDoseId,
        metadata: { caregiversNotified: activeCaregivers.length },
      });

      return jsonResponse(200, {
        dose: updateRes.Attributes as DoseRecord,
        caregiversNotified: activeCaregivers.length,
      });
    }

    // 5. POST /api/v1/doses/trigger-workflow (Start real Step Functions execution for a medication dose)
    if (method === 'POST' && rawPath.endsWith('/doses/trigger-workflow')) {
      await assertPatientAccess(principal.userId, requestedPatientId, 'MANAGE_MEDICATIONS');
      const input = TriggerDemoWorkflowSchema.parse(parseJsonBody(event.body));

      const medRes = await ddb.send(
        new GetCommand({
          TableName: ENV.MEDICATIONS_TABLE,
          Key: {
            patientId: requestedPatientId,
            medicationId: input.medicationId,
          },
        })
      );

      if (!medRes.Item) {
        throw new AppError(404, 'MEDICATION_NOT_FOUND', 'Medication not found.');
      }

      const med = medRes.Item as Medication;
      const scheduledDate = getTodayDateInTimezone(med.timezone || 'Asia/Kolkata');

      if (!ENV.STATE_MACHINE_ARN) {
        throw new AppError(
          503,
          'WORKFLOW_NOT_CONFIGURED',
          'Step Functions State Machine ARN is not configured in environment.'
        );
      }

      const executionInput = {
        patientId: requestedPatientId,
        medicationId: med.medicationId,
        scheduledDate,
        scheduledTime: med.scheduleTime,
        responseWindowSeconds: input.responseWindowSeconds,
        isDemoTrigger: true,
      };

      const sfnRes = await sfn.send(
        new StartExecutionCommand({
          stateMachineArn: ENV.STATE_MACHINE_ARN,
          input: JSON.stringify(executionInput),
        })
      );

      logger('INFO', 'STEP_FUNCTIONS_WORKFLOW_STARTED', {
        patientId: requestedPatientId,
        medicationId: med.medicationId,
        executionArn: sfnRes.executionArn,
        responseWindowSeconds: input.responseWindowSeconds,
      });

      return jsonResponse(202, {
        started: true,
        executionArn: sfnRes.executionArn,
        startDate: sfnRes.startDate?.toISOString(),
        responseWindowSeconds: input.responseWindowSeconds,
      });
    }

    return jsonResponse(405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: `Unsupported route ${method} ${rawPath}` },
    });
  } catch (err) {
    return handleError(err, requestId);
  }
};

