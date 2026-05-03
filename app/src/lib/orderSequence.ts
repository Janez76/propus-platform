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
 * `order_no` aufrufen.
 */

import { query } from "./db";

let _ensured = false;

export async function ensureBookingOrderSequence(): Promise<void> {
  if (_ensured) return;
  const startRows = await query<{ start_val: number }>(
    `SELECT COALESCE(MAX(order_no), 0) + 1 AS start_val FROM booking.orders`,
  );
  const startVal = Number(startRows[0]?.start_val) || 1;
  await query(
    `CREATE SEQUENCE IF NOT EXISTS booking.orders_order_no_seq AS BIGINT START WITH ${startVal}`,
  );
  await query(
    `ALTER TABLE booking.orders ALTER COLUMN order_no SET DEFAULT nextval('booking.orders_order_no_seq')`,
  );
  await query(
    `ALTER SEQUENCE booking.orders_order_no_seq OWNED BY booking.orders.order_no`,
  );
  await query(
    `SELECT setval('booking.orders_order_no_seq'::regclass,
                   GREATEST((SELECT COALESCE(MAX(order_no), 0) FROM booking.orders), last_value))
     FROM booking.orders_order_no_seq`,
  );
  _ensured = true;
}
