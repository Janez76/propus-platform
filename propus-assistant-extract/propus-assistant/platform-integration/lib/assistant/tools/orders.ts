/**
 * Orders-Tools — Aufträge im Propus-System.
 *
 * HINWEIS: Die SQL-Queries hier sind generisch. Passe die Spaltennamen
 * an dein tatsächliches Schema in `propus-platform` an. Suchpfade:
 *   - Tabelle "orders" oder "auftraege"
 *   - Statusfeld evtl. "status" oder "auftrag_status"
 *   - Du verwendest raw SQL, kein ORM
 */

import type { ToolDefinition, ToolHandler } from './index';

// Helper für DB-Zugriff. ANPASSEN an deinen tatsächlichen DB-Client.
async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  // TODO: deinen pg-Client / Drizzle / was auch immer hier einhängen.
  // Beispiel mit `pg`:
  //
  //   import { Pool } from 'pg';
  //   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  //   const result = await pool.query(sql, params);
  //   return result.rows;
  //
  throw new Error('DB-Client nicht konfiguriert — siehe lib/assistant/tools/orders.ts');
}

export const ordersTools: ToolDefinition[] = [
  {
    name: 'get_open_orders',
    description:
      'Listet offene Aufträge (nicht abgeschlossen, nicht storniert). Standardmässig die nächsten 14 Tage.',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: {
          type: 'number',
          description: 'Wie viele Tage in die Zukunft schauen (Default: 14)',
        },
        limit: { type: 'number', description: 'Max. Anzahl (Default: 20)' },
      },
    },
  },
  {
    name: 'get_order_by_id',
    description: 'Holt einen Auftrag inkl. Kundendaten, Status und verknüpften Touren.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'UUID oder Auftragsnummer' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'search_orders',
    description: 'Sucht Aufträge nach Kundenname, Adresse oder Stichwort.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Suchbegriff' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_today_schedule',
    description: 'Heutige Termine / Shootings inkl. Adresse und Uhrzeit.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'update_order_status',
    description:
      'Setzt den Status eines Auftrags. SCHREIBENDE AKTION — Bestätigung des Users einholen.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
        new_status: {
          type: 'string',
          enum: ['draft', 'confirmed', 'shooting_done', 'in_processing', 'delivered', 'cancelled'],
        },
        note: { type: 'string', description: 'Optionale Notiz' },
      },
      required: ['order_id', 'new_status'],
    },
  },
  {
    name: 'create_order_draft',
    description:
      'Legt einen Auftrags-Entwurf an (Status=draft). SCHREIBENDE AKTION — Bestätigung einholen.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' },
        customer_email: { type: 'string' },
        property_address: { type: 'string' },
        services: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['photography', 'matterport', 'drone', 'floorplan', 'staging', 'video'],
          },
        },
        scheduled_at: { type: 'string', description: 'ISO 8601 Datum/Zeit' },
        notes: { type: 'string' },
      },
      required: ['customer_name', 'property_address', 'services'],
    },
  },
];

export const ordersHandlers: Record<string, ToolHandler> = {
  get_open_orders: async (input) => {
    const days = (input.days_ahead as number) ?? 14;
    const limit = (input.limit as number) ?? 20;
    const rows = await query(
      `SELECT id, customer_name, property_address, scheduled_at, status, services
       FROM orders
       WHERE status NOT IN ('delivered', 'cancelled')
         AND (scheduled_at IS NULL OR scheduled_at <= NOW() + ($1 || ' days')::interval)
       ORDER BY scheduled_at NULLS LAST
       LIMIT $2`,
      [days, limit],
    );
    return { count: rows.length, orders: rows };
  },

  get_order_by_id: async (input) => {
    const rows = await query(
      `SELECT o.*, COALESCE(json_agg(t.*) FILTER (WHERE t.id IS NOT NULL), '[]') AS tours
       FROM orders o
       LEFT JOIN tours t ON t.order_id = o.id
       WHERE o.id::text = $1 OR o.order_number = $1
       GROUP BY o.id`,
      [input.order_id],
    );
    if (rows.length === 0) return { error: 'Auftrag nicht gefunden' };
    return rows[0];
  },

  search_orders: async (input) => {
    const limit = (input.limit as number) ?? 10;
    const q = `%${input.query}%`;
    const rows = await query(
      `SELECT id, customer_name, property_address, scheduled_at, status
       FROM orders
       WHERE customer_name ILIKE $1
          OR property_address ILIKE $1
          OR notes ILIKE $1
       ORDER BY scheduled_at DESC NULLS LAST
       LIMIT $2`,
      [q, limit],
    );
    return { count: rows.length, orders: rows };
  },

  get_today_schedule: async () => {
    const rows = await query(
      `SELECT id, customer_name, property_address, scheduled_at, services, status
       FROM orders
       WHERE scheduled_at::date = CURRENT_DATE
         AND status NOT IN ('cancelled')
       ORDER BY scheduled_at`,
    );
    return { date: new Date().toISOString().slice(0, 10), count: rows.length, schedule: rows };
  },

  update_order_status: async (input, ctx) => {
    await query(
      `UPDATE orders SET status = $2, updated_at = NOW(), updated_by = $3
       WHERE id::text = $1 OR order_number = $1`,
      [input.order_id, input.new_status, ctx.userId],
    );
    return { ok: true, order_id: input.order_id, new_status: input.new_status };
  },

  create_order_draft: async (input, ctx) => {
    const rows = await query<{ id: string; order_number: string }>(
      `INSERT INTO orders
        (customer_name, customer_email, property_address, services, scheduled_at, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)
       RETURNING id, order_number`,
      [
        input.customer_name,
        input.customer_email ?? null,
        input.property_address,
        JSON.stringify(input.services),
        input.scheduled_at ?? null,
        input.notes ?? null,
        ctx.userId,
      ],
    );
    return { ok: true, order: rows[0] };
  },
};
