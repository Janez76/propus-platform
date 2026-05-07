import { NextRequest, NextResponse } from "next/server";
import {
  isOpenAiWhisperConfigured,
  MIN_TRANSCRIPTION_AUDIO_BYTES,
  transcribeAudio,
  validateWhisperAudioBuffer,
} from "@/lib/assistant/whisper";
import { VOICE_TRANSCRIPTION_UNAVAILABLE_USER_MSG } from "@/lib/assistant/voice-transcription-messages";
import { resolveAssistantUser } from "@/lib/assistant/auth";
import { isAssistantDailyLimitExempt } from "@/lib/assistant/access-env";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/**
 * Bug-Hunt HIGH-3: per-User Burst- und Tageslimit fuer Whisper-Transcribe.
 * Whisper kostet ~$0.006/Audio-Minute und laeuft auf einem getrennten
 * OpenAI-Budget — der Anthropic-Token-Counter (siehe /api/assistant/route.ts)
 * deckt das nicht ab. In-Memory-Buckets reichen fuer Single-Pod-Deploys; bei
 * Multi-Pod sollte das spaeter in Redis/Postgres wandern.
 */
const WHISPER_PER_MIN_LIMIT = (() => {
  const raw = process.env.WHISPER_PER_MIN_LIMIT;
  const n = raw ? parseInt(raw, 10) : 6;
  return Number.isFinite(n) && n > 0 ? n : 6;
})();
const WHISPER_PER_DAY_LIMIT = (() => {
  const raw = process.env.WHISPER_PER_DAY_LIMIT;
  const n = raw ? parseInt(raw, 10) : 200;
  return Number.isFinite(n) && n > 0 ? n : 200;
})();
const WHISPER_BURST_WINDOW_MS = 60_000;
const WHISPER_DAY_WINDOW_MS = 24 * 60 * 60_000;

const _whisperBurstBuckets = new Map<string, { count: number; resetAt: number }>();
const _whisperDailyBuckets = new Map<string, { count: number; resetAt: number }>();

function checkBucket(
  store: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

if (typeof globalThis !== "undefined" && !(globalThis as { _whisperLimitGC?: boolean })._whisperLimitGC) {
  (globalThis as { _whisperLimitGC?: boolean })._whisperLimitGC = true;
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of _whisperBurstBuckets) if (b.resetAt <= now) _whisperBurstBuckets.delete(k);
    for (const [k, b] of _whisperDailyBuckets) if (b.resetAt <= now) _whisperDailyBuckets.delete(k);
  }, 5 * 60_000).unref?.();
}

export async function POST(req: NextRequest) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  if (!isOpenAiWhisperConfigured()) {
    return NextResponse.json({ error: VOICE_TRANSCRIPTION_UNAVAILABLE_USER_MSG }, { status: 503 });
  }

  // Rate-Limits gelten fuer alle Nicht-Exempt-User. Exemption-Liste teilt sich
  // mit dem Text-Chat: wer dort vom Daily-Limit befreit ist, ist es hier auch.
  const exempt = isAssistantDailyLimitExempt(user.email);
  if (!exempt) {
    if (!checkBucket(_whisperBurstBuckets, user.id, WHISPER_PER_MIN_LIMIT, WHISPER_BURST_WINDOW_MS)) {
      return NextResponse.json(
        { error: "Zu viele Transkriptions-Anfragen pro Minute. Bitte kurz warten." },
        { status: 429 },
      );
    }
    if (!checkBucket(_whisperDailyBuckets, user.id, WHISPER_PER_DAY_LIMIT, WHISPER_DAY_WINDOW_MS)) {
      return NextResponse.json(
        { error: "Tageslimit fuer Sprach-Transkription erreicht. Bitte morgen erneut." },
        { status: 429 },
      );
    }
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
    const audioBuffer = Buffer.from(await file.arrayBuffer());
    const validation = validateWhisperAudioBuffer(audioBuffer, { minBytes: MIN_TRANSCRIPTION_AUDIO_BYTES });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const result = await transcribeAudio(audioBuffer, file.type || "audio/webm");
    return NextResponse.json(result);
  } catch (err) {
    // Bug-Hunt MEDIUM M04: keine OpenAI-Fehler-Texte direkt an den Client.
    console.error("[assistant/transcribe]", err);
    return NextResponse.json(
      { error: "Transkription momentan nicht verfügbar. Bitte erneut versuchen." },
      { status: 502 },
    );
  }
}
