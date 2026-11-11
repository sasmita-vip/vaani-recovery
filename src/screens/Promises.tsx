import { useEffect, useState } from 'react';
import { Handshake, CalendarDays, Link2, Download, FilterX, Search, MessageSquare, Send } from 'lucide-react';
import type { OutboundStatus, PromiseState, PromiseToPay } from '@/types';
import {
  Card,
  Chip,
  PageHeader,
  statusToColor,
  EmptyState,
  Skeleton,
  ErrorState,
  Pagination,
  SortableTh,
  Button,
} from '@/components/ui';
import {
  fetchPromiseCounts,
  fetchPromises,
  fetchPromisesForExport,
  fetchPromisesPage,
  insertOutboundMessages,
  writeExportAudit,
} from '@/lib/api';
import { useLiveData } from '@/lib/live';
import { useAuth, usePermissions } from '@/lib/auth';
import { daysBetween, formatDate, formatINR, istDateKey, parseIstDate, toCsv } from '@/lib/format';
import { downloadCsv } from '@/lib/download';

const tabs: PromiseState[] = ['Due today', 'Upcoming', 'Missed', 'Paid'];

const messageStatusLabel: Record<OutboundStatus, string> = {
  queued: 'SMS queued',
  sent: 'SMS sent',
  failed: 'SMS failed',
};

function CalendarStrip({ promises }: { promises: PromiseToPay[] }) {
  const today = parseIstDate(istDateKey());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return { date: d, key: istDateKey(new Date(today.getTime() + i * 86_400_000)) };
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <span className="text-sm font-semibold text-content-strong">Next 7 days</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map(({ date, key }, i) => {
          const count = promises.filter((p) => p.promisedDate === key).length;
          return (
            <div
              key={key}
              className={`flex flex-col items-center rounded-xl border p-2 transition-colors ${
                i === 0 ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10' : 'border-line bg-surface-2'
              }`}
            >
              <span className="text-[10px] font-medium uppercase text-muted">
                {date.toLocaleDateString('en-IN', { weekday: 'short' })}
              </span>
              <span className={`tabular mt-0.5 text-sm font-semibold ${i === 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-content-strong'}`}>
                {date.getDate()}
              </span>
              <span
                className={`tabular mt-1 rounded-full px-1.5 text-[10px] font-medium ${
                  count > 0 ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'bg-surface-3 text-muted'
                }`}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function PromisesScreen({ onCallSelect }: { onCallSelect: (callId: string) => void }) {
  const { profile } = useAuth();
  const { canExport, canWorkEscalations } = usePermissions();

  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<PromiseState>('Due today');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortBy, setSortBy] = useState('promisedDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const filters = { page, search: debouncedSearch, state: tab, from, to, sortBy, sortDir };
  const state = useLiveData(() => fetchPromisesPage(filters), [page, debouncedSearch, tab, from, to, sortBy, sortDir]);
  const counts = useLiveData(fetchPromiseCounts, []);
  const allPromises = useLiveData(fetchPromises, []);

  const rows = state.data?.rows ?? [];
  const today = parseIstDate(istDateKey());

  const handleSort = (column: string) => {
    if (column === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(column);
      setSortDir('asc');
    }
    setPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const toggleRow = (loanId: string) => {
    setSelected((prev) => (prev.includes(loanId) ? prev.filter((id) => id !== loanId) : [...prev, loanId]));
  };

  const toggleAll = () => {
    const pageIds = rows.map((r) => r.loanId);
    setSelected((prev) => (pageIds.every((id) => prev.includes(id)) ? prev.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...prev, ...pageIds]))));
  };

  const queueMessages = async (template: 'payment_link' | 'payment_reminder') => {
    if (!profile || selected.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const tomorrow = new Date(today.getTime() + 86_400_000);
      const scheduledFor =
        template === 'payment_reminder' ? new Date(`${istDateKey(tomorrow)}T10:00:00+05:30`).toISOString() : null;
      const count = await insertOutboundMessages({
        loanIds: selected,
        template,
        scheduledFor,
        createdBy: profile.id,
      });
      setNotice(
        template === 'payment_link'
          ? `Payment link SMS queued for ${count} ${count === 1 ? 'customer' : 'customers'}.`
          : `Reminder SMS scheduled for ${count} ${count === 1 ? 'customer' : 'customers'} tomorrow at 10:00 AM IST.`
      );
      setSelected([]);
      state.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The messages could not be queued.');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!profile) return;
    setBusy(true);
    setNotice(null);
    try {
      const exportRows = await fetchPromisesForExport(filters);
      const csv = toCsv(
        ['Promise ID', 'Customer', 'Loan ID', 'Promised date', 'Amount (INR)', 'State', 'Source call', 'Paid at'],
        exportRows.map((p) => [
          p.id,
          p.customerName,
          p.loanId,
          formatDate(parseIstDate(p.promisedDate)),
          p.promisedAmount,
          p.state,
          p.sourceCallId,
          p.paidAt ? formatDate(p.paidAt) : '',
        ])
      );
      downloadCsv(`vaani-promises-${istDateKey()}.csv`, csv);
      await writeExportAudit({
        entity: 'promises_to_pay',
        description: `Promises export (state: ${tab}, search: ${debouncedSearch || 'none'})`,
        rowCount: exportRows.length,
        actorId: profile.id,
      });
      setNotice(`Exported ${exportRows.length} promises.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The export failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promises to Pay"
        subtitle="Commitments captured by the Vaani agent"
        action={
          canExport ? (
            <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void handleExport()} disabled={busy}>
              Export CSV
            </Button>
          ) : undefined
        }
      />

      <CalendarStrip promises={allPromises.data ?? []} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setPage(1);
                setSelected([]);
              }}
              aria-pressed={tab === t}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                tab === t ? 'bg-indigo-600 text-white shadow-sm' : 'text-muted hover:bg-surface-3 hover:text-content'
              }`}
            >
              {t}
              <span className={`tabular rounded-full px-1.5 text-[10px] ${tab === t ? 'bg-white/20' : 'bg-surface-3'}`}>
                {counts.data?.[t] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search promises"
            placeholder="Search by customer, loan ID, or promise ID…"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-content placeholder:text-muted focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            aria-label="Promised from"
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-content focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="date"
            value={to}
            aria-label="Promised to"
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-content focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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

      {selected.length > 0 && canWorkEscalations && (
        <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
            {selected.length} {selected.length === 1 ? 'promise' : 'promises'} selected
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Send className="h-4 w-4" />} disabled={busy} onClick={() => void queueMessages('payment_link')}>
              Send payment link by SMS
            </Button>
            <Button size="sm" variant="secondary" icon={<MessageSquare className="h-4 w-4" />} disabled={busy} onClick={() => void queueMessages('payment_reminder')}>
              Schedule reminder SMS
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {notice}
        </p>
      )}

      {state.loading && !state.data ? (
        <div className="space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-64" />
        </div>
      ) : state.error ? (
        <Card>
          <ErrorState title="Couldn't load promises" message={state.error} onRetry={state.reload} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Handshake className="h-7 w-7" />}
            title={`No ${tab.toLowerCase()} promises`}
            description={
              debouncedSearch || from || to
                ? 'No promise matches this search and date range.'
                : `There are no promises marked as ${tab.toLowerCase()} right now.`
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
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all promises on this page"
                      disabled={!canWorkEscalations}
                      checked={rows.length > 0 && rows.every((r) => selected.includes(r.loanId))}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-line text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <SortableTh label="Customer" column="customer" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Loan" column="loan" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Promised date" column="promisedDate" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Amount" column="amount" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Message</th>
                  <SortableTh label="Source call" column="sourceCall" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        aria-label={`Select promise for ${p.customerName}`}
                        disabled={!canWorkEscalations}
                        checked={selected.includes(p.loanId)}
                        onChange={() => toggleRow(p.loanId)}
                        className="h-3.5 w-3.5 rounded border-line text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3.5 text-sm font-medium text-content-strong">{p.customerName}</td>
                    <td className="tabular px-4 py-3.5 text-sm text-content">{p.loanId}</td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm text-content">{formatDate(parseIstDate(p.promisedDate))}</div>
                      <div className="text-xs text-muted">{daysBetween(istDateKey(), p.promisedDate) === 0 ? 'Today' : daysBetween(istDateKey(), p.promisedDate) > 0 ? `in ${daysBetween(istDateKey(), p.promisedDate)}d` : `${Math.abs(daysBetween(istDateKey(), p.promisedDate))}d ago`}</div>
                    </td>
                    <td className="tabular px-4 py-3.5 text-right text-sm font-semibold text-content-strong">{formatINR(p.promisedAmount)}</td>
                    <td className="px-4 py-3.5"><Chip color={statusToColor(p.state)}>{p.state}</Chip></td>
                    <td className="px-4 py-3.5">
                      {p.lastMessageStatus ? (
                        <Chip color={p.lastMessageStatus === 'sent' ? 'success' : p.lastMessageStatus === 'failed' ? 'escalated' : 'info'}>
                          {messageStatusLabel[p.lastMessageStatus]}
                        </Chip>
                      ) : (
                        <span className="text-xs text-muted">No message</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => onCallSelect(p.sourceCallId)}
                        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                      >
                        <Link2 className="h-3.5 w-3.5" /> {p.sourceCallId}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={state.data?.page ?? page} pageSize={state.data?.pageSize ?? 25} total={state.data?.total ?? 0} onPage={setPage} label="promises" />
          </Card>

          <div className="space-y-3 lg:hidden">
            {rows.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-content-strong">{p.customerName}</div>
                    <div className="tabular text-xs text-muted">{p.loanId}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Select promise for ${p.customerName}`}
                      disabled={!canWorkEscalations}
                      checked={selected.includes(p.loanId)}
                      onChange={() => toggleRow(p.loanId)}
                      className="h-4 w-4 rounded border-line text-indigo-600 focus:ring-indigo-500"
                    />
                    <Chip color={statusToColor(p.state)}>{p.state}</Chip>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                  <div>
                    <div className="text-xs text-muted">Promised</div>
                    <div className="tabular text-sm font-medium text-content">{formatDate(parseIstDate(p.promisedDate))}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted">Amount</div>
                    <div className="tabular text-sm font-semibold text-content-strong">{formatINR(p.promisedAmount)}</div>
                  </div>
                </div>
                {p.lastMessageStatus && (
                  <div className="mt-2 text-xs text-muted">{messageStatusLabel[p.lastMessageStatus]}</div>
                )}
              </Card>
            ))}
            <Card>
              <Pagination page={state.data?.page ?? page} pageSize={state.data?.pageSize ?? 25} total={state.data?.total ?? 0} onPage={setPage} label="promises" />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
