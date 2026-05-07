import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/auth.server";
import { isPortalOnlyRole } from "@/lib/postLoginRedirect";
import { createMapsHandlers } from "@/lib/assistant/tools/maps";
import { isAssistantDailyLimitExempt } from "@/lib/assistant/access-env";

export const runtime = "nodejs";

const MAX_LEGS = 25;

/**
 * Bug-Hunt MEDIUM M01: Rate-Limit fuer Google Distance Matrix Cost-DoS.
 * Distance Matrix kostet ~$0.005 pro Element (origins × destinations); pro
 * Request bis MAX_LEGS=25 Elemente = ~$0.125. Ein offener Dashboard-Tab plus
 * Polling (TodayCard refetcht beim legsKey-Wechsel + Geo-Position-Update)
 * kann ohne Limit das Maps-Budget eskalieren — gleiches Pattern wie Whisper
 * in transcribe/route.ts (PR #361).
 *
 * Defaults sind grosszuegig: Dashboard-User mit drei Tabs sollten nicht
 * regelmaessig anschlagen. Konfigurierbar via env. Wer auf der
 * ASSISTANT_UNLIMITED_EMAILS-Liste steht, ist auch hier exempt — selbe
 * Quelle wie /api/assistant.
 */
const DRIVE_TIMES_PER_MIN_LIMIT = (() => {
  const raw = process.env.DRIVE_TIMES_PER_MIN_LIMIT;
  const n = raw ? parseInt(raw, 10) : 30;
  return Number.isFinite(n) && n > 0 ? n : 30;
})();
const DRIVE_TIMES_PER_DAY_LIMIT = (() => {
  const raw = process.env.DRIVE_TIMES_PER_DAY_LIMIT;
  const n = raw ? parseInt(raw, 10) : 1000;
  return Number.isFinite(n) && n > 0 ? n : 1000;
})();
const DRIVE_TIMES_BURST_WINDOW_MS = 60_000;
const DRIVE_TIMES_DAY_WINDOW_MS = 24 * 60 * 60_000;

const _driveTimesBurstBuckets = new Map<string, { count: number; resetAt: number }>();
const _driveTimesDailyBuckets = new Map<string, { count: number; resetAt: number }>();

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

if (typeof globalThis !== "undefined" && !(globalThis as { _driveTimesLimitGC?: boolean })._driveTimesLimitGC) {
  (globalThis as { _driveTimesLimitGC?: boolean })._driveTimesLimitGC = true;
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of _driveTimesBurstBuckets) if (b.resetAt <= now) _driveTimesBurstBuckets.delete(k);
    for (const [k, b] of _driveTimesDailyBuckets) if (b.resetAt <= now) _driveTimesDailyBuckets.delete(k);
  }, 5 * 60_000).unref?.();
}

function sessionEmail(session: AdminSession): string {
  const key = String(session.userKey || "").trim();
  if (key.includes("@")) return key.toLowerCase();
  const name = String(session.userName || "").trim();
  if (name.includes("@")) return name.toLowerCase();
  return "";
}

type LegIn = { orderNo?: unknown; address?: unknown };

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }
  if (isPortalOnlyRole(session.role) && !session.isImpersonating) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  // Bucket-Key: dieselbe Identitaet, die auch in ctx (siehe unten) verwendet wird.
  const bucketKey = String(session.userKey || session.userName || "dash").trim() || "dash";
  const exempt = isAssistantDailyLimitExempt(sessionEmail(session));
  if (!exempt) {
    if (!checkBucket(_driveTimesBurstBuckets, bucketKey, DRIVE_TIMES_PER_MIN_LIMIT, DRIVE_TIMES_BURST_WINDOW_MS)) {
      return NextResponse.json(
        { error: "Zu viele Fahrzeit-Anfragen pro Minute. Bitte kurz warten." },
        { status: 429 },
      );
    }
    if (!checkBucket(_driveTimesDailyBuckets, bucketKey, DRIVE_TIMES_PER_DAY_LIMIT, DRIVE_TIMES_DAY_WINDOW_MS)) {
      return NextResponse.json(
        { error: "Tageslimit fuer Live-Fahrzeiten erreicht." },
        { status: 429 },
      );
    }
  }

  let body: { lat?: unknown; lng?: unknown; legs?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "lat/lng ungültig" }, { status: 400 });
  }

  if (!Array.isArray(body.legs) || body.legs.length === 0) {
    return NextResponse.json({ error: "legs fehlt oder leer" }, { status: 400 });
  }

  const legsRaw = body.legs.slice(0, MAX_LEGS) as LegIn[];
  const legs: Array<{ orderNo: string; address: string }> = [];
  for (const row of legsRaw) {
    const orderNo = String(row.orderNo ?? "").trim();
    const address = typeof row.address === "string" ? row.address.trim() : "";
    if (!orderNo || address.length < 3) continue;
    legs.push({ orderNo, address });
  }
  if (legs.length === 0) {
    return NextResponse.json({ error: "Keine gültigen Zieladressen" }, { status: 400 });
  }

  const ctx = {
    userId: String(session.userKey || session.userName || "dash").trim() || "dash",
    userEmail: String(session.userName || session.userKey || "admin").trim() || "admin@local",
  };

  const handlers = createMapsHandlers();
  const matrixResult = await handlers.get_distance_matrix(
    {
      origins: [`${lat},${lng}`],
      destinations: legs.map((l) => l.address),
      mode: "driving",
      departure_time: "now",
    },
    ctx,
  );

  if (matrixResult && typeof matrixResult === "object" && "error" in matrixResult && matrixResult.error) {
    const errMsg = String(matrixResult.error);
    return NextResponse.json(
      { error: errMsg },
      { status: errMsg.includes("GOOGLE_MAPS") ? 503 : 400 },
    );
  }

  type MatrixRow = { cells?: Array<{ status?: string; durationText?: string | null; distanceText?: string | null }> };
  const row = (matrixResult as { matrix?: MatrixRow[] })?.matrix?.[0];
  const cells = row?.cells ?? [];

  const out = legs.map((leg, i) => {
    const cell = cells[i];
    if (!cell || cell.status !== "OK") {
      return {
        orderNo: leg.orderNo,
        durationText: null as string | null,
        distanceText: null as string | null,
        status: cell?.status ?? "UNKNOWN",
      };
    }
    return {
      orderNo: leg.orderNo,
      durationText: cell.durationText ?? null,
      distanceText: cell.distanceText ?? null,
      status: "OK",
    };
  });

  return NextResponse.json({ legs: out });
}
