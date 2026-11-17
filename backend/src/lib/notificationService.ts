import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { PublishCommand } from '@aws-sdk/client-sns';
import { ddb, ENV, sns } from './aws';
import { logger } from './http';
import { NotificationRecord, NotificationType } from '../types/models';

export interface DispatchNotificationInput {
  idempotencyKey: string; // Deterministic notificationId to guarantee zero duplicate alerts on retry
  recipientUserId: string;
  patientId: string;
  doseId?: string;
  medicationId?: string;
  type: NotificationType;
  title: string;
  message: string;
  sendExternalAlert?: boolean;
}

/**
 * Idempotently records and optionally dispatches an SNS notification.
 * Uses conditional PutItem (`attribute_not_exists(notificationId)`) so Step Functions retries
 * never send duplicate emails/alerts to patients or caregivers.
 * Never includes sensitive clinical details in public logs or email subjects.
 */
export async function dispatchIdempotentNotification(
  input: DispatchNotificationInput
): Promise<{ notification: NotificationRecord; alreadySent: boolean }> {
  const now = new Date().toISOString();
  const notificationId = input.idempotencyKey;

  const initialRecord: NotificationRecord = {
    notificationId,
    recipientUserId: input.recipientUserId,
    patientId: input.patientId,
    doseId: input.doseId,
    medicationId: input.medicationId,
    type: input.type,
    title: input.title,
    message: input.message,
    deliveryChannel: input.sendExternalAlert && ENV.SNS_TOPIC_ARN ? 'SNS_EMAIL' : 'IN_APP',
    deliveryStatus: 'RECORDED',
    read: false,
    createdAt: now,
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: ENV.NOTIFICATIONS_TABLE,
        Item: initialRecord,
        ConditionExpression: 'attribute_not_exists(recipientUserId) AND attribute_not_exists(notificationId)',
      })
    );
  } catch (err: unknown) {
    const errName = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
    if (errName === 'ConditionalCheckFailedException') {
      logger('INFO', 'NOTIFICATION_IDEMPOTENT_SKIP', {
        notificationId,
        recipientUserId: input.recipientUserId,
        type: input.type,
      });
      return { notification: initialRecord, alreadySent: true };
    }
    throw err;
  }

  if (input.sendExternalAlert && ENV.SNS_TOPIC_ARN) {
    try {
      // Safe generic subject line without PHI / medication names
      const safeSubject =
        input.type === 'CAREGIVER_MISSED_DOSE_ALERT'
          ? 'DoseGuard AI: Caregiver Escalation Alert'
          : 'DoseGuard AI: Scheduled Medication Reminder';

      const publishRes = await sns.send(
        new PublishCommand({
          TopicArn: ENV.SNS_TOPIC_ARN,
          Subject: safeSubject,
          Message: `${input.title}\n\n${input.message}\n\nView details securely in the DoseGuard AI portal.`,
          MessageAttributes: {
            notificationType: {
              DataType: 'String',
              StringValue: input.type,
            },
            recipientUserId: {
              DataType: 'String',
              StringValue: input.recipientUserId,
            },
          },
        })
      );

      initialRecord.deliveryStatus = 'DELIVERED';
      initialRecord.providerMessageId = publishRes.MessageId;

      await ddb.send(
        new PutCommand({
          TableName: ENV.NOTIFICATIONS_TABLE,
          Item: initialRecord,
        })
      );

      logger('INFO', 'SNS_NOTIFICATION_PUBLISHED', {
        notificationId,
        type: input.type,
        messageId: publishRes.MessageId,
      });
    } catch (snsErr) {
      initialRecord.deliveryStatus = 'FAILED';
      await ddb.send(
        new PutCommand({
          TableName: ENV.NOTIFICATIONS_TABLE,
          Item: initialRecord,
        })
      );
      logger('ERROR', 'SNS_NOTIFICATION_PUBLISH_FAILED', {
        notificationId,
        type: input.type,
        error: snsErr instanceof Error ? snsErr.message : String(snsErr),
      });
    }
  }

  return { notification: initialRecord, alreadySent: false };
}

