"use server";

import { getAdminSession, requireOrderViewAccess } from "@/lib/auth.server";
import { loadVerknuepfungenData } from "@/lib/repos/orders/verknuepfungenData";
import type { VerknuepfungenData } from "@/lib/repos/orders/verknuepfungenTypes";

export type GetVerknuepfungenResult =
  | { ok: true; data: VerknuepfungenData }
  | { ok: false; error: string };

export async function getVerknuepfungenForClient(orderId: string): Promise<GetVerknuepfungenResult> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: "Nicht angemeldet" };
  }
  await requireOrderViewAccess(orderId, session);
  const data = await loadVerknuepfungenData(orderId);
  if (!data) {
    return { ok: false, error: "Bestellung nicht gefunden" };
  }
  return { ok: true, data };
}
