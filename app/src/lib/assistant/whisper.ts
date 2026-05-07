import { VOICE_TRANSCRIPTION_UNAVAILABLE_USER_MSG } from "./voice-transcription-messages";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export type TranscriptionResult = {
  text: string;
  durationMs: number;
  language?: string;
};

export const MIN_TRANSCRIPTION_AUDIO_BYTES = 1024;

const MIME_EXTENSION_MAP: Array<[needle: string, extension: string]> = [
  ["webm", "webm"],
  ["mp4", "m4a"],
  ["m4a", "m4a"],
  ["mpeg", "mp3"],
  ["mp3", "mp3"],
  ["wav", "wav"],
  ["x-wav", "wav"],
  ["ogg", "ogg"],
];

function runtimeEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

/** OpenAI Whisper (Spracheingabe); unabhängig vom Claude-Textchat. */
export function isOpenAiWhisperConfigured(): boolean {
  const v = runtimeEnv("OPENAI_API_KEY");
  return Boolean(v?.trim());
}

export function getWhisperAudioFilename(mimeType = "audio/webm"): string {
  const normalized = mimeType.toLowerCase();
  const extension = MIME_EXTENSION_MAP.find(([needle]) => normalized.includes(needle))?.[1] ?? "webm";
  return `audio.${extension}`;
}

/**
 * Bug-Hunt MEDIUM M03: Magic-Bytes-Validierung. Vorher pruefte die Funktion
 * nur die Buffer-Laenge. Da der MIME-Type per FormData clientseitig
 * spoofbar ist, konnten beliebige Binaerdaten als `audio/webm` an OpenAI
 * weitergeleitet werden — Whisper verwirft sie still und die Kosten
 * laufen trotzdem. Wir checken die ersten Bytes gegen die Magic-Numbers
 * der unterstuetzten Formate (siehe MIME_EXTENSION_MAP) und lehnen alles
 * andere mit 400 ab.
 */
function looksLikeAudio(buf: Buffer): boolean {
  if (buf.length < 12) return false;

  // EBML header → WebM / Matroska (Opus, Vorbis): 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;

  // RIFF…WAVE → WAV: "RIFF" (52 49 46 46) + 4 bytes size + "WAVE" (57 41 56 45)
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
  ) return true;

  // OggS → Ogg/Vorbis/Opus: 4F 67 67 53
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true;

  // ID3 tag → MP3 mit Tag: 49 44 33
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;

  // MPEG audio frame sync → MP3 ohne Tag: FF Ex/Fx (11 sync bits + MPEG Audio version 1/2/2.5)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;

  // ftyp-Box (M4A/MP4/3GP) → bytes 4..7 = "ftyp" (66 74 79 70)
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return true;

  return false;
}

export function validateWhisperAudioBuffer(
  audioBuffer: Buffer,
  options: { minBytes?: number; checkMagicBytes?: boolean } = {},
): { ok: true } | { ok: false; error: string } {
  if (audioBuffer.byteLength === 0) {
    return { ok: false, error: "Keine Audiodaten empfangen. Bitte Aufnahme erneut starten." };
  }
  if (audioBuffer.byteLength < (options.minBytes ?? MIN_TRANSCRIPTION_AUDIO_BYTES)) {
    return { ok: false, error: "Aufnahme zu kurz. Bitte mindestens eine kurze Frage aufnehmen." };
  }
  // Default: magic-byte-Check ein. Tests, die mit gemockten Buffers fahren,
  // koennen ihn explizit ausschalten (option checkMagicBytes: false).
  if (options.checkMagicBytes !== false && !looksLikeAudio(audioBuffer)) {
    return { ok: false, error: "Datei ist kein erkanntes Audio-Format (webm, wav, mp3, m4a oder ogg erwartet)." };
  }
  return { ok: true };
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType = "audio/webm"): Promise<TranscriptionResult> {
  const validation = validateWhisperAudioBuffer(audioBuffer);
  if (!validation.ok) throw new Error(validation.error);

  const apiKey = runtimeEnv("OPENAI_API_KEY");
  if (!apiKey?.trim()) throw new Error(VOICE_TRANSCRIPTION_UNAVAILABLE_USER_MSG);

  const start = Date.now();
  const formData = new FormData();
  const arrayBuffer = audioBuffer.buffer.slice(
    audioBuffer.byteOffset,
    audioBuffer.byteOffset + audioBuffer.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: mimeType });

  formData.append("file", blob, getWhisperAudioFilename(mimeType));
  formData.append("model", "whisper-1");
  formData.append("language", "de");
  formData.append("prompt", "Propus, Matterport, Auftrag, Shooting, HDR, Verknüpfung, Zürich, Zug, CHF, Drohne, Floorplan.");
  formData.append("response_format", "json");

  const response = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Whisper-Fehler ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = (await response.json()) as { text: string; language?: string };
  return { text: data.text, language: data.language, durationMs: Date.now() - start };
}
