/**
 * Defensiver Bootstrap der booking.orders_order_no-Sequence für die
 * Next-App. Spiegelt das gleichnamige Pattern in `booking/server.js`,
 * damit die Order-Allokation auch in Setups funktioniert, in denen die
 * kanonische Migration `core/migrations/055_orders_order_no_sequence.sql`
 * (noch) nicht eingespielt ist (Codex-Review #253).
 *
 * Pro Prozess wird der Bootstrap nur einmal ausgeführt
 * (`_ensured`-Flag). Race-safe für parallele Erst-Aufrufe via
 * `CREATE SEQUENCE IF NOT EXISTS`.
 *
 * Aufrufer (duplicateOrder, assistant create_order) sollten diese
 * Funktion vor dem ersten INSERT auf `booking.orders` ohne expliziten
 * `order_no` aufrufen. Der optionale `runQuery`-Parameter ist für Tests
 * (DI mit gemocktem `query`); in Production wird der echte
 * `@/lib/db.query` benutzt.
 */

import { query as defaultQuery } from "./db";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

let _ensured = false;

export async function ensureBookingOrderSequence(runQuery?: QueryFn): Promise<void> {
  if (_ensured) return;
  const q: QueryFn = runQuery ?? (defaultQuery as QueryFn);
  // Defensiv: bei DI-Mocks die undefined zurueckliefern wuerden, fallback auf [].
  const startRows = (await q<{ start_val: number }>(
    `SELECT COALESCE(MAX(order_no), 0) + 1 AS start_val FROM booking.orders`,
  )) ?? [];
  const startVal = Number(startRows[0]?.start_val) || 1;
  await q(
    `CREATE SEQUENCE IF NOT EXISTS booking.orders_order_no_seq AS BIGINT START WITH ${startVal}`,
  );
  await q(
    `ALTER TABLE booking.orders ALTER COLUMN order_no SET DEFAULT nextval('booking.orders_order_no_seq')`,
  );
  await q(
    `ALTER SEQUENCE booking.orders_order_no_seq OWNED BY booking.orders.order_no`,
  );
  await q(
    `SELECT setval('booking.orders_order_no_seq'::regclass,
                   GREATEST((SELECT COALESCE(MAX(order_no), 0) FROM booking.orders), last_value))
     FROM booking.orders_order_no_seq`,
  );
  _ensured = true;
}

/** Nur für Tests: setzt den ensured-Flag zurück. */
export function _resetEnsuredFlagForTests(): void {
  _ensured = false;
}
