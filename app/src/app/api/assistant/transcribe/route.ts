import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/assistant/whisper";
import { getAdminSession } from "@/lib/auth.server";

export const runtime = "nodejs";
export const maxDuration = 60;

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  if (!INTERNAL_ROLES.has(String(session.role || "").toLowerCase())) {
    return NextResponse.json({ error: "Keine Berechtigung für den Assistant" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("audio");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Audio-Datei fehlt (Feld: audio)" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio-Datei ist zu groß (max. 10 MB)" }, { status: 413 });
  }

  try {
    const result = await transcribeAudio(Buffer.from(await file.arrayBuffer()), file.type || "audio/webm");
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transkription fehlgeschlagen";
    console.error("[assistant/transcribe]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
