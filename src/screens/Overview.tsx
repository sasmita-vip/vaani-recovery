import {
  PhoneCall,
  PhoneOutgoing,
  Handshake,
  IndianRupee,
  AlertTriangle,
  Timer,
  Clock,
  AlertCircle,
  ChevronRight,
  CalendarCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, Chip, statusToColor, PageHeader, EmptyState, Skeleton, ErrorState } from '@/components/ui';
import { LineChart, DonutChart } from '@/components/charts';
import { fetchEscalations, fetchHourlyPromises, fetchKpis, fetchPromises } from '@/lib/api';
import { useLiveData } from '@/lib/live';
import { formatINR, formatDuration, formatWaiting, formatDate } from '@/lib/format';
import { ESCALATION_REASON_LABELS } from '@/types';
import type { NavKey } from '@/lib/router';
import type { Escalation, HourPoint, Kpis, OutcomeSlice, PromiseToPay } from '@/types';

interface OverviewData {
  kpis: Omit<Kpis, 'openEscalations'> & { openEscalations: number };
  outcomes: OutcomeSlice[];
  hourly: HourPoint[];
  promises: PromiseToPay[];
  escalations: Escalation[];
}

function KpiCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
        {icon}
      </div>
      <div className="mt-4">
        <div className="tabular text-2xl font-semibold text-content-strong">{value}</div>
        <div className="mt-0.5 text-sm text-muted">{label}</div>
      </div>
    </Card>
  );
}

function OverviewContent({ data, onNavigate }: { data: OverviewData; onNavigate: (k: NavKey) => void }) {
  const dueToday = data.promises.filter((p) => p.state === 'Due today');
  const openEscalations = data.escalations
    .filter((e) => e.queueStatus !== 'Resolved')
    .sort((a, b) => b.waitingMinutes - a.waitingMinutes)
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle={`Today's collection performance — ${formatDate(new Date())}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={<PhoneCall className="h-5 w-5" />} label="Calls today" value={data.kpis.callsToday.toLocaleString('en-IN')} />
        <KpiCard icon={<PhoneOutgoing className="h-5 w-5" />} label="Connect rate" value={`${Math.round(data.kpis.connectRate * 100)}%`} />
        <KpiCard icon={<Handshake className="h-5 w-5" />} label="Promises to pay" value={data.kpis.ptpCaptured.toLocaleString('en-IN')} />
        <KpiCard icon={<IndianRupee className="h-5 w-5" />} label="PTP amount" value={formatINR(data.kpis.ptpAmount)} />
        <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Open escalations" value={String(data.kpis.openEscalations)} />
        <KpiCard icon={<Timer className="h-5 w-5" />} label="Avg. call length" value={formatDuration(data.kpis.avgCallLengthSec)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-content-strong">Promises captured per hour</h3>
              <p className="text-xs text-muted">Today vs yesterday (IST)</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-content"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Today</span>
              <span className="flex items-center gap-1.5 text-muted"><span className="h-2.5 w-2.5 rounded-full bg-stone-400" /> Yesterday</span>
            </div>
          </div>
          {data.hourly.length ? <LineChart data={data.hourly} /> : <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="No hourly data yet" description="Promises captured each hour will appear here." />}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-content-strong">Call outcomes today</h3>
          {data.outcomes.length ? <DonutChart data={data.outcomes} /> : <EmptyState icon={<PhoneCall className="h-6 w-6" />} title="No calls yet today" description="Outcomes appear once the Vaani agent starts calling." />}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line p-5">
            <div>
              <h3 className="text-sm font-semibold text-content-strong">Promises due today</h3>
              <p className="text-xs text-muted">{dueToday.length} promises scheduled for payment</p>
            </div>
            <button onClick={() => onNavigate('ptp')} className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:text-indigo-400">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {dueToday.length === 0 ? (
            <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="No payments due today" description="Promises falling due today will be listed here." />
          ) : (
            <div className="divide-y divide-line">
              {dueToday.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-muted">
                      {p.customerName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-content-strong">{p.customerName}</div>
                      <div className="tabular text-xs text-muted">{p.loanId}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="tabular text-sm font-semibold text-content-strong">{formatINR(p.promisedAmount)}</span>
                    <Chip color={statusToColor(p.state)}>{p.state}</Chip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-500" />
            <h3 className="text-sm font-semibold text-content-strong">Needs attention</h3>
          </div>
          <p className="mb-4 text-xs text-muted">Oldest open escalations first</p>
          {openEscalations.length === 0 ? (
            <EmptyState icon={<AlertCircle className="h-6 w-6" />} title="Nothing needs attention" description="Open escalations will appear here." />
          ) : (
            <div className="space-y-3">
              {openEscalations.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onNavigate('escalation')}
                  className="w-full rounded-xl border border-line p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-content-strong">{e.customerName}</span>
                    <span className="tabular flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
                      <Clock className="h-3 w-3" /> {formatWaiting(e.waitingMinutes)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Chip color={e.sensitive ? 'escalated' : 'warning'}>{ESCALATION_REASON_LABELS[e.reason] ?? e.reason}</Chip>
                    {e.sensitive && <Chip color="escalated">Sensitive</Chip>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

export function OverviewScreen({ onNavigate }: { onNavigate: (k: NavKey) => void }) {
  const state = useLiveData<OverviewData>(async () => {
    const [kpiBundle, hourly, promises, escalations] = await Promise.all([
      fetchKpis(),
      fetchHourlyPromises(),
      fetchPromises(),
      fetchEscalations(),
    ]);
    return { kpis: kpiBundle.kpis, outcomes: kpiBundle.outcomes, hourly, promises, escalations };
  });

  if (state.loading && !state.data) return <OverviewSkeleton />;
  if (state.error || !state.data) {
    return (
      <ErrorState
        title="Couldn't load the overview"
        message={state.error ?? 'The daily summary is unavailable right now.'}
        onRetry={state.reload}
      />
    );
  }
  return <OverviewContent data={state.data} onNavigate={onNavigate} />;
}
