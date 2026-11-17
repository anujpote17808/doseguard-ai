import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ENV } from '../lib/aws';
import { AppError, extractAuthPrincipal, handleError, jsonResponse } from '../lib/http';
import { NotificationRecord } from '../types/models';

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const requestId = event.requestContext?.requestId;
  try {
    const principal = extractAuthPrincipal(event);
    const method = event.requestContext?.http?.method || 'GET';
    const rawPath = event.rawPath || '';

    // 1. GET /api/v1/notifications
    if (method === 'GET') {
      const res = await ddb.send(
        new QueryCommand({
          TableName: ENV.NOTIFICATIONS_TABLE,
          KeyConditionExpression: 'recipientUserId = :uid',
          ExpressionAttributeValues: {
            ':uid': principal.userId,
          },
          Limit: 100,
        })
      );

      const notifications = ((res.Items || []) as NotificationRecord[]).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );

      return jsonResponse(200, {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      });
    }

    // 2. PATCH /api/v1/notifications/{id}/read
    if (method === 'PATCH' && rawPath.endsWith('/read')) {
      const notificationId = decodeURIComponent(event.pathParameters?.id || '');
      if (!notificationId) {
        throw new AppError(400, 'MISSING_NOTIFICATION_ID', 'Notification ID is required.');
      }

      const existing = await ddb.send(
        new GetCommand({
          TableName: ENV.NOTIFICATIONS_TABLE,
          Key: {
            recipientUserId: principal.userId,
            notificationId,
          },
        })
      );

      if (!existing.Item) {
        throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
      }

      const now = new Date().toISOString();
      const updated = await ddb.send(
        new UpdateCommand({
          TableName: ENV.NOTIFICATIONS_TABLE,
          Key: {
            recipientUserId: principal.userId,
            notificationId,
          },
          UpdateExpression: 'SET #read = :true, readAt = :now',
          ExpressionAttributeNames: {
            '#read': 'read',
          },
          ExpressionAttributeValues: {
            ':true': true,
            ':now': now,
          },
          ReturnValues: 'ALL_NEW',
        })
      );

      return jsonResponse(200, {
        notification: updated.Attributes as NotificationRecord,
      });
    }

    return jsonResponse(405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: `Unsupported route ${method} ${rawPath}` },
    });
  } catch (err) {
    return handleError(err, requestId);
  }
};

