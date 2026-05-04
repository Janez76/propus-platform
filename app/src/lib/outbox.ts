import { query, type Querier } from "./db";

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
 * Schreibt eine Outbox-Row. MUSS mit derselben `tx` aufgerufen werden,
 * gegen die auch das Order-UPDATE laeuft, damit beide zusammen
 * committet/zurueckgerollt werden.
 *
 * Der Worker dispatcht at-least-once: Handler MUESSEN idempotent sein
 * (z. B. via Outbox-Row-ID als Idempotency-Key). Mailversand sollte
 * pro Outbox-ID hoechstens einmal akzeptieren — siehe
 * booking/lib/outbox-handlers.js.
 */
export async function enqueueOutbox(
  tx: Querier,
  orderNo: number,
  kind: OutboxKind,
  payload: Record<string, unknown>,
  options: { maxAttempts?: number } = {},
): Promise<{ id: number }> {
  const maxAttempts = Number.isFinite(options.maxAttempts) ? options.maxAttempts : 5;
  const rows = await query<{ id: number }>(
    `INSERT INTO booking.order_outbox (order_no, kind, payload, max_attempts)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id`,
    [orderNo, kind, JSON.stringify(payload), maxAttempts],
    tx,
  );
  return { id: Number(rows[0]?.id) };
}
