import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ENV } from '../lib/aws';
import { recordAuditEvent } from '../lib/caregiverAuth';
import { AppError, extractAuthPrincipal, handleError, jsonResponse, logger } from '../lib/http';
import { CaregiverConnection, CaregiverInvitation } from '../types/models';

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const requestId = event.requestContext?.requestId;
  try {
    const principal = extractAuthPrincipal(event);
    const method = event.requestContext?.http?.method || 'GET';
    const targetId = decodeURIComponent(event.pathParameters?.id || '');

    // 1. GET /api/v1/caregivers
    // Returns:
    // - caregivers connected to this user as a patient (`myCaregivers`)
    // - pending invitations created by this user (`myInvitations`)
    // - patients whom this user monitors as a caregiver (`connectedPatients`)
    if (method === 'GET' && !targetId) {
      const [myCaregiversRes, connectedPatientsRes, myInvitationsRes] = await Promise.all([
        ddb.send(
          new QueryCommand({
            TableName: ENV.CAREGIVERS_TABLE,
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: {
              ':pid': principal.userId,
            },
          })
        ),
        ddb.send(
          new QueryCommand({
            TableName: ENV.CAREGIVERS_TABLE,
            IndexName: 'CaregiverPatientsIndex',
            KeyConditionExpression: 'caregiverId = :cid',
            ExpressionAttributeValues: {
              ':cid': principal.userId,
            },
          })
        ),
        ddb.send(
          new QueryCommand({
            TableName: ENV.INVITATIONS_TABLE,
            IndexName: 'PatientInvitationsIndex',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: {
              ':pid': principal.userId,
            },
          })
        ),
      ]);

      const myCaregivers = ((myCaregiversRes.Items || []) as CaregiverConnection[]).filter(
        (c) => c.status === 'ACTIVE'
      );
      const connectedPatients = ((connectedPatientsRes.Items || []) as CaregiverConnection[]).filter(
        (c) => c.status === 'ACTIVE'
      );
      const myInvitations = ((myInvitationsRes.Items || []) as CaregiverInvitation[])
        .map((inv) => ({
          invitationId: inv.invitationId,
          relationship: inv.relationship,
          permissions: inv.permissions,
          status: inv.status,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
          redeemedByCaregiverName: inv.redeemedByCaregiverName,
          redeemedAt: inv.redeemedAt,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return jsonResponse(200, {
        myCaregivers,
        connectedPatients,
        myInvitations,
      });
    }

    // 2. DELETE /api/v1/caregivers/{id}
    // Supports revoking an active caregiver connection (by caregiverId) OR revoking a pending invitation (by invitationId)
    if (method === 'DELETE' && targetId) {
      const now = new Date().toISOString();

      // Check if targetId is a pending invitation owned by this patient
      if (targetId.startsWith('inv_')) {
        const invQuery = await ddb.send(
          new QueryCommand({
            TableName: ENV.INVITATIONS_TABLE,
            IndexName: 'PatientInvitationsIndex',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: {
              ':pid': principal.userId,
            },
          })
        );

        const match = ((invQuery.Items || []) as CaregiverInvitation[]).find(
          (i) => i.invitationId === targetId
        );

        if (!match) {
          throw new AppError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
        }

        await ddb.send(
          new UpdateCommand({
            TableName: ENV.INVITATIONS_TABLE,
            Key: { tokenHash: match.tokenHash },
            UpdateExpression: 'SET #status = :revoked',
            ConditionExpression: 'patientId = :pid AND #status = :pending',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':revoked': 'REVOKED',
              ':pid': principal.userId,
              ':pending': 'PENDING',
            },
          })
        );

        await recordAuditEvent({
          actorUserId: principal.userId,
          patientId: principal.userId,
          action: 'CAREGIVER_INVITATION_REVOKED',
          resourceId: targetId,
        });

        return jsonResponse(200, { revoked: true, invitationId: targetId });
      }

      // Otherwise revoke caregiver connection where patientId === principal.userId and caregiverId === targetId
      const existingConn = await ddb.send(
        new GetCommand({
          TableName: ENV.CAREGIVERS_TABLE,
          Key: {
            patientId: principal.userId,
            caregiverId: targetId,
          },
        })
      );

      if (!existingConn.Item) {
        throw new AppError(404, 'CAREGIVER_CONNECTION_NOT_FOUND', 'Caregiver connection not found.');
      }

      await ddb.send(
        new UpdateCommand({
          TableName: ENV.CAREGIVERS_TABLE,
          Key: {
            patientId: principal.userId,
            caregiverId: targetId,
          },
          UpdateExpression: 'SET #status = :revoked, updatedAt = :now',
          ConditionExpression: 'patientId = :pid',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':revoked': 'REVOKED',
            ':now': now,
            ':pid': principal.userId,
          },
        })
      );

      await recordAuditEvent({
        actorUserId: principal.userId,
        patientId: principal.userId,
        action: 'CAREGIVER_ACCESS_REVOKED',
        resourceId: targetId,
      });

      logger('INFO', 'CAREGIVER_ACCESS_REVOKED', {
        patientId: principal.userId,
        caregiverId: targetId,
      });

      return jsonResponse(200, {
        revoked: true,
        caregiverId: targetId,
      });
    }

    return jsonResponse(405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: `Unsupported route ${method} ${event.rawPath}` },
    });
  } catch (err) {
    return handleError(err, requestId);
  }
};

