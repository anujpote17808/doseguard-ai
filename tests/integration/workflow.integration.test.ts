import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachAwsMocks, buildAuthEvent, createInMemoryCloudState, InMemoryCloudState } from '../testHarness';

vi.mock('../../backend/src/lib/aws', () => {
  return {
    ddb: { send: vi.fn() },
    s3: { send: vi.fn() },
    scheduler: { send: vi.fn() },
    sns: { send: vi.fn() },
    sfn: { send: vi.fn() },
    ENV: {
      USERS_TABLE: 'DoseGuard-Users',
      MEDICATIONS_TABLE: 'DoseGuard-Medications',
      DOSES_TABLE: 'DoseGuard-Doses',
      CAREGIVERS_TABLE: 'DoseGuard-Caregivers',
      INVITATIONS_TABLE: 'DoseGuard-Invitations',
      NOTIFICATIONS_TABLE: 'DoseGuard-Notifications',
      REPORTS_TABLE: 'DoseGuard-Reports',
      AUDIT_TABLE: 'DoseGuard-Audit',
      REPORTS_BUCKET: 'doseguard-private-reports-bucket',
      SNS_TOPIC_ARN: 'arn:aws:sns:ap-south-1:123456789012:DoseGuardAlerts',
      STATE_MACHINE_ARN: 'arn:aws:states:ap-south-1:123456789012:stateMachine:DoseGuardWorkflow',
      SCHEDULER_ROLE_ARN: 'arn:aws:iam::123456789012:role/DoseGuardSchedulerRole',
      SCHEDULER_GROUP_NAME: 'default',
    },
  };
});

import * as awsLib from '../../backend/src/lib/aws';
import { handler as medicationHandler } from '../../backend/src/handlers/medicationHandler';
import { handler as doseHandler } from '../../backend/src/handlers/doseHandler';
import { handler as caregiverInviteHandler } from '../../backend/src/handlers/caregiverInvitationHandler';
import { handler as reminderWorkflowHandler } from '../../backend/src/handlers/reminderWorkflowHandler';
import { handler as workflowStatusCheckHandler } from '../../backend/src/handlers/workflowStatusCheckHandler';

describe('Phase 6 — End-to-End Workflow & Scheduler Integration Tests', () => {
  let state: InMemoryCloudState;
  const todayStr = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    vi.clearAllMocks();
    state = createInMemoryCloudState();
    attachAwsMocks(state, awsLib as unknown as Parameters<typeof attachAwsMocks>[1]);
  });

  it('1, 2 & 3. Medication lifecycle creates, updates, and disables/deletes EventBridge Scheduler schedules', async () => {
    // Create
    const createRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-int',
        body: {
          name: 'Metoprolol',
          dosageDescription: '25mg',
          scheduleTime: '08:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'Asia/Kolkata',
        },
      })
    );
    expect(createRes.statusCode).toBe(201);
    const med = JSON.parse(createRes.body!).medication;
    expect(state.schedules.get(med.scheduleName)?.expression).toBe('cron(0 8 * * ? *)');
    expect(state.schedules.get(med.scheduleName)?.state).toBe('ENABLED');

    // Update
    const updateRes = await medicationHandler(
      buildAuthEvent({
        method: 'PATCH',
        rawPath: `/api/v1/medications/${med.medicationId}`,
        userId: 'patient-int',
        pathParameters: { id: med.medicationId },
        body: { scheduleTime: '21:30', active: false },
      })
    );
    expect(updateRes.statusCode).toBe(200);
    expect(state.schedules.get(med.scheduleName)?.expression).toBe('cron(30 21 * * ? *)');
    expect(state.schedules.get(med.scheduleName)?.state).toBe('DISABLED');

    // Delete
    await medicationHandler(
      buildAuthEvent({
        method: 'DELETE',
        rawPath: `/api/v1/medications/${med.medicationId}`,
        userId: 'patient-int',
        pathParameters: { id: med.medicationId },
      })
    );
    expect(state.schedules.has(med.scheduleName)).toBe(false);
  });

  it('4 & 5. EventBridge Scheduler / Trigger starts Step Functions workflow and invokes Lambda tasks', async () => {
    const createRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-int',
        body: {
          name: 'Apixaban',
          dosageDescription: '5mg',
          scheduleTime: '09:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'UTC',
        },
      })
    );
    const med = JSON.parse(createRes.body!).medication;

    const triggerRes = await doseHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/doses/trigger-workflow',
        userId: 'patient-int',
        body: { medicationId: med.medicationId, responseWindowSeconds: 60 },
      })
    );
    expect(triggerRes.statusCode).toBe(202);
    expect(state.sfnExecutions.length).toBe(1);
    const sfnInput = JSON.parse(state.sfnExecutions[0].input);
    expect(sfnInput.medicationId).toBe(med.medicationId);
    expect(sfnInput.responseWindowSeconds).toBe(60);
  });

  it('6. Confirmed dose during response window prevents caregiver escalation', async () => {
    const createRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-int',
        body: {
          name: 'Pantoprazole',
          dosageDescription: '40mg',
          scheduleTime: '07:30',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'UTC',
        },
      })
    );
    const med = JSON.parse(createRes.body!).medication;

    // Connect caregiver
    const invRes = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations',
        userId: 'patient-int',
        body: { relationship: 'Daughter', permissions: ['VIEW_ONLY'], expiresInHours: 24 },
      })
    );
    await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations/redeem',
        userId: 'caregiver-int',
        body: { passcode: JSON.parse(invRes.body!).passcode },
      })
    );

    // Step 1: Reminder sent
    const reminderResult = await reminderWorkflowHandler({
      patientId: 'patient-int',
      medicationId: med.medicationId,
      scheduledDate: todayStr,
      scheduledTime: '07:30',
      responseWindowSeconds: 60,
    });
    expect(reminderResult.action).toBe('REMINDER_SENT');

    // Patient confirms dose during the wait window
    await doseHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: `/api/v1/doses/${encodeURIComponent(reminderResult.doseId)}/confirm`,
        userId: 'patient-int',
        pathParameters: { id: reminderResult.doseId },
      })
    );

    // Step 2: Status check verifies TAKEN and prevents escalation
    const statusResult = await workflowStatusCheckHandler(reminderResult);
    expect(statusResult.outcome).toBe('CONFIRMED_IN_TIME');
    expect(statusResult.caregiversNotified).toBe(0);
  });

  it('7 & 8. Missed dose creates caregiver notification and duplicate workflow execution does not duplicate notifications', async () => {
    const createRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-int',
        body: {
          name: 'Digoxin',
          dosageDescription: '125mcg',
          scheduleTime: '10:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'UTC',
        },
      })
    );
    const med = JSON.parse(createRes.body!).medication;

    const invRes = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations',
        userId: 'patient-int',
        body: { relationship: 'Son', permissions: ['VIEW_ONLY'], expiresInHours: 24 },
      })
    );
    await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations/redeem',
        userId: 'caregiver-int',
        body: { passcode: JSON.parse(invRes.body!).passcode },
      })
    );

    const reminderResult = await reminderWorkflowHandler({
      patientId: 'patient-int',
      medicationId: med.medicationId,
      scheduledDate: todayStr,
      scheduledTime: '10:00',
      responseWindowSeconds: 60,
    });

    // Execute status check twice (simulating Step Functions retry / duplicate execution)
    const outcome1 = await workflowStatusCheckHandler(reminderResult);
    const snsCountAfterFirst = state.snsMessages.length;

    const outcome2 = await workflowStatusCheckHandler(reminderResult);
    const snsCountAfterSecond = state.snsMessages.length;

    expect(outcome1.outcome).toBe('ESCALATED_TO_CAREGIVERS');
    expect(outcome2.outcome).toBe('ESCALATED_TO_CAREGIVERS');
    // Idempotency guarantee: second execution did not publish duplicate SNS messages
    expect(snsCountAfterSecond).toBe(snsCountAfterFirst);
  });
});

