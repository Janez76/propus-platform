/**
 * OpenAI Whisper Client — Speech-to-Text.
 * Optimiert für Deutsch / Schweizerdeutsch.
 */

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

export interface TranscriptionResult {
  text: string;
  durationMs: number;
  language?: string;
}

// Whisper akzeptiert: webm, m4a, mp3, mp4, mpeg, mpga, wav, oga, ogg, flac.
function pickWhisperExtension(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes('m4a') || m.includes('mp4') || m.includes('aac')) return 'm4a';
  if (m.includes('wav')) return 'wav';
  if (m.includes('ogg') || m.includes('oga') || m.includes('opus')) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3') || m.includes('mpga')) return 'mp3';
  if (m.includes('flac')) return 'flac';
  return 'webm';
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm',
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY ist nicht gesetzt');
  }

  const start = Date.now();

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  const ext = pickWhisperExtension(mimeType);
  formData.append('file', blob, `audio.${ext}`);
  formData.append('model', 'whisper-1');
  formData.append('language', 'de');
  // Kontext-Hinweis verbessert Erkennung von Propus-Begriffen
  formData.append(
    'prompt',
    'Propus, Matterport, Auftrag, Shooting, HDR, Verknüpfung, Zürich, Zug, CHF, Drohne, Floorplan.',
  );
  formData.append('response_format', 'json');

  const response = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper-Fehler ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as { text: string; language?: string };
  return {
    text: data.text,
    durationMs: Date.now() - start,
    language: data.language,
  };
}
