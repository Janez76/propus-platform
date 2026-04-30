import { query as defaultQuery } from "@/lib/db";
import type { ToolDefinition, ToolHandler } from "./index";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

type InvoicesDeps = {
  query: QueryFn;
};

function boundedNumber(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

export const invoicesTools: ToolDefinition[] = [
  {
    name: "search_invoices",
    description:
      "Sucht über Verlängerungs- und Exxas-Rechnungen nach Kundenname, Rechnungsnummer oder Status. Nutzt die zentrale View invoices_central_v.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff (Kundenname, Rechnungsnummer)" },
        status: { type: "string", description: "Optionaler Status-Filter (z.B. 'open', 'paid', 'overdue', 'bz')" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 20, max. 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_overdue_invoices",
    description: "Listet überfällige Verlängerungsrechnungen (unbezahlt, Fälligkeitsdatum überschritten).",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximale Anzahl (Default: 20, max. 20)" },
      },
    },
  },
  {
    name: "get_invoice_stats",
    description: "Gibt Zählung nach Status für Verlängerungs- und Exxas-Rechnungen zurück.",
    input_schema: { type: "object", properties: {} },
  },
];

export function createInvoicesHandlers(deps: InvoicesDeps): Record<string, ToolHandler> {
  const runQuery = deps.query;

  return {
    search_invoices: async (input) => {
      const q = String(input.query || "").trim();
      if (!q) return { count: 0, invoices: [] };
      const status = typeof input.status === "string" ? input.status.trim().toLowerCase() : null;
      const limit = boundedNumber(input.limit, 20, 20);

      const rows = await runQuery<{
        invoice_type: string;
        invoice_number: string | null;
        invoice_status: string | null;
        amount: number | null;
        due_at: string | Date | null;
        customer_name: string | null;
        tour_id: number | null;
        tour_label: string | null;
      }>(
        `SELECT
           v.invoice_type,
           v.invoice_number,
           v.invoice_status,
           v.amount,
           v.due_at,
           v.customer_name,
           v.tour_id,
           v.tour_label
         FROM tour_manager.invoices_central_v v
         WHERE (
           v.customer_name ILIKE $1
           OR v.invoice_number ILIKE $1
           OR v.tour_label ILIKE $1
         )
         AND ($2::text IS NULL OR LOWER(v.invoice_status) = $2::text)
         ORDER BY v.due_at DESC NULLS LAST
         LIMIT $3`,
        [`%${q}%`, status, limit],
      );

      return {
        count: rows.length,
        invoices: rows.map((r) => ({
          type: r.invoice_type,
          number: r.invoice_number,
          status: r.invoice_status,
          amount: r.amount,
          dueAt: r.due_at instanceof Date ? r.due_at.toISOString().slice(0, 10) : r.due_at,
          customerName: r.customer_name,
          tourId: r.tour_id,
          tourLabel: r.tour_label,
        })),
      };
    },

    get_overdue_invoices: async (input) => {
      const limit = boundedNumber(input.limit, 20, 20);

      const rows = await runQuery<{
        invoice_number: string | null;
        invoice_status: string | null;
        amount_chf: number | null;
        due_at: string | Date | null;
        customer_name: string | null;
        customer_email: string | null;
        tour_id: number | null;
        tour_label: string | null;
      }>(
        `SELECT ri.invoice_number, ri.invoice_status, ri.amount_chf, ri.due_at,
                COALESCE(ri.customer_name, t.customer_name) AS customer_name,
                COALESCE(ri.customer_email, t.customer_email) AS customer_email,
                ri.tour_id,
                COALESCE(t.canonical_object_label, t.object_label, t.bezeichnung) AS tour_label
         FROM tour_manager.renewal_invoices ri
         JOIN tour_manager.tours t ON t.id = ri.tour_id
         WHERE ri.invoice_status NOT IN ('paid', 'cancelled', 'archived')
           AND ri.due_at < NOW()
           AND ri.deleted_at IS NULL
         ORDER BY ri.due_at ASC
         LIMIT $1`,
        [limit],
      );

      return {
        count: rows.length,
        invoices: rows.map((r) => ({
          number: r.invoice_number,
          status: r.invoice_status,
          amount: r.amount_chf,
          dueAt: r.due_at instanceof Date ? r.due_at.toISOString().slice(0, 10) : r.due_at,
          customerName: r.customer_name,
          customerEmail: r.customer_email,
          tourId: r.tour_id,
          tourLabel: r.tour_label,
        })),
      };
    },

    get_invoice_stats: async () => {
      const renewalStats = await runQuery<{ status: string; cnt: string }>(
        `SELECT COALESCE(invoice_status, 'unknown') AS status, COUNT(*) AS cnt
         FROM tour_manager.renewal_invoices
         WHERE deleted_at IS NULL
         GROUP BY COALESCE(invoice_status, 'unknown')
         ORDER BY cnt DESC`,
      );

      const renewalOverdue = await runQuery<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM tour_manager.renewal_invoices
         WHERE invoice_status NOT IN ('paid', 'cancelled', 'archived')
           AND due_at < NOW()
           AND deleted_at IS NULL`,
      );

      const exxasStats = await runQuery<{ status: string; cnt: string }>(
        `SELECT COALESCE(exxas_status, 'unknown') AS status, COUNT(*) AS cnt
         FROM tour_manager.exxas_invoices
         WHERE deleted_at IS NULL
         GROUP BY COALESCE(exxas_status, 'unknown')
         ORDER BY cnt DESC`,
      );

      return {
        renewal: {
          byStatus: renewalStats.map((r) => ({ status: r.status, count: Number(r.cnt) })),
          overdue: Number(renewalOverdue[0]?.cnt || 0),
        },
        exxas: {
          byStatus: exxasStats.map((r) => ({ status: r.status, count: Number(r.cnt) })),
        },
      };
    },
  };
}

export const invoicesHandlers = createInvoicesHandlers({ query: defaultQuery });
