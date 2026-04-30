import { query as defaultQuery } from "@/lib/db";
import type { ToolDefinition, ToolHandler } from "./index";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

type ToursDeps = {
  query: QueryFn;
};

type TourRow = {
  id: number;
  bezeichnung: string | null;
  object_label: string | null;
  canonical_object_label: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_id: number | null;
  status: string;
  matterport_space_id: string | null;
  canonical_matterport_space_id: string | null;
  term_end_date: string | Date | null;
  ablaufdatum: string | Date | null;
  canonical_term_end_date: string | Date | null;
  booking_order_no: number | null;
};

function boundedNumber(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

function text(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function isoDate(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeTour(row: TourRow) {
  return {
    id: row.id,
    label: text(row.canonical_object_label) || text(row.object_label) || text(row.bezeichnung),
    customerName: text(row.customer_name),
    customerEmail: text(row.customer_email),
    customerId: row.customer_id,
    status: row.status,
    matterportSpaceId: text(row.canonical_matterport_space_id) || text(row.matterport_space_id),
    termEndDate: isoDate(row.canonical_term_end_date || row.term_end_date || row.ablaufdatum),
    bookingOrderNo: row.booking_order_no,
  };
}

const tourSelect = `
  SELECT id, bezeichnung, object_label, canonical_object_label, customer_name, customer_email,
         customer_id, status, matterport_space_id, canonical_matterport_space_id,
         term_end_date, ablaufdatum, canonical_term_end_date, booking_order_no
  FROM tour_manager.tours
`;

export const toursTools: ToolDefinition[] = [
  {
    name: "get_tours_expiring_soon",
    description: "Listet aktive Matterport-Touren, deren kanonisches Laufzeitende bald erreicht ist.",
    input_schema: {
      type: "object",
      properties: {
        days_ahead: { type: "number", description: "Tage in die Zukunft (Default: 30, max. 365)" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 20, max. 50)" },
      },
    },
  },
  {
    name: "get_tour_status",
    description: "Holt den Status einer Tour anhand ihrer ID.",
    input_schema: {
      type: "object",
      properties: { tour_id: { type: "number", description: "Tour-ID" } },
      required: ["tour_id"],
    },
  },
  {
    name: "count_active_tours",
    description: "Zählt aktive Touren in tour_manager.tours.",
    input_schema: { type: "object", properties: {} },
  },
];

export function createToursHandlers(deps: ToursDeps): Record<string, ToolHandler> {
  const runQuery = deps.query;

  return {
    get_tours_expiring_soon: async (input) => {
      const days = boundedNumber(input.days_ahead, 30, 365);
      const limit = boundedNumber(input.limit, 20, 50);
      const rows = await runQuery<TourRow>(
        `${tourSelect}
         WHERE UPPER(COALESCE(status, '')) IN ('ACTIVE', 'AKTIV')
           AND COALESCE(canonical_term_end_date, term_end_date, ablaufdatum) IS NOT NULL
           AND COALESCE(canonical_term_end_date, term_end_date, ablaufdatum) <= CURRENT_DATE + ($1::int * INTERVAL '1 day')
         ORDER BY COALESCE(canonical_term_end_date, term_end_date, ablaufdatum) ASC, id DESC
         LIMIT $2`,
        [days, limit],
      );
      return { count: rows.length, tours: rows.map(normalizeTour) };
    },

    get_tour_status: async (input) => {
      const tourId = Number(input.tour_id);
      if (!Number.isInteger(tourId) || tourId <= 0) return { error: "Ungültige Tour-ID" };
      const rows = await runQuery<TourRow>(
        `${tourSelect}
         WHERE id = $1
         LIMIT 1`,
        [tourId],
      );
      if (rows.length === 0) return { error: "Tour nicht gefunden" };
      return normalizeTour(rows[0]);
    },

    count_active_tours: async () => {
      const rows = await runQuery<{ count: string | number }>(
        `SELECT COUNT(*) AS count
         FROM tour_manager.tours
         WHERE UPPER(COALESCE(status, '')) IN ('ACTIVE', 'AKTIV')`,
      );
      return { count: Number(rows[0]?.count || 0) };
    },
  };
}

export const toursHandlers = createToursHandlers({ query: defaultQuery });
