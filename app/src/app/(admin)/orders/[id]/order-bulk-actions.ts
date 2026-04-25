"use server";

import { revalidatePath } from "next/cache";
import { requireOrderEditor } from "@/lib/auth.server";
import { updateOrderOverview, type UpdateOverviewOptions } from "./actions";
import { saveOrderObjekt, type SaveOrderObjektOptions } from "./objekt/actions";
import { saveLeistungen, type SaveLeistungenOptions } from "./leistungen/actions";
import { saveOrderTermin, type SaveOrderTerminOptions } from "./termin/actions";
import type { BulkSaveInput, BulkSaveResult, BulkStep } from "./order-bulk-types";

export type { BulkSaveInput, BulkSaveResult, BulkStep } from "./order-bulk-types";

const skip: UpdateOverviewOptions & SaveOrderObjektOptions & SaveLeistungenOptions & SaveOrderTerminOptions =
  { skipRedirect: true };

/**
 * Führt nacheinander Mehrfach-Updates auf einer Bestellung aus (ohne Redirects),
 * revalidiert am Ende einmal die Order-Pfade. Für Step 10 / Sammel-Speichern.
 * Termin: Konflikte & Mailversand unverändert; bei Fehler werden vorherige Schritte **nicht** automatisch rückgängig gemacht.
 */
export async function saveOrderAllSections(input: BulkSaveInput): Promise<BulkSaveResult> {
  await requireOrderEditor();
  const successfulSteps: BulkStep[] = [];
  const n = String(input.orderNo);
  if (!n) {
    return { ok: false, step: "exception", error: "Ungültige Bestellnummer", successfulSteps };
  }

  try {
    if (input.overviewFormData) {
      await updateOrderOverview(input.overviewFormData, skip);
      successfulSteps.push("overview");
    }

    if (input.objekt !== undefined) {
      const r = await saveOrderObjekt(input.objekt, skip);
      if (r && "ok" in r && r.ok === false) {
        return { ok: false, step: "objekt", error: r.error, successfulSteps };
      }
      successfulSteps.push("objekt");
    }

    if (input.leistungen !== undefined) {
      const r = await saveLeistungen(input.leistungen, skip);
      if (r && "ok" in r && r.ok === false) {
        return { ok: false, step: "leistungen", error: r.error, successfulSteps };
      }
      successfulSteps.push("leistungen");
    }

    if (input.termin !== undefined) {
      const r = await saveOrderTermin(input.termin, skip);
      if (!r.ok) {
        return { ok: false, step: "termin", error: r.error, successfulSteps, terminDetail: r };
      }
      successfulSteps.push("termin");
    }

    revalidatePath(`/orders/${n}`);
    revalidatePath(`/orders/${n}/objekt`);
    revalidatePath(`/orders/${n}/leistungen`);
    revalidatePath(`/orders/${n}/termin`);
    return { ok: true, successfulSteps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, step: "exception", error: msg, successfulSteps };
  }
}
