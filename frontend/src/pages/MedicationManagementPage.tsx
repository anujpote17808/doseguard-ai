import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit3,
  Pill,
  Plus,
  Power,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import { Medication, MedicationFrequency } from '../types';
import { useAuth } from '../context/AuthContext';

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const MedicationManagementPage: React.FC = () => {
  const { profile } = useAuth();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const todayIso = new Date().toISOString().slice(0, 10);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [dosageDescription, setDosageDescription] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [secondaryScheduleTime, setSecondaryScheduleTime] = useState('20:00');
  const [frequency, setFrequency] = useState<MedicationFrequency>('DAILY');
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState('');
  const [timezone, setTimezone] = useState(profile?.timezone || 'Asia/Kolkata');
  const [instructions, setInstructions] = useState('');
  const [active, setActive] = useState(true);

  const loadMedications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMedications();
      setMedications(res.medications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load medications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMedications();
  }, [loadMedications]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDosageDescription('');
    setScheduleTime('08:00');
    setSecondaryScheduleTime('20:00');
    setFrequency('DAILY');
    setStartDate(todayIso);
    setEndDate('');
    setTimezone(profile?.timezone || 'Asia/Kolkata');
    setInstructions('');
    setActive(true);
  };

  const handleEditSelect = (med: Medication) => {
    setEditingId(med.medicationId);
    setName(med.name);
    setDosageDescription(med.dosageDescription);
    setScheduleTime(med.scheduleTime);
    setSecondaryScheduleTime(med.secondaryScheduleTime || '20:00');
    setFrequency(med.frequency);
    setStartDate(med.startDate);
    setEndDate(med.endDate || '');
    setTimezone(med.timezone);
    setInstructions(med.instructions || '');
    setActive(med.active);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim() || !dosageDescription.trim()) {
      setError('Medication name and dosage description are required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        dosageDescription: dosageDescription.trim(),
        scheduleTime,
        secondaryScheduleTime: frequency === 'TWICE_DAILY' ? secondaryScheduleTime : undefined,
        frequency,
        startDate,
        endDate: endDate ? endDate : undefined,
        timezone,
        instructions: instructions.trim() || undefined,
        active,
      };

      if (editingId) {
        const res = await api.updateMedication(editingId, payload);
        setSuccess(
          `Updated ${res.medication.name} and synchronized EventBridge schedule (${res.medication.scheduleName}).`
        );
      } else {
        const res = await api.createMedication(payload);
        setSuccess(
          `Added ${res.medication.name} and provisioned EventBridge Scheduler rule (${res.medication.scheduleName}).`
        );
      }

      resetForm();
      await loadMedications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save medication schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (med: Medication) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await api.updateMedication(med.medicationId, { active: !med.active });
      setSuccess(
        `Medication ${res.medication.name} is now ${
          res.medication.active ? 'ACTIVE (schedule enabled)' : 'PAUSED (schedule disabled)'
        }.`
      );
      await loadMedications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update medication state');
    }
  };

  const handleDelete = async (med: Medication) => {
    setError(null);
    setSuccess(null);
    try {
      await api.deleteMedication(med.medicationId);
      setSuccess(`Deleted ${med.name} and removed its EventBridge Scheduler rule.`);
      if (editingId === med.medicationId) resetForm();
      await loadMedications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete medication');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Medication Schedule Management
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Every active schedule is synchronized with Amazon EventBridge Scheduler in your configured IANA timezone. DoseGuard AI never generates clinical dosage advice.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Card */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="h-4 w-4 text-teal-600" />
              {editingId ? 'Edit Medication Schedule' : 'Add New Medication'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Medication Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Lisinopril, Metformin, Atorvastatin"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Patient-Entered Dosage Description *
              </label>
              <input
                type="text"
                required
                value={dosageDescription}
                onChange={(e) => setDosageDescription(e.target.value)}
                placeholder="e.g., 10mg tablet with morning meal"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Frequency *</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as MedicationFrequency)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none"
                >
                  <option value="DAILY">Daily</option>
                  <option value="TWICE_DAILY">Twice Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="CUSTOM">Custom Daily</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Primary Time (24h) *
                </label>
                <input
                  type="time"
                  required
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>

            {frequency === 'TWICE_DAILY' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Secondary Dose Time (24h)
                </label>
                <input
                  type="time"
                  value={secondaryScheduleTime}
                  onChange={(e) => setSecondaryScheduleTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Start Date *</label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">IANA Timezone *</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Optional Instructions / Notes
              </label>
              <textarea
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Take with a full glass of water"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="med-active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="med-active" className="text-xs font-medium text-slate-700">
                Enable recurring EventBridge Scheduler reminder immediately
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold py-2.5 text-sm shadow transition-colors"
            >
              {submitting
                ? 'Provisioning EventBridge Schedule...'
                : editingId
                ? 'Save Changes & Sync Schedule'
                : 'Create Medication & Provision Schedule'}
            </button>
          </form>
        </div>

        {/* Medication List */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">
              Configured Medications ({medications.length})
            </h2>
            <span className="text-xs text-slate-500">
              FlexibleTimeWindow: OFF • Deterministic IDs
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading medications from DynamoDB...
            </div>
          ) : medications.length === 0 ? (
            <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-10 text-center space-y-2">
              <Pill className="h-8 w-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-800">No medications configured</div>
              <p className="text-xs text-slate-500">
                Use the form on the left to add your first medication schedule.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {medications.map((med) => (
                <div
                  key={med.medicationId}
                  className={`rounded-xl border p-4 transition-all ${
                    med.active
                      ? 'border-slate-200 bg-white'
                      : 'border-slate-200 bg-slate-50 opacity-75'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{med.name}</h3>
                        <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 text-xs font-mono font-semibold">
                          <Clock className="h-3 w-3" />
                          {med.scheduleTime}
                          {med.secondaryScheduleTime ? ` & ${med.secondaryScheduleTime}` : ''}
                        </span>
                        <span className="rounded-md bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-semibold">
                          {med.frequency}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            med.active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {med.active ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 font-medium mt-1">
                        {med.dosageDescription}
                      </p>
                      {med.instructions && (
                        <p className="text-xs text-slate-500 mt-0.5">Note: {med.instructions}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                        <span>TZ: {med.timezone}</span>
                        <span>•</span>
                        <span>Start: {med.startDate}</span>
                        {med.endDate && (
                          <>
                            <span>•</span>
                            <span>End: {med.endDate}</span>
                          </>
                        )}
                        {med.scheduleName && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-teal-700">
                              Scheduler: {med.scheduleName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditSelect(med)}
                        className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
                        title="Edit Medication"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(med)}
                        className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
                        title={med.active ? 'Pause Schedule' : 'Enable Schedule'}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(med)}
                        className="p-2 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600"
                        title="Delete Medication"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

