import { useState } from 'react';
import { PhoneCall, X, Bot, User, Loader2, RefreshCw, PhoneForwarded } from 'lucide-react';
import type { Call, ConversationStage } from '@/types';
import { Card, Chip, Button, PageHeader, EmptyState, Skeleton, ErrorState, Drawer } from '@/components/ui';
import { fetchCall, fetchLiveCalls, isBackendConnected, transferCallToOfficer } from '@/lib/api';
import { useLiveData, useLive, useNow } from '@/lib/live';
import { usePermissions } from '@/lib/auth';
import { formatDuration, formatTime } from '@/lib/format';
import { VoiceDemo } from '@/components/VoiceDemo';

const stages: ConversationStage[] = ['Identity verification', 'Payment demand', 'Negotiation', 'Promise to pay'];

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2);
}

function StageIndicator({ current }: { current: ConversationStage }) {
  const currentIdx = stages.indexOf(current);
  return (
    <div className="flex items-center gap-1" aria-label={`Stage: ${current}`}>
      {stages.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all ${i <= currentIdx ? 'bg-indigo-500' : 'bg-surface-3'} ${i === currentIdx ? 'w-6' : 'w-3'}`}
        />
      ))}
    </div>
  );
}

function elapsedSeconds(startedAt: string, now: number): number {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now - started) / 1000));
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const now = useNow(1000);
  return (
    <span className="tabular flex items-center gap-1 text-xs text-muted">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
      </span>
      {formatDuration(elapsedSeconds(startedAt, now))}
    </span>
  );
}

function CallCard({ call, selected, onSelect }: { call: Call; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`card w-full p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${selected ? 'ring-2 ring-indigo-500' : 'hover:shadow-card-lg'}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            {initials(call.customerName)}
          </div>
          <div>
            <div className="text-sm font-semibold text-content-strong">{call.customerName}</div>
            <div className="tabular text-xs text-muted">{call.loanId} · {call.loanType}</div>
          </div>
        </div>
        <LiveTimer startedAt={call.startedAt} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Chip color="neutral">{call.language}</Chip>
        <span className="text-xs font-medium text-content">{call.stage}</span>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <StageIndicator current={call.stage} />
      </div>
    </button>
  );
}

function TranscriptPanel({ callId, onClose }: { callId: string; onClose: () => void }) {
  const { canWorkEscalations } = usePermissions();
  const detail = useLiveData(() => fetchCall(callId), [callId]);
  const call = detail.data;
  const [transferring, setTransferring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const transfer = async () => {
    if (!call) return;
    setTransferring(true);
    setMessage(null);
    setError(null);
    try {
      await transferCallToOfficer(call.callId);
      setMessage('Transfer requested. An officer will pick up this call shortly.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The transfer request failed.');
    } finally {
      setTransferring(false);
    }
  };

  return (
    <Drawer onClose={onClose} widthClass="max-w-md" label={call ? `Live call with ${call.customerName}` : 'Live call'}>
      <div className="flex items-center justify-between border-b border-line p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            {call ? initials(call.customerName) : '…'}
          </div>
          <div>
            <div className="text-sm font-semibold text-content-strong">{call?.customerName ?? 'Loading call…'}</div>
            <div className="tabular text-xs text-muted">{call ? `${call.loanId} · ${call.callId}` : callId}</div>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40">
          <X className="h-5 w-5" />
        </button>
      </div>

      {call && (
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2.5">
          <LiveTimer startedAt={call.startedAt} />
          <div className="flex items-center gap-2">
            <Chip color="neutral">Started {formatTime(call.startedAt)}</Chip>
            <Chip color="progress">{call.stage}</Chip>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-xs text-content">
        <Bot className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        The Vaani agent is handling this call.
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {detail.loading && !call && <p className="text-sm text-muted">Loading transcript…</p>}
        {detail.error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{detail.error}</p>}
        {call && call.transcript.length === 0 && <p className="text-sm text-muted">The transcript will appear as the conversation continues.</p>}
        {call?.transcript.map((line) => (
          <div key={line.id} className={`flex gap-2.5 ${line.speaker === 'agent' ? 'flex-row' : 'flex-row-reverse'}`}>
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${line.speaker === 'agent' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400' : 'bg-surface-3 text-muted'}`}>
              {line.speaker === 'agent' ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            </div>
            <div className={`max-w-[78%] ${line.speaker === 'agent' ? '' : 'text-right'}`}>
              <div className={`mb-1 flex items-center gap-2 text-[10px] text-muted ${line.speaker === 'agent' ? '' : 'justify-end'}`}>
                <span className="font-medium">{line.speaker === 'agent' ? 'Vaani agent' : 'Customer'}</span>
                <span className="tabular">{formatTime(line.time)}</span>
              </div>
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${line.speaker === 'agent' ? 'rounded-tl-sm bg-indigo-50 text-content-strong dark:bg-indigo-500/10 dark:text-indigo-50' : 'rounded-tr-sm bg-surface-3 text-content-strong'}`}>
                {line.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-4">
        {message && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</p>}
        {error && <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        {!isBackendConnected && (
          <p className="mb-3 text-xs text-muted">
            Backend not connected. Set <code>VITE_API_BASE_URL</code> to enable live call transfers.
          </p>
        )}
        <Button
          size="sm"
          className="w-full"
          icon={transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneForwarded className="h-4 w-4" />}
          disabled={!isBackendConnected || transferring || !canWorkEscalations}
          title={!isBackendConnected ? 'Backend not connected' : !canWorkEscalations ? 'Only officers and managers can transfer calls' : undefined}
          onClick={() => void transfer()}
        >
          Transfer to officer
        </Button>
      </div>
    </Drawer>
  );
}

export function LiveCallsScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { connection } = useLive();
  const state = useLiveData(fetchLiveCalls, []);
  const calls = state.data ?? [];
  const selected = calls.find((c) => c.callId === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Calls"
        subtitle={`${calls.length} ${calls.length === 1 ? 'call' : 'calls'} in progress`}
        action={
          <div className="flex items-center gap-2">
            {connection === 'disconnected' && (
              <span role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                Reconnecting…
              </span>
            )}
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={state.reload}>
              Refresh
            </Button>
          </div>
        }
      />

      <VoiceDemo onCallUpdated={state.reload} />

      {state.loading && !state.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : state.error ? (
        <Card>
          <ErrorState title="Couldn't load live calls" message={state.error} onRetry={state.reload} />
        </Card>
      ) : calls.length === 0 ? (
        <Card>
          <EmptyState icon={<PhoneCall className="h-7 w-7" />} title="No calls in progress" description="Active calls will appear here as the Vaani agent dials customers." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {calls.map((call) => (
            <CallCard key={call.callId} call={call} selected={selected?.callId === call.callId} onSelect={() => setSelectedId(call.callId)} />
          ))}
        </div>
      )}

      {selectedId && !selected && (
        <p className="text-xs text-muted">That call has ended and left the live list. You can find it in Call History.</p>
      )}

      {selected && <TranscriptPanel key={selected.callId} callId={selected.callId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
