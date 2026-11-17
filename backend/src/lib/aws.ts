import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { SNSClient } from '@aws-sdk/client-sns';
import { SFNClient } from '@aws-sdk/client-sfn';

const region = process.env.AWS_REGION || 'ap-south-1';

const rawDdb = new DynamoDBClient({ region });
export const ddb = DynamoDBDocumentClient.from(rawDdb, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const s3 = new S3Client({ region });
export const scheduler = new SchedulerClient({ region });
export const sns = new SNSClient({ region });
export const sfn = new SFNClient({ region });

export const ENV = {
  USERS_TABLE: process.env.USERS_TABLE || 'DoseGuard-Users',
  MEDICATIONS_TABLE: process.env.MEDICATIONS_TABLE || 'DoseGuard-Medications',
  DOSES_TABLE: process.env.DOSES_TABLE || 'DoseGuard-Doses',
  CAREGIVERS_TABLE: process.env.CAREGIVERS_TABLE || 'DoseGuard-Caregivers',
  INVITATIONS_TABLE: process.env.INVITATIONS_TABLE || 'DoseGuard-Invitations',
  NOTIFICATIONS_TABLE: process.env.NOTIFICATIONS_TABLE || 'DoseGuard-Notifications',
  REPORTS_TABLE: process.env.REPORTS_TABLE || 'DoseGuard-Reports',
  AUDIT_TABLE: process.env.AUDIT_TABLE || 'DoseGuard-Audit',
  REPORTS_BUCKET: process.env.REPORTS_BUCKET || 'doseguard-reports-local',
  SNS_TOPIC_ARN: process.env.SNS_TOPIC_ARN || '',
  STATE_MACHINE_ARN: process.env.STATE_MACHINE_ARN || '',
  SCHEDULER_ROLE_ARN: process.env.SCHEDULER_ROLE_ARN || '',
  SCHEDULER_GROUP_NAME: process.env.SCHEDULER_GROUP_NAME || 'default',
};

