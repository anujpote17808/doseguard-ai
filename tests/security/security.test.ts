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
import { handler as caregiverAuthHandler } from '../../backend/src/handlers/caregiverAuthorizationHandler';
import { handler as reportHandler } from '../../backend/src/handlers/reportHandler';
import { hashInvitationToken } from '../../backend/src/lib/caregiverAuth';

describe('Phase 6 — Security & Tenant Isolation Tests', () => {
  let state: InMemoryCloudState;
  const todayStr = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    vi.clearAllMocks();
    state = createInMemoryCloudState();
    attachAwsMocks(state, awsLib as unknown as Parameters<typeof attachAwsMocks>[1]);
  });

  it('1 & 2. Unauthenticated API request and invalid/empty JWT claims are rejected with 401', async () => {
    const unauthRes = await medicationHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/medications',
        // no userId -> no JWT claims
      })
    );
    expect(unauthRes.statusCode).toBe(401);

    const emptyClaimEvent = buildAuthEvent({
      method: 'GET',
      rawPath: '/api/v1/medications',
      userId: '   ',
    });
    const invalidJwtRes = await medicationHandler(emptyClaimEvent);
    expect(invalidJwtRes.statusCode).toBe(401);
  });

  it('3. User A cannot access or modify User B medication by changing patientId or medicationId', async () => {
    const createRes = await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'user-b',
        body: {
          name: 'Warfarin',
          dosageDescription: '2mg',
          scheduleTime: '18:00',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'UTC',
        },
      })
    );
    const medB = JSON.parse(createRes.body!).medication;

    // User A tries to read User B's medications
    const attackRead = await medicationHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/medications',
        userId: 'user-a',
        queryStringParameters: { patientId: 'user-b' },
      })
    );
    expect(attackRead.statusCode).toBe(403);

    // User A tries to delete User B's medication
    const attackDelete = await medicationHandler(
      buildAuthEvent({
        method: 'DELETE',
        rawPath: `/api/v1/medications/${medB.medicationId}`,
        userId: 'user-a',
        pathParameters: { id: medB.medicationId },
        queryStringParameters: { patientId: 'user-b' },
      })
    );
    expect(attackDelete.statusCode).toBe(403);
  });

  it('4. User A cannot confirm User B dose', async () => {
    await medicationHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/medications',
        userId: 'user-b',
        body: {
          name: 'Levothyroxine',
          dosageDescription: '50mcg',
          scheduleTime: '06:30',
          frequency: 'DAILY',
          startDate: todayStr,
          timezone: 'UTC',
        },
      })
    );

    const todayRes = await doseHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/doses/today',
        userId: 'user-b',
      })
    );
    const doseB = JSON.parse(todayRes.body!).doses[0];

    const attackConfirm = await doseHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: `/api/v1/doses/${encodeURIComponent(doseB.doseId)}/confirm`,
        userId: 'user-a',
        pathParameters: { id: doseB.doseId },
        queryStringParameters: { patientId: 'user-b' },
      })
    );
    expect(attackConfirm.statusCode).toBe(403);
  });

  it('5. Unconnected caregiver cannot access patient data', async () => {
    const res = await doseHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/doses/today',
        userId: 'unconnected-caregiver',
        queryStringParameters: { patientId: 'patient-xyz' },
      })
    );
    expect(res.statusCode).toBe(403);
  });

  it('6. Expired invitation is rejected and self-redemption is forbidden', async () => {
    const invRes = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations',
        userId: 'patient-1',
        body: { relationship: 'Brother', permissions: ['VIEW_ONLY'], expiresInHours: 1 },
      })
    );
    const { passcode } = JSON.parse(invRes.body!);

    // Self-redemption rejected with 400
    const selfRedeem = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations/redeem',
        userId: 'patient-1',
        body: { passcode },
      })
    );
    expect(selfRedeem.statusCode).toBe(400);

    // Expire the invitation in DynamoDB
    const tokenHash = hashInvitationToken(passcode);
    const stored = state.invitations.get(tokenHash)!;
    stored.expiresAt = new Date(Date.now() - 60000).toISOString();
    state.invitations.set(tokenHash, stored);

    // Expired invitation rejected with 410
    const expiredRedeem = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations/redeem',
        userId: 'caregiver-1',
        body: { passcode },
      })
    );
    expect(expiredRedeem.statusCode).toBe(410);
  });

  it('7. Redeemed invitation cannot be reused (atomic single-use enforcement)', async () => {
    const invRes = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations',
        userId: 'patient-1',
        body: { relationship: 'Sister', permissions: ['VIEW_ONLY'], expiresInHours: 24 },
      })
    );
    const { passcode } = JSON.parse(invRes.body!);

    const firstRedeem = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations/redeem',
        userId: 'caregiver-1',
        body: { passcode },
      })
    );
    expect(firstRedeem.statusCode).toBe(200);

    const replayRedeem = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations/redeem',
        userId: 'caregiver-2',
        body: { passcode },
      })
    );
    expect(replayRedeem.statusCode).toBe(409);
  });

  it('8. Revoked caregiver access is immediately rejected on subsequent requests', async () => {
    const invRes = await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations',
        userId: 'patient-1',
        body: { relationship: 'Nurse', permissions: ['VIEW_ONLY'], expiresInHours: 24 },
      })
    );
    const { passcode } = JSON.parse(invRes.body!);

    await caregiverInviteHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/caregivers/invitations/redeem',
        userId: 'caregiver-1',
        body: { passcode },
      })
    );

    // Access works while ACTIVE
    const okRes = await doseHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/doses/today',
        userId: 'caregiver-1',
        queryStringParameters: { patientId: 'patient-1' },
      })
    );
    expect(okRes.statusCode).toBe(200);

    // Patient revokes caregiver-1
    const revokeRes = await caregiverAuthHandler(
      buildAuthEvent({
        method: 'DELETE',
        rawPath: '/api/v1/caregivers/caregiver-1',
        userId: 'patient-1',
        pathParameters: { id: 'caregiver-1' },
      })
    );
    expect(revokeRes.statusCode).toBe(200);

    // Subsequent access by caregiver-1 is rejected with 403
    const deniedRes = await doseHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: '/api/v1/doses/today',
        userId: 'caregiver-1',
        queryStringParameters: { patientId: 'patient-1' },
      })
    );
    expect(deniedRes.statusCode).toBe(403);
  });

  it('9. S3 private reports cannot be accessed or downloaded without authorization', async () => {
    const repCreate = await reportHandler(
      buildAuthEvent({
        method: 'POST',
        rawPath: '/api/v1/reports',
        userId: 'patient-1',
        body: { days: 7, format: 'CSV' },
      })
    );
    const report = JSON.parse(repCreate.body!).report;

    // Unauthorized User B attempts to get presigned download URL for Patient 1's report
    const unauthorizedDownload = await reportHandler(
      buildAuthEvent({
        method: 'GET',
        rawPath: `/api/v1/reports/${report.reportId}/download`,
        userId: 'intruder-user',
        pathParameters: { id: report.reportId },
        queryStringParameters: { patientId: 'patient-1' },
      })
    );
    expect(unauthorizedDownload.statusCode).toBe(403);
  });
});

