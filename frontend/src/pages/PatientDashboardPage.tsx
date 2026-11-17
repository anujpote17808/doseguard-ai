import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  HeartHandshake,
  Pill,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { api } from '../services/api';
import {
  AnalyticsSummaryResponse,
  CaregiverConnection,
  DoseRecord,
  NotificationRecord,
} from '../types';
import { WorkflowPipelineBanner } from '../components/WorkflowPipelineBanner';
import { useAuth } from '../context/AuthContext';

export const PatientDashboardPage: React.FC = () => {
  const { profile } = useAuth();
  const [doses, setDoses] = useState<DoseRecord[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [caregivers, setCaregivers] = useState<CaregiverConnection[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [todayRes, summaryRes, cgRes, notifRes] = await Promise.all([
        api.getTodayDoses(),
        api.getAnalyticsSummary(),
        api.getCaregivers(),
        api.getNotifications(),
      ]);
      setDoses(todayRes.doses);
      setSummary(summaryRes);
      setCaregivers(cgRes.myCaregivers);
      setNotifications(notifRes.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data from AWS API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleConfirmDose = async (doseId: string) => {
    setActionBusy(doseId);
    try {
      await api.confirmDose(doseId);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm dose');
    } finally {
      setActionBusy(null);
    }
  };

  const handleTriggerDemoWorkflow = async (medicationId: string) => {
    setActionBusy(`wf-${medicationId}`);
    setWorkflowMessage(null);
    try {
      const res = await api.triggerReminderWorkflow(medicationId, 60);
      setWorkflowMessage(
        `Step Functions execution started (60s demo response window). Execution ARN: ${res.executionArn}`
      );
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Step Functions workflow');
    } finally {
      setActionBusy(null);
    }
  };

  const nextUpcomingDose = doses.find((d) => d.status === 'PENDING');
  const activePipelineStage = doses.some((d) => d.workflowStatus === 'ESCALATED' || d.status === 'MISSED')
    ? 'ESCALATED'
    : doses.some((d) => d.workflowStatus === 'REMINDER_SENT')
    ? 'REMINDER_SENT'
    : doses.some((d) => d.status === 'TAKEN')
    ? 'CONFIRMED_IN_TIME'
    : 'SCHEDULED';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Patient Safety Dashboard
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Welcome back, <span className="font-semibold text-slate-800">{profile?.fullName}</span> • Live synchronization with Amazon DynamoDB & Step Functions
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to="/medications"
            className="inline-flex items-center gap-1.5 rounded-xl bg-navy-900 hover:bg-navy-800 px-4 py-2 text-xs font-semibold text-white shadow-sm"
          >
            <Plus className="h-4 w-4 text-teal-400" />
            Add Medication
          </Link>
        </div>
      </div>

      {/* Step Functions Live Pipeline Banner */}
      <WorkflowPipelineBanner activeStage={activePipelineStage} />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {workflowMessage && (
        <div className="rounded-xl bg-teal-50 border border-teal-200 p-4 text-xs text-teal-900 flex items-center justify-between">
          <span>{workflowMessage}</span>
          <button onClick={() => setWorkflowMessage(null)} className="font-bold underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Key Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>ADHERENCE RATE</span>
            <TrendingUp className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">
            {summary ? `${summary.overallAdherenceRate}%` : '—'}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Weekly: {summary?.weeklyAdherenceRate ?? 100}%
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
            <span>TAKEN TODAY</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-700">
            {doses.filter((d) => d.status === 'TAKEN').length}
          </div>
          <p className="mt-1 text-xs text-slate-500">Confirmed on time</p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
            <span>PENDING TODAY</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-amber-700">
            {doses.filter((d) => d.status === 'PENDING').length}
          </div>
          <p className="mt-1 text-xs text-slate-500">Awaiting confirmation</p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-rose-700">
            <span>MISSED TODAY</span>
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-rose-700">
            {doses.filter((d) => d.status === 'MISSED').length}
          </div>
          <p className="mt-1 text-xs text-slate-500">Escalated to caregivers</p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-sky-700">
            <span>CAREGIVERS</span>
            <HeartHandshake className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">{caregivers.length}</div>
          <p className="mt-1 text-xs text-slate-500">
            {caregivers.length > 0 ? 'Active escalation link' : 'No caregiver linked yet'}
          </p>
        </div>
      </div>

      {/* Next Upcoming Dose Spotlight */}
      {nextUpcomingDose && (
        <div className="rounded-2xl bg-gradient-to-r from-teal-900 to-navy-900 text-white p-6 shadow-md border border-teal-700/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-400/20 px-3 py-0.5 text-xs font-bold text-teal-300">
              <Clock className="h-3.5 w-3.5" />
              Next Upcoming Scheduled Dose
            </span>
            <h2 className="text-xl font-extrabold">
              {nextUpcomingDose.medicationName} — {nextUpcomingDose.dosageDescription}
            </h2>
            <p className="text-xs text-slate-300">
              Scheduled for <span className="font-bold text-white">{nextUpcomingDose.scheduledTime}</span> ({nextUpcomingDose.scheduledDate}) • Workflow Status:{' '}
              <span className="font-mono text-teal-300">
                {nextUpcomingDose.workflowStatus || 'SCHEDULED'}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleConfirmDose(nextUpcomingDose.doseId)}
              disabled={actionBusy === nextUpcomingDose.doseId}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-navy-950 font-bold px-5 py-2.5 text-xs shadow transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              {actionBusy === nextUpcomingDose.doseId ? 'Confirming...' : 'Confirm Dose Taken'}
            </button>
            <button
              onClick={() => handleTriggerDemoWorkflow(nextUpcomingDose.medicationId)}
              disabled={actionBusy === `wf-${nextUpcomingDose.medicationId}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold px-4 py-2.5 text-xs transition-colors"
            >
              <Play className="h-3.5 w-3.5 text-teal-300" />
              Trigger 60s Demo Workflow
            </button>
          </div>
        </div>
      )}

      {/* Main Two-Column Grid: Today's Schedule & Recent Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Today's Medication Schedule */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Today&apos;s Medication Schedule</h2>
              <p className="text-xs text-slate-500">
                Real-time dose tracking with idempotent confirmation
              </p>
            </div>
            <Link
              to="/doses"
              className="text-xs font-semibold text-teal-600 hover:text-teal-700"
            >
              Full Confirmation View →
            </Link>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading today&apos;s medication schedule from DynamoDB...
            </div>
          ) : doses.length === 0 ? (
            <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-8 text-center space-y-3">
              <Pill className="h-8 w-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-800">
                No scheduled doses for today yet
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Add your first recurring medication schedule to provision an Amazon EventBridge Scheduler rule and track daily doses.
              </p>
              <Link
                to="/medications"
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold px-4 py-2 text-xs"
              >
                <Plus className="h-4 w-4" />
                Add Medication Schedule
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {doses.map((dose) => (
                <div
                  key={dose.doseId}
                  className="rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                        dose.status === 'TAKEN'
                          ? 'bg-emerald-100 text-emerald-700'
                          : dose.status === 'MISSED'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {dose.status === 'TAKEN' ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : dose.status === 'MISSED' ? (
                        <ShieldAlert className="h-5 w-5" />
                      ) : (
                        <Clock className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {dose.medicationName}
                        </span>
                        <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {dose.scheduledTime}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{dose.dosageDescription}</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Workflow: {dose.workflowStatus || 'SCHEDULED'}
                        {dose.confirmedAt &&
                          ` • Confirmed at ${new Date(dose.confirmedAt).toLocaleTimeString()}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        dose.status === 'TAKEN'
                          ? 'bg-emerald-100 text-emerald-800'
                          : dose.status === 'MISSED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {dose.status}
                    </span>

                    {dose.status === 'PENDING' && (
                      <button
                        onClick={() => handleConfirmDose(dose.doseId)}
                        disabled={actionBusy === dose.doseId}
                        className="rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold px-3 py-1.5 text-xs transition-colors"
                      >
                        {actionBusy === dose.doseId ? 'Saving...' : 'Confirm Taken'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Caregiver Connection Status & Notification History */}
        <div className="lg:col-span-5 space-y-6">
          {/* Caregiver Status Card */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <HeartHandshake className="h-4 w-4 text-teal-600" />
                Caregiver Escalation Network
              </h2>
              <Link
                to="/caregivers"
                className="text-xs font-semibold text-teal-600 hover:underline"
              >
                Manage Access →
              </Link>
            </div>

            {caregivers.length === 0 ? (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600 space-y-2">
                <p>No caregivers are currently connected to receive missed-dose escalations.</p>
                <Link
                  to="/caregivers"
                  className="inline-block font-bold text-teal-700 hover:underline"
                >
                  Generate a secure one-time invitation passcode →
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {caregivers.map((cg) => (
                  <div
                    key={cg.connectionId}
                    className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{cg.caregiverName}</div>
                      <div className="text-slate-500">
                        {cg.relationship} • {cg.caregiverEmail}
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 font-semibold">
                      ACTIVE
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notification History Card */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Bell className="h-4 w-4 text-teal-600" />
                Recent Reminders & Escalation Log
              </h2>
              <span className="text-xs text-slate-400">{notifications.length} events</span>
            </div>

            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No reminders or escalation alerts recorded yet.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {notifications.slice(0, 8).map((n) => (
                  <div
                    key={n.notificationId}
                    className={`rounded-xl border p-3 text-xs ${
                      n.type === 'CAREGIVER_MISSED_DOSE_ALERT'
                        ? 'bg-rose-50/70 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{n.title}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                      <span>Channel: {n.deliveryChannel}</span>
                      <span>•</span>
                      <span>Status: {n.deliveryStatus}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

