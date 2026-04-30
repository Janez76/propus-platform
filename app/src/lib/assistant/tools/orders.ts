import { query as defaultQuery } from "@/lib/db";
import type { ToolContext, ToolDefinition, ToolHandler } from "./index";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

type OrdersDeps = {
  query: QueryFn;
};

type OrderRow = {
  order_no: number;
  status: string;
  address: string;
  object: Record<string, unknown> | null;
  services: Record<string, unknown> | unknown[] | null;
  photographer: Record<string, unknown> | null;
  schedule: Record<string, unknown> | null;
  billing: Record<string, unknown> | null;
  customer_id: number | null;
  created_at: string | Date | null;
};

const openOrderStatusSql = "('done','completed','cancelled','archived')";

function boundedNumber(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

function stringValue(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function firstString(source: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = stringValue(source[key]);
    if (value) return value;
  }
  return null;
}

function servicesList(services: OrderRow["services"]): string[] {
  if (Array.isArray(services)) {
    return services.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (!services || typeof services !== "object") return [];
  return Object.entries(services)
    .filter(([, value]) => value === true || (typeof value === "number" && value > 0) || (typeof value === "string" && value.trim() !== ""))
    .map(([key]) => key);
}

function normalizeOrder(row: OrderRow) {
  const object = row.object && typeof row.object === "object" ? row.object : null;
  const billing = row.billing && typeof row.billing === "object" ? row.billing : null;
  const photographer = row.photographer && typeof row.photographer === "object" ? row.photographer : null;
  const schedule = row.schedule && typeof row.schedule === "object" ? row.schedule : null;

  return {
    orderNo: row.order_no,
    status: row.status,
    address: row.address,
    customerId: row.customer_id,
    customerName: firstString(billing, ["name", "company", "companyName", "customerName"]),
    customerEmail: firstString(billing, ["email", "customerEmail"]),
    objectLabel: firstString(object, ["label", "type", "title", "name"]),
    services: servicesList(row.services),
    photographerName: firstString(photographer, ["name", "displayName", "key"]),
    scheduledDate: firstString(schedule, ["date", "scheduledDate"]),
    scheduledTime: firstString(schedule, ["time", "startTime", "from"]),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const orderSelect = `
  SELECT order_no, status, address, object, services, photographer, schedule, billing, customer_id, created_at
  FROM booking.orders
`;

export const ordersTools: ToolDefinition[] = [
  {
    name: "get_open_orders",
    description: "Listet offene Aufträge aus booking.orders. Standard: nächste 14 Tage, max. 50 Einträge.",
    input_schema: {
      type: "object",
      properties: {
        days_ahead: { type: "number", description: "Wie viele Tage in die Zukunft schauen (Default: 14, max. 365)" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 20, max. 50)" },
      },
    },
  },
  {
    name: "get_order_by_id",
    description: "Holt einen Auftrag anhand der Auftragsnummer.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Auftragsnummer" } },
      required: ["order_id"],
    },
  },
  {
    name: "search_orders",
    description: "Sucht Aufträge nach Adresse, Rechnungsname oder Rechnungs-E-Mail.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 10, max. 50)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_today_schedule",
    description: "Listet heutige Aufträge anhand booking.orders.schedule->>'date'.",
    input_schema: { type: "object", properties: {} },
  },
];

export function createOrdersHandlers(deps: OrdersDeps): Record<string, ToolHandler> {
  const runQuery = deps.query;

  return {
    get_open_orders: async (input: Record<string, unknown>, _ctx: ToolContext) => {
      const days = boundedNumber(input.days_ahead, 14, 365);
      const limit = boundedNumber(input.limit, 20, 50);
      const rows = await runQuery<OrderRow>(
        `${orderSelect}
         WHERE status NOT IN ${openOrderStatusSql}
           AND (
             NULLIF(schedule->>'date', '') IS NULL
             OR (schedule->>'date')::date <= CURRENT_DATE + ($1::int * INTERVAL '1 day')
           )
         ORDER BY NULLIF(schedule->>'date', '')::date NULLS LAST, NULLIF(schedule->>'time', '') NULLS LAST, created_at DESC
         LIMIT $2`,
        [days, limit],
      );
      return { count: rows.length, orders: rows.map(normalizeOrder) };
    },

    get_order_by_id: async (input: Record<string, unknown>) => {
      const orderNo = Number(input.order_id);
      if (!Number.isInteger(orderNo) || orderNo <= 0) return { error: "Ungültige Auftragsnummer" };
      const rows = await runQuery<OrderRow>(
        `${orderSelect}
         WHERE order_no = $1
         LIMIT 1`,
        [orderNo],
      );
      if (rows.length === 0) return { error: "Auftrag nicht gefunden" };
      return normalizeOrder(rows[0]);
    },

    search_orders: async (input: Record<string, unknown>) => {
      const q = String(input.query || "").trim();
      if (!q) return { count: 0, orders: [] };
      const limit = boundedNumber(input.limit, 10, 50);
      const rows = await runQuery<OrderRow>(
        `${orderSelect}
         WHERE address ILIKE $1
            OR billing->>'name' ILIKE $1
            OR billing->>'company' ILIKE $1
            OR billing->>'email' ILIKE $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [`%${q}%`, limit],
      );
      return { count: rows.length, orders: rows.map(normalizeOrder) };
    },

    get_today_schedule: async () => {
      const rows = await runQuery<OrderRow>(
        `${orderSelect}
         WHERE NULLIF(schedule->>'date', '')::date = CURRENT_DATE
           AND status NOT IN ${openOrderStatusSql}
         ORDER BY NULLIF(schedule->>'time', '') NULLS LAST, created_at DESC
         LIMIT 50`,
        [],
      );
      return { count: rows.length, orders: rows.map(normalizeOrder) };
    },
  };
}

export const ordersHandlers = createOrdersHandlers({ query: defaultQuery });
