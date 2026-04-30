/**
 * POST /api/assistant/transcribe
 *
 * multipart/form-data, Feld "audio". Auth wie /api/assistant
 * (Cookie ODER Bearer, portal-only-Rollen abgelehnt).
 * Limit: 25 MB (Whisper-Maximum).
 */

import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/assistant/whisper";
import { getAssistantSession } from "@/lib/assistant/auth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getAssistantSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("audio");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Audio-Datei fehlt (Feld: "audio")' }, { status: 400 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Datei zu gross (max ${MAX_AUDIO_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = file.type || "audio/webm";

  try {
    const result = await transcribeAudio(buffer, mimeType);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transkription fehlgeschlagen";
    logger.error("[TRANSCRIBE] failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
