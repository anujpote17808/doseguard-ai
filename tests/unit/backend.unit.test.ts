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

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://doseguard-private-reports-bucket.s3.ap-south-1.amazonaws.com/signed-report?X-Amz-Expires=300'),
}));

import * as awsLib from '../../backend/src/lib/aws';
import { handler as medicationHandler } from '../../backend/src/handlers/medicationHandler';
import { handler as doseHandler } from '../../backend/src/handlers/doseHandler';
import { handler as caregiverInviteHandler } from '../../backend/src/handlers/caregiverInvitationHandler';
import { handler as caregiverAuthHandler } from '../../backend/src/handlers/caregiverAuthorizationHandler';
import { handler as analyticsHandler } from '../../backend/src/handlers/analyticsHandler';
import { handler as reportHandler } from '../../backend/src/handlers/reportHandler';
import { handler as userProfileHandler } from '../../backend/src/handlers/userProfileHandler';
import { handler as notificationHandler } from '../../backend/src/handlers/notificationHandler';
import { handler as reminderWorkflowHandler } from '../../backend/src/handlers/reminderWorkflowHandler';
import { handler as workflowStatusCheckHandler } from '../../backend/src/handlers/workflowStatusCheckHandler';

describe('Phase 6 — Backend Unit Tests', () => {
  let state: InMemoryCloudState;
  const todayStr = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    vi.clearAllMocks();
    state = createInMemoryCloudState();
    attachAwsMocks(state, awsLib as unknown as Parameters<typeof attachAwsMocks>[1]);
  });

  it('1. Medication creation persists to DynamoDB and creates EventBridge schedule', async () => {
    const res = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-1',
        body: {
          name: 'Atorvastatin',
          dosageDescription: '20mg tablet with water',
          scheduleTime: '08:30',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'Asia/Kolkata',
          instructions: 'Take after breakfast',
          active: true,
        },
      })
    );

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body!);
    expect(body.medication.name).toBe('Atorvastatin');
    expect(body.medication.scheduleName).toMatch(/^dg-med-/);
    expect(state.schedules.has(body.medication.scheduleName)).toBe(true);
  });

  it('2. Medication updates modify DynamoDB record and synchronize EventBridge schedule', async () => {
    const createRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-1',
        body: {
          name: 'Lisinopril',
          dosageDescription: '10mg tablet',
          scheduleTime: '09:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'Asia/Kolkata',
        },
      })
    );
    const medId = JSON.parse(createRes.body!).medication.medicationId;

    const patchRes = await medicationHandler(
      buildAuthEvent({
        method: 'PATCH',
        rawPath: `/api/v1/medications/${medId}`,
        userId: 'patient-1',
        pathParameters: { id: medId },
        body: {
          scheduleTime: '10:15',
          active: false,
        },
      })
    );

    expect(patchRes.statusCode).toBe(200);
    const updated = JSON.parse(patchRes.body!).medication;
    expect(updated.scheduleTime).toBe('10:15');
    expect(updated.active).toBe(false);
    const sched = state.schedules.get(updated.scheduleName);
    expect(sched?.state).toBe('DISABLED');
  });

  it('3. Medication deletion removes record and deletes EventBridge schedule', async () => {
    const createRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-1',
        body: {
          name: 'Metformin',
          dosageDescription: '500mg tablet',
          scheduleTime: '07:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'Asia/Kolkata',
        },
      })
    );
    const created = JSON.parse(createRes.body!).medication;

    const delRes = await medicationHandler(
      buildAuthEvent({
        method: 'DELETE',
        rawPath: `/api/v1/medications/${created.medicationId}`,
        userId: 'patient-1',
        pathParameters: { id: created.medicationId },
      })
    );

    expect(delRes.statusCode).toBe(200);
    expect(state.schedules.has(created.scheduleName)).toBe(false);
    expect(state.medications.size).toBe(0);
  });

  it('4 & 5. Dose confirmation transitions PENDING to TAKEN and handles duplicate confirmation idempotently', async () => {
    const createRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-1',
        body: {
          name: 'Amlodipine',
          dosageDescription: '5mg',
          scheduleTime: '08:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'UTC',
        },
      })
    );
    const med = JSON.parse(createRes.body!).medication;

    const todayRes = await doseHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/doses/today',
        userId: 'patient-1',
      })
    );
    const doses = JSON.parse(todayRes.body!).doses;
    expect(doses.length).toBe(1);
    expect(doses[0].status).toBe('PENDING');

    const doseId = doses[0].doseId;

    // First confirmation
    const confirm1 = await doseHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: `/api/v1/doses/${encodeURIComponent(doseId)}/confirm`,
        userId: 'patient-1',
        pathParameters: { id: doseId },
      })
    );
    expect(confirm1.statusCode).toBe(200);
    const body1 = JSON.parse(confirm1.body!);
    expect(body1.dose.status).toBe('TAKEN');
    expect(body1.idempotent).toBe(false);

    // Duplicate confirmation
    const confirm2 = await doseHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: `/api/v1/doses/${encodeURIComponent(doseId)}/confirm`,
        userId: 'patient-1',
        pathParameters: { id: doseId },
      })
    );
    expect(confirm2.statusCode).toBe(200);
    const body2 = JSON.parse(confirm2.body!);
    expect(body2.dose.status).toBe('TAKEN');
    expect(body2.idempotent).toBe(true);
  });

  it('6. Missed-dose workflow escalates unconfirmed dose to connected caregivers', async () => {
    const createRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-1',
        body: {
          name: 'Clopidogrel',
          dosageDescription: '75mg',
          scheduleTime: '09:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'UTC',
        },
      })
    );
    const med = JSON.parse(createRes.body!).medication;

    // Connect caregiver-1 to patient-1
    const invRes = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations',
        userId: 'patient-1',
        body: { relationship: 'Daughter', permissions: ['VIEW_ONLY'], expiresInHours: 24 },
      })
    );
    const passcode = JSON.parse(invRes.body!).passcode;

    await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations/redeem',
        userId: 'caregiver-1',
        body: { passcode, caregiverName: 'Ananya' },
      })
    );

    // Step 1: Reminder workflow runs
    const step1 = await reminderWorkflowHandler({
      patientId: 'patient-1',
      medicationId: med.medicationId,
      scheduledDate: todayStr,
      scheduledTime: '09:00',
      responseWindowSeconds: 60,
    });
    expect(step1.action).toBe('REMINDER_SENT');

    // Step 2: Status check runs without patient confirmation -> escalates
    const step2 = await workflowStatusCheckHandler(step1);
    expect(step2.outcome).toBe('ESCALATED_TO_CAREGIVERS');
    expect(step2.caregiversNotified).toBe(1);
  });

  it('7, 8 & 9. Caregiver invitation creation, expiration check, and revocation', async () => {
    const invRes = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations',
        userId: 'patient-1',
        body: { relationship: 'Son', permissions: ['VIEW_ONLY'], expiresInHours: 24 },
      })
    );
    expect(invRes.statusCode).toBe(201);
    const { invitation, passcode } = JSON.parse(invRes.body!);
    expect(passcode).toMatch(/^DG-/);

    // Revoke invitation before redemption
    const revokeRes = await caregiverAuthHandler(
      buildAuthEvent({
        method: 'DELETE',
        rawPath: `/api/v1/caregivers/${invitation.invitationId}`,
        userId: 'patient-1',
        pathParameters: { id: invitation.invitationId },
      })
    );
    expect(revokeRes.statusCode).toBe(200);

    // Attempt to redeem revoked invitation fails with 410
    const redeemRevoked = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations/redeem',
        userId: 'caregiver-2',
        body: { passcode },
      })
    );
    expect(redeemRevoked.statusCode).toBe(410);
  });

  it('10. Caregiver permission checks enforce VIEW_ONLY vs MANAGE_MEDICATIONS', async () => {
    const invRes = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations',
        userId: 'patient-1',
        body: { relationship: 'Spouse', permissions: ['VIEW_ONLY'], expiresInHours: 24 },
      })
    );
    const { passcode } = JSON.parse(invRes.body!);

    await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations/redeem',
        userId: 'caregiver-readonly',
        body: { passcode },
      })
    );

    // Caregiver with VIEW_ONLY can GET patient-1 medications
    const viewRes = await medicationHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/medications',
        userId: 'caregiver-readonly',
        queryStringParameters: { patientId: 'patient-1' },
      })
    );
    expect(viewRes.statusCode).toBe(200);

    // Caregiver with VIEW_ONLY CANNOT POST medication for patient-1
    const writeRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'caregiver-readonly',
        queryStringParameters: { patientId: 'patient-1' },
        body: {
          name: 'UnauthorizedMed',
          dosageDescription: '10mg',
          scheduleTime: '12:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'UTC',
        },
      })
    );
    expect(writeRes.statusCode).toBe(403);
  });

  it('11 & 12. Analytics aggregation and S3 Report generation + presigned download authorization', async () => {
    await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-1',
        body: {
          name: 'Rosuvastatin',
          dosageDescription: '10mg',
          scheduleTime: '08:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'UTC',
        },
      })
    );

    const todayDosesRes = await doseHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/doses/today',
        userId: 'patient-1',
      })
    );
    const doseId = JSON.parse(todayDosesRes.body!).doses[0].doseId;

    await doseHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: `/api/v1/doses/${encodeURIComponent(doseId)}/confirm`,
        userId: 'patient-1',
        pathParameters: { id: doseId },
      })
    );

    const summaryRes = await analyticsHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/analytics/summary',
        userId: 'patient-1',
      })
    );
    expect(summaryRes.statusCode).toBe(200);
    const summary = JSON.parse(summaryRes.body!);
    expect(summary.overallAdherenceRate).toBe(100);
    expect(summary.totalTaken).toBe(1);

    // Create report
    const repCreate = await reportHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/reports',
        userId: 'patient-1',
        body: { days: 30, format: 'CSV' },
      })
    );
    expect(repCreate.statusCode).toBe(201);
    const report = JSON.parse(repCreate.body!).report;
    expect(state.s3Objects.has(`${report.s3Bucket}/${report.s3Key}`)).toBe(true);

    // Presigned download URL
    const dlRes = await reportHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: `/api/v1/reports/${report.reportId}/download`,
        userId: 'patient-1',
        pathParameters: { id: report.reportId },
      })
    );
    expect(dlRes.statusCode).toBe(200);
    expect(JSON.parse(dlRes.body!).downloadUrl).toContain('X-Amz-Expires=300');
  });

  it('13. Registration / first-login profile provisioning, profile PATCH update, and /health check', async () => {
    // Health check (unauthenticated)
    const healthRes = await userProfileHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/health',
      })
    );
    expect(healthRes.statusCode).toBe(200);
    expect(JSON.parse(healthRes.body!).status).toBe('healthy');

    // First authenticated login provisions user profile in DynamoDB
    const getMeRes = await userProfileHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/me',
        userId: 'new-cognito-user-1',
        email: 'eleanor@doseguard.test',
        name: 'Eleanor Vance',
      })
    );
    expect(getMeRes.statusCode).toBe(200);
    const createdProfile = JSON.parse(getMeRes.body!).profile;
    expect(createdProfile.userId).toBe('new-cognito-user-1');
    expect(createdProfile.fullName).toBe('Eleanor Vance');
    expect(createdProfile.timezone).toBe('Asia/Kolkata');

    // PATCH profile preferences and timezone
    const patchMeRes = await userProfileHandler(
      buildAuthEvent({
        method: 'PATCH',
        rawPath: '/api/v1/me',
        userId: 'new-cognito-user-1',
        email: 'eleanor@doseguard.test',
        body: {
          fullName: 'Eleanor Vance-Updated',
          timezone: 'America/New_York',
          notificationPreferences: {
            emailEnabled: true,
            smsEnabled: true,
            escalationDelayMinutes: 30,
          },
        },
      })
    );
    expect(patchMeRes.statusCode).toBe(200);
    const updatedProfile = JSON.parse(patchMeRes.body!).profile;
    expect(updatedProfile.fullName).toBe('Eleanor Vance-Updated');
    expect(updatedProfile.timezone).toBe('America/New_York');
    expect(updatedProfile.notificationPreferences.escalationDelayMinutes).toBe(30);
  });

  it('14. Notification listing and mark-as-read workflow', async () => {
    const createRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'patient-notif',
        body: {
          name: 'Metoprolol',
          dosageDescription: '50mg',
          scheduleTime: '08:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'UTC',
        },
      })
    );
    const med = JSON.parse(createRes.body!).medication;

    await reminderWorkflowHandler({
      patientId: 'patient-notif',
      medicationId: med.medicationId,
      scheduledDate: todayStr,
      scheduledTime: '08:00',
      responseWindowSeconds: 60,
    });

    const listRes = await notificationHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/notifications',
        userId: 'patient-notif',
      })
    );
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body!);
    expect(listBody.notifications.length).toBe(1);
    expect(listBody.unreadCount).toBe(1);

    const notifId = listBody.notifications[0].notificationId;
    const readRes = await notificationHandler(
      buildAuthEvent({
        method: 'PATCH',
        rawPath: `/api/v1/notifications/${encodeURIComponent(notifId)}/read`,
        userId: 'patient-notif',
        pathParameters: { id: notifId },
      })
    );
    expect(readRes.statusCode).toBe(200);
    expect(JSON.parse(readRes.body!).notification.read).toBe(true);
  });
});

