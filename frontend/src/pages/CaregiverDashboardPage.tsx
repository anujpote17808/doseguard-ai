import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  HeartHandshake,
  Lock,
  Pill,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { api } from '../services/api';
import {
  AnalyticsSummaryResponse,
  CaregiverConnection,
  DoseRecord,
  Medication,
  NotificationRecord,
} from '../types';

export const CaregiverDashboardPage: React.FC = () => {
  const [connectedPatients, setConnectedPatients] = useState<CaregiverConnection[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [patientMeds, setPatientMeds] = useState<Medication[]>([]);
  const [patientDoses, setPatientDoses] = useState<DoseRecord[]>([]);
  const [patientSummary, setPatientSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCaregiverPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cgRes, notifRes] = await Promise.all([
        api.getCaregivers(),
        api.getNotifications(),
      ]);
      setConnectedPatients(cgRes.connectedPatients);
      setNotifications(notifRes.notifications);

      if (cgRes.connectedPatients.length > 0 && !selectedPatientId) {
        setSelectedPatientId(cgRes.connectedPatients[0].patientId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load caregiver dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    loadCaregiverPatients();
  }, [loadCaregiverPatients]);

  const loadSelectedPatientDetails = useCallback(async (patientId: string) => {
    if (!patientId) return;
    setError(null);
    try {
      const [medsRes, dosesRes, sumRes] = await Promise.all([
        api.getMedications(patientId),
        api.getTodayDoses(patientId),
        api.getAnalyticsSummary(patientId),
      ]);
      setPatientMeds(medsRes.medications);
      setPatientDoses(dosesRes.doses);
      setPatientSummary(sumRes);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load authorized patient medication schedule'
      );
    }
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      loadSelectedPatientDetails(selectedPatientId);
    }
  }, [selectedPatientId, loadSelectedPatientDetails]);

  const activeConnection = connectedPatients.find((p) => p.patientId === selectedPatientId);
  const missedDoseAlerts = notifications.filter(
    (n) => n.type === 'CAREGIVER_MISSED_DOSE_ALERT'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Caregiver Monitoring Portal
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Displays only patients who have explicitly granted access via single-use SHA-256 invitation redemption.
          </p>
        </div>

        <button
          onClick={() => {
            loadCaregiverPatients();
            if (selectedPatientId) loadSelectedPatientDetails(selectedPatientId);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Portal
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center text-sm text-slate-500">
          Verifying caregiver connections in Amazon DynamoDB...
        </div>
      ) : connectedPatients.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center space-y-3">
          <HeartHandshake className="h-10 w-10 text-teal-600 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">
            No Connected Patients Yet
          </h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            You can only view medication schedules and missed-dose escalations for patients who have generated a one-time invitation passcode and shared it with you.
          </p>
          <Link
            to="/caregivers"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold px-5 py-2.5 text-xs shadow"
          >
            Redeem a Patient Invitation Passcode →
          </Link>
        </div>
      ) : (
        <>
          {/* Connected Patient Selector */}
          <div className="rounded-2xl bg-navy-950 text-white p-5 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-300">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-teal-400 font-bold block">
                  Authorized Patient Selection ({connectedPatients.length})
                </label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="mt-1 rounded-lg bg-navy-900 border border-slate-700 px-3 py-1.5 text-sm font-bold text-white focus:border-teal-400 focus:outline-none"
                >
                  {connectedPatients.map((cp) => (
                    <option key={cp.connectionId} value={cp.patientId}>
                      {cp.patientName} ({cp.relationship}) — {cp.patientEmail}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activeConnection && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-lg bg-navy-900 border border-slate-700 px-3 py-1.5 text-slate-300">
                  <Lock className="h-3.5 w-3.5 text-teal-400" />
                  Permissions: <strong className="text-white">{activeConnection.permissions.join(', ')}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Patient Overview Cards */}
          {patientSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>PATIENT ADHERENCE</span>
                  <TrendingUp className="h-4 w-4 text-teal-600" />
                </div>
                <div className="mt-2 text-3xl font-extrabold text-slate-900">
                  {patientSummary.overallAdherenceRate}%
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Weekly: {patientSummary.weeklyAdherenceRate}%
                </p>
              </div>

              <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
                  <span>TAKEN TODAY</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="mt-2 text-3xl font-extrabold text-emerald-700">
                  {patientSummary.today.taken}
                </div>
                <p className="mt-1 text-xs text-slate-500">Confirmed doses</p>
              </div>

              <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
                  <span>PENDING TODAY</span>
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <div className="mt-2 text-3xl font-extrabold text-amber-700">
                  {patientSummary.today.pending}
                </div>
                <p className="mt-1 text-xs text-slate-500">Awaiting patient</p>
              </div>

              <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-xs font-semibold text-rose-700">
                  <span>MISSED TODAY</span>
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                </div>
                <div className="mt-2 text-3xl font-extrabold text-rose-700">
                  {patientSummary.today.missed}
                </div>
                <p className="mt-1 text-xs text-slate-500">Escalated alerts</p>
              </div>
            </div>
          )}

          {/* Patient Schedule & Missed-Dose Escalation Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Patient Today's Doses & Active Medications */}
            <div className="lg:col-span-7 space-y-6">
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">
                  Patient&apos;s Today Dose Status ({patientDoses.length})
                </h2>

                {patientDoses.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    No doses scheduled for this patient today.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {patientDoses.map((d) => (
                      <div
                        key={d.doseId}
                        className="rounded-xl border border-slate-200 p-4 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {d.medicationName}
                            </span>
                            <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {d.scheduledTime}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{d.dosageDescription}</p>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            d.status === 'TAKEN'
                              ? 'bg-emerald-100 text-emerald-800'
                              : d.status === 'MISSED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {d.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Pill className="h-4 w-4 text-teal-600" />
                    Patient&apos;s Active Medication Regimen ({patientMeds.length})
                  </h2>
                  {!activeConnection?.permissions.includes('MANAGE_MEDICATIONS') && (
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                      Read-Only View (VIEW_ONLY)
                    </span>
                  )}
                </div>

                <div className="space-y-2.5">
                  {patientMeds.map((m) => (
                    <div
                      key={m.medicationId}
                      className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {m.name} — {m.dosageDescription}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          Time: {m.scheduleTime} ({m.timezone}) • {m.frequency}
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-teal-700">
                        {m.active ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Missed-Dose Escalation Feed */}
            <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-rose-600" />
                  Caregiver Missed-Dose Alerts ({missedDoseAlerts.length})
                </h2>
                <Bell className="h-4 w-4 text-slate-400" />
              </div>

              {missedDoseAlerts.length === 0 ? (
                <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-6 text-center space-y-2">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600 mx-auto" />
                  <div className="text-xs font-bold text-emerald-950">
                    Zero Unresolved Missed-Dose Escalations
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    All scheduled doses have been confirmed within their response window.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {missedDoseAlerts.map((alert) => (
                    <div
                      key={alert.notificationId}
                      className="rounded-xl bg-rose-50/80 border border-rose-200 p-4 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-rose-900">{alert.title}</span>
                        <span className="text-[10px] font-mono text-rose-700">
                          {new Date(alert.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-rose-800 leading-relaxed">{alert.message}</p>
                      <div className="text-[10px] text-rose-600 font-medium">
                        Delivery: {alert.deliveryChannel} ({alert.deliveryStatus})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

