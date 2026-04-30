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

export function getWhisperAudioFilename(mimeType = "audio/webm"): string {
  const normalized = mimeType.toLowerCase();
  const extension = MIME_EXTENSION_MAP.find(([needle]) => normalized.includes(needle))?.[1] ?? "webm";
  return `audio.${extension}`;
}

export function validateWhisperAudioBuffer(
  audioBuffer: Buffer,
  options: { minBytes?: number } = {},
): { ok: true } | { ok: false; error: string } {
  if (audioBuffer.byteLength === 0) {
    return { ok: false, error: "Keine Audiodaten empfangen. Bitte Aufnahme erneut starten." };
  }
  if (audioBuffer.byteLength < (options.minBytes ?? MIN_TRANSCRIPTION_AUDIO_BYTES)) {
    return { ok: false, error: "Aufnahme zu kurz. Bitte mindestens eine kurze Frage aufnehmen." };
  }
  return { ok: true };
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType = "audio/webm"): Promise<TranscriptionResult> {
  const validation = validateWhisperAudioBuffer(audioBuffer);
  if (!validation.ok) throw new Error(validation.error);

  const apiKey = runtimeEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY ist nicht gesetzt");

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
