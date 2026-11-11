import { supabaseUrl, supabaseAnonKey, supabaseConfigError } from '@/lib/supabase';

const base = supabaseUrl?.replace(/\/+$/, '') ?? '';

/** The deployed Supabase Edge Function that proxies Gnani's speech APIs. */
export const VOICE_ENDPOINT = base ? `${base}/functions/v1/voice` : '';

/** True when Supabase (and therefore the voice function URL) is configured. */
export const isVoiceConfigured = Boolean(VOICE_ENDPOINT && supabaseAnonKey);

export interface VoiceSession {
  callId: string;
  greeting: string;
  customer: {
    name: string;
    loanId: string;
    loanType: string;
    overdueAmount: number;
    lenderName: string;
    daysPastDue: number;
    language: string;
    stage: string;
  };
  turns: { seq: number; speaker: 'agent' | 'customer'; text: string }[];
}

export interface VoiceTurnResult {
  reply: string;
  stage: string;
  status: string;
  intent: string;
  identityVerified: boolean;
  escalation: { reason: string; sensitive: boolean } | null;
  promise: { promisedDate: string; promisedAmount: number } | null;
  seq: number;
}

function authHeaders(): Record<string, string> {
  if (!VOICE_ENDPOINT || !supabaseAnonKey) {
    throw new Error(supabaseConfigError ?? 'Voice demo is not configured. Set VITE_SUPABASE_URL and deploy the voice function.');
  }
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  };
}

async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    // Browsers only reject on a network/CORS failure, so keep the detail: it is
    // the difference between "not deployed" and "blocked by the browser".
    const reason = error instanceof Error && error.message && !/failed to fetch/i.test(error.message)
      ? ` ${error.message}.`
      : ''
    throw new Error(
      `Could not reach the voice function at ${VOICE_ENDPOINT}.${reason} Check that it is deployed (supabase functions deploy voice) and that this site is allowed to call it.`,
    );
  }
}

async function readError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    if (parsed.error) return parsed.error;
    if (parsed.message) {
      if (/function was not found|not found/i.test(parsed.message) && response.status === 404) {
        return 'The voice function is not deployed yet. Run `supabase functions deploy voice`, then reload.';
      }
      return parsed.message;
    }
  } catch {
    // fall through to the raw body
  }
  if (body) return body.slice(0, 240);
  return `The voice function returned ${response.status}. Is it deployed?`;
}

export async function startVoiceSession(loanId?: string): Promise<VoiceSession> {
  const response = await safeFetch(`${VOICE_ENDPOINT}/session`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(loanId ? { loanId } : {}),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as VoiceSession;
}

export async function transcribeRecording(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio', audio, 'recording.wav');

  const response = await safeFetch(`${VOICE_ENDPOINT}/transcribe`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!response.ok) throw new Error(await readError(response));

  const data = (await response.json()) as { transcript?: string };
  return (data.transcript ?? '').trim();
}

export async function sendVoiceTurn(callId: string, text: string): Promise<VoiceTurnResult> {
  const response = await safeFetch(`${VOICE_ENDPOINT}/turn`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ callId, text }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as VoiceTurnResult;
}

/** Returns an object URL for the synthesised WAV; caller must revoke it. */
export async function synthesiseSpeech(text: string): Promise<string> {
  const response = await safeFetch(`${VOICE_ENDPOINT}/speak`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(await readError(response));

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export interface VoiceHealth {
  ok: boolean;
  gnaniKeyConfigured: boolean;
  sttModel: string;
  sttLanguage: string;
  ttsModel: string;
  ttsVoice: string;
}

export async function fetchVoiceHealth(): Promise<VoiceHealth> {
  const response = await safeFetch(`${VOICE_ENDPOINT}/health`, { headers: authHeaders() });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as VoiceHealth;
}
