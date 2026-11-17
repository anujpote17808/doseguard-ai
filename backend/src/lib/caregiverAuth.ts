import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ENV } from './aws';
import { AppError, logger } from './http';
import { CaregiverConnection, CaregiverPermission } from '../types/models';
import crypto from 'crypto';

export function hashInvitationToken(rawPasscode: string): string {
  return crypto.createHash('sha256').update(rawPasscode.trim()).digest('hex');
}

export function generateSecurePasscode(): { rawPasscode: string; tokenHash: string } {
  // 16 random bytes = 128 bits of entropy, formatted cleanly as DG-XXXX-XXXX-XXXX-XXXX
  const hex = crypto.randomBytes(8).toString('hex').toUpperCase();
  const rawPasscode = `DG-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
  return {
    rawPasscode,
    tokenHash: hashInvitationToken(rawPasscode),
  };
}

/**
 * Verifies whether `actorUserId` is allowed to access `targetPatientId` data.
 * - If actorUserId === targetPatientId -> always allowed (isOwner = true).
 * - Otherwise, queries Caregivers table for an ACTIVE connection between targetPatientId and actorUserId
 *   and checks requiredPermission if specified.
 */
export async function assertPatientAccess(
  actorUserId: string,
  targetPatientId: string,
  requiredPermission: CaregiverPermission = 'VIEW_ONLY'
): Promise<{ isOwner: boolean; connection?: CaregiverConnection }> {
  if (!actorUserId || !targetPatientId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing identity for authorization check.');
  }

  if (actorUserId === targetPatientId) {
    return { isOwner: true };
  }

  const res = await ddb.send(
    new GetCommand({
      TableName: ENV.CAREGIVERS_TABLE,
      Key: {
        patientId: targetPatientId,
        caregiverId: actorUserId,
      },
    })
  );

  const connection = res.Item as CaregiverConnection | undefined;
  if (!connection || connection.status !== 'ACTIVE') {
    logger('WARN', 'AUTHZ_DENIED_NO_CAREGIVER_LINK', {
      actorUserId,
      targetPatientId,
      requiredPermission,
    });
    throw new AppError(
      403,
      'FORBIDDEN_PATIENT_ACCESS',
      'You do not have active caregiver authorization for this patient.'
    );
  }

  if (
    requiredPermission === 'MANAGE_MEDICATIONS' &&
    !connection.permissions.includes('MANAGE_MEDICATIONS')
  ) {
    logger('WARN', 'AUTHZ_DENIED_INSUFFICIENT_PERMISSION', {
      actorUserId,
      targetPatientId,
      requiredPermission,
      grantedPermissions: connection.permissions,
    });
    throw new AppError(
      403,
      'FORBIDDEN_INSUFFICIENT_PERMISSION',
      'Caregiver connection is read-only and cannot modify patient medication schedules.'
    );
  }

  return { isOwner: false, connection };
}

export async function listActiveCaregiversForPatient(patientId: string): Promise<CaregiverConnection[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: ENV.CAREGIVERS_TABLE,
      KeyConditionExpression: 'patientId = :pid',
      ExpressionAttributeValues: {
        ':pid': patientId,
      },
    })
  );
  const items = (res.Items || []) as CaregiverConnection[];
  return items.filter((c) => c.status === 'ACTIVE');
}

export async function recordAuditEvent(params: {
  actorUserId: string;
  patientId: string;
  action: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const now = new Date().toISOString();
    const auditId = `${now}#${crypto.randomUUID()}`;
    await ddb.send(
      new PutCommand({
        TableName: ENV.AUDIT_TABLE,
        Item: {
          patientId: params.patientId,
          auditId,
          actorUserId: params.actorUserId,
          action: params.action,
          resourceId: params.resourceId,
          metadata: params.metadata || {},
          createdAt: now,
          ttl: Math.floor(Date.now() / 1000) + 90 * 86400, // 90 days retention
        },
      })
    );
  } catch (err) {
    logger('WARN', 'AUDIT_LOG_WRITE_FAILED', {
      action: params.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

