import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth.server";
import { isPortalOnlyRole } from "@/lib/postLoginRedirect";
import { createMapsHandlers } from "@/lib/assistant/tools/maps";

export const runtime = "nodejs";

const MAX_LEGS = 25;

type LegIn = { orderNo?: unknown; address?: unknown };

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }
  if (isPortalOnlyRole(session.role) && !session.isImpersonating) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
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
