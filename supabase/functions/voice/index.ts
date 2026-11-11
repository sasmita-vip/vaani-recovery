/**
 * Gnani voice proxy + demo call engine.
 *
 * The browser never sees the Gnani API key. This function holds it in
 * `GNANI_API_KEY` and exposes four endpoints:
 *
 *   POST /voice/session     create (or reuse) a demo call and greet the customer
 *   POST /voice/transcribe  audio (wav) -> Prisma transcript
 *   POST /voice/turn        customer text -> agent reply + DB writes
 *   POST /voice/speak       agent text -> Timbre audio (wav)
 *   GET  /voice/health      configuration check (never returns the key)
 *
 * Database writes use the service role because the dashboard schema revokes
 * insert/update on calls, call_turns and promises_to_pay from normal users.
 * The function is intentionally reachable by anonymous visitors so the public
 * demo works without signing in; inputs are bounded and only demo call ids are
 * used for writes.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decideAgentTurn, type AgentContext } from '../_shared/agent.ts';

const GNANI_BASE = (Deno.env.get('GNANI_BASE_URL') ?? 'https://api.vachana.ai').replace(/\/+$/, '');
const GNANI_KEY = Deno.env.get('GNANI_API_KEY') ?? Deno.env.get('GNANI_API_KEY_ID') ?? '';
const STT_MODEL = Deno.env.get('GNANI_STT_MODEL') ?? 'prisma-v3.0';
const STT_LANGUAGE = Deno.env.get('GNANI_STT_LANGUAGE') ?? (STT_MODEL.startsWith('prisma-v3') ? 'indic-auto' : 'hi-IN');
const TTS_VOICE = Deno.env.get('GNANI_TTS_VOICE') ?? 'Nalini';
const TTS_MODEL = Deno.env.get('GNANI_TTS_MODEL') ?? 'timbre-v2.5';
const TTS_LANGUAGE = Deno.env.get('GNANI_TTS_LANGUAGE') ?? 'hi-IN';
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_TEXT_CHARS = 800;

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

type LoanRow = {
  loan_id: string;
  customer_name: string;
  lender_name: string;
  loan_type: string;
  overdue_amount: number;
  due_date: string;
};

type CallRow = {
  call_id: string;
  loan_id: string;
  customer_name: string;
  loan_type: string;
  overdue_amount: number;
  started_at: string;
  identity_verified: boolean;
  stage: string;
  language: string;
};

function daysPastDue(dueDate: string): number {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  if (Number.isNaN(due)) return 0;
  return Math.max(0, Math.floor((Date.now() - due) / 86_400_000));
}

async function nextSeq(callId: string): Promise<number> {
  const { data } = await db
    .from('call_turns')
    .select('seq')
    .eq('call_id', callId)
    .order('seq', { ascending: false })
    .limit(1);
  return data && data.length > 0 ? num(data[0].seq) : 0;
}

async function insertTurn(callId: string, seq: number, speaker: 'agent' | 'customer', body: string, language: string) {
  const { error } = await db
    .from('call_turns')
    .insert({ call_id: callId, seq, speaker, text: body, language });
  if (error) throw new Error(error.message);
}

async function loadCall(callId: string): Promise<{ call: CallRow; loan: LoanRow | null } | null> {
  const { data, error } = await db
    .from('calls')
    .select('call_id, loan_id, customer_name, loan_type, overdue_amount, started_at, identity_verified, stage, language')
    .eq('call_id', callId)
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  const call = data[0] as CallRow;

  const { data: loanRows } = await db
    .from('loans')
    .select('loan_id, customer_name, lender_name, loan_type, overdue_amount, due_date')
    .eq('loan_id', call.loan_id)
    .limit(1);

  return { call, loan: (loanRows?.[0] as LoanRow) ?? null };
}

async function startSession(req: Request): Promise<Response> {
  const body = await readJson(req);
  const requestedLoanId = text(body.loanId);

  let loanQuery = db
    .from('loans')
    .select('loan_id, customer_name, lender_name, loan_type, overdue_amount, due_date');

  if (requestedLoanId) loanQuery = loanQuery.eq('loan_id', requestedLoanId);
  else loanQuery = loanQuery.order('due_date', { ascending: true }).limit(1);

  const { data: loans, error: loanError } = await loanQuery;
  if (loanError) return fail(`Could not read loans: ${loanError.message}`, 500);
  if (!loans || loans.length === 0) {
    return fail('No loans found. Apply the migrations and supabase/seed.sql first.', 409);
  }

  const loan = loans[0] as LoanRow;
  const callId = `CALL-DEMO-${Date.now().toString(36).toUpperCase()}`;
  const first = loan.customer_name.trim().split(/\s+/)[0] || loan.customer_name;
  const greeting = `Hello, this is Vaani calling from ${loan.lender_name}. Am I speaking with ${first}?`;

  const { error: insertError } = await db.from('calls').insert({
    call_id: callId,
    loan_id: loan.loan_id,
    customer_name: loan.customer_name,
    loan_type: loan.loan_type,
    overdue_amount: loan.overdue_amount,
    started_at: new Date().toISOString(),
    duration_sec: 0,
    status: 'In Progress',
    language: 'English',
    stage: 'Identity verification',
    identity_verified: false,
    within_calling_hours: true,
    no_unapproved_offers: true,
    provider: 'gnani',
    provider_status: 'connected',
  });
  if (insertError) return fail(`Could not start the demo call: ${insertError.message}`, 500);

  await insertTurn(callId, 1, 'agent', greeting, 'English');

  return json({
    callId,
    greeting,
    customer: {
      name: loan.customer_name,
      loanId: loan.loan_id,
      loanType: loan.loan_type,
      overdueAmount: loan.overdue_amount,
      lenderName: loan.lender_name,
      daysPastDue: daysPastDue(loan.due_date),
      language: 'English',
      stage: 'Identity verification',
    },
    turns: [{ seq: 1, speaker: 'agent', text: greeting }],
  });
}

async function transcribe(req: Request): Promise<Response> {
  if (!GNANI_KEY) return fail('The Gnani API key is not configured on this function.', 503);

  const form = await req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) {
    return fail('Send the recording as a multipart field named "audio".');
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return fail('That recording is too large. Keep it under 30 seconds.', 413);
  }

  const payload = new FormData();
  payload.append('audio_file', audio, 'recording.wav');
  payload.append('language_code', STT_LANGUAGE);
  payload.append('format', 'transcribe');
  if (STT_MODEL) payload.append('model', STT_MODEL);

  let response: Response;
  try {
    response = await fetch(`${GNANI_BASE}/stt/v3`, {
      method: 'POST',
      headers: { 'X-API-Key-ID': GNANI_KEY },
      body: payload,
    });
  } catch (error) {
    return fail(`Could not reach Gnani Prisma: ${error instanceof Error ? error.message : 'network error'}`, 502);
  }

  const raw = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const detail = text((parsed.error as Record<string, unknown> | undefined)?.message) || raw.slice(0, 300);
    return fail(`Prisma rejected the audio (${response.status}). ${detail}`.trim(), 502);
  }

  const errorObject = parsed.error as Record<string, unknown> | undefined;
  if (parsed.success === false || errorObject) {
    const detail =
      text(errorObject?.message) || text(parsed.message) || raw.slice(0, 240) || 'Prisma returned no transcript.';
    return fail(`Prisma could not transcribe that clip. ${detail}`.trim(), 502);
  }

  const nested = parsed.output as Record<string, unknown> | undefined;
  const transcript =
    text(parsed.transcript) ||
    text(nested?.transcript) ||
    text((parsed.data as Record<string, unknown> | undefined)?.transcript);

  return json({ transcript, requestId: text(parsed.request_id) || null, model: STT_MODEL });
}

async function turn(req: Request): Promise<Response> {
  const body = await readJson(req);
  const callId = text(body.callId);
  const customerText = text(body.text).trim();

  if (!/^[A-Za-z0-9-]{4,64}$/.test(callId)) return fail('A valid callId is required.');
  if (!customerText) return fail('No speech was recognised. Try again a little closer to the mic.');
  if (customerText.length > MAX_TEXT_CHARS) return fail('That turn is too long.', 413);

  const loaded = await loadCall(callId);
  if (!loaded) return fail('That demo call no longer exists. Start a new call.', 404);

  const { call, loan } = loaded;
  const seq = await nextSeq(callId);

  await insertTurn(callId, seq + 1, 'customer', customerText, call.language || 'English');

  const ctx: AgentContext = {
    customerName: call.customer_name,
    lenderName: loan?.lender_name ?? 'Sterling Credit',
    loanId: call.loan_id,
    loanType: call.loan_type,
    overdueAmount: num(call.overdue_amount),
    daysPastDue: daysPastDue(loan?.due_date ?? ''),
    identityVerified: Boolean(call.identity_verified),
    now: new Date(),
  };

  const decision = decideAgentTurn(customerText, ctx);
  await insertTurn(callId, seq + 2, 'agent', decision.reply, call.language || 'English');

  const startedAt = new Date(call.started_at).getTime();
  const duration = Number.isNaN(startedAt) ? 0 : Math.max(0, Math.round((Date.now() - startedAt) / 1000));

  const patch: Record<string, unknown> = {
    stage: decision.stage,
    agent_intent: decision.intentLabel,
    identity_verified: decision.identityVerified,
    status: decision.status,
    duration_sec: duration,
  };

  // Only a finishing turn closes the call. Writing ended_at = null on every
  // turn would reopen a call that had already been escalated or promised.
  if (decision.outcome !== 'continue') {
    patch.ended_at = new Date().toISOString();
    patch.provider_status = decision.outcome === 'escalate' ? 'escalated' : 'completed';
  }

  const { error: updateError } = await db
    .from('calls')
    .update(patch)
    .eq('call_id', callId);
  if (updateError) return fail(`Could not update the call: ${updateError.message}`, 500);

  let escalation: { reason: string; sensitive: boolean } | null = null;
  let promise: { promisedDate: string; promisedAmount: number } | null = null;

  if (decision.outcome === 'escalate' && decision.escalationReason) {
    const { error } = await db.from('escalations').insert({
      id: `ESC-DEMO-${Date.now().toString(36).toUpperCase()}`,
      call_id: callId,
      loan_id: call.loan_id,
      customer_name: call.customer_name,
      reason: decision.escalationReason,
      queue_status: 'Open',
      assigned_officer: null,
      alert_delivered: false,
      sensitive: Boolean(decision.escalationSensitive),
      notes: `Voice demo: ${customerText.slice(0, 180)}`,
      timeline: [],
    });
    if (error) return fail(`Could not queue the escalation: ${error.message}`, 500);
    escalation = { reason: decision.escalationReason, sensitive: Boolean(decision.escalationSensitive) };
  }

  if (decision.outcome === 'ptp' && decision.promisedDate) {
    const { error } = await db.from('promises_to_pay').insert({
      id: `PTP-DEMO-${Date.now().toString(36).toUpperCase()}`,
      loan_id: call.loan_id,
      customer_name: call.customer_name,
      promised_date: decision.promisedDate,
      promised_amount: num(call.overdue_amount),
      source_call_id: callId,
    });
    if (error) return fail(`Could not save the promise to pay: ${error.message}`, 500);
    promise = { promisedDate: decision.promisedDate, promisedAmount: num(call.overdue_amount) };
  }

  return json({
    reply: decision.reply,
    stage: decision.stage,
    status: decision.status,
    intent: decision.intentLabel,
    identityVerified: decision.identityVerified,
    escalation,
    promise,
    seq: seq + 2,
  });
}

async function speak(req: Request): Promise<Response> {
  if (!GNANI_KEY) return fail('The Gnani API key is not configured on this function.', 503);

  const body = await readJson(req);
  const speech = text(body.text).trim();
  if (!speech) return fail('Nothing to speak.');
  if (speech.length > 700) return fail('That reply is too long to synthesise.', 413);

  let response: Response;
  try {
    response = await fetch(`${GNANI_BASE}/api/v1/tts/inference`, {
      method: 'POST',
      headers: { 'X-API-Key-ID': GNANI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: speech,
        voice: text(body.voice) || TTS_VOICE,
        model: TTS_MODEL,
        language: TTS_LANGUAGE,
        speed: 1.0,
        audio_config: {
          sample_rate: 48000,
          num_channels: 1,
          sample_width: 2,
          encoding: 'linear_pcm',
          container: 'wav',
        },
      }),
    });
  } catch (error) {
    return fail(`Could not reach Gnani Timbre: ${error instanceof Error ? error.message : 'network error'}`, 502);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return fail(`Timbre rejected the reply (${response.status}). ${detail.slice(0, 300)}`.trim(), 502);
  }

  const contentType = response.headers.get('content-type') ?? 'audio/wav';
  if (!/audio\//i.test(contentType)) {
    const detail = await response.text().catch(() => '');
    return fail(`Timbre returned no audio (${contentType}). ${detail.slice(0, 240)}`.trim(), 502);
  }

  const audio = await response.arrayBuffer();
  if (audio.byteLength === 0) return fail('Timbre returned no audio.', 502);

  return new Response(audio, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const route = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const method = req.method;

  try {
    if (method === 'GET' && route === 'health') {
      return json({
        ok: true,
        gnaniKeyConfigured: Boolean(GNANI_KEY),
        sttModel: STT_MODEL,
        sttLanguage: STT_LANGUAGE,
        ttsModel: TTS_MODEL,
        ttsVoice: TTS_VOICE,
        baseUrl: GNANI_BASE,
      });
    }

    if (method !== 'POST') return fail('Method not allowed.', 405);

    switch (route) {
      case 'session':
        return await startSession(req);
      case 'transcribe':
        return await transcribe(req);
      case 'turn':
        return await turn(req);
      case 'speak':
        return await speak(req);
      default:
        return fail('Unknown voice route.', 404);
    }
  } catch (error) {
    console.error('voice function error', error);
    return fail(error instanceof Error ? error.message : 'Unexpected voice error.', 500);
  }
});
