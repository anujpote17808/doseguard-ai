import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ENV } from '../lib/aws';
import { extractAuthPrincipal, handleError, jsonResponse, logger, parseJsonBody } from '../lib/http';
import { UpdateProfileSchema } from '../schemas/validation';
import { UserProfile } from '../types/models';

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const requestId = event.requestContext?.requestId;
  try {
    const method = event.requestContext?.http?.method || 'GET';
    const rawPath = event.rawPath || '';

    // Unauthenticated health check endpoint
    if (rawPath === '/health' && method === 'GET') {
      return jsonResponse(200, {
        status: 'healthy',
        service: 'doseguard-ai-api',
        timestamp: new Date().toISOString(),
        region: process.env.AWS_REGION || 'ap-south-1',
      });
    }

    const principal = extractAuthPrincipal(event);

    if (method === 'GET') {
      const res = await ddb.send(
        new GetCommand({
          TableName: ENV.USERS_TABLE,
          Key: { userId: principal.userId },
        })
      );

      if (res.Item) {
        return jsonResponse(200, { profile: res.Item as UserProfile });
      }

      // Initialize default user profile on first authenticated login
      const now = new Date().toISOString();
      const newProfile: UserProfile = {
        userId: principal.userId,
        email: principal.email,
        fullName: principal.name || principal.email.split('@')[0],
        role: 'both',
        timezone: 'Asia/Kolkata',
        notificationPreferences: {
          emailEnabled: true,
          smsEnabled: false,
          escalationDelayMinutes: 15,
        },
        createdAt: now,
        updatedAt: now,
      };

      await ddb.send(
        new PutCommand({
          TableName: ENV.USERS_TABLE,
          Item: newProfile,
        })
      );

      logger('INFO', 'USER_PROFILE_PROVISIONED', { userId: principal.userId });
      return jsonResponse(200, { profile: newProfile });
    }

    if (method === 'PATCH') {
      const payload = UpdateProfileSchema.parse(parseJsonBody(event.body));
      const now = new Date().toISOString();

      // Ensure user exists first
      const existingRes = await ddb.send(
        new GetCommand({
          TableName: ENV.USERS_TABLE,
          Key: { userId: principal.userId },
        })
      );

      const baseProfile: UserProfile = (existingRes.Item as UserProfile) || {
        userId: principal.userId,
        email: principal.email,
        fullName: principal.name || principal.email.split('@')[0],
        role: 'both',
        timezone: 'Asia/Kolkata',
        notificationPreferences: {
          emailEnabled: true,
          smsEnabled: false,
          escalationDelayMinutes: 15,
        },
        createdAt: now,
        updatedAt: now,
      };

      const updatedProfile: UserProfile = {
        ...baseProfile,
        ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
        ...(payload.role !== undefined ? { role: payload.role } : {}),
        ...(payload.timezone !== undefined ? { timezone: payload.timezone } : {}),
        ...(payload.phoneNumber !== undefined ? { phoneNumber: payload.phoneNumber } : {}),
        ...(payload.notificationPreferences !== undefined
          ? { notificationPreferences: payload.notificationPreferences }
          : {}),
        updatedAt: now,
      };

      await ddb.send(
        new PutCommand({
          TableName: ENV.USERS_TABLE,
          Item: updatedProfile,
        })
      );

      logger('INFO', 'USER_PROFILE_UPDATED', { userId: principal.userId });
      return jsonResponse(200, { profile: updatedProfile });
    }

    return jsonResponse(405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: `Unsupported HTTP method ${method}` },
    });
  } catch (err) {
    return handleError(err, requestId);
  }
};

