import { supabase, supabaseConfigError } from '@/lib/supabase';
import { daysBetween, istDateKey } from '@/lib/format';
import type {
  AppSettings,
  AuditEntry,
  Call,
  CallbackRequest,
  CallStatus,
  ComplianceMetrics,
  ConversationStage,
  Escalation,
  EscalationReasonCode,
  FlaggedCall,
  HourPoint,
  Kpis,
  LanguageMix,
  Loan,
  LoanStatus,
  LoanType,
  OutboundMessage,
  OutboundStatus,
  OutcomeSlice,
  PromiseState,
  PromiseToPay,
  QueueStatus,
  TelephonyProvider,
  TranscriptLine,
} from '@/types';
import { SENSITIVE_REASONS } from '@/types';

type Row = Record<string, unknown>;

interface RawResult {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

async function run(result: PromiseLike<RawResult>): Promise<{ rows: Row[]; count: number | null }> {
  // Surface a configuration problem instead of a generic network failure.
  if (supabaseConfigError) throw new Error(supabaseConfigError);
  const resolved = await result;
  if (resolved.error) throw new Error(resolved.error.message);
  const rows = Array.isArray(resolved.data)
    ? (resolved.data as unknown[]).filter(isRow)
    : isRow(resolved.data)
      ? [resolved.data]
      : [];
  return { rows, count: resolved.count ?? null };
}

function phoneOf(row: Row): string {
  const loan = row.loans;
  const related = Array.isArray(loan) ? loan[0] : loan;
  return isRow(related) ? text(related.phone) : '';
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function mapLoan(r: Row): Loan {
  const dueDate = text(r.due_date);
  return {
    loanId: text(r.loan_id),
    customerId: text(r.customer_id),
    customerName: text(r.customer_name),
    lenderName: text(r.lender_name),
    loanType: text(r.loan_type) as LoanType,
    overdueAmount: num(r.overdue_amount),
    dueDate,
    daysPastDue: dueDate ? Math.max(0, daysBetween(dueDate, istDateKey())) : 0,
    status: text(r.status) as LoanStatus,
    phone: text(r.phone),
  };
}

function mapCall(r: Row): Call {
  return {
    callId: text(r.call_id),
    loanId: text(r.loan_id),
    customerName: text(r.customer_name),
    loanType: text(r.loan_type) as LoanType,
    overdueAmount: num(r.overdue_amount),
    phone: phoneOf(r),
    startedAt: text(r.started_at),
    endedAt: text(r.ended_at) || null,
    durationSec: num(r.duration_sec),
    status: text(r.status) as CallStatus,
    language: text(r.language) as LanguageMix,
    stage: text(r.stage) as ConversationStage,
    agentIntent: text(r.agent_intent) || undefined,
    provider: text(r.provider) || null,
    providerStatus: text(r.provider_status) || null,
    transcript: [],
    compliance: {
      identityVerifiedBeforeDisclosure: bool(r.identity_verified),
      withinCallingHours: bool(r.within_calling_hours),
      noUnapprovedOffers: bool(r.no_unapproved_offers),
    },
  };
}

function mapTurn(r: Row): TranscriptLine {
  return {
    id: `${text(r.call_id)}-${num(r.seq)}`,
    seq: num(r.seq),
    speaker: text(r.speaker) === 'customer' ? 'customer' : 'agent',
    text: text(r.text),
    time: text(r.created_at),
  };
}

function promiseState(r: Row): PromiseState {
  if (text(r.paid_at)) return 'Paid';
  const today = istDateKey();
  const date = text(r.promised_date);
  if (!date) return 'Upcoming';
  if (date === today) return 'Due today';
  return date < today ? 'Missed' : 'Upcoming';
}

function mapPromise(r: Row): PromiseToPay {
  return {
    id: text(r.id),
    loanId: text(r.loan_id),
    customerName: text(r.customer_name),
    promisedDate: text(r.promised_date),
    promisedAmount: num(r.promised_amount),
    sourceCallId: text(r.source_call_id),
    state: promiseState(r),
    paidAt: text(r.paid_at) || null,
    createdAt: text(r.created_at),
    phone: phoneOf(r),
    lastMessageStatus: null,
  };
}

function mapEscalation(r: Row): Escalation {
  const createdAt = text(r.created_at);
  const waiting = createdAt ? Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)) : 0;
  return {
    id: text(r.id),
    callId: text(r.call_id),
    loanId: text(r.loan_id),
    customerName: text(r.customer_name),
    phone: phoneOf(r),
    reason: text(r.reason) as EscalationReasonCode,
    queueStatus: text(r.queue_status) as QueueStatus,
    waitingMinutes: waiting,
    assignedOfficer: text(r.assigned_officer) || null,
    alertDelivered: bool(r.alert_delivered),
    sensitive: bool(r.sensitive) || SENSITIVE_REASONS.includes(text(r.reason) as EscalationReasonCode),
    notes: text(r.notes),
    createdAt,
  };
}

function outcomesOf(value: unknown): OutcomeSlice[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRow).map((o) => ({
    label: text(o.label),
    value: num(o.value),
    color: text(o.color) || '#9c6f45',
  }));
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

const CALL_COLUMNS =
  'call_id, loan_id, customer_name, loan_type, overdue_amount, started_at, ended_at, duration_sec, status, language, stage, agent_intent, identity_verified, within_calling_hours, no_unapproved_offers, provider, provider_status, loans(phone)';

export async function fetchCalls(): Promise<Call[]> {
  const { rows } = await run(
    supabase.from('calls').select(CALL_COLUMNS).order('started_at', { ascending: false })
  );
  return rows.map(mapCall);
}

export async function fetchLiveCalls(): Promise<Call[]> {
  const { rows } = await run(
    supabase
      .from('calls')
      .select(CALL_COLUMNS)
      .eq('status', 'In Progress')
      .is('ended_at', null)
      .order('started_at', { ascending: true })
  );
  return rows.map(mapCall);
}

export async function fetchCallTurns(callId: string): Promise<TranscriptLine[]> {
  const { rows } = await run(
    supabase.from('call_turns').select('call_id, seq, speaker, text, language, created_at').eq('call_id', callId).order('seq')
  );
  return rows.map(mapTurn);
}

export async function fetchCall(callId: string): Promise<Call | null> {
  const { rows } = await run(
    supabase.from('calls').select(CALL_COLUMNS).eq('call_id', callId).limit(1)
  );
  if (rows.length === 0) return null;
  const call = mapCall(rows[0]);
  call.transcript = await fetchCallTurns(callId);
  return call;
}

export interface CallFilters {
  page: number;
  pageSize?: number;
  search?: string;
  status?: string;
  language?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

const CALL_SORT_COLUMNS: Record<string, string> = {
  callId: 'call_id',
  customer: 'customer_name',
  loan: 'loan_id',
  started: 'started_at',
  duration: 'duration_sec',
  language: 'language',
  status: 'status',
};

function sanitizeSearch(search?: string): string {
  return (search ?? '').trim().replace(/[%,()*]/g, ' ').trim();
}

function buildCallsQuery(filters: CallFilters, withRange: boolean) {
  let query = supabase.from('calls').select(CALL_COLUMNS, { count: 'exact' });
  const term = sanitizeSearch(filters.search);
  if (term) query = query.or(`customer_name.ilike.%${term}%,call_id.ilike.%${term}%,loan_id.ilike.%${term}%`);
  if (filters.status && filters.status !== 'All') query = query.eq('status', filters.status);
  if (filters.language && filters.language !== 'All') query = query.eq('language', filters.language);
  if (filters.from) query = query.gte('started_at', `${filters.from}T00:00:00+05:30`);
  if (filters.to) query = query.lte('started_at', `${filters.to}T23:59:59+05:30`);

  const column = CALL_SORT_COLUMNS[filters.sortBy ?? 'started'] ?? 'started_at';
  query = query.order(column, { ascending: (filters.sortDir ?? 'desc') === 'asc' });

  if (withRange) {
    const size = filters.pageSize ?? 25;
    const from = Math.max(0, (filters.page - 1) * size);
    query = query.range(from, from + size - 1);
  }
  return query;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchCallsPage(filters: CallFilters): Promise<Page<Call>> {
  const size = filters.pageSize ?? 25;
  const { rows, count } = await run(buildCallsQuery(filters, true));
  return { rows: rows.map(mapCall), total: count ?? rows.length, page: filters.page, pageSize: size };
}

export async function fetchCallsForExport(filters: CallFilters): Promise<Call[]> {
  const { rows } = await run(buildCallsQuery({ ...filters, sortBy: 'started', sortDir: 'desc' }, false).limit(5000));
  return rows.map(mapCall);
}

// ---------------------------------------------------------------------------
// Promises to pay
// ---------------------------------------------------------------------------

const PROMISE_COLUMNS = 'id, loan_id, customer_name, promised_date, promised_amount, source_call_id, created_at, paid_at, loans(phone)';

interface PromiseFilters {
  page: number;
  pageSize?: number;
  search?: string;
  state?: PromiseState | 'All';
  from?: string;
  to?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

const PROMISE_SORT_COLUMNS: Record<string, string> = {
  customer: 'customer_name',
  loan: 'loan_id',
  promisedDate: 'promised_date',
  amount: 'promised_amount',
  sourceCall: 'source_call_id',
};

function buildPromisesQuery(filters: PromiseFilters, withRange: boolean) {
  let query = supabase.from('promises_to_pay').select(PROMISE_COLUMNS, { count: 'exact' });
  const term = sanitizeSearch(filters.search);
  if (term) query = query.or(`customer_name.ilike.%${term}%,loan_id.ilike.%${term}%,id.ilike.%${term}%`);
  if (filters.from) query = query.gte('promised_date', filters.from);
  if (filters.to) query = query.lte('promised_date', filters.to);

  const today = istDateKey();
  if (filters.state === 'Paid') query = query.not('paid_at', 'is', null);
  if (filters.state === 'Due today') query = query.is('paid_at', null).eq('promised_date', today);
  if (filters.state === 'Missed') query = query.is('paid_at', null).lt('promised_date', today);
  if (filters.state === 'Upcoming') query = query.is('paid_at', null).gt('promised_date', today);

  const column = PROMISE_SORT_COLUMNS[filters.sortBy ?? 'promisedDate'] ?? 'promised_date';
  query = query.order(column, { ascending: (filters.sortDir ?? 'asc') === 'asc' });

  if (withRange) {
    const size = filters.pageSize ?? 25;
    const from = Math.max(0, (filters.page - 1) * size);
    query = query.range(from, from + size - 1);
  }
  return query;
}

export async function fetchPromises(): Promise<PromiseToPay[]> {
  const { rows } = await run(
    supabase.from('promises_to_pay').select(PROMISE_COLUMNS).order('promised_date', { ascending: true })
  );
  return rows.map(mapPromise);
}

export async function fetchPromisesPage(filters: PromiseFilters): Promise<Page<PromiseToPay>> {
  const size = filters.pageSize ?? 25;
  const [page, messages] = await Promise.all([
    run(buildPromisesQuery(filters, true)),
    fetchLatestOutboundMessages(),
  ]);
  const rows = page.rows.map(mapPromise).map((p) => ({ ...p, lastMessageStatus: messages.get(p.loanId) ?? null }));
  return { rows, total: page.count ?? rows.length, page: filters.page, pageSize: size };
}

export type PromiseCounts = Record<'All' | PromiseState, number>;

export async function fetchPromiseCounts(): Promise<PromiseCounts> {
  if (supabaseConfigError) throw new Error(supabaseConfigError);
  const today = istDateKey();
  const base = () => supabase.from('promises_to_pay').select('id', { count: 'exact', head: true });

  const results = await Promise.all([
    base(),
    base().is('paid_at', null).eq('promised_date', today),
    base().is('paid_at', null).gt('promised_date', today),
    base().is('paid_at', null).lt('promised_date', today),
    base().not('paid_at', 'is', null),
  ]);

  const counts = results.map((result) => {
    if (result.error) throw new Error(result.error.message);
    return result.count ?? 0;
  });

  return { All: counts[0], 'Due today': counts[1], Upcoming: counts[2], Missed: counts[3], Paid: counts[4] };
}

export async function fetchPromisesForExport(filters: PromiseFilters): Promise<PromiseToPay[]> {
  const { rows } = await run(buildPromisesQuery(filters, false).limit(5000));
  return rows.map(mapPromise);
}

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

const ESCALATION_COLUMNS =
  'id, call_id, loan_id, customer_name, reason, queue_status, assigned_officer, alert_delivered, sensitive, notes, created_at, loans(phone)';

interface EscalationFilters {
  page: number;
  pageSize?: number;
  search?: string;
  status?: QueueStatus | 'All';
  reason?: EscalationReasonCode | 'All';
  from?: string;
  to?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

const ESCALATION_SORT_COLUMNS: Record<string, string> = {
  customer: 'customer_name',
  loan: 'loan_id',
  reason: 'reason',
  status: 'queue_status',
  assigned: 'assigned_officer',
  created: 'created_at',
};

function buildEscalationsQuery(filters: EscalationFilters, withRange: boolean) {
  let query = supabase.from('escalations').select(ESCALATION_COLUMNS, { count: 'exact' });
  const term = sanitizeSearch(filters.search);
  if (term) query = query.or(`customer_name.ilike.%${term}%,loan_id.ilike.%${term}%,id.ilike.%${term}%`);
  if (filters.status && filters.status !== 'All') query = query.eq('queue_status', filters.status);
  if (filters.reason && filters.reason !== 'All') query = query.eq('reason', filters.reason);
  if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00+05:30`);
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59+05:30`);

  const column = ESCALATION_SORT_COLUMNS[filters.sortBy ?? 'created'] ?? 'created_at';
  query = query.order(column, { ascending: (filters.sortDir ?? 'desc') === 'asc' });

  if (withRange) {
    const size = filters.pageSize ?? 25;
    const from = Math.max(0, (filters.page - 1) * size);
    query = query.range(from, from + size - 1);
  }
  return query;
}

export async function fetchEscalations(): Promise<Escalation[]> {
  const { rows } = await run(
    supabase.from('escalations').select(ESCALATION_COLUMNS).order('created_at', { ascending: false })
  );
  return rows.map(mapEscalation);
}

export async function fetchEscalationsPage(filters: EscalationFilters): Promise<Page<Escalation>> {
  const size = filters.pageSize ?? 25;
  const { rows, count } = await run(buildEscalationsQuery(filters, true));
  return { rows: rows.map(mapEscalation), total: count ?? rows.length, page: filters.page, pageSize: size };
}

export type EscalationCounts = Record<'All' | QueueStatus, number>;

export async function fetchEscalationCounts(): Promise<EscalationCounts> {
  if (supabaseConfigError) throw new Error(supabaseConfigError);
  const countRows = async (status?: QueueStatus) => {
    let query = supabase.from('escalations').select('id', { count: 'exact', head: true });
    if (status) query = query.eq('queue_status', status);
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    return result.count ?? 0;
  };

  const [all, open, assigned, resolved] = await Promise.all([
    countRows(),
    countRows('Open'),
    countRows('Assigned'),
    countRows('Resolved'),
  ]);
  return { All: all, Open: open, Assigned: assigned, Resolved: resolved };
}

export async function fetchEscalationsForExport(filters: EscalationFilters): Promise<Escalation[]> {
  const { rows } = await run(buildEscalationsQuery(filters, false).limit(5000));
  return rows.map(mapEscalation);
}

export async function fetchEscalation(id: string): Promise<Escalation | null> {
  const { rows } = await run(supabase.from('escalations').select(ESCALATION_COLUMNS).eq('id', id).limit(1));
  return rows.length ? mapEscalation(rows[0]) : null;
}

export async function fetchEscalationsForCall(callId: string): Promise<Escalation[]> {
  const { rows } = await run(
    supabase.from('escalations').select(ESCALATION_COLUMNS).eq('call_id', callId).order('created_at', { ascending: false })
  );
  return rows.map(mapEscalation);
}

export async function updateEscalation(
  id: string,
  patch: { queueStatus?: QueueStatus; assignedOfficer?: string | null; notes?: string }
): Promise<Escalation> {
  const payload: Record<string, unknown> = {};
  if (patch.queueStatus !== undefined) payload.queue_status = patch.queueStatus;
  if (patch.assignedOfficer !== undefined) payload.assigned_officer = patch.assignedOfficer;
  if (patch.notes !== undefined) payload.notes = patch.notes;

  const { rows } = await run(
    supabase.from('escalations').update(payload).eq('id', id).select(ESCALATION_COLUMNS)
  );
  if (rows.length === 0) throw new Error('This escalation could not be updated. Check your role.');
  return mapEscalation(rows[0]);
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

export async function fetchLoans(): Promise<Loan[]> {
  const { rows } = await run(supabase.from('loans').select('*').order('loan_id'));
  return rows.map(mapLoan);
}

export async function fetchLoan(loanId: string): Promise<Loan | null> {
  const { rows } = await run(supabase.from('loans').select('*').eq('loan_id', loanId).limit(1));
  return rows.length ? mapLoan(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Live views
// ---------------------------------------------------------------------------

export async function fetchKpis(): Promise<{
  kpis: Omit<Kpis, 'openEscalations'> & { openEscalations: number };
  outcomes: OutcomeSlice[];
}> {
  const { rows } = await run(supabase.from('daily_kpis').select('*'));
  const row = rows[0] ?? {};
  return {
    kpis: {
      callsToday: num(row.calls_today),
      connectRate: num(row.connect_rate),
      ptpCaptured: num(row.ptp_captured),
      ptpAmount: num(row.ptp_amount),
      openEscalations: num(row.open_escalations),
      avgCallLengthSec: num(row.avg_call_length_sec),
    },
    outcomes: outcomesOf(row.outcomes),
  };
}

export async function fetchHourlyPromises(): Promise<HourPoint[]> {
  const { rows } = await run(supabase.from('hourly_promises').select('*').order('sort_order'));
  return rows.map((r) => ({ hour: text(r.hour_label), today: num(r.today), yesterday: num(r.yesterday) }));
}

export async function fetchFlaggedCalls(): Promise<FlaggedCall[]> {
  const { rows } = await run(supabase.from('flagged_calls').select('*').order('started_at', { ascending: false }));
  return rows.map((r) => ({
    callId: text(r.call_id),
    customerName: text(r.customer_name),
    time: text(r.time_label),
    rule: text(r.rule),
    severity: (['low', 'medium', 'high'].includes(text(r.severity)) ? text(r.severity) : 'low') as FlaggedCall['severity'],
    startedAt: text(r.started_at),
  }));
}

export async function fetchComplianceMetrics(): Promise<ComplianceMetrics> {
  const { rows } = await run(supabase.from('compliance_metrics').select('*'));
  const row = rows[0] ?? {};
  return {
    adherenceRate: num(row.adherence_rate),
    callsBlockedOutsideHours: num(row.calls_blocked_outside_hours),
    idvFailureRate: num(row.idv_failure_rate),
    distressFlags: num(row.distress_flags),
    grievanceMentions: num(row.grievance_mentions),
  };
}

// ---------------------------------------------------------------------------
// Settings and telephony
// ---------------------------------------------------------------------------

export async function fetchSettings(): Promise<AppSettings | null> {
  const { rows } = await run(supabase.from('app_settings').select('*').eq('id', 1).limit(1));
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    callingStart: text(row.calling_start),
    callingEnd: text(row.calling_end),
    maxPtpDays: num(row.max_ptp_days),
    approvedOptions: Array.isArray(row.approved_options)
      ? (row.approved_options as unknown[]).filter((o): o is string => typeof o === 'string')
      : [],
    humanQueuePhone: text(row.human_queue_phone),
    alertWebhookUrl: text(row.alert_webhook_url),
  };
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  const { rows } = await run(
    supabase
      .from('app_settings')
      .update({
        calling_start: settings.callingStart,
        calling_end: settings.callingEnd,
        max_ptp_days: settings.maxPtpDays,
        approved_options: settings.approvedOptions,
        human_queue_phone: settings.humanQueuePhone,
        alert_webhook_url: settings.alertWebhookUrl,
      })
      .eq('id', 1)
      .select('id')
  );
  if (rows.length === 0) throw new Error('Only a manager can change settings.');
}

export async function fetchTelephony(): Promise<TelephonyProvider[]> {
  const { rows } = await run(supabase.from('telephony_providers').select('*').order('name'));
  return rows.map((r) => ({
    name: text(r.name),
    role: text(r.role),
    connected: bool(r.connected),
    lastHeartbeat: text(r.last_heartbeat) || null,
  }));
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

function mapAudit(r: Row): AuditEntry {
  return {
    id: num(r.id),
    actorId: text(r.actor_id) || null,
    action: text(r.action),
    entity: text(r.entity),
    entityId: text(r.entity_id) || null,
    before: isRow(r.before) ? r.before : null,
    after: isRow(r.after) ? r.after : null,
    createdAt: text(r.created_at),
  };
}

export async function fetchAuditLog(params: {
  entity: string;
  entityIds?: string[];
  limit?: number;
}): Promise<AuditEntry[]> {
  let query = supabase
    .from('audit_log')
    .select('*')
    .eq('entity', params.entity)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50);

  if (params.entityIds && params.entityIds.length > 0) query = query.in('entity_id', params.entityIds);
  if (params.entityIds && params.entityIds.length === 0) return [];

  const { rows } = await run(query);
  return rows.map(mapAudit);
}

export async function writeExportAudit(params: {
  entity: string;
  description: string;
  rowCount: number;
  actorId: string;
}): Promise<void> {
  await run(
    supabase.from('audit_log').insert({
      actor_id: params.actorId,
      action: 'export.csv',
      entity: params.entity,
      entity_id: params.description,
      after: { row_count: params.rowCount },
    })
  );
}

// ---------------------------------------------------------------------------
// Dashboard-queued actions
// ---------------------------------------------------------------------------

export async function insertCallbackRequest(params: {
  loanId: string;
  scheduledFor: string;
  requestedBy: string;
}): Promise<CallbackRequest> {
  const { rows } = await run(
    supabase
      .from('callback_requests')
      .insert({
        loan_id: params.loanId,
        scheduled_for: params.scheduledFor,
        status: 'queued',
        requested_by: params.requestedBy,
      })
      .select()
  );
  if (rows.length === 0) throw new Error('The callback could not be queued.');
  const r = rows[0];
  return {
    id: num(r.id),
    loanId: text(r.loan_id),
    scheduledFor: text(r.scheduled_for),
    status: 'queued',
    createdAt: text(r.created_at),
  };
}

export type MessageTemplate = 'payment_link' | 'payment_reminder';

export async function insertOutboundMessages(params: {
  loanIds: string[];
  template: MessageTemplate;
  scheduledFor?: string | null;
  createdBy: string;
}): Promise<number> {
  if (params.loanIds.length === 0) return 0;
  const payload = params.loanIds.map((loanId) => ({
    loan_id: loanId,
    channel: 'sms',
    template: params.template,
    scheduled_for: params.scheduledFor ?? new Date().toISOString(),
    status: 'queued',
    created_by: params.createdBy,
  }));
  const { rows } = await run(supabase.from('outbound_messages').insert(payload).select('id'));
  return rows.length;
}

export async function fetchLatestOutboundMessages(): Promise<Map<string, OutboundStatus>> {
  const { rows } = await run(
    supabase.from('outbound_messages').select('loan_id, status, created_at').order('created_at', { ascending: false }).limit(1000)
  );
  const latest = new Map<string, OutboundStatus>();
  for (const row of rows) {
    const loanId = text(row.loan_id);
    if (!loanId || latest.has(loanId)) continue;
    const status = text(row.status);
    latest.set(loanId, status === 'sent' || status === 'failed' ? status : 'queued');
  }
  return latest;
}

export async function fetchRecentMessages(limit = 10): Promise<OutboundMessage[]> {
  const { rows } = await run(
    supabase.from('outbound_messages').select('*').order('created_at', { ascending: false }).limit(limit)
  );
  return rows.map((r) => ({
    id: num(r.id),
    loanId: text(r.loan_id),
    channel: 'sms',
    template: text(r.template),
    scheduledFor: text(r.scheduled_for) || null,
    status: (text(r.status) === 'sent' || text(r.status) === 'failed' ? text(r.status) : 'queued') as OutboundStatus,
    createdAt: text(r.created_at),
  }));
}

// ---------------------------------------------------------------------------
// Voice backend
// ---------------------------------------------------------------------------

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
export const isBackendConnected = Boolean(API_BASE_URL);

export async function transferCallToOfficer(callId: string): Promise<void> {
  if (!API_BASE_URL) throw new Error('Backend not connected');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');

  const response = await fetch(`${API_BASE_URL}/v1/calls/${encodeURIComponent(callId)}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => '')) || '';
    throw new Error(body || `The backend rejected the transfer (${response.status}).`);
  }
}
