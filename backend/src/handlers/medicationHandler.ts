import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';
import { ddb, ENV } from '../lib/aws';
import { assertPatientAccess, recordAuditEvent } from '../lib/caregiverAuth';
import { AppError, extractAuthPrincipal, handleError, jsonResponse, logger, parseJsonBody } from '../lib/http';
import { removeMedicationSchedule, syncMedicationSchedule } from '../lib/schedulerSync';
import { CreateMedicationSchema, UpdateMedicationSchema } from '../schemas/validation';
import { Medication } from '../types/models';

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const requestId = event.requestContext?.requestId;
  try {
    const principal = extractAuthPrincipal(event);
    const method = event.requestContext?.http?.method || 'GET';
    const medicationId = event.pathParameters?.id;
    const requestedPatientId = event.queryStringParameters?.patientId || principal.userId;

    // 1. GET /api/v1/medications
    if (method === 'GET' && !medicationId) {
      await assertPatientAccess(principal.userId, requestedPatientId, 'VIEW_ONLY');

      const res = await ddb.send(
        new QueryCommand({
          TableName: ENV.MEDICATIONS_TABLE,
          KeyConditionExpression: 'patientId = :pid',
          ExpressionAttributeValues: {
            ':pid': requestedPatientId,
          },
          Limit: 100,
        })
      );

      const medications = ((res.Items || []) as Medication[]).sort((a, b) =>
        a.scheduleTime.localeCompare(b.scheduleTime)
      );

      return jsonResponse(200, {
        medications,
        patientId: requestedPatientId,
      });
    }

    // 2. GET /api/v1/medications/{id}
    if (method === 'GET' && medicationId) {
      await assertPatientAccess(principal.userId, requestedPatientId, 'VIEW_ONLY');

      const res = await ddb.send(
        new GetCommand({
          TableName: ENV.MEDICATIONS_TABLE,
          Key: {
            patientId: requestedPatientId,
            medicationId,
          },
        })
      );

      if (!res.Item) {
        throw new AppError(404, 'MEDICATION_NOT_FOUND', 'Medication schedule not found.');
      }

      return jsonResponse(200, { medication: res.Item as Medication });
    }

    // 3. POST /api/v1/medications
    if (method === 'POST' && !medicationId) {
      await assertPatientAccess(principal.userId, requestedPatientId, 'MANAGE_MEDICATIONS');

      const input = CreateMedicationSchema.parse(parseJsonBody(event.body));
      const now = new Date().toISOString();
      const newMedId = `med_${crypto.randomUUID().slice(0, 12)}`;

      const medication: Medication = {
        medicationId: newMedId,
        patientId: requestedPatientId,
        name: input.name,
        dosageDescription: input.dosageDescription,
        scheduleTime: input.scheduleTime,
        secondaryScheduleTime: input.secondaryScheduleTime,
        frequency: input.frequency,
        startDate: input.startDate,
        endDate: input.endDate,
        timezone: input.timezone,
        instructions: input.instructions,
        active: input.active,
        createdAt: now,
        updatedAt: now,
      };

      // Synchronize EventBridge Scheduler FIRST so if schedule creation fails, we return a clear backend error
      // and never falsely claim that reminders are active.
      const scheduleName = await syncMedicationSchedule(medication);
      medication.scheduleName = scheduleName;

      await ddb.send(
        new PutCommand({
          TableName: ENV.MEDICATIONS_TABLE,
          Item: medication,
          ConditionExpression: 'attribute_not_exists(medicationId)',
        })
      );

      await recordAuditEvent({
        actorUserId: principal.userId,
        patientId: requestedPatientId,
        action: 'MEDICATION_CREATED',
        resourceId: newMedId,
        metadata: { scheduleName, frequency: medication.frequency, scheduleTime: medication.scheduleTime },
      });

      logger('INFO', 'MEDICATION_CREATED', {
        patientId: requestedPatientId,
        medicationId: newMedId,
        scheduleName,
      });

      return jsonResponse(201, { medication });
    }

    // 4. PATCH /api/v1/medications/{id}
    if (method === 'PATCH' && medicationId) {
      await assertPatientAccess(principal.userId, requestedPatientId, 'MANAGE_MEDICATIONS');

      const existingRes = await ddb.send(
        new GetCommand({
          TableName: ENV.MEDICATIONS_TABLE,
          Key: {
            patientId: requestedPatientId,
            medicationId,
          },
        })
      );

      if (!existingRes.Item) {
        throw new AppError(404, 'MEDICATION_NOT_FOUND', 'Medication schedule not found.');
      }

      const existing = existingRes.Item as Medication;
      const input = UpdateMedicationSchema.parse(parseJsonBody(event.body));
      const now = new Date().toISOString();

      const updated: Medication = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.dosageDescription !== undefined ? { dosageDescription: input.dosageDescription } : {}),
        ...(input.scheduleTime !== undefined ? { scheduleTime: input.scheduleTime } : {}),
        ...(input.secondaryScheduleTime !== undefined
          ? { secondaryScheduleTime: input.secondaryScheduleTime || undefined }
          : {}),
        ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate || undefined } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        updatedAt: now,
      };

      const scheduleName = await syncMedicationSchedule(updated);
      updated.scheduleName = scheduleName;

      await ddb.send(
        new PutCommand({
          TableName: ENV.MEDICATIONS_TABLE,
          Item: updated,
        })
      );

      await recordAuditEvent({
        actorUserId: principal.userId,
        patientId: requestedPatientId,
        action: 'MEDICATION_UPDATED',
        resourceId: medicationId,
        metadata: { active: updated.active, scheduleTime: updated.scheduleTime },
      });

      return jsonResponse(200, { medication: updated });
    }

    // 5. DELETE /api/v1/medications/{id}
    if (method === 'DELETE' && medicationId) {
      await assertPatientAccess(principal.userId, requestedPatientId, 'MANAGE_MEDICATIONS');

      const existingRes = await ddb.send(
        new GetCommand({
          TableName: ENV.MEDICATIONS_TABLE,
          Key: {
            patientId: requestedPatientId,
            medicationId,
          },
        })
      );

      if (!existingRes.Item) {
        throw new AppError(404, 'MEDICATION_NOT_FOUND', 'Medication schedule not found.');
      }

      await removeMedicationSchedule(medicationId);

      await ddb.send(
        new DeleteCommand({
          TableName: ENV.MEDICATIONS_TABLE,
          Key: {
            patientId: requestedPatientId,
            medicationId,
          },
        })
      );

      await recordAuditEvent({
        actorUserId: principal.userId,
        patientId: requestedPatientId,
        action: 'MEDICATION_DELETED',
        resourceId: medicationId,
      });

      return jsonResponse(200, { deleted: true, medicationId });
    }

    return jsonResponse(405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: `Unsupported route ${method} ${event.rawPath}` },
    });
  } catch (err) {
    return handleError(err, requestId);
  }
};

