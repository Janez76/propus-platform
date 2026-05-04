"use server";

import { revalidatePath } from "next/cache";
import { requireOrderEditor } from "@/lib/auth.server";
import { withTransaction } from "@/lib/db";
import { updateOrderOverview } from "./actions";
import { saveOrderObjekt } from "./objekt/actions";
import { saveLeistungen } from "./leistungen/actions";
import { saveOrderTermin } from "./termin/actions";
import { PostCommitQueue } from "./_bulk-tx";
import type { BulkSaveInput, BulkSaveResult, BulkStep } from "./order-bulk-types";

export type { BulkSaveInput, BulkSaveResult, BulkStep } from "./order-bulk-types";

/**
 * Fuehrt mehrere Sub-Section-Updates auf einer Bestellung in EINER
 * Datenbank-Transaktion aus (Bug-Hunt T02 HIGH: Multi-Step ohne Tx).
 *
 * - DB-Mutationen aller Sections + Audit-Inserts laufen gegen den
 *   gleichen pg-Client. Faellt eine Section aus (Validierung/Constraint),
 *   wird die ganze Tx zurueckgerollt — keine inkonsistenten Bestellungen.
 * - HTTP-Side-Effects (Calendar-Sync, Workflow-Mails) werden ueber eine
 *   PostCommitQueue gesammelt und erst NACH erfolgreichem Commit
 *   ausgefuehrt; ein Mailfehler kann die DB-Mutationen nicht mehr
 *   zurueckrollen, was sonst Mails ohne dazugehoerigen Status-Change
 *   produziert haette.
 */
export async function saveOrderAllSections(input: BulkSaveInput): Promise<BulkSaveResult> {
  await requireOrderEditor();
  const successfulSteps: BulkStep[] = [];
  // String(input.orderNo) ist immer truthy (z.B. "undefined", "NaN") — der
  // bisherige `if (!n)`-Check war effektiv dead code (Bug-Hunt T02 MEDIUM).
  // Strikte Number.isInteger-Pruefung greift Tippfehler/Manipulationen ab.
  if (!Number.isInteger(input.orderNo) || input.orderNo <= 0) {
    return { ok: false, step: "exception", error: "Ungültige Bestellnummer", successfulSteps };
  }
  const n = String(input.orderNo);

  const postCommit = new PostCommitQueue();
  // Sub-Action-Fehler werden hier abgelegt, damit der Caller nach dem
  // ROLLBACK den fachlichen Grund (Validierung/Konflikt) erfaehrt statt
  // nur "Bulk Abort".
  type EarlyResult = {
    step: "overview" | "objekt" | "leistungen" | "termin";
    error: string;
    terminDetail?: import("./termin/actions").SaveTerminResult;
  };
  const earlyResultRef: { value: EarlyResult | null } = { value: null };

  try {
    await withTransaction(async (tx) => {
      const opts = { skipRedirect: true, tx, postCommit } as const;

      if (input.overviewFormData) {
        await updateOrderOverview(input.overviewFormData, opts);
        successfulSteps.push("overview");
      }

      if (input.objekt !== undefined) {
        const r = await saveOrderObjekt(input.objekt, opts);
        if (r && "ok" in r && r.ok === false) {
          earlyResultRef.value = { step: "objekt", error: r.error };
          throw new Error(`__BULK_ABORT__:${r.error}`);
        }
        successfulSteps.push("objekt");
      }

      if (input.leistungen !== undefined) {
        const r = await saveLeistungen(input.leistungen, opts);
        if (r && "ok" in r && r.ok === false) {
          earlyResultRef.value = { step: "leistungen", error: r.error };
          throw new Error(`__BULK_ABORT__:${r.error}`);
        }
        successfulSteps.push("leistungen");
      }

      if (input.termin !== undefined) {
        const r = await saveOrderTermin(input.termin, opts);
        if (!r.ok) {
          earlyResultRef.value = { step: "termin", error: r.error, terminDetail: r };
          throw new Error(`__BULK_ABORT__:${r.error}`);
        }
        successfulSteps.push("termin");
      }
    });
  } catch (e) {
    const captured = earlyResultRef.value;
    if (captured) {
      // Validation/business-Fehler einer Sub-Action — Tx wurde gerollback.
      // successfulSteps bezieht sich auf erfolgreich ausgefuehrte Sections,
      // muss aber im Roll-Back-Fall geleert werden, damit der Caller nicht
      // glaubt frühere Schritte seien bereits committed.
      return {
        ok: false,
        step: captured.step,
        error: captured.error,
        successfulSteps: [],
        terminDetail: captured.terminDetail,
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, step: "exception", error: msg, successfulSteps: [] };
  }

  // Tx commited — Side-Effects ausfuehren. Fehler werden geloggt aber
  // nicht mehr als Bulk-Fail behandelt (DB ist konsistent).
  await postCommit.run("saveOrderAllSections");

  revalidatePath(`/orders/${n}`);
  revalidatePath(`/orders/${n}/objekt`);
  revalidatePath(`/orders/${n}/leistungen`);
  revalidatePath(`/orders/${n}/termin`);
  return { ok: true, successfulSteps };
}
