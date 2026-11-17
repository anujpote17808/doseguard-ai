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

const DEMO_MODE_FLAG_KEY = 'doseguard_interactive_demo_mode';
const DEMO_STORE_KEY = 'doseguard_interactive_demo_state_v1';

export function isInteractiveDemoMode(): boolean {
  return localStorage.getItem(DEMO_MODE_FLAG_KEY) === 'true';
}

export function setInteractiveDemoMode(enabled: boolean): void {
  if (enabled) {
    localStorage.setItem(DEMO_MODE_FLAG_KEY, 'true');
    ensureDemoStoreInitialized();
  } else {
    localStorage.removeItem(DEMO_MODE_FLAG_KEY);
  }
}

export function resetInteractiveDemoStore(): void {
  localStorage.removeItem(DEMO_STORE_KEY);
  ensureDemoStoreInitialized();
}

interface DemoState {
  profile: UserProfile;
  medications: Medication[];
  doses: DoseRecord[];
  myCaregivers: CaregiverConnection[];
  connectedPatients: CaregiverConnection[];
  myInvitations: CaregiverInvitationSummary[];
  pendingPasscodes: Record<string, { relationship: string; permissions: CaregiverPermission[]; invitationId: string }>;
  notifications: NotificationRecord[];
  reports: AdherenceReport[];
}

function getDateOffsetStr(daysOffset: number): string {
  const d = new Date(Date.now() + daysOffset * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

function createInitialDemoState(): DemoState {
  const nowIso = new Date().toISOString();
  const todayStr = getDateOffsetStr(0);

  const profile: UserProfile = {
    userId: 'demo-patient-eleanor-001',
    email: 'eleanor.vance.demo@doseguard.example',
    fullName: 'Eleanor Vance (Synthetic Demo Patient)',
    role: 'both',
    timezone: 'Asia/Kolkata',
    phoneNumber: '+91-98000-00000',
    notificationPreferences: {
      emailEnabled: true,
      smsEnabled: false,
      escalationDelayMinutes: 15,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const medications: Medication[] = [
    {
      medicationId: 'med_demo_atorva',
      patientId: profile.userId,
      name: 'Atorvastatin (Synthetic Sample)',
      dosageDescription: '20mg tablet after breakfast',
      scheduleTime: '08:00',
      frequency: 'DAILY',
      startDate: getDateOffsetStr(-14),
      timezone: 'Asia/Kolkata',
      instructions: 'Synthetic demonstration schedule — take with water',
      active: true,
      scheduleName: 'dg-med-med_demo_atorva',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      medicationId: 'med_demo_metoprolol',
      patientId: profile.userId,
      name: 'Metoprolol Succinate (Synthetic Sample)',
      dosageDescription: '50mg extended-release tablet',
      scheduleTime: '14:00',
      frequency: 'DAILY',
      startDate: getDateOffsetStr(-14),
      timezone: 'Asia/Kolkata',
      instructions: 'Synthetic demonstration schedule — afternoon dose',
      active: true,
      scheduleName: 'dg-med-med_demo_metoprolol',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      medicationId: 'med_demo_metformin',
      patientId: profile.userId,
      name: 'Metformin HCl (Synthetic Sample)',
      dosageDescription: '500mg tablet with dinner',
      scheduleTime: '20:00',
      frequency: 'DAILY',
      startDate: getDateOffsetStr(-14),
      timezone: 'Asia/Kolkata',
      instructions: 'Synthetic demonstration schedule — evening dose',
      active: true,
      scheduleName: 'dg-med-med_demo_metformin',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  // Build 7 days of historical synthetic doses + today's doses
  const doses: DoseRecord[] = [];
  for (let offset = -6; offset <= -1; offset++) {
    const dateStr = getDateOffsetStr(offset);
    medications.forEach((med, idx) => {
      const isMissedSample = offset === -2 && idx === 1;
      doses.push({
        doseId: `${med.medicationId}#${dateStr}#${med.scheduleTime}`,
        patientId: profile.userId,
        medicationId: med.medicationId,
        medicationName: med.name,
        dosageDescription: med.dosageDescription,
        scheduledDate: dateStr,
        scheduledTime: med.scheduleTime,
        scheduledTimestampIso: `${dateStr}T${med.scheduleTime}:00Z`,
        status: isMissedSample ? 'MISSED' : 'TAKEN',
        confirmedAt: isMissedSample ? undefined : `${dateStr}T${med.scheduleTime}:04Z`,
        confirmedBy: isMissedSample ? undefined : profile.userId,
        missedAt: isMissedSample ? `${dateStr}T${med.scheduleTime}:15Z` : undefined,
        workflowStatus: isMissedSample ? 'ESCALATED' : 'CONFIRMED_IN_TIME',
        createdAt: `${dateStr}T00:00:00Z`,
        updatedAt: `${dateStr}T${med.scheduleTime}:15Z`,
      });
    });
  }

  // Today's doses: 08:00 TAKEN, 14:00 PENDING (ready to confirm or escalate!), 20:00 PENDING
  doses.push(
    {
      doseId: `med_demo_atorva#${todayStr}#08:00`,
      patientId: profile.userId,
      medicationId: 'med_demo_atorva',
      medicationName: 'Atorvastatin (Synthetic Sample)',
      dosageDescription: '20mg tablet after breakfast',
      scheduledDate: todayStr,
      scheduledTime: '08:00',
      scheduledTimestampIso: `${todayStr}T08:00:00Z`,
      status: 'TAKEN',
      confirmedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      confirmedBy: profile.userId,
      workflowStatus: 'CONFIRMED_IN_TIME',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      doseId: `med_demo_metoprolol#${todayStr}#14:00`,
      patientId: profile.userId,
      medicationId: 'med_demo_metoprolol',
      medicationName: 'Metoprolol Succinate (Synthetic Sample)',
      dosageDescription: '50mg extended-release tablet',
      scheduledDate: todayStr,
      scheduledTime: '14:00',
      scheduledTimestampIso: `${todayStr}T14:00:00Z`,
      status: 'PENDING',
      workflowStatus: 'REMINDER_SENT',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      doseId: `med_demo_metformin#${todayStr}#20:00`,
      patientId: profile.userId,
      medicationId: 'med_demo_metformin',
      medicationName: 'Metformin HCl (Synthetic Sample)',
      dosageDescription: '500mg tablet with dinner',
      scheduledDate: todayStr,
      scheduledTime: '20:00',
      scheduledTimestampIso: `${todayStr}T20:00:00Z`,
      status: 'PENDING',
      workflowStatus: 'SCHEDULED',
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  );

  const myCaregivers: CaregiverConnection[] = [
    {
      connectionId: `${profile.userId}#caregiver_demo_priya`,
      patientId: profile.userId,
      patientName: profile.fullName,
      patientEmail: profile.email,
      caregiverId: 'caregiver_demo_priya',
      caregiverName: 'Priya Sharma (Synthetic Demo Daughter)',
      caregiverEmail: 'priya.caregiver.demo@doseguard.example',
      relationship: 'Daughter',
      permissions: ['VIEW_ONLY'],
      status: 'ACTIVE',
      connectedAt: getDateOffsetStr(-10) + 'T10:00:00Z',
      updatedAt: nowIso,
    },
  ];

  // Also allow the user to explore the Caregiver Dashboard monitoring Eleanor Vance
  const connectedPatients: CaregiverConnection[] = [
    {
      connectionId: `${profile.userId}#${profile.userId}`,
      patientId: profile.userId,
      patientName: 'Eleanor Vance (Synthetic Demo Patient)',
      patientEmail: profile.email,
      caregiverId: profile.userId,
      caregiverName: 'Priya Sharma (Synthetic Demo Caregiver View)',
      caregiverEmail: 'priya.caregiver.demo@doseguard.example',
      relationship: 'Daughter',
      permissions: ['VIEW_ONLY'],
      status: 'ACTIVE',
      connectedAt: getDateOffsetStr(-10) + 'T10:00:00Z',
      updatedAt: nowIso,
    },
  ];

  const myInvitations: CaregiverInvitationSummary[] = [
    {
      invitationId: 'inv_demo_redeemed_01',
      relationship: 'Daughter',
      permissions: ['VIEW_ONLY'],
      status: 'REDEEMED',
      expiresAt: getDateOffsetStr(-8) + 'T10:00:00Z',
      createdAt: getDateOffsetStr(-10) + 'T09:00:00Z',
      redeemedByCaregiverName: 'Priya Sharma (Synthetic Demo Daughter)',
      redeemedAt: getDateOffsetStr(-10) + 'T10:00:00Z',
    },
  ];

  const notifications: NotificationRecord[] = [
    {
      notificationId: 'notif_demo_1',
      recipientUserId: profile.userId,
      patientId: profile.userId,
      doseId: `med_demo_metoprolol#${todayStr}#14:00`,
      medicationId: 'med_demo_metoprolol',
      type: 'PATIENT_REMINDER',
      title: 'Scheduled Medication Reminder (14:00) [SIMULATED DEMO]',
      message:
        'Synthetic Demo Reminder: Please take your scheduled dose of Metoprolol Succinate (50mg extended-release tablet) and confirm it within the response window.',
      deliveryChannel: 'SNS_EMAIL',
      deliveryStatus: 'DELIVERED',
      read: false,
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      notificationId: 'notif_demo_2',
      recipientUserId: profile.userId,
      patientId: profile.userId,
      doseId: `med_demo_metoprolol#${getDateOffsetStr(-2)}#14:00`,
      medicationId: 'med_demo_metoprolol',
      type: 'CAREGIVER_MISSED_DOSE_ALERT',
      title: 'Caregiver Escalation: Eleanor Vance Missed Dose [SIMULATED DEMO]',
      message:
        'Synthetic Demo Escalation: Eleanor Vance did not confirm their 14:00 dose of Metoprolol Succinate on ' +
        getDateOffsetStr(-2) +
        '. Connected caregiver Priya Sharma was alerted.',
      deliveryChannel: 'SNS_EMAIL',
      deliveryStatus: 'DELIVERED',
      read: true,
      createdAt: getDateOffsetStr(-2) + 'T14:15:00Z',
    },
  ];

  const reports: AdherenceReport[] = [
    {
      reportId: 'rep_demo_sample_30d',
      patientId: profile.userId,
      requestedByUserId: profile.userId,
      periodStart: getDateOffsetStr(-30),
      periodEnd: todayStr,
      totalScheduled: 21,
      totalTaken: 18,
      totalMissed: 1,
      totalPending: 2,
      adherencePercentage: 95,
      s3Bucket: 'doseguard-demo-simulated-s3-bucket',
      s3Key: `reports/${profile.userId}/rep_demo_sample_30d.csv`,
      format: 'CSV',
      createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    },
  ];

  return {
    profile,
    medications,
    doses,
    myCaregivers,
    connectedPatients,
    myInvitations,
    pendingPasscodes: {},
    notifications,
    reports,
  };
}

function ensureDemoStoreInitialized(): DemoState {
  const raw = localStorage.getItem(DEMO_STORE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as DemoState;
    } catch {
      // recreate
    }
  }
  const initial = createInitialDemoState();
  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(initial));
  return initial;
}

function saveDemoState(state: DemoState): void {
  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(state));
}

function computeDemoAdherence(doses: DoseRecord[]) {
  const totalDoses = doses.length;
  const takenCount = doses.filter((d) => d.status === 'TAKEN').length;
  const missedCount = doses.filter((d) => d.status === 'MISSED').length;
  const pendingCount = doses.filter((d) => d.status === 'PENDING').length;
  const resolved = takenCount + missedCount;
  const overallAdherenceRate =
    resolved > 0 ? Math.round((takenCount / resolved) * 100) : 100;

  const byDate = new Map<string, { taken: number; missed: number; pending: number }>();
  for (const d of doses) {
    const entry = byDate.get(d.scheduledDate) || { taken: 0, missed: 0, pending: 0 };
    if (d.status === 'TAKEN') entry.taken += 1;
    else if (d.status === 'MISSED') entry.missed += 1;
    else entry.pending += 1;
    byDate.set(d.scheduledDate, entry);
  }

  const dailySeries = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => {
      const resCount = counts.taken + counts.missed;
      return {
        date,
        taken: counts.taken,
        missed: counts.missed,
        pending: counts.pending,
        adherenceRate: resCount > 0 ? Math.round((counts.taken / resCount) * 100) : 100,
      };
    });

  return {
    totalDoses,
    takenCount,
    missedCount,
    pendingCount,
    overallAdherenceRate,
    dailySeries,
  };
}

export const demoApi = {
  checkHealth: async () => ({
    status: 'demo-simulated-mode',
    service: 'doseguard-ai-interactive-demo',
    timestamp: new Date().toISOString(),
    region: 'ap-south-1 (Simulated Demo)',
  }),

  getProfile: async () => {
    const st = ensureDemoStoreInitialized();
    return { profile: st.profile };
  },

  updateProfile: async (payload: Partial<UserProfile>) => {
    const st = ensureDemoStoreInitialized();
    st.profile = {
      ...st.profile,
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    saveDemoState(st);
    return { profile: st.profile };
  },

  getMedications: async () => {
    const st = ensureDemoStoreInitialized();
    return {
      medications: st.medications.slice().sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime)),
      patientId: st.profile.userId,
    };
  },

  createMedication: async (payload: {
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
  }) => {
    const st = ensureDemoStoreInitialized();
    const now = new Date().toISOString();
    const todayStr = getDateOffsetStr(0);
    const medId = `med_demo_${Math.random().toString(36).slice(2, 9)}`;
    const medication: Medication = {
      medicationId: medId,
      patientId: st.profile.userId,
      name: payload.name,
      dosageDescription: payload.dosageDescription,
      scheduleTime: payload.scheduleTime,
      secondaryScheduleTime: payload.secondaryScheduleTime,
      frequency: payload.frequency,
      startDate: payload.startDate,
      endDate: payload.endDate,
      timezone: payload.timezone,
      instructions: payload.instructions,
      active: payload.active ?? true,
      scheduleName: `dg-med-${medId}`,
      createdAt: now,
      updatedAt: now,
    };
    st.medications.push(medication);

    if (medication.active) {
      const doseId = `${medId}#${todayStr}#${medication.scheduleTime}`;
      st.doses.push({
        doseId,
        patientId: st.profile.userId,
        medicationId: medId,
        medicationName: medication.name,
        dosageDescription: medication.dosageDescription,
        scheduledDate: todayStr,
        scheduledTime: medication.scheduleTime,
        scheduledTimestampIso: `${todayStr}T${medication.scheduleTime}:00Z`,
        status: 'PENDING',
        workflowStatus: 'SCHEDULED',
        createdAt: now,
        updatedAt: now,
      });
    }

    saveDemoState(st);
    return { medication };
  },

  updateMedication: async (id: string, payload: Partial<Medication>) => {
    const st = ensureDemoStoreInitialized();
    const idx = st.medications.findIndex((m) => m.medicationId === id);
    if (idx === -1) throw new Error('Medication not found in demo store');
    st.medications[idx] = {
      ...st.medications[idx],
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    saveDemoState(st);
    return { medication: st.medications[idx] };
  },

  deleteMedication: async (id: string) => {
    const st = ensureDemoStoreInitialized();
    st.medications = st.medications.filter((m) => m.medicationId !== id);
    saveDemoState(st);
    return { deleted: true, medicationId: id };
  },

  getTodayDoses: async () => {
    const st = ensureDemoStoreInitialized();
    const todayStr = getDateOffsetStr(0);
    return {
      doses: st.doses
        .filter((d) => d.scheduledDate === todayStr)
        .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)),
      patientId: st.profile.userId,
    };
  },

  getDoseHistory: async () => {
    const st = ensureDemoStoreInitialized();
    return {
      doses: st.doses
        .slice()
        .sort((a, b) =>
          `${b.scheduledDate}T${b.scheduledTime}`.localeCompare(`${a.scheduledDate}T${a.scheduledTime}`)
        ),
      patientId: st.profile.userId,
    };
  },

  confirmDose: async (doseId: string) => {
    const st = ensureDemoStoreInitialized();
    const dose = st.doses.find((d) => d.doseId === doseId);
    if (!dose) throw new Error('Scheduled dose not found');
    if (dose.status === 'TAKEN') {
      return { dose, idempotent: true };
    }
    const now = new Date().toISOString();
    dose.status = 'TAKEN';
    dose.confirmedAt = now;
    dose.confirmedBy = st.profile.userId;
    dose.workflowStatus = 'CONFIRMED_IN_TIME';
    dose.updatedAt = now;
    saveDemoState(st);
    return { dose, idempotent: false };
  },

  markDoseMissed: async (doseId: string) => {
    const st = ensureDemoStoreInitialized();
    const dose = st.doses.find((d) => d.doseId === doseId);
    if (!dose) throw new Error('Scheduled dose not found');
    const now = new Date().toISOString();
    dose.status = 'MISSED';
    dose.missedAt = now;
    dose.workflowStatus = 'ESCALATED';
    dose.updatedAt = now;

    st.notifications.unshift({
      notificationId: `notif_demo_missed_${Date.now()}`,
      recipientUserId: st.profile.userId,
      patientId: st.profile.userId,
      doseId: dose.doseId,
      medicationId: dose.medicationId,
      type: 'CAREGIVER_MISSED_DOSE_ALERT',
      title: `Caregiver Escalation: ${dose.medicationName} Missed [SIMULATED DEMO]`,
      message: `Synthetic Demo Escalation: Scheduled dose (${dose.medicationName} - ${dose.dosageDescription}) at ${dose.scheduledTime} was marked MISSED. Connected caregivers (${st.myCaregivers.length}) alerted.`,
      deliveryChannel: 'SNS_EMAIL',
      deliveryStatus: 'DELIVERED',
      read: false,
      createdAt: now,
    });

    saveDemoState(st);
    return { dose, caregiversNotified: st.myCaregivers.length };
  },

  triggerReminderWorkflow: async (medicationId: string, responseWindowSeconds = 60) => {
    const st = ensureDemoStoreInitialized();
    const med = st.medications.find((m) => m.medicationId === medicationId);
    if (!med) throw new Error('Medication not found');
    const todayStr = getDateOffsetStr(0);
    const dose = st.doses.find(
      (d) => d.medicationId === medicationId && d.scheduledDate === todayStr
    );
    const now = new Date().toISOString();
    if (dose && dose.status === 'PENDING') {
      dose.workflowStatus = 'REMINDER_SENT';
      dose.updatedAt = now;
    }

    st.notifications.unshift({
      notificationId: `notif_demo_wf_${Date.now()}`,
      recipientUserId: st.profile.userId,
      patientId: st.profile.userId,
      doseId: dose?.doseId,
      medicationId: med.medicationId,
      type: 'PATIENT_REMINDER',
      title: `Step Functions Demo Reminder Triggered (${med.scheduleTime}) [SIMULATED]`,
      message: `Simulated Step Functions workflow started for ${med.name} (${med.dosageDescription}) with a ${responseWindowSeconds}s response window.`,
      deliveryChannel: 'SNS_EMAIL',
      deliveryStatus: 'DELIVERED',
      read: false,
      createdAt: now,
    });

    saveDemoState(st);
    return {
      started: true,
      executionArn: `arn:aws:states:ap-south-1:demo-simulation:execution:DoseGuardAI-ReminderAndEscalationWorkflow:demo-${Date.now()}`,
      startDate: now,
      responseWindowSeconds,
    };
  },

  getCaregivers: async () => {
    const st = ensureDemoStoreInitialized();
    return {
      myCaregivers: st.myCaregivers,
      connectedPatients: st.connectedPatients,
      myInvitations: st.myInvitations,
    };
  },

  createCaregiverInvitation: async (payload: {
    relationship: string;
    permissions: CaregiverPermission[];
    expiresInHours: number;
  }) => {
    const st = ensureDemoStoreInitialized();
    const rand = Math.random().toString(16).slice(2, 10).toUpperCase().padEnd(8, 'A');
    const passcode = `DG-DEMO-${rand.slice(0, 4)}-${rand.slice(4, 8)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + payload.expiresInHours * 3600 * 1000).toISOString();
    const invitationId = `inv_demo_${Date.now()}`;

    const invitation: CaregiverInvitationSummary = {
      invitationId,
      relationship: payload.relationship,
      permissions: payload.permissions,
      status: 'PENDING',
      expiresAt,
      createdAt: now.toISOString(),
    };

    st.myInvitations.unshift(invitation);
    st.pendingPasscodes[passcode] = {
      relationship: payload.relationship,
      permissions: payload.permissions,
      invitationId,
    };
    saveDemoState(st);
    return { invitation, passcode };
  },

  redeemCaregiverInvitation: async (payload: { passcode: string; caregiverName?: string }) => {
    const st = ensureDemoStoreInitialized();
    const code = payload.passcode.trim().toUpperCase();
    const pending = st.pendingPasscodes[code];
    const now = new Date().toISOString();

    const relationship = pending?.relationship || 'Family Caregiver';
    const permissions: CaregiverPermission[] = pending?.permissions || ['VIEW_ONLY'];
    const caregiverName = payload.caregiverName || 'Rohan Mehta (Synthetic Demo Caregiver)';

    if (pending) {
      const inv = st.myInvitations.find((i) => i.invitationId === pending.invitationId);
      if (inv) {
        inv.status = 'REDEEMED';
        inv.redeemedByCaregiverName = caregiverName;
        inv.redeemedAt = now;
      }
      delete st.pendingPasscodes[code];
    }

    const connection: CaregiverConnection = {
      connectionId: `${st.profile.userId}#cg_${Date.now()}`,
      patientId: st.profile.userId,
      patientName: st.profile.fullName,
      patientEmail: st.profile.email,
      caregiverId: `cg_demo_${Date.now()}`,
      caregiverName,
      caregiverEmail: 'caregiver.redeemed.demo@doseguard.example',
      relationship,
      permissions,
      status: 'ACTIVE',
      connectedAt: now,
      updatedAt: now,
    };

    st.myCaregivers.push(connection);
    saveDemoState(st);
    return { connection };
  },

  revokeCaregiverOrInvitation: async (id: string) => {
    const st = ensureDemoStoreInitialized();
    if (id.startsWith('inv_')) {
      const inv = st.myInvitations.find((i) => i.invitationId === id);
      if (inv) inv.status = 'REVOKED';
    } else {
      st.myCaregivers = st.myCaregivers.filter((c) => c.caregiverId !== id);
    }
    saveDemoState(st);
    return { revoked: true };
  },

  getAnalyticsSummary: async (): Promise<AnalyticsSummaryResponse> => {
    const st = ensureDemoStoreInitialized();
    const todayStr = getDateOffsetStr(0);
    const todayDoses = st.doses.filter((d) => d.scheduledDate === todayStr);
    const todayStats = computeDemoAdherence(todayDoses);
    const allStats = computeDemoAdherence(st.doses);

    return {
      patientId: st.profile.userId,
      activeMedicationsCount: st.medications.filter((m) => m.active).length,
      totalMedicationsCount: st.medications.length,
      today: {
        total: todayStats.totalDoses,
        taken: todayStats.takenCount,
        missed: todayStats.missedCount,
        pending: todayStats.pendingCount,
        adherenceRate: todayStats.overallAdherenceRate,
      },
      weeklyAdherenceRate: allStats.overallAdherenceRate,
      monthlyAdherenceRate: allStats.overallAdherenceRate,
      overallAdherenceRate: allStats.overallAdherenceRate,
      totalTaken: allStats.takenCount,
      totalMissed: allStats.missedCount,
      totalPending: allStats.pendingCount,
      recentAlertsCount: st.notifications.length,
    };
  },

  getAnalyticsAdherence: async (): Promise<AnalyticsDetailResponse> => {
    const st = ensureDemoStoreInitialized();
    const todayStr = getDateOffsetStr(0);
    const todayStats = computeDemoAdherence(
      st.doses.filter((d) => d.scheduledDate === todayStr)
    );
    const allStats = computeDemoAdherence(st.doses);

    return {
      patientId: st.profile.userId,
      dailyAdherence: todayStats.overallAdherenceRate,
      weeklyAdherence: allStats.overallAdherenceRate,
      monthlyAdherence: allStats.overallAdherenceRate,
      dailySeries: allStats.dailySeries,
      totals: {
        taken: allStats.takenCount,
        missed: allStats.missedCount,
        pending: allStats.pendingCount,
        total: allStats.totalDoses,
      },
      medicationHistory: st.doses
        .slice()
        .sort((a, b) =>
          `${b.scheduledDate}T${b.scheduledTime}`.localeCompare(`${a.scheduledDate}T${a.scheduledTime}`)
        ),
      alertHistory: st.notifications,
    };
  },

  getNotifications: async () => {
    const st = ensureDemoStoreInitialized();
    return {
      notifications: st.notifications,
      unreadCount: st.notifications.filter((n) => !n.read).length,
    };
  },

  markNotificationRead: async (notificationId: string) => {
    const st = ensureDemoStoreInitialized();
    const notif = st.notifications.find((n) => n.notificationId === notificationId);
    if (!notif) throw new Error('Notification not found');
    notif.read = true;
    notif.readAt = new Date().toISOString();
    saveDemoState(st);
    return { notification: notif };
  },

  getReports: async () => {
    const st = ensureDemoStoreInitialized();
    return {
      reports: st.reports,
      patientId: st.profile.userId,
    };
  },

  generateReport: async (payload: { days: number; format: 'CSV' | 'JSON' }) => {
    const st = ensureDemoStoreInitialized();
    const stats = computeDemoAdherence(st.doses);
    const now = new Date().toISOString();
    const reportId = `rep_demo_${Math.random().toString(36).slice(2, 8)}`;
    const report: AdherenceReport = {
      reportId,
      patientId: st.profile.userId,
      requestedByUserId: st.profile.userId,
      periodStart: getDateOffsetStr(-payload.days),
      periodEnd: getDateOffsetStr(0),
      totalScheduled: stats.totalDoses,
      totalTaken: stats.takenCount,
      totalMissed: stats.missedCount,
      totalPending: stats.pendingCount,
      adherencePercentage: stats.overallAdherenceRate,
      s3Bucket: 'doseguard-demo-simulated-s3-bucket',
      s3Key: `reports/${st.profile.userId}/${reportId}.${payload.format.toLowerCase()}`,
      format: payload.format,
      createdAt: now,
    };
    st.reports.unshift(report);
    saveDemoState(st);
    return { report };
  },

  getReportDownloadUrl: async (reportId: string) => {
    const st = ensureDemoStoreInitialized();
    const report = st.reports.find((r) => r.reportId === reportId) || st.reports[0];
    const fmt = report?.format || 'CSV';

    let content = '';
    let mime = 'text/csv;charset=utf-8;';
    if (fmt === 'CSV') {
      const header =
        'Dose ID,Patient ID,Medication Name,Dosage Description,Scheduled Date,Scheduled Time,Status,Workflow Status,Mode';
      const rows = st.doses.map(
        (d) =>
          `"${d.doseId}","${d.patientId}","${d.medicationName}","${d.dosageDescription}","${d.scheduledDate}","${d.scheduledTime}","${d.status}","${d.workflowStatus || ''}","SYNTHETIC_DEMO_DATA"`
      );
      content = [header, ...rows].join('\n');
    } else {
      mime = 'application/json;charset=utf-8;';
      content = JSON.stringify(
        {
          notice: 'SYNTHETIC DEMO REPORT — NOT REAL PATIENT DATA',
          report,
          doses: st.doses,
        },
        null,
        2
      );
    }

    const blob = new Blob([content], { type: mime });
    const downloadUrl = URL.createObjectURL(blob);
    return {
      reportId: report?.reportId || reportId,
      downloadUrl,
      expiresInSeconds: 300,
      format: fmt,
    };
  },
};
