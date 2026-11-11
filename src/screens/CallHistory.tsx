import { useEffect, useState } from 'react';
import { History, Search, ChevronRight, Download, FilterX } from 'lucide-react';
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
import { fetchCallsForExport, fetchCallsPage, writeExportAudit } from '@/lib/api';
import { useLiveData } from '@/lib/live';
import { useAuth, usePermissions } from '@/lib/auth';
import { formatDate, formatDuration, formatTime, istDateKey, maskPhone, toCsv } from '@/lib/format';
import { downloadCsv } from '@/lib/download';
import type { NavKey } from '@/lib/router';

const CALL_STATUSES = ['All', 'Completed', 'PTP Promised', 'Escalated / Disputed', 'Failed', 'In Progress'];
const LANGUAGES = ['All', 'English', 'Hindi', 'Tamil', 'Telugu'];

interface CallHistoryProps {
  initialQuery: string;
  onCallSelect: (callId: string) => void;
  onNavigate: (key: NavKey) => void;
}

export function CallHistoryScreen({ initialQuery, onCallSelect, onNavigate }: CallHistoryProps) {
  const { profile } = useAuth();
  const { canExport } = usePermissions();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQuery);
  const [status, setStatus] = useState('All');
  const [language, setLanguage] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortBy, setSortBy] = useState('started');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setSearch(initialQuery);
    setDebouncedSearch(initialQuery);
    setPage(1);
  }, [initialQuery]);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const filters = { page, search: debouncedSearch, status, language, from, to, sortBy, sortDir };
  const state = useLiveData(() => fetchCallsPage(filters), [page, debouncedSearch, status, language, from, to, sortBy, sortDir]);

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatus('All');
    setLanguage('All');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const handleSort = (column: string) => {
    if (column === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir(column === 'started' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const handleExport = async () => {
    if (!profile) return;
    setExporting(true);
    setNotice(null);
    try {
      const rows = await fetchCallsForExport(filters);
      const csv = toCsv(
        ['Call ID', 'Customer', 'Loan ID', 'Loan type', 'Phone', 'Started (IST)', 'Duration (sec)', 'Language', 'Status'],
        rows.map((c) => [
          c.callId,
          c.customerName,
          c.loanId,
          c.loanType,
          c.phone,
          `${formatDate(c.startedAt)} ${formatTime(c.startedAt)}`,
          c.durationSec,
          c.language,
          c.status,
        ])
      );
      downloadCsv(`vaani-call-history-${istDateKey()}.csv`, csv);
      await writeExportAudit({
        entity: 'calls',
        description: `Call History export (status: ${status}, language: ${language}, search: ${debouncedSearch || 'none'})`,
        rowCount: rows.length,
        actorId: profile.id,
      });
      setNotice(`Exported ${rows.length} calls.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The export failed.');
    } finally {
      setExporting(false);
    }
  };

  const rows = state.data?.rows ?? [];
  const showEmpty = !state.loading && rows.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Call History"
        subtitle="Every Vaani agent call, newest first"
        action={
          canExport ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={() => void handleExport()}
              disabled={exporting || state.loading}
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search calls"
              placeholder="Search by customer, call ID, or loan ID…"
              className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-9 pr-3 text-sm text-content placeholder:text-muted focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
              Status
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-content focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {CALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
              Language
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-content focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-content focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-content focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-content"
          >
            <FilterX className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
        {notice && (
          <p role="status" className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">{notice}</p>
        )}
      </div>

      {state.loading && !state.data ? (
        <div className="space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-72" />
        </div>
      ) : state.error ? (
        <Card>
          <ErrorState title="Couldn't load call history" message={state.error} onRetry={state.reload} />
        </Card>
      ) : showEmpty ? (
        <Card>
          <EmptyState
            icon={<History className="h-7 w-7" />}
            title={debouncedSearch || status !== 'All' || language !== 'All' || from || to ? 'No calls match your filters' : 'No calls yet'}
            description={
              debouncedSearch || status !== 'All' || language !== 'All' || from || to
                ? 'Try widening the date range or clearing the search.'
                : 'Calls made by the Vaani agent will appear here.'
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
                  <SortableTh label="Call ID" column="callId" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Customer" column="customer" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Loan" column="loan" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Started" column="started" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Duration" column="duration" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Language" column="language" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th scope="col" className="w-10 px-4 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => (
                  <tr
                    key={c.callId}
                    onClick={() => onCallSelect(c.callId)}
                    className="cursor-pointer transition-colors hover:bg-surface-2"
                  >
                    <td className="tabular px-4 py-3.5 text-sm font-medium text-content">{c.callId}</td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm font-medium text-content-strong">{c.customerName}</div>
                      <div className="tabular text-xs text-muted">{maskPhone(c.phone)}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="tabular text-xs text-muted">{c.loanId}</div>
                      <div className="text-xs text-muted">{c.loanType}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm text-content">{formatDate(c.startedAt)}</div>
                      <div className="tabular text-xs text-muted">{formatTime(c.startedAt)}</div>
                    </td>
                    <td className="tabular px-4 py-3.5 text-sm text-content">{formatDuration(c.durationSec)}</td>
                    <td className="px-4 py-3.5"><Chip color="neutral">{c.language}</Chip></td>
                    <td className="px-4 py-3.5">
                      <Chip color={statusToColor(c.status)} dot={c.status === 'In Progress'} pulse={c.status === 'In Progress'}>
                        {c.status}
                      </Chip>
                    </td>
                    <td className="px-4 py-3.5"><ChevronRight className="h-4 w-4 text-muted" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={state.data?.page ?? page} pageSize={state.data?.pageSize ?? 25} total={state.data?.total ?? 0} onPage={setPage} label="calls" />
          </Card>

          <div className="space-y-3 lg:hidden">
            {rows.map((c) => (
              <Card key={c.callId} onClick={() => onCallSelect(c.callId)} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-content-strong">{c.customerName}</div>
                    <div className="tabular text-xs text-muted">{c.callId} · {c.loanId}</div>
                    <div className="tabular text-xs text-muted">{maskPhone(c.phone)}</div>
                  </div>
                  <Chip color={statusToColor(c.status)} dot={c.status === 'In Progress'} pulse={c.status === 'In Progress'}>{c.status}</Chip>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
                  <span className="text-muted">{formatDate(c.startedAt)}, {formatTime(c.startedAt)} · {formatDuration(c.durationSec)}</span>
                  <Chip color="neutral">{c.language}</Chip>
                </div>
              </Card>
            ))}
            <Card>
              <Pagination page={state.data?.page ?? page} pageSize={state.data?.pageSize ?? 25} total={state.data?.total ?? 0} onPage={setPage} label="calls" />
            </Card>
          </div>
        </>
      )}

      <p className="text-xs text-muted">
        Phone numbers are masked in lists. Open a call to see the full number if your role allows it.{' '}
        <button onClick={() => onNavigate('live')} className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
          View live calls
        </button>
      </p>
    </div>
  );
}
