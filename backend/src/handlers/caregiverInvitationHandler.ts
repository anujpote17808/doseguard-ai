import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';
import { ddb, ENV } from '../lib/aws';
import {
  generateSecurePasscode,
  hashInvitationToken,
  recordAuditEvent,
} from '../lib/caregiverAuth';
import { AppError, extractAuthPrincipal, handleError, jsonResponse, logger, parseJsonBody } from '../lib/http';
import { dispatchIdempotentNotification } from '../lib/notificationService';
import { CreateInvitationSchema, RedeemInvitationSchema } from '../schemas/validation';
import { CaregiverConnection, CaregiverInvitation, UserProfile } from '../types/models';

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const requestId = event.requestContext?.requestId;
  try {
    const principal = extractAuthPrincipal(event);
    const method = event.requestContext?.http?.method || 'GET';
    const rawPath = event.rawPath || '';

    // 1. POST /api/v1/caregivers/invitations — Patient generates a secure one-time passcode
    if (method === 'POST' && rawPath.endsWith('/invitations')) {
      const input = CreateInvitationSchema.parse(parseJsonBody(event.body));

      const userRes = await ddb.send(
        new GetCommand({
          TableName: ENV.USERS_TABLE,
          Key: { userId: principal.userId },
        })
      );
      const patientProfile = userRes.Item as UserProfile | undefined;
      const patientName =
        patientProfile?.fullName || principal.name || principal.email.split('@')[0];

      const { rawPasscode, tokenHash } = generateSecurePasscode();
      const now = new Date();
      const expiresAtDate = new Date(now.getTime() + input.expiresInHours * 3600 * 1000);
      const invitationId = `inv_${crypto.randomUUID().slice(0, 12)}`;

      const invitation: CaregiverInvitation = {
        invitationId,
        patientId: principal.userId,
        patientName,
        patientEmail: principal.email,
        tokenHash,
        relationship: input.relationship,
        permissions: input.permissions,
        status: 'PENDING',
        expiresAt: expiresAtDate.toISOString(),
        ttl: Math.floor(expiresAtDate.getTime() / 1000) + 7 * 86400, // Keep record 7 days past expiry for audit
        createdAt: now.toISOString(),
      };

      await ddb.send(
        new PutCommand({
          TableName: ENV.INVITATIONS_TABLE,
          Item: invitation,
          ConditionExpression: 'attribute_not_exists(tokenHash)',
        })
      );

      await recordAuditEvent({
        actorUserId: principal.userId,
        patientId: principal.userId,
        action: 'CAREGIVER_INVITATION_CREATED',
        resourceId: invitationId,
        metadata: {
          relationship: input.relationship,
          permissions: input.permissions,
          expiresAt: invitation.expiresAt,
        },
      });

      logger('INFO', 'CAREGIVER_INVITATION_CREATED', {
        patientId: principal.userId,
        invitationId,
        expiresAt: invitation.expiresAt,
      });

      // Return rawPasscode ONLY once on creation; never stored in plaintext in DynamoDB
      return jsonResponse(201, {
        invitation: {
          invitationId: invitation.invitationId,
          relationship: invitation.relationship,
          permissions: invitation.permissions,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        },
        passcode: rawPasscode,
      });
    }

    // 2. POST /api/v1/caregivers/invitations/redeem — Caregiver redeems passcode
    if (method === 'POST' && rawPath.endsWith('/invitations/redeem')) {
      const input = RedeemInvitationSchema.parse(parseJsonBody(event.body));
      const tokenHash = hashInvitationToken(input.passcode);

      const invRes = await ddb.send(
        new GetCommand({
          TableName: ENV.INVITATIONS_TABLE,
          Key: { tokenHash },
        })
      );

      if (!invRes.Item) {
        throw new AppError(404, 'INVITATION_NOT_FOUND', 'Invalid or unrecognized caregiver invitation passcode.');
      }

      const invitation = invRes.Item as CaregiverInvitation;

      // Prevent self-redemption
      if (invitation.patientId === principal.userId) {
        throw new AppError(
          400,
          'SELF_REDEMPTION_FORBIDDEN',
          'A patient cannot redeem their own caregiver invitation.'
        );
      }

      // Check status before conditional write
      if (invitation.status === 'REDEEMED') {
        throw new AppError(409, 'INVITATION_ALREADY_REDEEMED', 'This caregiver invitation has already been redeemed.');
      }

      if (invitation.status === 'REVOKED') {
        throw new AppError(410, 'INVITATION_REVOKED', 'This caregiver invitation has been revoked by the patient.');
      }

      const now = new Date();
      if (new Date(invitation.expiresAt).getTime() <= now.getTime()) {
        throw new AppError(410, 'INVITATION_EXPIRED', 'This caregiver invitation has expired.');
      }

      const caregiverProfileRes = await ddb.send(
        new GetCommand({
          TableName: ENV.USERS_TABLE,
          Key: { userId: principal.userId },
        })
      );
      const caregiverProfile = caregiverProfileRes.Item as UserProfile | undefined;
      const caregiverName =
        input.caregiverName ||
        caregiverProfile?.fullName ||
        principal.name ||
        principal.email.split('@')[0];

      // Atomic conditional single-use redemption on Invitations table
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: ENV.INVITATIONS_TABLE,
            Key: { tokenHash },
            UpdateExpression:
              'SET #status = :redeemed, redeemedByCaregiverId = :cid, redeemedByCaregiverEmail = :cemail, redeemedByCaregiverName = :cname, redeemedAt = :now',
            ConditionExpression:
              'attribute_exists(tokenHash) AND #status = :pending AND expiresAt > :now AND patientId <> :cid',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':redeemed': 'REDEEMED',
              ':pending': 'PENDING',
              ':cid': principal.userId,
              ':cemail': principal.email,
              ':cname': caregiverName,
              ':now': now.toISOString(),
            },
          })
        );
      } catch (condErr: unknown) {
        const errName = condErr && typeof condErr === 'object' && 'name' in condErr ? String(condErr.name) : '';
        if (errName === 'ConditionalCheckFailedException') {
          throw new AppError(
            409,
            'INVITATION_REDEMPTION_CONFLICT',
            'Invitation is no longer valid, expired, or was already redeemed.'
          );
        }
        throw condErr;
      }

      // Create active caregiver connection
      const connection: CaregiverConnection = {
        connectionId: `${invitation.patientId}#${principal.userId}`,
        patientId: invitation.patientId,
        patientName: invitation.patientName,
        patientEmail: invitation.patientEmail,
        caregiverId: principal.userId,
        caregiverName,
        caregiverEmail: principal.email,
        relationship: invitation.relationship,
        permissions: invitation.permissions,
        status: 'ACTIVE',
        connectedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await ddb.send(
        new PutCommand({
          TableName: ENV.CAREGIVERS_TABLE,
          Item: connection,
        })
      );

      // Notify patient that caregiver connected
      await dispatchIdempotentNotification({
        idempotencyKey: `inv-redeemed#${invitation.invitationId}#${principal.userId}`,
        recipientUserId: invitation.patientId,
        patientId: invitation.patientId,
        type: 'CAREGIVER_INVITATION_REDEEMED',
        title: 'Caregiver Connected',
        message: `${caregiverName} (${invitation.relationship}) redeemed your invitation and is now connected to receive missed-dose escalations.`,
        sendExternalAlert: false,
      });

      await recordAuditEvent({
        actorUserId: principal.userId,
        patientId: invitation.patientId,
        action: 'CAREGIVER_INVITATION_REDEEMED',
        resourceId: invitation.invitationId,
        metadata: { caregiverId: principal.userId, permissions: invitation.permissions },
      });

      logger('INFO', 'CAREGIVER_INVITATION_REDEEMED', {
        patientId: invitation.patientId,
        caregiverId: principal.userId,
        invitationId: invitation.invitationId,
      });

      return jsonResponse(200, {
        connection,
      });
    }

    return jsonResponse(405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: `Unsupported route ${method} ${rawPath}` },
    });
  } catch (err) {
    return handleError(err, requestId);
  }
};

