import {
  Bot,
  User,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  PhoneCall,
  ArrowLeft,
  Clock,
  History,
  AlertTriangle,
} from 'lucide-react';
import { Card, Chip, Button, PageHeader, statusToColor, EmptyState, Skeleton, ErrorState } from '@/components/ui';
import { fetchAuditLog, fetchCall, fetchEscalationsForCall, fetchLoan } from '@/lib/api';
import { useLiveData } from '@/lib/live';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatDuration, formatINR, formatTime, maskPhone } from '@/lib/format';
import { ESCALATION_REASON_LABELS } from '@/types';
import type { NavKey } from '@/lib/router';
import type { AuditEntry, Call, Escalation, Loan } from '@/types';

interface CallDetailData {
  call: Call;
  loan: Loan | null;
  escalations: Escalation[];
  audit: AuditEntry[];
}

function ComplianceCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
      )}
      <span className={`text-sm ${ok ? 'text-content' : 'font-medium text-content-strong'}`}>{label}</span>
      <span className="sr-only">{ok ? 'passed' : 'failed'}</span>
    </div>
  );
}

function CallDetailContent({ data, onNavigate }: { data: CallDetailData; onNavigate: (k: NavKey) => void }) {
  const { profile } = useAuth();
  const { call, loan, escalations, audit } = data;
  const canSeePhone = profile?.role === 'officer' || profile?.role === 'manager';
  const escalation = escalations[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Call ${call.callId}`}
        breadcrumbs={['Call History', call.callId]}
        subtitle={`${call.customerName} · ${formatDate(call.startedAt)}, ${formatTime(call.startedAt)} · ${formatDuration(call.durationSec)}`}
        action={
          <Button variant="secondary" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => onNavigate('history')}>
            Back to history
          </Button>
        }
      />

      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-semibold text-white">
              {call.customerName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div className="text-base font-semibold text-content-strong">{call.customerName}</div>
              <div className="tabular text-sm text-muted">{call.loanId} · {call.loanType}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip color={statusToColor(call.status)}>{call.status}</Chip>
            <Chip color="neutral">{call.language}</Chip>
            <span className="tabular flex items-center gap-1 text-sm text-muted"><Clock className="h-3.5 w-3.5" /> {formatDuration(call.durationSec)}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted">Overdue amount</div>
            <div className="tabular text-sm font-semibold text-content-strong">{loan ? formatINR(loan.overdueAmount) : '—'}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Days past due</div>
            <div className="tabular text-sm font-semibold text-content-strong">{loan ? loan.daysPastDue : '—'}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Phone</div>
            <div className="tabular text-sm font-medium text-content">{canSeePhone ? call.phone : maskPhone(call.phone)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Ended</div>
            <div className="tabular text-sm font-medium text-content">{call.endedAt ? `${formatDate(call.endedAt)}, ${formatTime(call.endedAt)}` : 'In progress'}</div>
          </div>
        </div>

        {(call.provider || call.providerStatus) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-medium uppercase tracking-wide">Telephony</span>
            {call.provider && <Chip color="neutral">{call.provider}</Chip>}
            {call.providerStatus && <span>{call.providerStatus}</span>}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-content-strong">Full transcript</h3>
          {call.transcript.length === 0 ? (
            <p className="text-sm text-muted">No turns have been recorded for this call yet.</p>
          ) : (
            <div className="space-y-4">
              {call.transcript.map((line) => (
                <div key={line.id} className={`flex gap-3 ${line.speaker === 'agent' ? 'flex-row' : 'flex-row-reverse'}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    line.speaker === 'agent'
                      ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
                      : 'bg-surface-3 text-muted'
                  }`}>
                    {line.speaker === 'agent' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <div className={`max-w-[80%] ${line.speaker === 'agent' ? '' : 'text-right'}`}>
                    <div className={`mb-1 flex items-center gap-2 text-[10px] text-muted ${line.speaker === 'agent' ? '' : 'justify-end'}`}>
                      <span className="font-medium">{line.speaker === 'agent' ? 'Vaani agent' : 'Customer'}</span>
                      <span className="tabular">{formatTime(line.time)}</span>
                    </div>
                    <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      line.speaker === 'agent'
                        ? 'rounded-tl-sm bg-indigo-50 text-content-strong dark:bg-indigo-500/10 dark:text-indigo-50'
                        : 'rounded-tr-sm bg-surface-3 text-content-strong'
                    }`}>
                      {line.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-content-strong">Outcome</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Result</span>
                <Chip color={statusToColor(call.status)}>{call.status}</Chip>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Conversation stage</span>
                <span className="text-sm font-medium text-content">{call.stage}</span>
              </div>
              {call.agentIntent && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm text-muted">Agent intent</span>
                  <span className="text-right text-sm font-medium text-content">{call.agentIntent}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Call ID</span>
                <span className="tabular text-sm font-medium text-content">{call.callId}</span>
              </div>
            </div>
          </Card>

          {escalation && (
            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content-strong">
                <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" /> Escalation
              </h3>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip color={escalation.sensitive ? 'escalated' : 'warning'}>
                    {ESCALATION_REASON_LABELS[escalation.reason] ?? escalation.reason}
                  </Chip>
                  <Chip color={statusToColor(escalation.queueStatus)}>{escalation.queueStatus}</Chip>
                </div>
                <p className="text-xs text-muted">Raised {formatDateTime(escalation.createdAt)}</p>
                <p className="text-xs text-muted">{escalation.assignedOfficer ? `Assigned to ${escalation.assignedOfficer}` : 'Not yet assigned'}</p>
              </div>
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => onNavigate('escalation')}>
                Open escalation queue
              </Button>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-content-strong">
              <ShieldCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Compliance checks
            </h3>
            <div className="space-y-3">
              <ComplianceCheck ok={call.compliance.identityVerifiedBeforeDisclosure} label="Identity verified before disclosure" />
              <ComplianceCheck ok={call.compliance.withinCallingHours} label="Within permitted calling hours" />
              <ComplianceCheck ok={call.compliance.noUnapprovedOffers} label="No unapproved settlement offers" />
            </div>

            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                <History className="h-3.5 w-3.5" /> Escalation audit trail
              </div>
              {audit.length === 0 ? (
                <p className="text-xs text-muted">No escalation changes for this call.</p>
              ) : (
                <div className="space-y-2">
                  {audit.map((entry) => (
                    <div key={entry.id} className="text-xs text-content">
                      <span className="tabular text-muted">{formatDateTime(entry.createdAt)} · </span>
                      {entry.action === 'escalation.updated' ? 'Escalation updated' : entry.action}
                      {entry.after && typeof entry.after.queue_status === 'string' ? (
                        <span className="text-muted"> → {entry.after.queue_status}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {escalation && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs dark:border-rose-500/20 dark:bg-rose-500/10">
                <span className="font-medium text-rose-700 dark:text-rose-300">Escalated: </span>
                <span className="text-rose-600 dark:text-rose-400">{ESCALATION_REASON_LABELS[escalation.reason] ?? escalation.reason}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export function CallDetailScreen({
  callId,
  onNavigate,
}: {
  callId?: string;
  onNavigate: (k: NavKey) => void;
  onCallSelect?: (callId: string) => void;
}) {
  const state = useLiveData<CallDetailData>(async () => {
    if (!callId) throw new Error('No call was selected.');
    const call = await fetchCall(callId);
    if (!call) throw new Error('This call could not be found.');
    const [loan, escalations] = await Promise.all([fetchLoan(call.loanId), fetchEscalationsForCall(callId)]);
    const audit = escalations.length
      ? await fetchAuditLog({ entity: 'escalations', entityIds: escalations.map((e) => e.id) })
      : [];
    return { call, loan, escalations, audit };
  }, [callId]);

  if (!callId) {
    return (
      <Card>
        <EmptyState
          icon={<PhoneCall className="h-7 w-7" />}
          title="No call selected"
          description="Pick a call from Call History to see its transcript and compliance checks."
          action={<Button variant="secondary" size="sm" onClick={() => onNavigate('history')}>Go to Call History</Button>}
        />
      </Card>
    );
  }

  if (state.loading && !state.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-40" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (state.error || !state.data) {
    return (
      <Card>
        <ErrorState title="Couldn't load this call" message={state.error ?? 'The call is unavailable.'} onRetry={state.reload} />
      </Card>
    );
  }

  return <CallDetailContent data={state.data} onNavigate={onNavigate} />;
}
