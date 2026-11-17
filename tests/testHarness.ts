import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { vi } from 'vitest';
import {
  CaregiverConnection,
  CaregiverInvitation,
  DoseRecord,
  Medication,
  NotificationRecord,
  AdherenceReport,
  UserProfile,
} from '../../backend/src/types/models';

export interface InMemoryCloudState {
  users: Map<string, UserProfile>;
  medications: Map<string, Medication>; // key: `${patientId}#${medicationId}`
  doses: Map<string, DoseRecord>; // key: `${patientId}#${doseId}`
  caregivers: Map<string, CaregiverConnection>; // key: `${patientId}#${caregiverId}`
  invitations: Map<string, CaregiverInvitation>; // key: tokenHash
  notifications: Map<string, NotificationRecord>; // key: `${recipientUserId}#${notificationId}`
  reports: Map<string, AdherenceReport>; // key: `${patientId}#${reportId}`
  s3Objects: Map<string, { bucket: string; key: string; body: string; contentType: string }>;
  schedules: Map<string, { name: string; expression: string; timezone: string; state: string; input: string }>;
  snsMessages: Array<{ subject?: string; message?: string; recipientUserId?: string }>;
  sfnExecutions: Array<{ stateMachineArn: string; input: string; executionArn: string }>;
  failNextSchedulerCall: boolean;
}

export function createInMemoryCloudState(): InMemoryCloudState {
  return {
    users: new Map(),
    medications: new Map(),
    doses: new Map(),
    caregivers: new Map(),
    invitations: new Map(),
    notifications: new Map(),
    reports: new Map(),
    s3Objects: new Map(),
    schedules: new Map(),
    snsMessages: [],
    sfnExecutions: [],
    failNextSchedulerCall: false,
  };
}

export function buildAuthEvent(params: {
  method: string;
  rawPath: string;
  userId?: string;
  email?: string;
  name?: string;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: unknown;
}): APIGatewayProxyEventV2 {
  const claims = params.userId
    ? {
        sub: params.userId,
        email: params.email || `${params.userId}@doseguard.test`,
        name: params.name || `User ${params.userId}`,
      }
    : undefined;

  return {
    version: '2.0',
    routeKey: `${params.method} ${params.rawPath}`,
    rawPath: params.rawPath,
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    pathParameters: params.pathParameters,
    queryStringParameters: params.queryStringParameters,
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'testapi',
      domainName: 'test.execute-api.ap-south-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: params.method,
        path: params.rawPath,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: `req-${Math.random().toString(36).slice(2, 9)}`,
      routeKey: `${params.method} ${params.rawPath}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
      ...(claims ? { authorizer: { jwt: { claims, scopes: [] } } } : {}),
    } as unknown as APIGatewayProxyEventV2['requestContext'],
  };
}

export function attachAwsMocks(state: InMemoryCloudState, clients: {
  ddb: { send: ReturnType<typeof vi.fn> };
  s3: { send: ReturnType<typeof vi.fn> };
  scheduler: { send: ReturnType<typeof vi.fn> };
  sns: { send: ReturnType<typeof vi.fn> };
  sfn: { send: ReturnType<typeof vi.fn> };
}) {
  // Set required env vars for scheduler and SFN
  process.env.STATE_MACHINE_ARN = 'arn:aws:states:ap-south-1:123456789012:stateMachine:DoseGuardWorkflow';
  process.env.SCHEDULER_ROLE_ARN = 'arn:aws:iam::123456789012:role/DoseGuardSchedulerRole';
  process.env.SNS_TOPIC_ARN = 'arn:aws:sns:ap-south-1:123456789012:DoseGuardAlerts';
  process.env.REPORTS_BUCKET = 'doseguard-private-reports-bucket';

  clients.ddb.send.mockImplementation(async (cmd: { constructor: { name: string }; input: Record<string, any> }) => {
    const cmdName = cmd.constructor.name;
    const input = cmd.input;
    const table = String(input.TableName || '');

    const makeCondError = () => {
      const err = new Error('The conditional request failed');
      err.name = 'ConditionalCheckFailedException';
      return err;
    };

    if (cmdName === 'GetCommand') {
      if (table.includes('Users')) {
        return { Item: state.users.get(input.Key.userId) };
      }
      if (table.includes('Medications')) {
        return { Item: state.medications.get(`${input.Key.patientId}#${input.Key.medicationId}`) };
      }
      if (table.includes('Doses')) {
        return { Item: state.doses.get(`${input.Key.patientId}#${input.Key.doseId}`) };
      }
      if (table.includes('Caregivers')) {
        return { Item: state.caregivers.get(`${input.Key.patientId}#${input.Key.caregiverId}`) };
      }
      if (table.includes('Invitations')) {
        return { Item: state.invitations.get(input.Key.tokenHash) };
      }
      if (table.includes('Notifications')) {
        return { Item: state.notifications.get(`${input.Key.recipientUserId}#${input.Key.notificationId}`) };
      }
      if (table.includes('Reports')) {
        return { Item: state.reports.get(`${input.Key.patientId}#${input.Key.reportId}`) };
      }
      return { Item: undefined };
    }

    if (cmdName === 'PutCommand') {
      const item = input.Item;
      if (table.includes('Users')) {
        state.users.set(item.userId, item);
      } else if (table.includes('Medications')) {
        const key = `${item.patientId}#${item.medicationId}`;
        if (input.ConditionExpression?.includes('attribute_not_exists') && state.medications.has(key)) {
          throw makeCondError();
        }
        state.medications.set(key, item);
      } else if (table.includes('Doses')) {
        const key = `${item.patientId}#${item.doseId}`;
        if (input.ConditionExpression?.includes('attribute_not_exists') && state.doses.has(key)) {
          throw makeCondError();
        }
        state.doses.set(key, item);
      } else if (table.includes('Caregivers')) {
        state.caregivers.set(`${item.patientId}#${item.caregiverId}`, item);
      } else if (table.includes('Invitations')) {
        if (input.ConditionExpression?.includes('attribute_not_exists') && state.invitations.has(item.tokenHash)) {
          throw makeCondError();
        }
        state.invitations.set(item.tokenHash, item);
      } else if (table.includes('Notifications')) {
        const key = `${item.recipientUserId}#${item.notificationId}`;
        if (input.ConditionExpression?.includes('attribute_not_exists') && state.notifications.has(key)) {
          throw makeCondError();
        }
        state.notifications.set(key, item);
      } else if (table.includes('Reports')) {
        state.reports.set(`${item.patientId}#${item.reportId}`, item);
      }
      return {};
    }

    if (cmdName === 'UpdateCommand') {
      if (table.includes('Doses')) {
        const key = `${input.Key.patientId}#${input.Key.doseId}`;
        const existing = state.doses.get(key);
        if (!existing) throw makeCondError();
        if (input.ConditionExpression?.includes('#status <> :taken') && existing.status === 'TAKEN') {
          throw makeCondError();
        }
        const vals = input.ExpressionAttributeValues || {};
        const updated: DoseRecord = {
          ...existing,
          ...(vals[':taken'] ? { status: vals[':taken'], confirmedAt: vals[':now'], confirmedBy: vals[':actor'] } : {}),
          ...(vals[':missed'] ? { status: vals[':missed'], missedAt: vals[':now'] } : {}),
          ...(vals[':wfStatus'] ? { workflowStatus: vals[':wfStatus'] } : {}),
          updatedAt: vals[':now'] || existing.updatedAt,
        };
        state.doses.set(key, updated);
        return { Attributes: updated };
      }

      if (table.includes('Invitations')) {
        const existing = state.invitations.get(input.Key.tokenHash);
        if (!existing) throw makeCondError();
        const vals = input.ExpressionAttributeValues || {};
        if (vals[':redeemed']) {
          // Enforce single-use, non-expired, non-self condition
          if (
            existing.status !== 'PENDING' ||
            existing.expiresAt <= vals[':now'] ||
            existing.patientId === vals[':cid']
          ) {
            throw makeCondError();
          }
          const updated: CaregiverInvitation = {
            ...existing,
            status: 'REDEEMED',
            redeemedByCaregiverId: vals[':cid'],
            redeemedByCaregiverEmail: vals[':cemail'],
            redeemedByCaregiverName: vals[':cname'],
            redeemedAt: vals[':now'],
          };
          state.invitations.set(input.Key.tokenHash, updated);
          return { Attributes: updated };
        }
        if (vals[':revoked']) {
          if (existing.patientId !== vals[':pid'] || existing.status !== 'PENDING') {
            throw makeCondError();
          }
          const updated: CaregiverInvitation = { ...existing, status: 'REVOKED' };
          state.invitations.set(input.Key.tokenHash, updated);
          return { Attributes: updated };
        }
      }

      if (table.includes('Caregivers')) {
        const key = `${input.Key.patientId}#${input.Key.caregiverId}`;
        const existing = state.caregivers.get(key);
        if (!existing) throw makeCondError();
        const vals = input.ExpressionAttributeValues || {};
        const updated: CaregiverConnection = {
          ...existing,
          status: vals[':revoked'] || existing.status,
          updatedAt: vals[':now'] || existing.updatedAt,
        };
        state.caregivers.set(key, updated);
        return { Attributes: updated };
      }

      if (table.includes('Notifications')) {
        const key = `${input.Key.recipientUserId}#${input.Key.notificationId}`;
        const existing = state.notifications.get(key);
        if (!existing) throw makeCondError();
        const vals = input.ExpressionAttributeValues || {};
        const updated: NotificationRecord = {
          ...existing,
          read: true,
          readAt: vals[':now'],
        };
        state.notifications.set(key, updated);
        return { Attributes: updated };
      }

      return {};
    }

    if (cmdName === 'DeleteCommand') {
      if (table.includes('Medications')) {
        state.medications.delete(`${input.Key.patientId}#${input.Key.medicationId}`);
      }
      return {};
    }

    if (cmdName === 'QueryCommand') {
      const vals = input.ExpressionAttributeValues || {};
      if (table.includes('Medications')) {
        const pid = vals[':pid'];
        return {
          Items: Array.from(state.medications.values()).filter((m) => m.patientId === pid),
        };
      }
      if (table.includes('Doses')) {
        const pid = vals[':pid'];
        return {
          Items: Array.from(state.doses.values()).filter((d) => d.patientId === pid),
        };
      }
      if (table.includes('Caregivers')) {
        if (input.IndexName === 'CaregiverPatientsIndex') {
          const cid = vals[':cid'];
          return {
            Items: Array.from(state.caregivers.values()).filter((c) => c.caregiverId === cid),
          };
        }
        const pid = vals[':pid'];
        return {
          Items: Array.from(state.caregivers.values()).filter((c) => c.patientId === pid),
        };
      }
      if (table.includes('Invitations')) {
        const pid = vals[':pid'];
        return {
          Items: Array.from(state.invitations.values()).filter((i) => i.patientId === pid),
        };
      }
      if (table.includes('Notifications')) {
        const uid = vals[':uid'];
        return {
          Items: Array.from(state.notifications.values()).filter((n) => n.recipientUserId === uid),
        };
      }
      if (table.includes('Reports')) {
        const pid = vals[':pid'];
        return {
          Items: Array.from(state.reports.values()).filter((r) => r.patientId === pid),
        };
      }
      return { Items: [] };
    }

    return {};
  });

  clients.scheduler.send.mockImplementation(async (cmd: { constructor: { name: string }; input: Record<string, any> }) => {
    if (state.failNextSchedulerCall) {
      state.failNextSchedulerCall = false;
      throw new Error('EventBridge Scheduler service error');
    }
    const cmdName = cmd.constructor.name;
    const input = cmd.input;
    if (cmdName === 'GetScheduleCommand') {
      const existing = state.schedules.get(input.Name);
      if (!existing) {
        const err = new Error('Schedule not found');
        err.name = 'ResourceNotFoundException';
        throw err;
      }
      return existing;
    }
    if (cmdName === 'CreateScheduleCommand' || cmdName === 'UpdateScheduleCommand') {
      state.schedules.set(input.Name, {
        name: input.Name,
        expression: input.ScheduleExpression,
        timezone: input.ScheduleExpressionTimezone,
        state: input.State,
        input: input.Target?.Input,
      });
      return { ScheduleArn: `arn:aws:scheduler:ap-south-1:123456789012:schedule/default/${input.Name}` };
    }
    if (cmdName === 'DeleteScheduleCommand') {
      state.schedules.delete(input.Name);
      return {};
    }
    return {};
  });

  clients.sns.send.mockImplementation(async (cmd: { input: Record<string, any> }) => {
    const input = cmd.input;
    state.snsMessages.push({
      subject: input.Subject,
      message: input.Message,
      recipientUserId: input.MessageAttributes?.recipientUserId?.StringValue,
    });
    return { MessageId: `sns-msg-${state.snsMessages.length}` };
  });

  clients.s3.send.mockImplementation(async (cmd: { constructor: { name: string }; input: Record<string, any> }) => {
    const cmdName = cmd.constructor.name;
    const input = cmd.input;
    if (cmdName === 'PutObjectCommand') {
      state.s3Objects.set(`${input.Bucket}/${input.Key}`, {
        bucket: input.Bucket,
        key: input.Key,
        body: String(input.Body),
        contentType: String(input.ContentType),
      });
      return {};
    }
    return {};
  });

  clients.sfn.send.mockImplementation(async (cmd: { input: Record<string, any> }) => {
    const executionArn = `arn:aws:states:ap-south-1:123456789012:execution:DoseGuardWorkflow:exec-${state.sfnExecutions.length + 1}`;
    state.sfnExecutions.push({
      stateMachineArn: cmd.input.stateMachineArn,
      input: cmd.input.input,
      executionArn,
    });
    return {
      executionArn,
      startDate: new Date(),
    };
  });
}

