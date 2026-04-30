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
    description:
      "Nutze dieses Tool wenn der User nach heutigen, offenen oder bevorstehenden Aufträgen fragt. Listet offene Aufträge aus booking.orders. Standard: nächste 14 Tage, max. 50 Einträge.",
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
    description:
      "Nutze dieses Tool wenn eine bestimmte Auftragsnummer genannt wird oder du Basisdaten zu einem Auftrag brauchst.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Auftragsnummer" } },
      required: ["order_id"],
    },
  },
  {
    name: "get_order_detail",
    description:
      "Nutze dieses Tool wenn du den vollständigen Kontext eines Auftrags brauchst: Basisdaten, Kunden-Info, Ordner-Status, verknüpfte Rechnungen, letzte Chat-Nachrichten und Kalender-Verknüpfung.",
    input_schema: {
      type: "object",
      properties: { order_no: { type: "number", description: "Auftragsnummer" } },
      required: ["order_no"],
    },
  },
  {
    name: "search_orders",
    description:
      "Nutze dieses Tool wenn nach einem Kunden, einer Adresse oder einem Stichwort in Aufträgen gesucht wird. Durchsucht Adresse, Rechnungsname und Rechnungs-E-Mail.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff (Adresse, Kundenname, E-Mail)" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 10, max. 50)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_today_schedule",
    description:
      "Nutze dieses Tool wenn nach dem heutigen Tagesplan, heutigen Terminen oder heutigen Aufträgen gefragt wird.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_photographers",
    description:
      "Listet alle aktiven Fotografen mit Schlüssel, Name, Heimatadresse und Skills. Nutze dieses Tool wenn ein Fotograf für einen Auftrag ausgewählt werden soll.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_available_services",
    description:
      "Listet alle verfügbaren Dienstleistungen (Pakete + Addons) aus dem Buchungssystem. Nutze dieses Tool um dem Benutzer die verfügbaren Services bei der Auftragsanlage zu zeigen.",
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

    get_order_detail: async (input: Record<string, unknown>) => {
      const orderNo = Number(input.order_no);
      if (!Number.isInteger(orderNo) || orderNo <= 0) return { error: "Ungültige Auftragsnummer" };

      const baseRows = await runQuery<OrderRow & { done_at: string | Date | null; cust_name: string | null; cust_email: string | null; photographer_event_id: string | null; office_event_id: string | null }>(
        `SELECT o.order_no, o.status, o.address, o.object, o.services, o.photographer, o.schedule, o.billing,
                o.customer_id, o.created_at, o.done_at,
                c.name AS cust_name, c.email AS cust_email,
                o.photographer_event_id, o.office_event_id
         FROM booking.orders o
         LEFT JOIN core.customers c ON c.id = o.customer_id
         WHERE o.order_no = $1
         LIMIT 1`,
        [orderNo],
      );
      if (baseRows.length === 0) return { error: "Auftrag nicht gefunden" };
      const row = baseRows[0];

      const folders = await runQuery<{ folder_type: string; status: string; display_name: string | null }>(
        `SELECT folder_type, status, display_name
         FROM booking.order_folder_links
         WHERE order_no = $1
         LIMIT 5`,
        [orderNo],
      );

      const invoices = await runQuery<{ source: string; invoice_number: string | null; status: string | null; amount: number | null; due_at: string | Date | null }>(
        `SELECT 'renewal' AS source, ri.invoice_number, ri.invoice_status AS status, ri.amount_chf AS amount, ri.due_at
         FROM tour_manager.renewal_invoices ri
         JOIN tour_manager.tours t ON t.id = ri.tour_id
         WHERE t.booking_order_no = $1
         UNION ALL
         SELECT 'exxas' AS source, ei.nummer AS invoice_number, ei.exxas_status AS status, ei.preis_brutto AS amount, NULL AS due_at
         FROM tour_manager.exxas_invoices ei
         JOIN tour_manager.tours t ON t.id = ei.tour_id
         WHERE t.booking_order_no = $1
         LIMIT 5`,
        [orderNo],
      );

      const chatMessages = await runQuery<{ sender_role: string; sender_name: string | null; body_text: string; created_at: string | Date }>(
        `SELECT sender_role, sender_name, LEFT(body_text, 200) AS body_text, created_at
         FROM booking.order_chat_messages
         WHERE order_no = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [orderNo],
      );

      const base = normalizeOrder(row);
      return {
        ...base,
        doneAt: row.done_at instanceof Date ? row.done_at.toISOString() : row.done_at,
        customer: { id: row.customer_id, name: row.cust_name, email: row.cust_email },
        calendarLinked: { photographer: Boolean(row.photographer_event_id), office: Boolean(row.office_event_id) },
        folders: folders.map((f) => ({ type: f.folder_type, status: f.status, displayName: f.display_name })),
        invoices: invoices.map((i) => ({ source: i.source, number: i.invoice_number, status: i.status, amount: i.amount, dueAt: i.due_at instanceof Date ? i.due_at.toISOString().slice(0, 10) : i.due_at })),
        recentChat: chatMessages.reverse().map((m) => ({ role: m.sender_role, name: m.sender_name, text: m.body_text, at: m.created_at instanceof Date ? m.created_at.toISOString() : m.created_at })),
      };
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

    list_photographers: async () => {
      const rows = await runQuery<{
        key: string;
        name: string;
        display_name: string | null;
        home_address: string | null;
        skills: Record<string, unknown> | null;
      }>(
        `SELECT p.key, p.name,
                COALESCE(NULLIF(TRIM(p.name), ''), p.key) AS display_name,
                ps.home_address,
                ps.skills
         FROM booking.photographers p
         LEFT JOIN booking.photographer_settings ps ON ps.photographer_key = p.key
         WHERE p.active = TRUE AND p.bookable = TRUE
         ORDER BY p.name ASC`,
        [],
      );
      return {
        count: rows.length,
        photographers: rows.map((r) => ({
          key: r.key,
          displayName: r.display_name || r.key,
          homeAddress: r.home_address || null,
          skills: r.skills && typeof r.skills === "object" ? r.skills : null,
        })),
      };
    },

    list_available_services: async () => {
      const rows = await runQuery<{
        id: number;
        code: string;
        name: string;
        kind: string;
        category_key: string;
        description: string | null;
      }>(
        `SELECT id, code, name, kind, category_key, description
         FROM booking.products
         WHERE active = TRUE
         ORDER BY sort_order ASC, name ASC`,
        [],
      );
      return {
        count: rows.length,
        services: rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          kind: r.kind,
          categoryKey: r.category_key,
          description: r.description || null,
        })),
      };
    },
  };
}

export const ordersHandlers = createOrdersHandlers({ query: defaultQuery });
