const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export type TranscriptionResult = {
  text: string;
  durationMs: number;
  language?: string;
};

function runtimeEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType = "audio/webm"): Promise<TranscriptionResult> {
  const apiKey = runtimeEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY ist nicht gesetzt");

  const start = Date.now();
  const formData = new FormData();
  const arrayBuffer = audioBuffer.buffer.slice(
    audioBuffer.byteOffset,
    audioBuffer.byteOffset + audioBuffer.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("wav") ? "wav" : "webm";

  formData.append("file", blob, `audio.${ext}`);
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
