import "server-only";
import { cookies } from "next/headers";
import { logger } from "@/lib/logger";

/**
 * Ruft die Express-Route `PATCH /api/admin/orders/:orderNo/reschedule` auf.
 * Die Next.js-Termin-/Leistungs-Actions schreiben nur in die DB; Outlook/365
 * wird dort sonst nicht aktualisiert (Legacy-UI nutzt dieselbe Route).
 */
export async function requestAdminReschedule(
  orderNo: number,
  body: { date: string; time: string; durationMin: number },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const base = process.env.PLATFORM_INTERNAL_URL;
  if (!base) {
    logger.warn("[calendar-sync] PLATFORM_INTERNAL_URL fehlt — 365-Sync übersprungen");
    return { ok: false, reason: "no_platform_internal_url" };
  }

  const store = await cookies();
  const token = store.get("admin_session")?.value;
  if (!token) {
    return { ok: false, reason: "no_admin_session" };
  }

  const url = `${String(base).replace(/\/$/, "")}/api/admin/orders/${orderNo}/reschedule`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[calendar-sync] fetch fehlgeschlagen", { orderNo, msg });
    return { ok: false, reason: "fetch_error" };
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error("[calendar-sync] reschedule fehlgeschlagen", {
      orderNo,
      status: res.status,
      body: text.slice(0, 500),
    });
    return { ok: false, reason: `http_${res.status}` };
  }

  return { ok: true };
}
