export type UserRole = 'patient' | 'caregiver' | 'both';

export interface NotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  escalationDelayMinutes: number; // default 15
}

export interface UserProfile {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  timezone: string; // IANA timezone, e.g., 'Asia/Kolkata', 'America/New_York'
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
  dosageDescription: string; // e.g., "10mg tablet with water"
  scheduleTime: string; // HH:mm in 24h format (e.g., "08:00")
  secondaryScheduleTime?: string; // Optional second time for TWICE_DAILY (e.g., "20:00")
  frequency: MedicationFrequency;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  timezone: string; // IANA timezone
  instructions?: string;
  active: boolean;
  scheduleName?: string; // EventBridge Scheduler schedule identifier
  createdAt: string;
  updatedAt: string;
}

export type DoseStatus = 'PENDING' | 'TAKEN' | 'MISSED';

export interface DoseRecord {
  doseId: string; // deterministic: `${medicationId}#${scheduledDate}#${scheduledTime}`
  patientId: string;
  medicationId: string;
  medicationName: string;
  dosageDescription: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
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

export interface CaregiverInvitation {
  invitationId: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  tokenHash: string; // SHA-256 hex digest of secret passcode/token
  relationship: string; // e.g., "Daughter", "Son", "Spouse", "Visiting Nurse"
  permissions: CaregiverPermission[];
  status: 'PENDING' | 'REDEEMED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string; // ISO string
  ttl: number; // Unix epoch seconds for DynamoDB TTL
  redeemedByCaregiverId?: string;
  redeemedByCaregiverEmail?: string;
  redeemedByCaregiverName?: string;
  redeemedAt?: string;
  createdAt: string;
}

export interface CaregiverConnection {
  connectionId: string; // `${patientId}#${caregiverId}`
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

export type NotificationType =
  | 'PATIENT_REMINDER'
  | 'CAREGIVER_MISSED_DOSE_ALERT'
  | 'CAREGIVER_INVITATION_REDEEMED'
  | 'DOSE_CONFIRMED';

export interface NotificationRecord {
  notificationId: string;
  recipientUserId: string;
  patientId: string;
  doseId?: string;
  medicationId?: string;
  type: NotificationType;
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
  ttl: number;
}

export interface ReminderWorkflowEvent {
  patientId: string;
  medicationId: string;
  scheduledDate?: string; // Optional override, defaults to current date in medication timezone
  scheduledTime: string; // HH:mm
  responseWindowSeconds?: number; // Default 900 (15m), demo override 60
  isDemoTrigger?: boolean;
}

