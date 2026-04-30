/**
 * Tours-Tools — Matterport-Touren-Lifecycle.
 * Liest aus deiner `tours`-Tabelle (siehe WORKFLOW_TOURS.md).
 */

import type { ToolDefinition, ToolHandler } from './index';

async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  throw new Error('DB-Client nicht konfiguriert — siehe lib/assistant/tools/tours.ts');
}

export const toursTools: ToolDefinition[] = [
  {
    name: 'get_tours_expiring_soon',
    description:
      'Listet Touren, die in den nächsten N Tagen ablaufen oder bereits abgelaufen sind.',
    input_schema: {
      type: 'object',
      properties: {
        days_window: {
          type: 'number',
          description: 'Tage in die Zukunft (Default: 30)',
        },
      },
    },
  },
  {
    name: 'get_tour_status',
    description: 'Detailstatus einer einzelnen Tour: Laufzeit, Renewal-Stufe, Kunde.',
    input_schema: {
      type: 'object',
      properties: {
        tour_id: { type: 'string' },
      },
      required: ['tour_id'],
    },
  },
  {
    name: 'count_active_tours',
    description: 'Wie viele Touren sind gerade aktiv?',
    input_schema: { type: 'object', properties: {} },
  },
];

export const toursHandlers: Record<string, ToolHandler> = {
  get_tours_expiring_soon: async (input) => {
    const days = (input.days_window as number) ?? 30;
    const rows = await query(
      `SELECT t.id, t.matterport_id, t.customer_name, t.activated_at,
              t.activated_at + INTERVAL '6 months' AS expires_at,
              t.renewal_stage, t.status,
              EXTRACT(DAY FROM (t.activated_at + INTERVAL '6 months') - NOW()) AS days_left
       FROM tours t
       WHERE t.status IN ('active', 'renewal_pending')
         AND t.activated_at + INTERVAL '6 months' <= NOW() + ($1 || ' days')::interval
       ORDER BY expires_at`,
      [days],
    );
    return { count: rows.length, tours: rows };
  },

  get_tour_status: async (input) => {
    const rows = await query(
      `SELECT t.*, o.customer_name, o.property_address
       FROM tours t
       LEFT JOIN orders o ON o.id = t.order_id
       WHERE t.id::text = $1 OR t.matterport_id = $1`,
      [input.tour_id],
    );
    if (rows.length === 0) return { error: 'Tour nicht gefunden' };
    return rows[0];
  },

  count_active_tours: async () => {
    const rows = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM tours WHERE status = 'active'`,
    );
    return { active: rows[0]?.count ?? 0 };
  },
};
