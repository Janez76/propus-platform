"use server";

import { getAdminSession, requireOrderViewAccess } from "@/lib/auth.server";
import {
  loadOrderVerlaufData,
  type EventEntry,
  type VerlaufFilterInput,
} from "@/lib/repos/orders/verlaufData";

export type GetOrderVerlaufResult =
  | { ok: true; events: EventEntry[] }
  | { ok: false; error: string };

/**
 * Lädt Verlauf-Einträge für eingebettete Order-Shell (Client-Section ohne vollen Routenwechsel).
 */
export async function getOrderVerlaufForClient(
  orderId: string,
  sp: VerlaufFilterInput = {},
): Promise<GetOrderVerlaufResult> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: "Nicht angemeldet" };
  }
  await requireOrderViewAccess(orderId, session);
  const events = await loadOrderVerlaufData(orderId, sp);
  if (events === null) {
    return { ok: false, error: "Bestellung nicht gefunden" };
  }
  return { ok: true, events };
}
