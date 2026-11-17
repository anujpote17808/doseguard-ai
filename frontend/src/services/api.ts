import { cognitoGetCurrentSessionToken, getRuntimeConfig } from './cognitoAuth';
import { demoApi, isInteractiveDemoMode } from './demoDataService';
import {
  AdherenceReport,
  AnalyticsDetailResponse,
  AnalyticsSummaryResponse,
  CaregiverConnection,
  CaregiverInvitationSummary,
  CaregiverPermission,
  DoseRecord,
  Medication,
  MedicationFrequency,
  NotificationRecord,
  UserProfile,
} from '../types';

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cfg = getRuntimeConfig();
  if (!cfg.apiBaseUrl) {
    throw new Error(
      'API Gateway endpoint URL is not configured. Deploy the AWS CDK stack or configure the API endpoint in Settings / Auth.'
    );
  }

  const token = await cognitoGetCurrentSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${cfg.apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `API request failed with HTTP status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  checkHealth: () =>
    isInteractiveDemoMode()
      ? demoApi.checkHealth()
      : apiRequest<{ status: string; service: string; timestamp: string; region: string }>('/health'),

  getProfile: () =>
    isInteractiveDemoMode()
      ? demoApi.getProfile()
      : apiRequest<{ profile: UserProfile }>('/api/v1/me'),

  updateProfile: (payload: Partial<UserProfile>) =>
    isInteractiveDemoMode()
      ? demoApi.updateProfile(payload)
      : apiRequest<{ profile: UserProfile }>('/api/v1/me', {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),

  getMedications: (patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.getMedications()
      : apiRequest<{ medications: Medication[]; patientId: string }>(
          `/api/v1/medications${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`
        ),

  createMedication: (
    payload: {
      name: string;
      dosageDescription: string;
      scheduleTime: string;
      secondaryScheduleTime?: string;
      frequency: MedicationFrequency;
      startDate: string;
      endDate?: string;
      timezone: string;
      instructions?: string;
      active?: boolean;
    },
    patientId?: string
  ) =>
    isInteractiveDemoMode()
      ? demoApi.createMedication(payload)
      : apiRequest<{ medication: Medication }>(
          `/api/v1/medications${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        ),

  updateMedication: (
    id: string,
    payload: Partial<Medication>,
    patientId?: string
  ) =>
    isInteractiveDemoMode()
      ? demoApi.updateMedication(id, payload)
      : apiRequest<{ medication: Medication }>(
          `/api/v1/medications/${encodeURIComponent(id)}${
            patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''
          }`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          }
        ),

  deleteMedication: (id: string, patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.deleteMedication(id)
      : apiRequest<{ deleted: boolean; medicationId: string }>(
          `/api/v1/medications/${encodeURIComponent(id)}${
            patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''
          }`,
          {
            method: 'DELETE',
          }
        ),

  getTodayDoses: (patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.getTodayDoses()
      : apiRequest<{ doses: DoseRecord[]; patientId: string }>(
          `/api/v1/doses/today${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`
        ),

  getDoseHistory: (patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.getDoseHistory()
      : apiRequest<{ doses: DoseRecord[]; patientId: string }>(
          `/api/v1/doses/history${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`
        ),

  confirmDose: (doseId: string, patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.confirmDose(doseId)
      : apiRequest<{ dose: DoseRecord; idempotent: boolean }>(
          `/api/v1/doses/${encodeURIComponent(doseId)}/confirm${
            patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''
          }`,
          {
            method: 'POST',
            body: JSON.stringify({}),
          }
        ),

  markDoseMissed: (doseId: string, patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.markDoseMissed(doseId)
      : apiRequest<{ dose: DoseRecord; caregiversNotified: number }>(
          `/api/v1/doses/${encodeURIComponent(doseId)}/mark-missed${
            patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''
          }`,
          {
            method: 'POST',
            body: JSON.stringify({}),
          }
        ),

  triggerReminderWorkflow: (medicationId: string, responseWindowSeconds = 60, patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.triggerReminderWorkflow(medicationId, responseWindowSeconds)
      : apiRequest<{
          started: boolean;
          executionArn: string;
          startDate: string;
          responseWindowSeconds: number;
        }>(
          `/api/v1/doses/trigger-workflow${
            patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''
          }`,
          {
            method: 'POST',
            body: JSON.stringify({ medicationId, responseWindowSeconds }),
          }
        ),

  getCaregivers: () =>
    isInteractiveDemoMode()
      ? demoApi.getCaregivers()
      : apiRequest<{
          myCaregivers: CaregiverConnection[];
          connectedPatients: CaregiverConnection[];
          myInvitations: CaregiverInvitationSummary[];
        }>('/api/v1/caregivers'),

  createCaregiverInvitation: (payload: {
    relationship: string;
    permissions: CaregiverPermission[];
    expiresInHours: number;
  }) =>
    isInteractiveDemoMode()
      ? demoApi.createCaregiverInvitation(payload)
      : apiRequest<{
          invitation: CaregiverInvitationSummary;
          passcode: string;
        }>('/api/v1/caregivers/invitations', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  redeemCaregiverInvitation: (payload: { passcode: string; caregiverName?: string }) =>
    isInteractiveDemoMode()
      ? demoApi.redeemCaregiverInvitation(payload)
      : apiRequest<{ connection: CaregiverConnection }>('/api/v1/caregivers/invitations/redeem', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  revokeCaregiverOrInvitation: (id: string) =>
    isInteractiveDemoMode()
      ? demoApi.revokeCaregiverOrInvitation(id)
      : apiRequest<{ revoked: boolean }>(`/api/v1/caregivers/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),

  getAnalyticsSummary: (patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.getAnalyticsSummary()
      : apiRequest<AnalyticsSummaryResponse>(
          `/api/v1/analytics/summary${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`
        ),

  getAnalyticsAdherence: (patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.getAnalyticsAdherence()
      : apiRequest<AnalyticsDetailResponse>(
          `/api/v1/analytics/adherence${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`
        ),

  getNotifications: () =>
    isInteractiveDemoMode()
      ? demoApi.getNotifications()
      : apiRequest<{ notifications: NotificationRecord[]; unreadCount: number }>(
          '/api/v1/notifications'
        ),

  markNotificationRead: (notificationId: string) =>
    isInteractiveDemoMode()
      ? demoApi.markNotificationRead(notificationId)
      : apiRequest<{ notification: NotificationRecord }>(
          `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`,
          {
            method: 'PATCH',
          }
        ),

  getReports: (patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.getReports()
      : apiRequest<{ reports: AdherenceReport[]; patientId: string }>(
          `/api/v1/reports${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`
        ),

  generateReport: (payload: { days: number; format: 'CSV' | 'JSON'; patientId?: string }) =>
    isInteractiveDemoMode()
      ? demoApi.generateReport(payload)
      : apiRequest<{ report: AdherenceReport }>('/api/v1/reports', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  getReportDownloadUrl: (reportId: string, patientId?: string) =>
    isInteractiveDemoMode()
      ? demoApi.getReportDownloadUrl(reportId)
      : apiRequest<{
          reportId: string;
          downloadUrl: string;
          expiresInSeconds: number;
          format: 'CSV' | 'JSON';
        }>(
          `/api/v1/reports/${encodeURIComponent(reportId)}/download${
            patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''
          }`
        ),
};

