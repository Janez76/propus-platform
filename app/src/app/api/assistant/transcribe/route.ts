import { NextRequest, NextResponse } from "next/server";
import { MIN_TRANSCRIPTION_AUDIO_BYTES, transcribeAudio, validateWhisperAudioBuffer } from "@/lib/assistant/whisper";
import { resolveAssistantUser } from "@/lib/assistant/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("audio");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Audio-Datei fehlt (Feld: audio)" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio-Datei ist zu groß (max. 10 MB)" }, { status: 413 });
  }

  try {
    const audioBuffer = Buffer.from(await file.arrayBuffer());
    const validation = validateWhisperAudioBuffer(audioBuffer, { minBytes: MIN_TRANSCRIPTION_AUDIO_BYTES });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const result = await transcribeAudio(audioBuffer, file.type || "audio/webm");
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transkription fehlgeschlagen";
    console.error("[assistant/transcribe]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
