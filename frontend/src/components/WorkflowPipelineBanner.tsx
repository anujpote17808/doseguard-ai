import React from 'react';
import {
  Activity,
  Bell,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

interface WorkflowPipelineBannerProps {
  activeStage?: 'SCHEDULED' | 'REMINDER_SENT' | 'CONFIRMED_IN_TIME' | 'ESCALATED';
  compact?: boolean;
}

const STAGES = [
  {
    id: 'SCHEDULE',
    label: 'SCHEDULE',
    sub: 'EventBridge Scheduler (IANA TZ)',
    icon: Clock,
  },
  {
    id: 'REMINDER',
    label: 'REMINDER',
    sub: 'Step Functions + SNS Alert',
    icon: Bell,
  },
  {
    id: 'CONFIRMATION',
    label: 'PATIENT CONFIRMATION',
    sub: 'Response Window (15m / 60s Demo)',
    icon: CheckCircle2,
  },
  {
    id: 'STATUS_CHECK',
    label: 'STATUS CHECK',
    sub: 'DynamoDB Conditional Verification',
    icon: Activity,
  },
  {
    id: 'ESCALATION',
    label: 'CAREGIVER ESCALATION',
    sub: 'Automatic Missed-Dose Alert',
    icon: ShieldAlert,
  },
];

export const WorkflowPipelineBanner: React.FC<WorkflowPipelineBannerProps> = ({
  activeStage = 'SCHEDULED',
  compact = false,
}) => {
  const getStepHighlight = (index: number) => {
    if (activeStage === 'ESCALATED') {
      return index === 4
        ? 'border-rose-500/80 bg-rose-950/60 text-rose-200'
        : 'border-teal-500/40 bg-navy-800/80 text-slate-200';
    }
    if (activeStage === 'CONFIRMED_IN_TIME') {
      if (index <= 3) return 'border-emerald-400/70 bg-emerald-950/50 text-emerald-200';
      return 'border-slate-700 bg-navy-900/50 text-slate-400 opacity-60';
    }
    if (activeStage === 'REMINDER_SENT') {
      if (index <= 2) return 'border-teal-400 bg-teal-950/50 text-teal-200';
      return 'border-slate-700 bg-navy-800/60 text-slate-300';
    }
    return index === 0
      ? 'border-teal-400/80 bg-navy-800 text-white'
      : 'border-slate-700/80 bg-navy-900/70 text-slate-300';
  };

  return (
    <div className="rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-800 p-5 text-white shadow-lg border border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-300 border border-teal-500/30">
            <Sparkles className="h-3.5 w-3.5" />
            AWS Step Functions Standard Workflow
          </span>
          <span className="text-xs text-slate-300">
            Deterministic Closed-Loop Medication Verification
          </span>
        </div>
        <span className="text-xs font-mono text-teal-300 bg-navy-950/80 px-2.5 py-1 rounded-md border border-slate-800">
          State: {activeStage}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          return (
            <div
              key={stage.id}
              className={`relative rounded-xl border p-3 transition-all ${getStepHighlight(idx)}`}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4 text-teal-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-wider uppercase text-teal-300">
                    Step {idx + 1}
                  </div>
                  <div className="text-xs font-bold truncate">{stage.label}</div>
                </div>
              </div>
              {!compact && (
                <p className="mt-1.5 text-[11px] text-slate-300 leading-snug">{stage.sub}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

