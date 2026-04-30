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

type CleanupSelectionRow = TourRow & {
  confirmation_required: boolean | null;
  confirmation_sent_at: string | Date | null;
  cleanup_sent_at: string | Date | null;
  cleanup_action: string | null;
  cleanup_action_at: string | Date | null;
  cleanup_completed: boolean | null;
  delete_requested_at: string | Date | null;
  delete_after_at: string | Date | null;
  customer_intent: string | null;
  customer_intent_source: string | null;
  customer_intent_note: string | null;
  customer_intent_updated_at: string | Date | null;
  customer_transfer_requested: boolean | null;
  customer_billing_attention: boolean | null;
  latest_session_created_at: string | Date | null;
  latest_session_expires_at: string | Date | null;
  latest_session_accessed_at: string | Date | null;
  latest_cleanup_log_action: string | null;
  latest_cleanup_log_at: string | Date | null;
  latest_cleanup_log_actor: string | null;
  latest_cleanup_log_details: Record<string, unknown> | null;
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

function isoDateTime(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizedEmail(value: unknown): string | null {
  const raw = text(value);
  return raw ? raw.toLowerCase() : null;
}

function optionalPositiveInteger(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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

const cleanupActionLabels: Record<string, string> = {
  weiterfuehren: "Weiterführen",
  weiterfuehren_pending_payment: "Weiterführen, Zahlung ausstehend",
  weiterfuehren_online: "Weiterführen, Online-Zahlung gewählt",
  weiterfuehren_qr: "Weiterführen, QR-Rechnung gewählt",
  weiterfuehren_review: "Weiterführen, manuelle Prüfung",
  archivieren: "Archivieren",
  uebertragen: "Übertragen",
  loeschen: "Löschen",
};

function cleanupActionLabel(action: string | null): string | null {
  if (!action) return null;
  return cleanupActionLabels[action] || action;
}

function normalizeCleanupSelection(row: CleanupSelectionRow) {
  return {
    tour: normalizeTour(row),
    confirmationRequired: Boolean(row.confirmation_required),
    confirmationSentAt: isoDateTime(row.confirmation_sent_at),
    cleanupSentAt: isoDateTime(row.cleanup_sent_at),
    cleanupAction: text(row.cleanup_action),
    cleanupActionLabel: cleanupActionLabel(text(row.cleanup_action)),
    cleanupActionAt: isoDateTime(row.cleanup_action_at),
    cleanupCompleted: Boolean(row.cleanup_completed),
    deleteRequestedAt: isoDateTime(row.delete_requested_at),
    deleteAfterAt: isoDateTime(row.delete_after_at),
    customerIntent: text(row.customer_intent)
      ? {
          value: text(row.customer_intent),
          source: text(row.customer_intent_source),
          note: text(row.customer_intent_note),
          updatedAt: isoDateTime(row.customer_intent_updated_at),
          transferRequested: Boolean(row.customer_transfer_requested),
          billingAttention: Boolean(row.customer_billing_attention),
        }
      : null,
    latestSession:
      row.latest_session_created_at || row.latest_session_expires_at || row.latest_session_accessed_at
        ? {
            createdAt: isoDateTime(row.latest_session_created_at),
            expiresAt: isoDateTime(row.latest_session_expires_at),
            lastAccessedAt: isoDateTime(row.latest_session_accessed_at),
          }
        : null,
    latestCleanupLog: row.latest_cleanup_log_action
      ? {
          action: row.latest_cleanup_log_action,
          createdAt: isoDateTime(row.latest_cleanup_log_at),
          actorRef: text(row.latest_cleanup_log_actor),
          details: row.latest_cleanup_log_details || null,
        }
      : null,
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
  {
    name: "get_cleanup_selections",
    description:
      "Liest Bereinigungslauf-Auswahl und Status pro Tour. Verwende dieses Tool bei Fragen wie „was hat der Kunde im Bereinigungslauf ausgewählt?“ nach Tour-ID, Kunden-ID, Kunden-E-Mail oder Suchbegriff.",
    input_schema: {
      type: "object",
      properties: {
        tour_id: { type: "number", description: "Tour-ID" },
        customer_id: { type: "number", description: "Kunden-ID aus core.customers/tour_manager.tours" },
        customer_email: { type: "string", description: "Kunden-E-Mail; berücksichtigt core.customers.email_aliases" },
        query: { type: "string", description: "Suchbegriff für Objekt, Kunde, E-Mail oder Matterport-Space-ID" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 10, max. 50)" },
      },
    },
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

    get_cleanup_selections: async (input) => {
      const email = normalizedEmail(input.customer_email);
      const customerId = optionalPositiveInteger(input.customer_id);
      const tourId = optionalPositiveInteger(input.tour_id);
      const q = text(input.query);
      if (!email && !customerId && !tourId && !q) {
        return { error: "Bitte Tour-ID, Kunden-ID, Kunden-E-Mail oder Suchbegriff angeben." };
      }

      const limit = boundedNumber(input.limit, 10, 50);
      const rows = await runQuery<CleanupSelectionRow>(
        `SELECT t.id, t.bezeichnung, t.object_label, t.canonical_object_label, t.customer_name, t.customer_email,
                t.customer_id, t.status, t.matterport_space_id, t.canonical_matterport_space_id,
                t.term_end_date, t.ablaufdatum, t.canonical_term_end_date, t.booking_order_no,
                t.confirmation_required, t.confirmation_sent_at,
                t.cleanup_sent_at, t.cleanup_action, t.cleanup_action_at, t.cleanup_completed,
                t.delete_requested_at, t.delete_after_at,
                t.customer_intent, t.customer_intent_source, t.customer_intent_note, t.customer_intent_updated_at,
                t.customer_transfer_requested, t.customer_billing_attention,
                s.created_at AS latest_session_created_at,
                s.expires_at AS latest_session_expires_at,
                s.last_accessed_at AS latest_session_accessed_at,
                al.action AS latest_cleanup_log_action,
                al.created_at AS latest_cleanup_log_at,
                al.actor_ref AS latest_cleanup_log_actor,
                al.details_json AS latest_cleanup_log_details
         FROM tour_manager.tours t
         LEFT JOIN core.customers c ON c.id = t.customer_id
         LEFT JOIN LATERAL (
           SELECT cs.created_at, cs.expires_at, cs.last_accessed_at
           FROM tour_manager.cleanup_sessions cs
           WHERE LOWER(TRIM(cs.customer_email)) = LOWER(TRIM(t.customer_email))
              OR ($1::text IS NOT NULL AND LOWER(TRIM(cs.customer_email)) = $1::text)
           ORDER BY cs.created_at DESC
           LIMIT 1
         ) s ON TRUE
         LEFT JOIN LATERAL (
           SELECT action, created_at, actor_ref, details_json
           FROM tour_manager.actions_log
           WHERE tour_id = t.id
             AND action ILIKE 'CLEANUP%'
           ORDER BY created_at DESC, id DESC
           LIMIT 1
         ) al ON TRUE
         WHERE ($1::text IS NULL OR LOWER(TRIM(t.customer_email)) = $1::text OR core.customer_email_matches($1::text, c.email, c.email_aliases))
           AND ($2::int IS NULL OR t.customer_id = $2::int)
           AND ($3::int IS NULL OR t.id = $3::int)
           AND (
             $4::text IS NULL
             OR t.bezeichnung ILIKE '%' || $4::text || '%'
             OR t.object_label ILIKE '%' || $4::text || '%'
             OR t.canonical_object_label ILIKE '%' || $4::text || '%'
             OR t.customer_name ILIKE '%' || $4::text || '%'
             OR t.customer_email ILIKE '%' || $4::text || '%'
             OR t.matterport_space_id ILIKE '%' || $4::text || '%'
             OR t.canonical_matterport_space_id ILIKE '%' || $4::text || '%'
           )
           AND (
             t.confirmation_required = TRUE
             OR t.cleanup_sent_at IS NOT NULL
             OR t.cleanup_action IS NOT NULL
             OR t.customer_intent IS NOT NULL
           )
         ORDER BY COALESCE(t.cleanup_action_at, t.cleanup_sent_at, t.confirmation_sent_at, t.updated_at) DESC NULLS LAST, t.id DESC
         LIMIT $5`,
        [email, customerId, tourId, q, limit],
      );
      return { count: rows.length, cleanupSelections: rows.map(normalizeCleanupSelection) };
    },
  };
}

export const toursHandlers = createToursHandlers({ query: defaultQuery });
