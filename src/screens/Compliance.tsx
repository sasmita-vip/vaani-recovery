import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  PhoneOff,
  Heart,
  Phone,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, Chip, PageHeader, ProgressBar, Skeleton, ErrorState, EmptyState } from '@/components/ui';
import { BarChart } from '@/components/charts';
import { fetchComplianceMetrics, fetchFlaggedCalls } from '@/lib/api';
import { useLiveData } from '@/lib/live';
import { formatDate, formatTime } from '@/lib/format';
import type { ComplianceMetrics, FlaggedCall } from '@/types';

function MetricCard({ icon, label, value, sub, color }: { icon: ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted">{label}</div>
          <div className="tabular text-xl font-semibold text-content-strong">{value}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-muted">{sub}</div>
    </Card>
  );
}

const severityColor: Record<FlaggedCall['severity'], 'escalated' | 'warning' | 'neutral'> = {
  high: 'escalated',
  medium: 'warning',
  low: 'neutral',
};

interface ComplianceData {
  metrics: ComplianceMetrics;
  flagged: FlaggedCall[];
}

function ComplianceContent({ data, onCallSelect }: { data: ComplianceData; onCallSelect: (callId: string) => void }) {
  const adherencePct = Math.round(data.metrics.adherenceRate * 100);
  const idvPct = Math.round(data.metrics.idvFailureRate * 100);

  const severityCounts = (['high', 'medium', 'low'] as const).map((severity) => ({
    label: severity,
    value: data.flagged.filter((f) => f.severity === severity).length,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        subtitle={`Fair-practice monitoring and calling-hours adherence — ${formatDate(new Date())} (IST)`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          icon={<Clock className="h-5 w-5 text-emerald-600" />}
          label="Calling-hours adherence"
          value={`${adherencePct}%`}
          sub="Calls within the configured calling window"
          color="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <MetricCard
          icon={<PhoneOff className="h-5 w-5 text-amber-600" />}
          label="Calls blocked outside hours"
          value={String(data.metrics.callsBlockedOutsideHours)}
          sub="Attempts prevented today"
          color="bg-amber-50 dark:bg-amber-500/10"
        />
        <MetricCard
          icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}
          label="Identity verification failure"
          value={`${idvPct}%`}
          sub="Calls disclosing before verifying"
          color="bg-rose-50 dark:bg-rose-500/10"
        />
        <MetricCard
          icon={<Heart className="h-5 w-5 text-rose-600" />}
          label="Abuse / distress flags"
          value={String(data.metrics.distressFlags)}
          sub="Flagged for human review"
          color="bg-rose-50 dark:bg-rose-500/10"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-1 text-sm font-semibold text-content-strong">Calling-hours adherence</h3>
          <p className="mb-4 text-xs text-muted">Share of calls placed within the permitted window today</p>
          <div className="mb-3 flex items-end justify-between">
            <span className="tabular text-3xl font-semibold text-content-strong">{adherencePct}%</span>
            <span className="text-xs text-muted">{data.metrics.callsBlockedOutsideHours} blocked attempts</span>
          </div>
          <ProgressBar value={adherencePct} max={100} colorClass="bg-emerald-500" />
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Flagged calls by severity</div>
            {data.flagged.length ? (
              <BarChart data={severityCounts} color="#f59e0b" />
            ) : (
              <p className="text-sm text-muted">No calls were flagged today.</p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-content-strong">
            <Phone className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Grievance helpline
          </h3>
          <div className="mb-4">
            <div className="tabular text-3xl font-semibold text-content-strong">{data.metrics.grievanceMentions}</div>
            <div className="text-xs text-muted">mentions on calls today</div>
          </div>
          <div className="space-y-2.5 rounded-lg border border-line bg-surface-2 p-3 text-xs">
            <div className="flex items-center gap-2 text-content">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Helpline stated on complaint calls
            </div>
            <div className="flex items-center gap-2 text-content">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Fair-practice script followed
            </div>
            <div className="flex items-center gap-2 text-muted">
              <XCircle className="h-3.5 w-3.5 text-amber-500" /> Omissions are flagged in the table below
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-content-strong">Flagged calls</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted">Calls where a compliance rule was triggered today</p>
        </div>

        {data.flagged.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No flagged calls" description="Calls that break a compliance rule will be listed here." />
        ) : (
          <>
            <table className="hidden w-full lg:table">
              <thead className="bg-surface-2">
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th scope="col" className="px-5 py-3">Call ID</th>
                  <th scope="col" className="px-5 py-3">Customer</th>
                  <th scope="col" className="px-5 py-3">Time</th>
                  <th scope="col" className="px-5 py-3">Rule triggered</th>
                  <th scope="col" className="px-5 py-3">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.flagged.map((f) => (
                  <tr
                    key={f.callId}
                    onClick={() => onCallSelect(f.callId)}
                    className="cursor-pointer transition-colors hover:bg-surface-2"
                  >
                    <td className="tabular px-5 py-3.5 text-sm font-medium text-content">{f.callId}</td>
                    <td className="px-5 py-3.5 text-sm text-content-strong">{f.customerName}</td>
                    <td className="px-5 py-3.5 text-sm text-content">{formatTime(f.startedAt)}</td>
                    <td className="px-5 py-3.5 text-sm text-content">{f.rule}</td>
                    <td className="px-5 py-3.5"><Chip color={severityColor[f.severity]}>{f.severity}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-line lg:hidden">
              {data.flagged.map((f) => (
                <button key={f.callId} onClick={() => onCallSelect(f.callId)} className="block w-full p-4 text-left">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-content-strong">{f.customerName}</div>
                      <div className="tabular text-xs text-muted">{f.callId} · {formatTime(f.startedAt)}</div>
                    </div>
                    <Chip color={severityColor[f.severity]}>{f.severity}</Chip>
                  </div>
                  <div className="mt-2 text-sm text-content">{f.rule}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export function ComplianceScreen({ onCallSelect }: { onCallSelect: (callId: string) => void }) {
  const state = useLiveData<ComplianceData>(async () => {
    const [metrics, flagged] = await Promise.all([fetchComplianceMetrics(), fetchFlaggedCalls()]);
    return { metrics, flagged };
  }, []);

  if (state.loading && !state.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (state.error || !state.data) {
    return (
      <Card>
        <ErrorState title="Couldn't load compliance metrics" message={state.error ?? 'Compliance data is unavailable.'} onRetry={state.reload} />
      </Card>
    );
  }

  return <ComplianceContent data={state.data} onCallSelect={onCallSelect} />;
}
