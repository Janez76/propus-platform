import { query as defaultQuery } from "@/lib/db";
import type { ToolDefinition, ToolHandler } from "./index";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

type PosteingangDeps = {
  query: QueryFn;
};

function boundedNumber(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

export const posteingangTools: ToolDefinition[] = [
  {
    name: "search_posteingang_conversations",
    description: "Sucht Posteingang-Konversationen nach Betreff, Kunde oder Text-Ausschnitt.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 10, max. 30)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_recent_posteingang_messages",
    description: "Listet aktuelle Posteingang-Nachrichten.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "Maximale Anzahl (Default: 10, max. 30)" } },
    },
  },
  {
    name: "get_open_tasks",
    description: "Listet offene Posteingang-Aufgaben.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "Maximale Anzahl (Default: 10, max. 30)" } },
    },
  },
];

export function createPosteingangHandlers(deps: PosteingangDeps): Record<string, ToolHandler> {
  const runQuery = deps.query;

  return {
    search_posteingang_conversations: async (input) => {
      const q = String(input.query || "").trim();
      if (!q) return { count: 0, conversations: [] };
      const limit = boundedNumber(input.limit, 10, 30);
      const rows = await runQuery(
        `SELECT c.id, c.subject, c.status, c.priority, c.customer_id, cust.name AS customer_name,
                c.last_message_at, c.created_at
         FROM tour_manager.posteingang_conversations c
         LEFT JOIN core.customers cust ON cust.id = c.customer_id
         WHERE c.subject ILIKE $1
            OR cust.name ILIKE $1
            OR EXISTS (
              SELECT 1 FROM tour_manager.posteingang_messages m
              WHERE m.conversation_id = c.id
                AND (m.body_text ILIKE $1 OR m.subject ILIKE $1)
            )
         ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
         LIMIT $2`,
        [`%${q}%`, limit],
      );
      return { count: rows.length, conversations: rows };
    },

    get_recent_posteingang_messages: async (input) => {
      const limit = boundedNumber(input.limit, 10, 30);
      const rows = await runQuery(
        `SELECT m.id, m.conversation_id, m.direction, m.from_name, m.from_email,
                m.subject, m.body_text, m.sent_at, c.status AS conversation_status
         FROM tour_manager.posteingang_messages m
         JOIN tour_manager.posteingang_conversations c ON c.id = m.conversation_id
         ORDER BY m.sent_at DESC NULLS LAST, m.id DESC
         LIMIT $1`,
        [limit],
      );
      return { count: rows.length, messages: rows };
    },

    get_open_tasks: async (input) => {
      const limit = boundedNumber(input.limit, 10, 30);
      const rows = await runQuery(
        `SELECT id, title, description, status, priority, due_at, conversation_id,
                customer_id, order_id, tour_id, assigned_admin_user_id
         FROM tour_manager.posteingang_tasks
         WHERE status IN ('open', 'in_progress')
         ORDER BY due_at NULLS LAST, priority DESC, id DESC
         LIMIT $1`,
        [limit],
      );
      return { count: rows.length, tasks: rows };
    },
  };
}

export const posteingangHandlers = createPosteingangHandlers({ query: defaultQuery });
