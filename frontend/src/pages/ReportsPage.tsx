import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { AdherenceReport } from '../types';

export const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<AdherenceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [format, setFormat] = useState<'CSV' | 'JSON'>('CSV');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getReports();
      setReports(res.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.generateReport({ days, format });
      setSuccess(
        `Generated ${res.report.format} adherence report (${res.report.reportId}) encrypted in private Amazon S3 bucket (${res.report.s3Bucket}).`
      );
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate adherence report');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (report: AdherenceReport) => {
    setDownloadingId(report.reportId);
    setError(null);
    try {
      const res = await api.getReportDownloadUrl(report.reportId);
      window.open(res.downloadUrl, '_blank', 'noopener,noreferrer');
      setSuccess(
        `Issued 5-minute presigned S3 download URL for ${report.reportId} (expires in ${res.expiresInSeconds}s).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate presigned S3 URL');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Private Amazon S3 Adherence Reports
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Reports are encrypted at rest (SSE-S3) in a private S3 bucket (`BlockPublicAccess.BLOCK_ALL`) and downloaded exclusively via short-lived 5-minute presigned URLs.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Report Generator Card */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Generate New S3 Report</h2>
              <p className="text-xs text-slate-500">
                Compile dose confirmations and missed-dose escalations
              </p>
            </div>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Reporting Period
              </label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value={7}>Last 7 Days</option>
                <option value={14}>Last 14 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Export Format</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['CSV', 'JSON'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={`py-2.5 rounded-xl border font-bold text-xs transition-all ${
                      format === fmt
                        ? 'border-teal-600 bg-teal-50 text-teal-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {fmt} Report
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={generating}
              className="w-full rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold py-2.5 text-sm shadow transition-colors"
            >
              {generating ? 'Writing Encrypted Object to S3...' : 'Generate & Store Report in S3'}
            </button>
          </form>

          <div className="rounded-xl bg-navy-950 text-slate-300 p-4 text-[11px] space-y-1.5">
            <div className="font-bold text-teal-400 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              S3 Security Architecture
            </div>
            <p>
              • Zero public bucket or object ACLs.<br />
              • Server-side authorization verifies patient ownership or active caregiver link before signing `GetObjectCommand`.<br />
              • Presigned URLs automatically expire after 300 seconds.
            </p>
          </div>
        </div>

        {/* Generated Reports List */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-teal-600" />
              Available Adherence Reports ({reports.length})
            </h2>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" />
              SSE-S3 Encrypted
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Loading report metadata from DynamoDB...
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-10 text-center space-y-2">
              <FileSpreadsheet className="h-8 w-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-800">No reports generated yet</div>
              <p className="text-xs text-slate-500">
                Use the generator on the left to create a downloadable CSV or JSON adherence report.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((rep) => (
                <div
                  key={rep.reportId}
                  className="rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {rep.periodStart} to {rep.periodEnd}
                      </span>
                      <span className="rounded bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 text-[10px] font-mono font-bold">
                        {rep.format}
                      </span>
                      <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-[11px] font-bold">
                        {rep.adherencePercentage}% Adherence
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Scheduled: {rep.totalScheduled} • Taken: {rep.totalTaken} • Missed:{' '}
                      {rep.totalMissed} • Pending: {rep.totalPending}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      S3 Key: {rep.s3Key} • Created {new Date(rep.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownload(rep)}
                    disabled={downloadingId === rep.reportId}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white font-semibold px-4 py-2 text-xs shrink-0 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-teal-400" />
                    {downloadingId === rep.reportId ? 'Signing URL...' : 'Presigned Download'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

