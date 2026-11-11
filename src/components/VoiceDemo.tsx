import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Mic, PhoneCall, RotateCcw, Square, User, Volume2 } from 'lucide-react';
import { Button, Card, Chip } from '@/components/ui';
import { formatDate, formatINR } from '@/lib/format';
import { isRecordingSupported, startVoiceRecording, type VoiceRecorder } from '@/lib/recorder';
import {
  isVoiceConfigured,
  sendVoiceTurn,
  startVoiceSession,
  synthesiseSpeech,
  transcribeRecording,
  type VoiceSession,
} from '@/lib/voice';

type Busy = null | 'starting' | 'transcribing' | 'thinking' | 'speaking';

interface Entry {
  id: number;
  speaker: 'agent' | 'customer';
  text: string;
}

/**
 * Live Gnani loop: browser mic -> Prisma STT -> Vaani policy -> Timbre TTS,
 * with each turn written to the call so the rest of the dashboard updates.
 */
export function VoiceDemo({ onCallUpdated }: { onCallUpdated?: () => void }) {
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const entryId = useRef(0);
  const sending = useRef(false);
  const audioUrlRef = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      recorderRef.current?.cancel();
      recorderRef.current = null;
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const append = (speaker: 'agent' | 'customer', text: string) => {
    entryId.current += 1;
    const entry: Entry = { id: entryId.current, speaker, text };
    setEntries((current) => [...current, entry]);
  };

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
  };

  const play = async (text: string) => {
    try {
      const url = await synthesiseSpeech(text);
      if (!mounted.current) {
        URL.revokeObjectURL(url);
        return;
      }
      stopAudio();
      audioUrlRef.current = url;
      setAudioUrl(url);
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play().catch(() => {
        setNotice('Agent audio is ready — press play to hear it.');
      });
    } catch (err) {
      setNotice(`Agent voice unavailable: ${err instanceof Error ? err.message : 'Timbre request failed.'}`);
    }
  };

  const startCall = async () => {
    stopAudio();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
    setSession(null);
    setEntries([]);
    setError(null);
    setNotice(null);
    setBusy('starting');

    try {
      const next = await startVoiceSession();
      if (!mounted.current) return;
      setSession(next);
      setEntries(next.turns.map((t) => ({ id: (entryId.current += 1), speaker: t.speaker, text: t.text })));
      setBusy(null);
      void play(next.greeting);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the voice demo.');
      setBusy(null);
    }
  };

  const submit = async (blob: Blob) => {
    if (!session || sending.current) return;
    sending.current = true;
    setRecording(false);
    recorderRef.current = null;
    setError(null);
    setBusy('transcribing');

    try {
      const heard = await transcribeRecording(blob);
      if (!heard) {
        setError("We couldn't make out a sentence. Try again, a little closer to the mic.");
        setBusy(null);
        return;
      }

      append('customer', heard);
      setBusy('thinking');

      const result = await sendVoiceTurn(session.callId, heard);
      append('agent', result.reply);
      setBusy(null);
      onCallUpdated?.();

      if (result.promise) {
        setNotice(`Promise to pay of ${formatINR(result.promise.promisedAmount)} saved for ${formatDate(result.promise.promisedDate)}.`);
      } else if (result.escalation) {
        setNotice('Escalated to the human queue — open Escalation Queue to pick it up.');
      }

      void play(result.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The voice turn failed.');
      setBusy(null);
    } finally {
      sending.current = false;
    }
  };

  const beginRecording = async () => {
    if (!session) return;
    setError(null);
    setNotice(null);
    try {
      recorderRef.current = await startVoiceRecording({
        onAutoStop: (blob) => {
          void submit(blob);
        },
      });
      setRecording(true);
    } catch {
      setError('Microphone access was blocked. Allow the mic for this site and try again.');
    }
  };

  const endRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setBusy('transcribing');
    try {
      const blob = await recorder.stop();
      await submit(blob);
    } catch (err) {
      recorderRef.current = null;
      setRecording(false);
      setError(err instanceof Error ? err.message : 'Could not process that recording.');
      setBusy(null);
    }
  };

  const working = busy === 'transcribing' || busy === 'thinking' || busy === 'starting';
  const statusLabel =
    busy === 'starting'
      ? 'Connecting…'
      : busy === 'transcribing'
        ? 'Prisma is transcribing…'
        : busy === 'thinking'
          ? 'Vaani is thinking…'
          : recording
            ? 'Listening — speak English'
            : session
              ? `Call ${session.callId}`
              : 'Ready';

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              <PhoneCall className="h-4 w-4" />
            </span>
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-content-strong">Voice demo</h2>
            <Chip color="progress">Gnani Prisma + Timbre</Chip>
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted">{statusLabel}</span>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Speak English into the mic. Prisma transcribes you, the Vaani collections policy replies, Timbre speaks the
            answer, and every turn is written to the call below.
          </p>
          {!isVoiceConfigured && (
            <p className="mt-2 max-w-xl text-xs text-amber-700 dark:text-amber-300">
              Supabase is not configured, so the voice function has no address. Set <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_ANON_KEY</code>.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!session ? (
            <Button
              onClick={() => void startCall()}
              disabled={working || !isVoiceConfigured}
              icon={busy === 'starting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
            >
              Start demo call
            </Button>
          ) : (
            <>
              <Button
                variant={recording ? 'danger' : 'primary'}
                onClick={() => void (recording ? endRecording() : beginRecording())}
                disabled={working || !isRecordingSupported()}
                icon={
                  busy === 'transcribing' || busy === 'thinking' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : recording ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )
                }
                title={!isRecordingSupported() ? 'This browser cannot record audio' : undefined}
              >
                {recording ? 'Stop & send' : busy === 'transcribing' ? 'Transcribing…' : busy === 'thinking' ? 'Thinking…' : 'Record reply'}
              </Button>
              <Button variant="secondary" onClick={() => void startCall()} disabled={working} icon={<RotateCcw className="h-4 w-4" />}>
                New call
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mx-5 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mx-5 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {notice}
        </p>
      )}

      {session && (
        <div className="grid gap-5 border-t border-line bg-surface-2 p-5 lg:grid-cols-[240px_1fr]">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-content-strong">{session.customer.name}</div>
              <div className="tabular text-xs text-muted">
                {session.customer.loanId} · {session.customer.loanType}
              </div>
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Overdue</dt>
                <dd className="tabular font-medium text-content-strong">{formatINR(session.customer.overdueAmount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Days past due</dt>
                <dd className="tabular font-medium text-content-strong">{session.customer.daysPastDue}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Language</dt>
                <dd className="font-medium text-content-strong">{session.customer.language}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Stage</dt>
                <dd className="font-medium text-content-strong">{session.customer.stage}</dd>
              </div>
            </dl>

            {audioUrl ? (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted">
                  <Volume2 className="h-3 w-3" /> Agent voice
                </div>
                <audio key={audioUrl} src={audioUrl} controls autoPlay className="h-9 w-full" />
              </div>
            ) : (
              <p className="text-[11px] text-muted">The agent&apos;s spoken reply appears here after the first turn.</p>
            )}
          </div>

          <div
            role="log"
            aria-live="polite"
            aria-label="Voice demo transcript"
            className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-line bg-surface p-3"
          >
            {entries.map((entry) => (
              <div key={entry.id} className={`flex gap-2 ${entry.speaker === 'agent' ? '' : 'flex-row-reverse'}`}>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    entry.speaker === 'agent'
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'bg-surface-3 text-muted'
                  }`}
                >
                  {entry.speaker === 'agent' ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                </span>
                <div className={`max-w-[85%] ${entry.speaker === 'agent' ? '' : 'text-right'}`}>
                  <div className={`mb-0.5 text-[10px] uppercase tracking-[0.14em] text-muted ${entry.speaker === 'agent' ? '' : 'text-right'}`}>
                    {entry.speaker === 'agent' ? 'Vaani' : 'You'}
                  </div>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      entry.speaker === 'agent'
                        ? 'rounded-tl-sm bg-indigo-50 text-content-strong dark:bg-indigo-500/10 dark:text-indigo-50'
                        : 'rounded-tr-sm bg-surface-3 text-content-strong'
                    }`}
                  >
                    {entry.text}
                  </div>
                </div>
              </div>
            ))}
            {working && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {busy === 'transcribing' ? 'Prisma is listening back…' : busy === 'thinking' ? 'Working out the reply…' : 'Starting the call…'}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
