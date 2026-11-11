import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  X,
  UserPlus,
  CheckCircle2,
  Clock,
  Heart,
  Shield,
  FileText,
  MessageSquare,
  Inbox,
  Loader2,
  Download,
  FilterX,
  Search,
  CalendarClock,
  History,
} from 'lucide-react';
import type { AuditEntry, Call, Escalation, EscalationReasonCode, Loan, QueueStatus } from '@/types';
import { ESCALATION_REASON_LABELS } from '@/types';
import {
  Card,
  Chip,
  Button,
  PageHeader,
  Badge,
  statusToColor,
  EmptyState,
  Skeleton,
  ErrorState,
  Pagination,
  SortableTh,
  Drawer,
} from '@/components/ui';
import {
  fetchAuditLog,
  fetchCall,
  fetchEscalationCounts,
  fetchEscalationsForExport,
  fetchEscalationsPage,
  fetchLoan,
  fetchSettings,
  insertCallbackRequest,
  updateEscalation,
  writeExportAudit,
} from '@/lib/api';
import { useLiveData } from '@/lib/live';
import { useAuth, usePermissions } from '@/lib/auth';
import { formatDate, formatDateTime, formatINR, formatTime, formatWaiting, istDateKey, maskPhone, toCsv } from '@/lib/format';
import { isWithinCallingWindow, formatClock } from '@/lib/callingWindow';
import { downloadCsv } from '@/lib/download';

const reasonIcon: Record<EscalationReasonCode, typeof Heart> = {
  customer_requested_human: UserPlus,
  dispute: FileText,
  hardship_medical: Heart,
  hardship_income: Heart,
  bereavement: Heart,
  complaint: MessageSquare,
  negotiation_request: MessageSquare,
  technical_failure: AlertTriangle,
  supervisor_transfer: UserPlus,
};

const REASONS = Object.keys(ESCALATION_REASON_LABELS) as EscalationReasonCode[];
const STATUSES: (QueueStatus | 'All')[] = ['All', 'Open', 'Assigned', 'Resolved'];

function DetailDrawer({
  esc,
  onClose,
  onSave,
  onOpenCall,
  readOnly,
}: {
  esc: Escalation;
  onClose: () => void;
  onSave: (id: string, patch: { queueStatus?: QueueStatus; assignedOfficer?: string | null; notes?: string }) => Promise<void>;
  onOpenCall: () => void;
  readOnly: boolean;
}) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState(esc.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [callbackAt, setCallbackAt] = useState('');
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [callbackQueued, setCallbackQueued] = useState<string | null>(null);

  const settings = useLiveData(fetchSettings, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchCall(esc.callId), fetchLoan(esc.loanId), fetchAuditLog({ entity: 'escalations', entityIds: [esc.id] })])
      .then(([c, l, a]) => {
        if (!active) return;
        setCall(c);
        setLoan(l);
        setAudit(a);
      })
      .catch(() => {
        if (active) setError('Some call details could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [esc.callId, esc.loanId, esc.id]);

  const act = async (patch: { queueStatus?: QueueStatus; assignedOfficer?: string | null; notes?: string }) => {
    if (readOnly) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await onSave(esc.id, patch);
      setMessage('Saved. The change is recorded in the audit log.');
      setAudit(await fetchAuditLog({ entity: 'escalations', entityIds: [esc.id] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your change');
    } finally {
      setSaving(false);
    }
  };

  const queueCallback = async () => {
    if (!profile || !callbackAt) return;
    setCallbackError(null);
    setCallbackQueued(null);
    const scheduled = new Date(`${callbackAt}:00+05:30`);
    if (Number.isNaN(scheduled.getTime())) {
      setCallbackError('Choose a valid date and time.');
      return;
    }
    if (settings.data && !isWithinCallingWindow(scheduled, settings.data.callingStart, settings.data.callingEnd)) {
      setCallbackError(
        `Callbacks are only allowed between ${formatClock(settings.data.callingStart)} and ${formatClock(settings.data.callingEnd)} IST.`
      );
      return;
    }
    try {
      const created = await insertCallbackRequest({ loanId: esc.loanId, scheduledFor: scheduled.toISOString(), requestedBy: profile.id });
      setCallbackQueued(`Callback queued for ${formatDateTime(created.scheduledFor)} IST.`);
      setCallbackAt('');
    } catch (err) {
      setCallbackError(err instanceof Error ? err.message : 'The callback could not be queued.');
    }
  };

  const Icon = reasonIcon[esc.reason];
  const isResolved = esc.queueStatus === 'Resolved';
  const canSeePhone = profile?.role === 'officer' || profile?.role === 'manager';

  return (
    <Drawer onClose={onClose} label={`Escalation for ${esc.customerName}`}>
      <div className="flex items-start justify-between border-b border-line p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-content-strong">{esc.customerName}</div>
            <div className="tabular text-xs text-muted">{esc.loanId} · {esc.id}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Chip color={statusToColor(esc.queueStatus)}>{esc.queueStatus}</Chip>
              <Chip color={esc.sensitive ? 'escalated' : 'warning'}>{ESCALATION_REASON_LABELS[esc.reason] ?? esc.reason}</Chip>
              {esc.sensitive && <Badge tone="sensitive">Sensitive case</Badge>}
            </div>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-surface-3">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {readOnly && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            You have read-only access. Ask a manager or collections officer to change this case.
          </p>
        )}

        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Loan summary</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted">Overdue amount</div>
              <div className="tabular font-semibold text-content-strong">{loan ? formatINR(loan.overdueAmount) : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Days past due</div>
              <div className="tabular font-semibold text-content-strong">{loan ? loan.daysPastDue : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Loan type</div>
              <div className="font-medium text-content">{loan?.loanType ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Phone</div>
              <div className="tabular font-medium text-content">{loan ? (canSeePhone ? loan.phone : maskPhone(loan.phone)) : '—'}</div>
            </div>
          </div>
        </div>

        <button
          onClick={onOpenCall}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:text-indigo-400"
        >
          Open the full call details for {esc.callId} →
        </button>

        {!isResolved && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
            <Clock className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            <div>
              <div className="text-xs text-muted">Waiting time</div>
              <div className="tabular text-lg font-semibold text-rose-700 dark:text-rose-300">{formatWaiting(esc.waitingMinutes)}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-muted">Manager alert</div>
              <div className={`text-xs font-medium ${esc.alertDelivered ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {esc.alertDelivered ? 'Delivered' : 'Pending'}
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
            <History className="h-3.5 w-3.5" /> Audit log
          </div>
          {audit.length === 0 ? (
            <p className="text-sm text-muted">No changes recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {audit.map((entry) => (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-indigo-500" />
                    <div className="h-full w-px bg-line" />
                  </div>
                  <div className="pb-1">
                    <div className="tabular text-xs text-muted">{formatDateTime(entry.createdAt)}</div>
                    <div className="text-sm text-content">
                      {entry.action === 'escalation.updated' ? 'Escalation updated' : entry.action}
                      {entry.after && typeof entry.after.queue_status === 'string' ? ` · ${entry.after.queue_status}` : ''}
                      {entry.after && typeof entry.after.assigned_officer === 'string' && entry.after.assigned_officer
                        ? ` · ${entry.after.assigned_officer}`
                        : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {call && call.transcript.length > 0 && (
          <div>
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Call transcript</div>
            <div className="space-y-2.5 rounded-xl border border-line bg-surface-2 p-3">
              {call.transcript.map((line) => (
                <div key={line.id} className={`text-sm ${line.speaker === 'agent' ? '' : 'text-right'}`}>
                  <span className={`text-xs font-medium ${line.speaker === 'agent' ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted'}`}>
                    {line.speaker === 'agent' ? 'Vaani agent' : 'Customer'} ·
                  </span>{' '}
                  <span className="text-content">{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isResolved && settings.data && (
          <div className="rounded-xl border border-line p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
              <CalendarClock className="h-3.5 w-3.5" /> Queue a callback
            </div>
            <p className="mb-2 text-xs text-muted">
              Allowed between {formatClock(settings.data.callingStart)} and {formatClock(settings.data.callingEnd)} IST.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="datetime-local"
                value={callbackAt}
                onChange={(e) => setCallbackAt(e.target.value)}
                aria-label="Callback date and time (IST)"
                className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-content focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <Button size="sm" variant="secondary" disabled={!callbackAt || readOnly} onClick={() => void queueCallback()}>
                Queue callback
              </Button>
            </div>
            {callbackError && <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">{callbackError}</p>}
            {callbackQueued && <p role="status" className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{callbackQueued}</p>}
          </div>
        )}

        <div>
          <label htmlFor="officer-notes" className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">Officer notes</label>
          <textarea
            id="officer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            readOnly={readOnly}
            placeholder="Add follow-up notes…"
            rows={3}
            className="w-full resize-none rounded-lg border border-line bg-surface-2 p-3 text-sm text-content placeholder:text-muted focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          {!readOnly && (
            <div className="mt-2 flex justify-end">
              <Button variant="secondary" size="sm" disabled={saving || notes === esc.notes} onClick={() => void act({ notes })}>
                Save notes
              </Button>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
      </div>

      {!isResolved && !readOnly && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-4">
          {esc.queueStatus === 'Open' && (
            <Button
              size="sm"
              disabled={saving}
              icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              onClick={() => void act({ queueStatus: 'Assigned', assignedOfficer: profile?.fullName ?? null })}
            >
              Assign to me
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={saving} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void act({ queueStatus: 'Resolved' })}>
            Mark resolved
          </Button>
        </div>
      )}
    </Drawer>
  );
}

export function EscalationQueueScreen({ onCallSelect }: { onCallSelect: (callId: string) => void }) {
  const { profile } = useAuth();
  const { canWorkEscalations, canExport } = usePermissions();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<QueueStatus | 'All'>('All');
  const [reason, setReason] = useState<EscalationReasonCode | 'All'>('All');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortBy, setSortBy] = useState('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, Partial<Escalation>>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const filters = { page, search: debouncedSearch, status, reason, from, to, sortBy, sortDir };
  const state = useLiveData(() => fetchEscalationsPage(filters), [page, debouncedSearch, status, reason, from, to, sortBy, sortDir]);
  const counts = useLiveData(fetchEscalationCounts, []);

  const rows = (state.data?.rows ?? []).map((e) => (optimistic[e.id] ? { ...e, ...optimistic[e.id] } : e));
  const selected = rows.find((e) => e.id === selectedId) ?? null;

  const handleSort = (column: string) => {
    if (column === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(column);
      setSortDir('asc');
    }
    setPage(1);
  };

  const resetFilters = () => {
    setStatus('All');
    setReason('All');
    setSearch('');
    setDebouncedSearch('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const handleSave = async (id: string, patch: { queueStatus?: QueueStatus; assignedOfficer?: string | null; notes?: string }) => {
    setActionError(null);
    const previous = rows.find((e) => e.id === id);
    const optimisticPatch: Partial<Escalation> = {};
    if (patch.queueStatus) optimisticPatch.queueStatus = patch.queueStatus;
    if (patch.assignedOfficer !== undefined) optimisticPatch.assignedOfficer = patch.assignedOfficer;
    if (patch.notes !== undefined) optimisticPatch.notes = patch.notes;
    setOptimistic((prev) => ({ ...prev, [id]: { ...prev[id], ...optimisticPatch } }));

    try {
      const updated = await updateEscalation(id, patch);
      setOptimistic((prev) => ({ ...prev, [id]: updated }));
      state.reload();
    } catch (err) {
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setActionError(err instanceof Error ? err.message : 'The change could not be saved.');
      if (previous) setSelectedId(previous.id);
      throw err;
    }
  };

  const handleExport = async () => {
    if (!profile) return;
    setBusy(true);
    setNotice(null);
    try {
      const exportRows = await fetchEscalationsForExport(filters);
      const csv = toCsv(
        ['Escalation ID', 'Call ID', 'Customer', 'Loan ID', 'Reason', 'Status', 'Assigned officer', 'Waiting (min)', 'Created (IST)'],
        exportRows.map((e) => [
          e.id,
          e.callId,
          e.customerName,
          e.loanId,
          ESCALATION_REASON_LABELS[e.reason] ?? e.reason,
          e.queueStatus,
          e.assignedOfficer ?? '',
          e.waitingMinutes,
          formatDateTime(e.createdAt),
        ])
      );
      downloadCsv(`vaani-escalations-${istDateKey()}.csv`, csv);
      await writeExportAudit({
        entity: 'escalations',
        description: `Escalation queue export (status: ${status}, reason: ${reason})`,
        rowCount: exportRows.length,
        actorId: profile.id,
      });
      setNotice(`Exported ${exportRows.length} escalations.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The export failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Escalation Queue"
        subtitle="Calls handed off from the Vaani agent to human officers"
        action={
          canExport ? (
            <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void handleExport()} disabled={busy}>
              Export CSV
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            aria-pressed={status === s}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
              status === s ? 'bg-indigo-600 text-white shadow-sm' : 'text-muted hover:bg-surface-3 hover:text-content'
            }`}
          >
            {s}
            <span className={`tabular rounded-full px-1.5 text-[10px] ${status === s ? 'bg-white/20' : 'bg-surface-3'}`}>
              {counts.data?.[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search escalations"
            placeholder="Search by customer, loan ID, or escalation ID…"
            className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-9 pr-3 text-sm text-content placeholder:text-muted focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Reason
          <select
            value={reason}
            onChange={(e) => {
              setReason(e.target.value as EscalationReasonCode | 'All');
              setPage(1);
            }}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-content focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="All">All reasons</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>{ESCALATION_REASON_LABELS[r]}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            aria-label="Created from"
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-content focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="date"
            value={to}
            aria-label="Created to"
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-content focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-content"
          >
            <FilterX className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {actionError}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {notice}
        </p>
      )}

      {state.loading && !state.data ? (
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : state.error ? (
        <Card>
          <ErrorState title="Couldn't load the queue" message={state.error} onRetry={state.reload} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title={debouncedSearch || status !== 'All' || reason !== 'All' || from || to ? 'No escalations match your filters' : 'The queue is empty'}
            description={
              debouncedSearch || status !== 'All' || reason !== 'All' || from || to
                ? 'Try clearing filters or widening the date range.'
                : 'Calls the Vaani agent hands to an officer will appear here.'
            }
            action={<Button variant="secondary" size="sm" onClick={resetFilters}>Clear filters</Button>}
          />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full">
              <thead className="bg-surface-2">
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Priority</th>
                  <SortableTh label="Customer" column="customer" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Reason" column="reason" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Waiting</th>
                  <SortableTh label="Assigned" column="assigned" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Alert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((e) => {
                  const Icon = reasonIcon[e.reason] ?? AlertTriangle;
                  return (
                    <tr key={e.id} onClick={() => setSelectedId(e.id)} className="cursor-pointer transition-colors hover:bg-surface-2">
                      <td className="px-4 py-3.5">
                        {e.sensitive ? (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400"><Shield className="h-3.5 w-3.5" /> High</span>
                        ) : (
                          <span className="text-xs text-muted">Normal</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-sm font-medium text-content-strong">{e.customerName}</div>
                        <div className="tabular text-xs text-muted">{e.loanId} · {maskPhone(e.phone)}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Chip color={e.sensitive ? 'escalated' : 'warning'}>
                          <Icon className="h-3 w-3" /> {ESCALATION_REASON_LABELS[e.reason] ?? e.reason}
                        </Chip>
                      </td>
                      <td className="tabular px-4 py-3.5 text-sm">
                        {e.queueStatus === 'Resolved' ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className={e.waitingMinutes > 30 ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-content'}>
                            {formatWaiting(e.waitingMinutes)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm">
                        {e.assignedOfficer ? <span className="text-content">{e.assignedOfficer}</span> : <span className="text-muted">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3.5"><Chip color={statusToColor(e.queueStatus)}>{e.queueStatus}</Chip></td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium ${e.alertDelivered ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {e.alertDelivered ? 'Delivered' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={state.data?.page ?? page} pageSize={state.data?.pageSize ?? 25} total={state.data?.total ?? 0} onPage={setPage} label="escalations" />
          </Card>

          <div className="space-y-3 lg:hidden">
            {rows.map((e) => {
              const Icon = reasonIcon[e.reason] ?? AlertTriangle;
              return (
                <Card key={e.id} onClick={() => setSelectedId(e.id)} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-content-strong">{e.customerName}</div>
                      <div className="tabular text-xs text-muted">{e.loanId} · {maskPhone(e.phone)}</div>
                    </div>
                    {e.queueStatus !== 'Resolved' && (
                      <span className={`tabular text-xs font-medium ${e.waitingMinutes > 30 ? 'text-rose-600 dark:text-rose-400' : 'text-content'}`}>
                        {formatWaiting(e.waitingMinutes)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Chip color={statusToColor(e.queueStatus)}>{e.queueStatus}</Chip>
                    <Chip color={e.sensitive ? 'escalated' : 'warning'}><Icon className="h-3 w-3" /> {ESCALATION_REASON_LABELS[e.reason] ?? e.reason}</Chip>
                    {e.sensitive && <Badge tone="sensitive">Sensitive</Badge>}
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    {e.assignedOfficer ? `Assigned: ${e.assignedOfficer}` : 'Unassigned'} · Alert {e.alertDelivered ? 'delivered' : 'pending'}
                  </div>
                  <div className="mt-1 text-[11px] text-muted">Created {formatDate(e.createdAt)}, {formatTime(e.createdAt)}</div>
                </Card>
              );
            })}
            <Card>
              <Pagination page={state.data?.page ?? page} pageSize={state.data?.pageSize ?? 25} total={state.data?.total ?? 0} onPage={setPage} label="escalations" />
            </Card>
          </div>
        </>
      )}

      {selected && (
        <DetailDrawer
          key={selected.id}
          esc={selected}
          readOnly={!canWorkEscalations}
          onClose={() => setSelectedId(null)}
          onSave={handleSave}
          onOpenCall={() => onCallSelect(selected.callId)}
        />
      )}
    </div>
  );
}
