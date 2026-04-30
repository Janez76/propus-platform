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
    description:
      "Nutze dieses Tool wenn nach E-Mails, Konversationen oder Nachrichten von/an bestimmte Personen gefragt wird. Durchsucht Betreff, Kundenname und Nachrichtentext.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff (Name, Betreff, E-Mail, Stichwort)" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 10, max. 30)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_recent_posteingang_messages",
    description:
      "Nutze dieses Tool wenn nach den neuesten E-Mails, letzten Nachrichten oder aktuellen Posteingängen gefragt wird.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "Maximale Anzahl (Default: 10, max. 30)" } },
    },
  },
  {
    name: "get_open_tasks",
    description:
      "Nutze dieses Tool wenn nach offenen Aufgaben, Pendenzen oder To-Dos gefragt wird.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "Maximale Anzahl (Default: 10, max. 30)" } },
    },
  },
  {
    name: "get_posteingang_conversation_detail",
    description:
      "Nutze dieses Tool wenn du den vollständigen Thread einer bestimmten Konversation brauchst: alle Nachrichten, Tags, Aufgaben und verknüpfte Entitäten.",
    input_schema: {
      type: "object",
      properties: { conversation_id: { type: "number", description: "Konversations-ID" } },
      required: ["conversation_id"],
    },
  },
  {
    name: "get_posteingang_stats",
    description:
      "Nutze dieses Tool wenn nach einer Übersicht, Statistiken oder dem aktuellen Stand des Posteingangs gefragt wird.",
    input_schema: { type: "object", properties: {} },
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

    get_posteingang_conversation_detail: async (input) => {
      const convId = Number(input.conversation_id);
      if (!Number.isInteger(convId) || convId <= 0) return { error: "Ungültige Konversations-ID" };

      const convRows = await runQuery<{
        id: number; subject: string | null; status: string; priority: string | null;
        customer_id: number | null; customer_name: string | null; customer_email: string | null;
        assigned_to: string | null; created_at: string | Date; last_message_at: string | Date | null;
      }>(
        `SELECT c.id, c.subject, c.status, c.priority, c.customer_id,
                cust.name AS customer_name, cust.email AS customer_email,
                c.assigned_to, c.created_at, c.last_message_at
         FROM tour_manager.posteingang_conversations c
         LEFT JOIN core.customers cust ON cust.id = c.customer_id
         WHERE c.id = $1
         LIMIT 1`,
        [convId],
      );
      if (convRows.length === 0) return { error: "Konversation nicht gefunden" };
      const conv = convRows[0];

      const messages = await runQuery<{
        direction: string; from_name: string | null; from_email: string | null;
        subject: string | null; body_text: string | null; sent_at: string | Date | null;
      }>(
        `SELECT direction, from_name, from_email, subject, LEFT(body_text, 300) AS body_text, sent_at
         FROM tour_manager.posteingang_messages
         WHERE conversation_id = $1
         ORDER BY sent_at ASC NULLS LAST, id ASC
         LIMIT 30`,
        [convId],
      );

      const tags = await runQuery<{ name: string }>(
        `SELECT name FROM tour_manager.posteingang_tags WHERE conversation_id = $1`,
        [convId],
      );

      const tasks = await runQuery<{ id: number; title: string; status: string; due_at: string | Date | null }>(
        `SELECT id, title, status, due_at
         FROM tour_manager.posteingang_tasks
         WHERE conversation_id = $1
         ORDER BY id DESC
         LIMIT 10`,
        [convId],
      );

      return {
        conversation: {
          id: conv.id,
          subject: conv.subject,
          status: conv.status,
          priority: conv.priority,
          assignedTo: conv.assigned_to,
          createdAt: conv.created_at instanceof Date ? conv.created_at.toISOString() : conv.created_at,
          lastMessageAt: conv.last_message_at instanceof Date ? conv.last_message_at.toISOString() : conv.last_message_at,
          customer: conv.customer_id ? { id: conv.customer_id, name: conv.customer_name, email: conv.customer_email } : null,
        },
        messages: messages.map((m) => ({
          direction: m.direction,
          fromName: m.from_name,
          fromEmail: m.from_email,
          subject: m.subject,
          body: m.body_text,
          sentAt: m.sent_at instanceof Date ? m.sent_at.toISOString() : m.sent_at,
        })),
        tags: tags.map((t) => t.name),
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.due_at instanceof Date ? t.due_at.toISOString().slice(0, 10) : t.due_at })),
      };
    },

    get_posteingang_stats: async () => {
      const statusCounts = await runQuery<{ status: string; cnt: string }>(
        `SELECT status, COUNT(*) AS cnt
         FROM tour_manager.posteingang_conversations
         GROUP BY status`,
      );

      const openTasks = await runQuery<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM tour_manager.posteingang_tasks
         WHERE status IN ('open', 'in_progress')`,
      );

      const avgResponse = await runQuery<{ avg_hours: number | null }>(
        `SELECT EXTRACT(EPOCH FROM AVG(first_reply.reply_at - c.created_at)) / 3600 AS avg_hours
         FROM tour_manager.posteingang_conversations c
         CROSS JOIN LATERAL (
           SELECT MIN(m.sent_at) AS reply_at
           FROM tour_manager.posteingang_messages m
           WHERE m.conversation_id = c.id AND m.direction = 'outbound'
         ) first_reply
         WHERE first_reply.reply_at IS NOT NULL
           AND c.created_at >= NOW() - INTERVAL '30 days'`,
      );

      const statusMap: Record<string, number> = {};
      for (const row of statusCounts) statusMap[row.status] = Number(row.cnt);

      return {
        conversations: statusMap,
        openTasks: Number(openTasks[0]?.cnt || 0),
        avgResponseTimeHours: avgResponse[0]?.avg_hours != null ? Math.round(avgResponse[0].avg_hours * 10) / 10 : null,
      };
    },
  };
}

export const posteingangHandlers = createPosteingangHandlers({ query: defaultQuery });
