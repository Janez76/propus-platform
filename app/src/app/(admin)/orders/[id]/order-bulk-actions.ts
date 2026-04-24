"use server";

import { revalidatePath } from "next/cache";
import { requireOrderEditor } from "@/lib/auth.server";
import { updateOrderOverview, type UpdateOverviewOptions } from "./actions";
import { saveOrderObjekt, type SaveOrderObjektOptions } from "./objekt/actions";
import { saveLeistungen, type SaveLeistungenOptions } from "./leistungen/actions";
import { saveOrderTermin, type SaveOrderTerminOptions, type SaveTerminResult } from "./termin/actions";

export type BulkSaveInput = {
  orderNo: number;
  /** FormData für Übersicht (optional), wie `updateOrderOverview` */
  overviewFormData?: FormData;
  /** JSON-Payloads wie die jeweiligen Client-Formulare (optional) */
  objekt?: unknown;
  leistungen?: unknown;
  termin?: unknown;
};

export type BulkSaveResult =
  | { ok: true }
  | {
      ok: false;
      step: "overview" | "objekt" | "leistungen" | "termin" | "exception";
      error: string;
      terminDetail?: SaveTerminResult;
    };

const skip: UpdateOverviewOptions & SaveOrderObjektOptions & SaveLeistungenOptions & SaveOrderTerminOptions =
  { skipRedirect: true };

/**
 * Führt nacheinander Mehrfach-Updates auf einer Bestellung aus (ohne Redirects),
 * revalidiert am Ende einmal die Order-Pfade. Für Step 10 / Sammel-Speichern.
 * Termin: Konflikte & Mailversand unverändert; bei Fehler werden vorherige Schritte **nicht** automatisch rückgängig gemacht.
 */
export async function saveOrderAllSections(input: BulkSaveInput): Promise<BulkSaveResult> {
  await requireOrderEditor();
  const n = String(input.orderNo);
  if (!n) {
    return { ok: false, step: "exception", error: "Ungültige Bestellnummer" };
  }

  try {
    if (input.overviewFormData) {
      await updateOrderOverview(input.overviewFormData, skip);
    }

    if (input.objekt !== undefined) {
      const r = await saveOrderObjekt(input.objekt, skip);
      if (r && "ok" in r && r.ok === false) {
        return { ok: false, step: "objekt", error: r.error };
      }
    }

    if (input.leistungen !== undefined) {
      const r = await saveLeistungen(input.leistungen, skip);
      if (r && "ok" in r && r.ok === false) {
        return { ok: false, step: "leistungen", error: r.error };
      }
    }

    if (input.termin !== undefined) {
      const r = await saveOrderTermin(input.termin, skip);
      if (!r.ok) {
        return { ok: false, step: "termin", error: r.error, terminDetail: r };
      }
    }

    revalidatePath(`/orders/${n}`);
    revalidatePath(`/orders/${n}/objekt`);
    revalidatePath(`/orders/${n}/leistungen`);
    revalidatePath(`/orders/${n}/termin`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, step: "exception", error: msg };
  }
}
