/**
 * Cron-Endpoint für Nightly Self-Learning Runs.
 *
 * Auth: x-cron-secret-Header oder ?token=… mit env CRON_SECRET.
 * Ohne CRON_SECRET-Konfiguration ist der Endpoint deaktiviert (403), damit er
 * im Standalone-Booking-Container nicht zufällig auslöst.
 *
 * Auf der VPS wird er von der bestehenden Cron-Routine angepingt; lokal kann
 * er manuell mit `curl -H "x-cron-secret: $CRON_SECRET" /api/cron/self-learning`
 * gestartet werden.
 */
import { NextRequest, NextResponse } from "next/server";
import { runSelfLearningOnce } from "@/lib/assistant/self-learning-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const headerSecret = req.headers.get("x-cron-secret")?.trim();
  if (headerSecret && headerSecret === secret) return true;
  const tokenParam = req.nextUrl.searchParams.get("token");
  if (tokenParam && tokenParam === secret) return true;
  return false;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Cron secret missing or invalid" }, { status: 403 });
  }
  try {
    const result = await runSelfLearningOnce({ trigger: "cron" });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Komfort: Cron-Tools die nur GET kennen (z. B. uptime-checker) dürfen auch GET.
  return POST(req);
}
