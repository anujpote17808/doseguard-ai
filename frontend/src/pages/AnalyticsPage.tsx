import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart3, BellRing, Calendar, CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { AnalyticsDetailResponse } from '../types';

export const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<AnalyticsDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAnalyticsAdherence();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load adherence analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Medication Adherence & Escalation Analytics
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Computed directly from live Amazon DynamoDB dose confirmation and caregiver notification records.
          </p>
        </div>

        <button
          onClick={loadAnalytics}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recompute Metrics
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Daily Adherence</span>
            <Calendar className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 text-4xl font-extrabold text-slate-900">
            {data ? `${data.dailyAdherence}%` : '—'}
          </div>
          <p className="mt-1 text-xs text-slate-500">Today&apos;s confirmed vs resolved doses</p>
        </div>

        <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>7-Day Weekly Adherence</span>
            <Activity className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2 text-4xl font-extrabold text-slate-900">
            {data ? `${data.weeklyAdherence}%` : '—'}
          </div>
          <p className="mt-1 text-xs text-slate-500">Rolling 7-day compliance rate</p>
        </div>

        <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>30-Day Monthly Adherence</span>
            <BarChart3 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-4xl font-extrabold text-slate-900">
            {data ? `${data.monthlyAdherence}%` : '—'}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Taken: {data?.totals.taken ?? 0} • Missed: {data?.totals.missed ?? 0}
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Taken vs Missed Bar Chart */}
        <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-1">
            Taken vs. Missed Doses by Date
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Real DynamoDB dose records grouped by scheduled date
          </p>

          {loading ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500">
              Loading chart...
            </div>
          ) : !data || data.dailySeries.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500">
              No dose records available yet to plot chart.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="taken" name="Taken" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="missed" name="Missed" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Daily Adherence Percentage Line Chart */}
        <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-1">
            Daily Adherence Percentage Trend (%)
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Percentage of resolved doses confirmed on time
          </p>

          {loading ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500">
              Loading chart...
            </div>
          ) : !data || data.dailySeries.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500">
              No adherence trend points available yet.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="adherenceRate"
                    name="Adherence %"
                    stroke="#0284c7"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Bottom History Tables: Medication History & Caregiver Alert History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
            Medication Dose History ({data?.medicationHistory.length ?? 0})
          </h2>

          {!data || data.medicationHistory.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No dose history recorded yet.</p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 text-xs">
              {data.medicationHistory.map((d) => (
                <div
                  key={d.doseId}
                  className="rounded-xl border border-slate-200 p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      {d.medicationName} ({d.dosageDescription})
                    </div>
                    <div className="text-slate-500 font-mono text-[11px]">
                      {d.scheduledDate} • {d.scheduledTime}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-bold text-[11px] ${
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
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <BellRing className="h-4 w-4 text-rose-600" />
            Caregiver & Reminder Alert History ({data?.alertHistory.length ?? 0})
          </h2>

          {!data || data.alertHistory.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No alerts recorded yet.</p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 text-xs">
              {data.alertHistory.map((a) => (
                <div
                  key={a.notificationId}
                  className="rounded-xl border border-slate-200 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{a.title}</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-slate-600">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

