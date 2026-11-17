import { z } from 'zod';

const ianaTimezoneSchema = z.string().min(2).max(64).refine((tz) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, { message: 'Invalid IANA timezone identifier' });

const time24hSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:mm 24-hour format');
const dateIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['patient', 'caregiver', 'both']).optional(),
  timezone: ianaTimezoneSchema.optional(),
  phoneNumber: z.string().trim().max(24).optional(),
  notificationPreferences: z.object({
    emailEnabled: z.boolean(),
    smsEnabled: z.boolean(),
    escalationDelayMinutes: z.number().int().min(1).max(120),
  }).optional(),
});

export const CreateMedicationSchema = z.object({
  name: z.string().trim().min(1, 'Medication name is required').max(120),
  dosageDescription: z.string().trim().min(1, 'Dosage description is required').max(200),
  scheduleTime: time24hSchema,
  secondaryScheduleTime: time24hSchema.optional(),
  frequency: z.enum(['DAILY', 'TWICE_DAILY', 'WEEKLY', 'CUSTOM']),
  startDate: dateIsoSchema,
  endDate: dateIsoSchema.optional(),
  timezone: ianaTimezoneSchema,
  instructions: z.string().trim().max(500).optional(),
  active: z.boolean().default(true),
});

export const UpdateMedicationSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  dosageDescription: z.string().trim().min(1).max(200).optional(),
  scheduleTime: time24hSchema.optional(),
  secondaryScheduleTime: time24hSchema.nullable().optional(),
  frequency: z.enum(['DAILY', 'TWICE_DAILY', 'WEEKLY', 'CUSTOM']).optional(),
  startDate: dateIsoSchema.optional(),
  endDate: dateIsoSchema.nullable().optional(),
  timezone: ianaTimezoneSchema.optional(),
  instructions: z.string().trim().max(500).optional(),
  active: z.boolean().optional(),
});

export const ConfirmDoseSchema = z.object({
  medicationId: z.string().min(1).optional(),
  scheduledDate: dateIsoSchema.optional(),
  scheduledTime: time24hSchema.optional(),
  notes: z.string().trim().max(300).optional(),
}).optional();

export const CreateInvitationSchema = z.object({
  relationship: z.string().trim().min(1, 'Relationship is required').max(60),
  permissions: z.array(z.enum(['VIEW_ONLY', 'MANAGE_MEDICATIONS'])).min(1).default(['VIEW_ONLY']),
  expiresInHours: z.number().int().min(1).max(168).default(48),
});

export const RedeemInvitationSchema = z.object({
  passcode: z.string().trim().min(8, 'Valid invitation passcode is required').max(128),
  caregiverName: z.string().trim().min(1).max(120).optional(),
});

export const CreateReportSchema = z.object({
  patientId: z.string().min(1).optional(),
  days: z.number().int().min(1).max(365).default(30),
  format: z.enum(['JSON', 'CSV']).default('CSV'),
});

export const TriggerDemoWorkflowSchema = z.object({
  medicationId: z.string().min(1),
  responseWindowSeconds: z.number().int().min(5).max(900).default(60),
});

