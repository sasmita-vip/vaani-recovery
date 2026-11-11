/**
 * Microphone capture for the Gnani voice demo.
 *
 * MediaRecorder gives us compressed audio (webm/opus in Chrome, mp4 in
 * Safari), but Gnani Prisma's REST endpoint wants WAV/MP3/OGG/FLAC/AAC/M4A.
 * We therefore decode the recording in the browser and re-encode it as mono
 * 16-bit PCM WAV, which every Gnani STT model accepts.
 */

export interface VoiceRecorder {
  /** Finish the recording and resolve with a WAV blob. */
  stop(): Promise<Blob>;
  /** Abandon the recording without producing audio. */
  cancel(): void;
}

const DEFAULT_MAX_MS = 20_000;
const MAX_ALLOWED_MS = 28_000;

export function isRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function supportedMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type));
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

async function toWav(blob: Blob): Promise<Blob> {
  const bytes = await blob.arrayBuffer();
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) throw new Error('This browser cannot decode the recording.');

  const context = new AudioCtor();
  try {
    const buffer = await context.decodeAudioData(bytes.slice(0));
    const sampleCount = buffer.length;
    const channels = buffer.numberOfChannels;
    const channelData: Float32Array[] = [];
    for (let c = 0; c < channels; c += 1) channelData.push(buffer.getChannelData(c));

    const pcm = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) {
      let sum = 0;
      for (let c = 0; c < channels; c += 1) sum += channelData[c][i];
      const sample = Math.max(-1, Math.min(1, sum / channels));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, pcm.byteLength, true);

    return new Blob([header, pcm.buffer], { type: 'audio/wav' });
  } finally {
    void context.close();
  }
}

/**
 * Starts recording from the default microphone. The stream is released as soon
 * as the recorder stops, and `onAutoStop` fires if the 20 second cap is hit.
 */
export async function startVoiceRecording(options: {
  onAutoStop?: (blob: Blob) => void;
  maxMs?: number;
} = {}): Promise<VoiceRecorder> {
  if (!isRecordingSupported()) {
    throw new Error('This browser cannot record audio. Try Chrome, Edge or Safari.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });

  const mimeType = supportedMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const releaseStream = () => stream.getTracks().forEach((track) => track.stop());
  let stopPromise: Promise<Blob> | null = null;

  const finish = (): Promise<Blob> => {
    if (stopPromise) return stopPromise;
    stopPromise = new Promise<Blob>((resolve, reject) => {
      const finalise = async () => {
        releaseStream();
        try {
          const raw = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
          resolve(await toWav(raw));
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Could not process that recording.'));
        }
      };

      if (recorder.state === 'inactive') {
        void finalise();
        return;
      }
      recorder.onstop = () => {
        void finalise();
      };
      recorder.stop();
    });
    return stopPromise;
  };

  const cap = Math.min(Math.max(options.maxMs ?? DEFAULT_MAX_MS, 3_000), MAX_ALLOWED_MS);
  const timer = window.setTimeout(() => {
    void finish()
      .then((blob) => options.onAutoStop?.(blob))
      .catch(() => undefined);
  }, cap);

  recorder.start(250);

  return {
    stop: () => {
      window.clearTimeout(timer);
      return finish();
    },
    cancel: () => {
      window.clearTimeout(timer);
      releaseStream();
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}
