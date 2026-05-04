"use server";

import { revalidatePath } from "next/cache";
import { requireOrderEditor, sessionActorId } from "@/lib/auth.server";
import { query, queryOne } from "@/lib/db";
import { logOrderEvent, logStatusAuditEntry } from "@/lib/audit";
import { getTransitionError } from "@/lib/orderWorkflow/stateMachine";
import { ORDER_STATUS } from "@/lib/orderWorkflow/orderStatus";

export type ChangeStatusResult = { ok: true } | { ok: false; error: string };

// Status-Werte, die der Topbar-Mehrweg-Knopf setzen darf. Aus der zentralen
// ORDER_STATUS-Konstante abgeleitet, statt hardcoded — verhindert Drift wenn
// die State-Machine erweitert wird (Bug-Hunt T02 LOW).
type TopbarTargetStatus =
  | typeof ORDER_STATUS.CANCELLED
  | typeof ORDER_STATUS.ARCHIVED
  | typeof ORDER_STATUS.PAUSED;

/**
 * Setzt den Status einer Bestellung (z. B. „cancelled" oder „archived") über
 * die State-Machine, ohne die vollen Termin-Felder neu zu speichern. Wird vom
 * „Mehr"-Menü im Topbar (Stornieren / Archivieren) verwendet.
 *
 * Validiert die Übergangs-Erlaubnis via `getTransitionError`, persistiert den
 * neuen Status, schreibt einen Audit-Eintrag und ein Order-Event. Sendet **keine**
 * Workflow-Mails (das passiert beim regulären Termin-Save).
 */
export async function changeOrderStatus(
  orderNo: number,
  toStatus: TopbarTargetStatus,
): Promise<ChangeStatusResult> {
  if (!Number.isInteger(orderNo) || orderNo <= 0) {
    return { ok: false, error: "Ungültige Bestell-Nummer" };
  }
  const editor = await requireOrderEditor();

  // updated_at als ::text auslesen, damit die volle Postgres-Praezision
  // (microseconds) erhalten bleibt — pg konvertiert TIMESTAMPTZ sonst in JS
  // Date (millisecond-truncated), wodurch der Optimistic-Concurrency-Check
  // false-negative liefern wuerde (Codex-Review #253).
  const row = await queryOne<{
    status: string;
    photographer_key: string | null;
    schedule: unknown;
    updated_at_token: string;
  }>(
    `SELECT status, photographer_key, schedule, updated_at::text AS updated_at_token
     FROM booking.orders WHERE order_no = $1 LIMIT 1`,
    [orderNo],
  );
  if (!row) return { ok: false, error: "Bestellung nicht gefunden" };

  // Schema garantiert `status NOT NULL DEFAULT 'pending'` + CHECK constraint
  // (siehe core/migrations/002_booking_schema.sql). Ein fehlender oder
  // leerer Wert deutet auf Daten-Korruption hin und sollte explizit
  // gemeldet werden statt still auf "pending" zu defaulten — sonst maskiert
  // dieser State-Machine-Eingang einen Bug (Bug-Hunt T02 HIGH).
  if (typeof row.status !== "string" || !row.status) {
    return { ok: false, error: "Bestellung hat keinen gueltigen Status" };
  }
  const oldStatus = row.status;
  if (oldStatus === toStatus) {
    return { ok: true };
  }

  const sched = (row.schedule ?? {}) as { date?: string; time?: string };
  const transErr = getTransitionError(
    oldStatus,
    toStatus,
    {
      photographerKey: row.photographer_key,
      schedule: { date: sched.date ?? "", time: sched.time ?? "" },
      photographer: { key: row.photographer_key || undefined },
    },
    { source: "api" },
  );
  if (transErr) {
    return { ok: false, error: transErr };
  }

  // Optimistic-Concurrency: UPDATE nur wenn die Row seit unserem SELECT
  // nicht von einem parallelen Status-Wechsel veraendert wurde. Vergleich
  // auf Postgres-Seite gegen ::text-Cast, damit volle us-Praezision bleibt
  // (siehe SELECT oben). Affected=0 -> Konflikt-Antwort.
  const updateResult = await query<{ updated_at_token: string }>(
    `UPDATE booking.orders
     SET status = $2, updated_at = now()
     WHERE order_no = $1 AND updated_at::text = $3
     RETURNING updated_at::text AS updated_at_token`,
    [orderNo, toStatus, row.updated_at_token],
  );
  if (updateResult.length === 0) {
    return {
      ok: false,
      error:
        "Bestellung wurde von einem anderen Vorgang geändert. Bitte Seite neu laden und erneut versuchen.",
    };
  }

  const actorId = sessionActorId(editor);
  await logStatusAuditEntry({
    orderNo,
    fromStatus: oldStatus,
    toStatus,
    source: "admin_topbar",
    actorId,
  });
  await logOrderEvent(
    orderNo,
    "status_changed",
    { old: { status: oldStatus }, new: { status: toStatus } },
    editor,
  );

  revalidatePath(`/orders/${orderNo}`);
  revalidatePath("/orders");
  return { ok: true };
}
