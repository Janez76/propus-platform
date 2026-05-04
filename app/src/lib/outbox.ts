import type { PoolClient } from "pg";
import { query } from "./db";

/**
 * Outbox-Pattern: Side-Effects (Mails, Calendar-Sync) werden in derselben
 * Transaktion wie die DB-Mutation als Row in `booking.order_outbox`
 * persistiert. Ein separater Worker im booking-Service (siehe
 * booking/jobs/outbox-dispatcher.js + booking/lib/outbox-dispatcher.js)
 * pollt die Tabelle und fuehrt sie aus.
 *
 * Damit ueberleben Side-Effects auch einen Server-Crash zwischen Commit
 * und Mailversand — die Bulk-Save PostCommitQueue (siehe _bulk-tx.ts)
 * laeuft NUR im Prozess-Speicher und wuerde dabei verloren gehen.
 */

export type OutboxKind =
  | "workflow_status_mail"
  | "calendar_reschedule";

/**
 * Schreibt eine Outbox-Row. Erwartet einen `PoolClient` (laufende
 * Transaktion) statt eines beliebigen Queriers — der Vertrag verlangt
 * dieselbe Tx wie das Order-UPDATE, damit beide zusammen committet/
 * zurueckgerollt werden. Wird der Pool durchgereicht, wuerde die Outbox-
 * Row sofort committen — DB liegt dann inkonsistent (CodeRabbit Major
 * #260).
 *
 * Der Worker dispatcht at-least-once: Handler MUESSEN idempotent sein
 * (z. B. via Outbox-Row-ID als Idempotency-Key). Mailversand sollte
 * pro Outbox-ID hoechstens einmal akzeptieren — siehe
 * booking/lib/outbox-handlers.js.
 */
export async function enqueueOutbox(
  tx: PoolClient,
  orderNo: number,
  kind: OutboxKind,
  payload: Record<string, unknown>,
  options: { maxAttempts?: number } = {},
): Promise<{ id: number }> {
  // maxAttempts MUSS positiv und ganzzahlig sein, sonst bricht die
  // CHECK-Constraint in 057_order_outbox.sql. Float/0/negativ → Default
  // (CodeRabbit Major #260).
  const maxAttempts =
    Number.isInteger(options.maxAttempts) && (options.maxAttempts as number) > 0
      ? (options.maxAttempts as number)
      : 5;
  const rows = await query<{ id: number }>(
    `INSERT INTO booking.order_outbox (order_no, kind, payload, max_attempts)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id`,
    [orderNo, kind, JSON.stringify(payload), maxAttempts],
    tx,
  );
  const rawId = rows[0]?.id;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("enqueueOutbox: INSERT lieferte keine gueltige id");
  }
  return { id };
}
