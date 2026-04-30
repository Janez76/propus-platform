/**
 * Tours-Tools — tour_manager.tours.
 *
 * Reales Schema:
 *   - matterport_space_id (TEXT)  ← nicht "matterport_id"
 *   - term_end_date (DATE)        ← Ablaufdatum
 *   - status TEXT (default 'ACTIVE', uppercase)
 *   - customer_name / customer_email direkt in der Tabelle
 */

import type { ToolDefinition, ToolHandler } from "./index";
import { query, queryOne } from "@/lib/db";

export const toursTools: ToolDefinition[] = [
  {
    name: "get_tours_expiring_soon",
    description:
      "Listet Touren, deren term_end_date in den nächsten N Tagen liegt oder bereits abgelaufen ist. Default 30 Tage.",
    input_schema: {
      type: "object",
      properties: {
        days_window: { type: "number", description: "Tage in die Zukunft (Default 30)" },
      },
    },
  },
  {
    name: "get_tour_status",
    description: "Detailstatus einer Tour anhand id oder matterport_space_id.",
    input_schema: {
      type: "object",
      properties: {
        tour_id: { type: "string", description: "id (numeric) oder matterport_space_id" },
      },
      required: ["tour_id"],
    },
  },
  {
    name: "count_active_tours",
    description: "Anzahl aktiver Touren (status = 'ACTIVE').",
    input_schema: { type: "object", properties: {} },
  },
];

export const toursHandlers: Record<string, ToolHandler> = {
  get_tours_expiring_soon: async (input) => {
    const days = Math.max(1, Math.min(180, Number(input.days_window) || 30));

    const rows = await query(
      `SELECT
         t.id,
         t.matterport_space_id,
         t.customer_name,
         t.customer_email,
         t.bezeichnung,
         t.object_label,
         t.term_end_date                           AS expires_at,
         t.status,
         (t.term_end_date - CURRENT_DATE)          AS days_left,
         t.customer_intent
       FROM tour_manager.tours t
       WHERE t.status = 'ACTIVE'
         AND t.term_end_date IS NOT NULL
         AND t.term_end_date <= CURRENT_DATE + ($1 || ' days')::interval
       ORDER BY t.term_end_date ASC NULLS LAST`,
      [days],
    );
    return { count: rows.length, tours: rows };
  },

  get_tour_status: async (input) => {
    const raw = String(input.tour_id ?? "").trim();
    if (!raw) return { error: "tour_id fehlt" };

    // Strict-numeric: nur "123" matcht id; "123abc" wird ausschliesslich gegen
    // matterport_space_id geprueft (verhindert Number.parseInt-Praefix-Trick).
    const numericId = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
    const row = await queryOne(
      `SELECT
         t.id,
         t.matterport_space_id,
         t.customer_name,
         t.customer_email,
         t.bezeichnung,
         t.object_label,
         t.matterport_created_at,
         t.term_end_date,
         t.status,
         t.customer_intent,
         t.customer_intent_source,
         t.customer_intent_note
       FROM tour_manager.tours t
       WHERE ($1::int IS NOT NULL AND t.id = $1::int)
          OR t.matterport_space_id = $2
       LIMIT 1`,
      [numericId, raw],
    );
    return row ?? { error: "Tour nicht gefunden" };
  },

  count_active_tours: async () => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM tour_manager.tours WHERE status = 'ACTIVE'`,
    );
    return { active: row?.count ?? 0 };
  },
};
