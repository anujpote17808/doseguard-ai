import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { DoseRecord } from '../types';
import { WorkflowPipelineBanner } from '../components/WorkflowPipelineBanner';

export const DoseConfirmationPage: React.FC = () => {
  const [todayDoses, setTodayDoses] = useState<DoseRecord[]>([]);
  const [historyDoses, setHistoryDoses] = useState<DoseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadDoses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [todayRes, historyRes] = await Promise.all([
        api.getTodayDoses(),
        api.getDoseHistory(),
      ]);
      setTodayDoses(todayRes.doses);
      setHistoryDoses(historyRes.doses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dose records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDoses();
  }, [loadDoses]);

  const handleConfirm = async (dose: DoseRecord) => {
    setBusyId(dose.doseId);
    setError(null);
    setFeedback(null);
    try {
      const res = await api.confirmDose(dose.doseId);
      setFeedback(
        res.idempotent
          ? `Idempotent check: ${dose.medicationName} (${dose.scheduledTime}) was already confirmed.`
          : `Confirmed ${dose.medicationName} (${dose.scheduledTime}) as TAKEN. Caregiver escalation prevented.`
      );
      await loadDoses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm dose');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkMissed = async (dose: DoseRecord) => {
    setBusyId(dose.doseId);
    setError(null);
    setFeedback(null);
    try {
      const res = await api.markDoseMissed(dose.doseId);
      setFeedback(
        `Marked ${dose.medicationName} (${dose.scheduledTime}) as MISSED. Notified ${res.caregiversNotified} connected caregiver(s).`
      );
      await loadDoses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark dose as missed');
    } finally {
      setBusyId(null);
    }
  };

  const handleStartWorkflow = async (dose: DoseRecord, windowSeconds: number) => {
    setBusyId(`wf-${dose.doseId}`);
    setError(null);
    setFeedback(null);
    try {
      const res = await api.triggerReminderWorkflow(dose.medicationId, windowSeconds);
      setFeedback(
        `Step Functions workflow started with ${windowSeconds}s response window (Execution ARN: ${res.executionArn}).`
      );
      await loadDoses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger Step Functions workflow');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Dose Confirmation & Escalation Control
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Only an explicit patient confirmation or an authorized Step Functions workflow changes dose status. Never automatically marked as taken.
          </p>
        </div>

        <button
          onClick={loadDoses}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Doses
        </button>
      </div>

      <WorkflowPipelineBanner compact />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
          {error}
        </div>
      )}

      {feedback && (
        <div className="rounded-xl bg-teal-50 border border-teal-200 p-4 text-xs text-teal-900 font-medium">
          {feedback}
        </div>
      )}

      {/* Today's Scheduled Doses */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Today&apos;s Scheduled Doses</h2>
        <p className="text-xs text-slate-500 mb-5">
          Idempotent composite key format: <code className="text-teal-700">medicationId#YYYY-MM-DD#HH:mm</code>
        </p>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading today&apos;s doses...</div>
        ) : todayDoses.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            No scheduled doses found for today. Add an active medication first.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {todayDoses.map((dose) => (
              <div
                key={dose.doseId}
                className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 ${
                  dose.status === 'TAKEN'
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : dose.status === 'MISSED'
                    ? 'border-rose-200 bg-rose-50/30'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                      {dose.scheduledDate} • {dose.scheduledTime}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                        dose.status === 'TAKEN'
                          ? 'bg-emerald-100 text-emerald-800'
                          : dose.status === 'MISSED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {dose.status === 'TAKEN' && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {dose.status === 'MISSED' && <AlertTriangle className="h-3.5 w-3.5" />}
                      {dose.status === 'PENDING' && <Clock className="h-3.5 w-3.5" />}
                      {dose.status}
                    </span>
                  </div>

                  <h3 className="text-lg font-extrabold text-slate-900">{dose.medicationName}</h3>
                  <p className="text-xs text-slate-600 font-medium">{dose.dosageDescription}</p>

                  <div className="pt-2 text-[11px] text-slate-500 space-y-0.5">
                    <div>
                      Dose ID: <code className="text-slate-700">{dose.doseId}</code>
                    </div>
                    <div>
                      Workflow State:{' '}
                      <span className="font-semibold text-slate-700">
                        {dose.workflowStatus || 'SCHEDULED'}
                      </span>
                    </div>
                    {dose.confirmedAt && (
                      <div className="text-emerald-700 font-medium">
                        Confirmed At: {new Date(dose.confirmedAt).toLocaleString()}
                      </div>
                    )}
                    {dose.missedAt && (
                      <div className="text-rose-700 font-medium">
                        Escalated / Missed At: {new Date(dose.missedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleConfirm(dose)}
                    disabled={busyId === dose.doseId}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold px-3.5 py-2 text-xs shadow-sm transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {dose.status === 'TAKEN' ? 'Re-Verify Taken (Idempotent)' : 'Confirm as Taken'}
                  </button>

                  {dose.status !== 'MISSED' && (
                    <button
                      type="button"
                      onClick={() => handleMarkMissed(dose)}
                      disabled={busyId === dose.doseId}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold px-3 py-2 text-xs transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      Mark Missed
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleStartWorkflow(dose, 60)}
                    disabled={busyId === `wf-${dose.doseId}`}
                    className="w-full mt-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-teal-300 font-semibold px-3 py-2 text-xs transition-colors"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Run Step Functions Workflow (60s Demo Window)
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historical Dose Ledger */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          Complete Dose Confirmation Ledger ({historyDoses.length})
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">Medication</th>
                <th className="py-2.5 px-3">Dosage</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Workflow State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyDoses.map((d) => (
                <tr key={d.doseId} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono text-slate-700">
                    {d.scheduledDate} {d.scheduledTime}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-900">{d.medicationName}</td>
                  <td className="py-2.5 px-3 text-slate-600">{d.dosageDescription}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold ${
                        d.status === 'TAKEN'
                          ? 'bg-emerald-100 text-emerald-800'
                          : d.status === 'MISSED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {d.status === 'MISSED' && <ShieldAlert className="h-3 w-3" />}
                      {d.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">
                    {d.workflowStatus || 'SCHEDULED'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

