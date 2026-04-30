/**
 * Orders-Tools — booking.orders.
 *
 * Reales Schema:
 *   - id (SERIAL), order_no (UNIQUE INTEGER)
 *   - customer_id → core.customers(id)
 *   - status enum: 'pending','paused','confirmed','completed','done','cancelled','archived'
 *   - address (TEXT), object/services/photographer/schedule/billing/pricing (JSONB)
 *
 * Termin-Felder leben in `schedule->>'date'` (ISO-Datum) und `schedule->>'time'` ('HH:MM').
 * Kunden-Anzeigedaten in `billing->>'company'` / `billing->>'name'` / `billing->>'email'`.
 */

import type { ToolDefinition, ToolHandler } from "./index";
import { query, queryOne } from "@/lib/db";

const ORDER_STATUS_VALUES = [
  "pending",
  "paused",
  "confirmed",
  "completed",
  "done",
  "cancelled",
  "archived",
] as const;

interface OrderRow {
  id: number;
  order_no: number;
  status: string;
  address: string;
  customer_name: string | null;
  customer_email: string | null;
  schedule_date: string | null;
  schedule_time: string | null;
  services_summary: string | null;
}

const SELECT_ORDER_LIST = `
  SELECT
    o.id,
    o.order_no,
    o.status,
    o.address,
    COALESCE(NULLIF(o.billing->>'company', ''), c.company, c.name)               AS customer_name,
    COALESCE(NULLIF(o.billing->>'email',   ''), c.email)                         AS customer_email,
    NULLIF(o.schedule->>'date', '')                                              AS schedule_date,
    NULLIF(o.schedule->>'time', '')                                              AS schedule_time,
    COALESCE(o.services->>'package', '')
      || CASE WHEN o.services ? 'addons'
              THEN COALESCE(' / ' || (
                SELECT string_agg(value::text, ', ')
                FROM jsonb_array_elements_text(o.services->'addons')
              ), '')
              ELSE '' END                                                         AS services_summary
  FROM booking.orders o
  LEFT JOIN core.customers c ON c.id = o.customer_id
`;

export const ordersTools: ToolDefinition[] = [
  {
    name: "get_open_orders",
    description:
      "Listet offene Aufträge (Status nicht 'done', 'cancelled' oder 'archived'). Standardmässig die nächsten 14 Tage anhand schedule.date.",
    input_schema: {
      type: "object",
      properties: {
        days_ahead: { type: "number", description: "Tage in die Zukunft (Default 14)" },
        limit: { type: "number", description: "Max. Anzahl (Default 20)" },
      },
    },
  },
  {
    name: "get_order_by_id",
    description:
      "Holt einen Auftrag anhand id (numeric) oder order_no inklusive Kundendaten.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "id oder order_no" },
      },
      required: ["order_id"],
    },
  },
  {
    name: "search_orders",
    description: "Sucht Aufträge nach Kundenname, E-Mail oder Objekt-Adresse.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_today_schedule",
    description: "Heutige Termine (schedule.date = heute, ohne 'cancelled').",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_order_status",
    description:
      "Setzt den Status eines Auftrags. SCHREIBENDE AKTION — vorher Bestätigung einholen.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "id oder order_no" },
        new_status: {
          type: "string",
          enum: [...ORDER_STATUS_VALUES],
        },
      },
      required: ["order_id", "new_status"],
    },
  },
];

/**
 * Akzeptiert ausschliesslich vollstaendig numerische Strings ("123" → 123,
 * aber NICHT "123abc" — sonst wuerde Number.parseInt das Praefix akzeptieren
 * und einen unbeabsichtigten Datensatz treffen).
 */
function parseOrderRef(raw: unknown): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Loest einen numerischen Order-Identifier eindeutig auf.
 * `order_no` (User-sichtbare Auftragsnummer) hat Vorrang vor `id` (interner SERIAL).
 * Liefert immer genau einen Datensatz oder null — verhindert, dass eine
 * UPDATE-Query mit `id = X OR order_no = X` zwei verschiedene Zeilen erwischt.
 */
async function resolveOrderId(ref: number): Promise<number | null> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM booking.orders
      WHERE order_no = $1 OR id = $1
      ORDER BY (order_no = $1) DESC, id ASC
      LIMIT 1`,
    [ref],
  );
  return row?.id ?? null;
}

export const ordersHandlers: Record<string, ToolHandler> = {
  get_open_orders: async (input) => {
    const days = Math.max(1, Math.min(90, Number(input.days_ahead) || 14));
    const limit = Math.max(1, Math.min(100, Number(input.limit) || 20));

    const rows = await query<OrderRow>(
      `${SELECT_ORDER_LIST}
       WHERE o.status NOT IN ('done', 'cancelled', 'archived')
         AND (
              o.schedule->>'date' = ''
           OR o.schedule->>'date' IS NULL
           OR (o.schedule->>'date')::date <= CURRENT_DATE + ($1 || ' days')::interval
         )
       ORDER BY NULLIF(o.schedule->>'date', '')::date NULLS LAST,
                NULLIF(o.schedule->>'time', '') NULLS LAST
       LIMIT $2`,
      [days, limit],
    );
    return { count: rows.length, orders: rows };
  },

  get_order_by_id: async (input) => {
    const ref = parseOrderRef(input.order_id);
    if (ref === null) return { error: "order_id muss eine vollstaendige Zahl sein" };

    const row = await queryOne(
      `${SELECT_ORDER_LIST}
       WHERE o.order_no = $1 OR o.id = $1
       ORDER BY (o.order_no = $1) DESC, o.id ASC
       LIMIT 1`,
      [ref],
    );
    return row ?? { error: "Auftrag nicht gefunden" };
  },

  search_orders: async (input) => {
    const limit = Math.max(1, Math.min(50, Number(input.limit) || 10));
    const term = `%${String(input.query ?? "").trim()}%`;
    if (term === "%%") return { error: "Suchbegriff fehlt" };

    const rows = await query<OrderRow>(
      `${SELECT_ORDER_LIST}
       WHERE  o.address ILIKE $1
          OR  o.billing->>'company' ILIKE $1
          OR  o.billing->>'name'    ILIKE $1
          OR  o.billing->>'email'   ILIKE $1
          OR  c.name    ILIKE $1
          OR  c.company ILIKE $1
          OR  c.email   ILIKE $1
       ORDER BY NULLIF(o.schedule->>'date', '')::date DESC NULLS LAST
       LIMIT $2`,
      [term, limit],
    );
    return { count: rows.length, orders: rows };
  },

  get_today_schedule: async () => {
    const rows = await query<OrderRow>(
      `${SELECT_ORDER_LIST}
       WHERE  NULLIF(o.schedule->>'date', '')::date = CURRENT_DATE
         AND  o.status NOT IN ('cancelled', 'archived')
       ORDER BY NULLIF(o.schedule->>'time', '') NULLS LAST`,
    );
    return {
      date: new Date().toISOString().slice(0, 10),
      count: rows.length,
      schedule: rows,
    };
  },

  update_order_status: async (input) => {
    const newStatus = String(input.new_status ?? "");
    if (!ORDER_STATUS_VALUES.includes(newStatus as (typeof ORDER_STATUS_VALUES)[number])) {
      return { error: `Ungültiger Status. Erlaubt: ${ORDER_STATUS_VALUES.join(", ")}` };
    }
    const ref = parseOrderRef(input.order_id);
    if (ref === null) return { error: "order_id muss eine vollstaendige Zahl sein" };

    const targetId = await resolveOrderId(ref);
    if (targetId === null) return { error: "Auftrag nicht gefunden" };

    const updated = await query<{ id: number; order_no: number; status: string }>(
      `UPDATE booking.orders
          SET status = $1,
              updated_at = NOW(),
              done_at = CASE WHEN $1 IN ('done','completed') AND done_at IS NULL THEN NOW() ELSE done_at END
        WHERE id = $2
        RETURNING id, order_no, status`,
      [newStatus, targetId],
    );
    if (updated.length === 0) return { error: "Auftrag nicht gefunden" };
    return { ok: true, order: updated[0] };
  },
};
