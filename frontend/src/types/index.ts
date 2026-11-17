export type UserRole = 'patient' | 'caregiver' | 'both';

export interface NotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  escalationDelayMinutes: number;
}

export interface UserProfile {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  timezone: string;
  phoneNumber?: string;
  notificationPreferences: NotificationPreferences;
  createdAt: string;
  updatedAt: string;
}

export type MedicationFrequency = 'DAILY' | 'TWICE_DAILY' | 'WEEKLY' | 'CUSTOM';

export interface Medication {
  medicationId: string;
  patientId: string;
  name: string;
  dosageDescription: string;
  scheduleTime: string;
  secondaryScheduleTime?: string;
  frequency: MedicationFrequency;
  startDate: string;
  endDate?: string;
  timezone: string;
  instructions?: string;
  active: boolean;
  scheduleName?: string;
  createdAt: string;
  updatedAt: string;
}

export type DoseStatus = 'PENDING' | 'TAKEN' | 'MISSED';

export interface DoseRecord {
  doseId: string;
  patientId: string;
  medicationId: string;
  medicationName: string;
  dosageDescription: string;
  scheduledDate: string;
  scheduledTime: string;
  scheduledTimestampIso: string;
  status: DoseStatus;
  confirmedAt?: string;
  confirmedBy?: string;
  missedAt?: string;
  workflowExecutionArn?: string;
  workflowStatus?: 'SCHEDULED' | 'REMINDER_SENT' | 'CONFIRMED_IN_TIME' | 'ESCALATED' | 'SKIPPED_INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export type CaregiverPermission = 'VIEW_ONLY' | 'MANAGE_MEDICATIONS';

export interface CaregiverConnection {
  connectionId: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  caregiverId: string;
  caregiverName: string;
  caregiverEmail: string;
  relationship: string;
  permissions: CaregiverPermission[];
  status: 'ACTIVE' | 'REVOKED';
  connectedAt: string;
  updatedAt: string;
}

export interface CaregiverInvitationSummary {
  invitationId: string;
  relationship: string;
  permissions: CaregiverPermission[];
  status: 'PENDING' | 'REDEEMED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  redeemedByCaregiverName?: string;
  redeemedAt?: string;
}

export interface NotificationRecord {
  notificationId: string;
  recipientUserId: string;
  patientId: string;
  doseId?: string;
  medicationId?: string;
  type:
    | 'PATIENT_REMINDER'
    | 'CAREGIVER_MISSED_DOSE_ALERT'
    | 'CAREGIVER_INVITATION_REDEEMED'
    | 'DOSE_CONFIRMED';
  title: string;
  message: string;
  deliveryChannel: 'SNS_EMAIL' | 'SES_EMAIL' | 'IN_APP';
  deliveryStatus: 'DELIVERED' | 'PENDING_CONFIRMATION' | 'FAILED' | 'RECORDED';
  providerMessageId?: string;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

export interface AdherenceReport {
  reportId: string;
  patientId: string;
  requestedByUserId: string;
  periodStart: string;
  periodEnd: string;
  totalScheduled: number;
  totalTaken: number;
  totalMissed: number;
  totalPending: number;
  adherencePercentage: number;
  s3Bucket: string;
  s3Key: string;
  format: 'JSON' | 'CSV';
  createdAt: string;
}

export interface AnalyticsSummaryResponse {
  patientId: string;
  activeMedicationsCount: number;
  totalMedicationsCount: number;
  today: {
    total: number;
    taken: number;
    missed: number;
    pending: number;
    adherenceRate: number;
  };
  weeklyAdherenceRate: number;
  monthlyAdherenceRate: number;
  overallAdherenceRate: number;
  totalTaken: number;
  totalMissed: number;
  totalPending: number;
  recentAlertsCount: number;
}

export interface DailyAdherencePoint {
  date: string;
  taken: number;
  missed: number;
  pending: number;
  adherenceRate: number;
}

export interface AnalyticsDetailResponse {
  patientId: string;
  dailyAdherence: number;
  weeklyAdherence: number;
  monthlyAdherence: number;
  dailySeries: DailyAdherencePoint[];
  totals: {
    taken: number;
    missed: number;
    pending: number;
    total: number;
  };
  medicationHistory: DoseRecord[];
  alertHistory: NotificationRecord[];
}

