import { query, queryOne } from "@/lib/db";

export type AssistantToolCallRecord = {
  name: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  error?: string;
};

export type AssistantConversationLinks = {
  customerId?: number | null;
  bookingOrderNo?: number | null;
  tourId?: number | null;
};

export type AssistantHistoryRow = {
  id: string;
  title: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  customerId: number | null;
  customerName: string | null;
  bookingOrderNo: number | null;
  bookingAddress: string | null;
  tourId: number | null;
  tourLabel: string | null;
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
};

function asPositiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function walkObject(value: unknown, visit: (key: string, entry: unknown) => void): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) walkObject(entry, visit);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    visit(key, entry);
    walkObject(entry, visit);
  }
}

export function deriveConversationLinksFromToolCalls(toolCalls: AssistantToolCallRecord[]): AssistantConversationLinks {
  const links: AssistantConversationLinks = {};
  for (const call of toolCalls) {
    const sources = [call.input, call.output];
    for (const source of sources) {
      walkObject(source, (key, value) => {
        const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
        const n = asPositiveInt(value);
        if (!n) return;
        if (links.customerId == null && normalizedKey === "customerid") links.customerId = n;
        if (links.bookingOrderNo == null && (normalizedKey === "bookingorderno" || normalizedKey === "orderno")) links.bookingOrderNo = n;
        if (links.tourId == null && normalizedKey === "tourid") links.tourId = n;
      });
    }
  }
  return links;
}

export async function ensureConversation(input: {
  conversationId?: string;
  userId: string;
  userEmail: string;
  title?: string;
}): Promise<string> {
  const provided = String(input.conversationId || "").trim();
  if (provided) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id
       FROM tour_manager.assistant_conversations
       WHERE id = $1 AND user_id = $2`,
      [provided, input.userId],
    );
    if (existing?.id) return existing.id;
  }

  const row = await queryOne<{ id: string }>(
    `INSERT INTO tour_manager.assistant_conversations (user_id, user_email, title)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [input.userId, input.userEmail, input.title || null],
  );
  if (!row?.id) throw new Error("Assistant-Konversation konnte nicht erstellt werden");
  return row.id;
}

export async function insertAssistantMessage(input: {
  conversationId: string;
  role: "user" | "assistant" | "tool";
  content: unknown;
  audioUrl?: string | null;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO tour_manager.assistant_messages (conversation_id, role, content, audio_url)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id`,
    [input.conversationId, input.role, JSON.stringify(input.content), input.audioUrl || null],
  );
  if (!row?.id) throw new Error("Assistant-Nachricht konnte nicht gespeichert werden");
  return row.id;
}

export async function insertAssistantToolCalls(input: {
  conversationId: string;
  messageId?: string | null;
  toolCalls: AssistantToolCallRecord[];
}): Promise<void> {
  for (const call of input.toolCalls) {
    await query(
      `INSERT INTO tour_manager.assistant_tool_calls
         (conversation_id, message_id, tool_name, input, output, status, error_message, duration_ms)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
      [
        input.conversationId,
        input.messageId || null,
        call.name,
        JSON.stringify(call.input ?? null),
        JSON.stringify(call.output ?? null),
        call.error ? "error" : "success",
        call.error || null,
        call.durationMs,
      ],
    );
  }
}

export async function updateConversationLinksFromToolCalls(input: {
  conversationId: string;
  toolCalls: AssistantToolCallRecord[];
}): Promise<AssistantConversationLinks> {
  const links = deriveConversationLinksFromToolCalls(input.toolCalls);
  if (links.customerId == null && links.bookingOrderNo == null && links.tourId == null) return links;

  await query(
    `UPDATE tour_manager.assistant_conversations
     SET customer_id = COALESCE(customer_id, $2),
         booking_order_no = COALESCE(booking_order_no, $3),
         tour_id = COALESCE(tour_id, $4),
         updated_at = NOW()
     WHERE id = $1`,
    [input.conversationId, links.customerId ?? null, links.bookingOrderNo ?? null, links.tourId ?? null],
  );
  return links;
}

export async function listAssistantHistory(input: { userId: string; limit?: number }): Promise<AssistantHistoryRow[]> {
  const limit = Math.min(Math.max(Number(input.limit || 20), 1), 20);
  return query<AssistantHistoryRow>(
    `SELECT
       c.id,
       c.title,
       c.created_at AS "createdAt",
       c.updated_at AS "updatedAt",
       c.customer_id AS "customerId",
       cust.name AS "customerName",
       c.booking_order_no AS "bookingOrderNo",
       o.address AS "bookingAddress",
       c.tour_id AS "tourId",
       COALESCE(t.canonical_object_label, t.object_label, t.bezeichnung) AS "tourLabel",
       (
         SELECT m.content->>'text'
         FROM tour_manager.assistant_messages m
         WHERE m.conversation_id = c.id AND m.role = 'user'
         ORDER BY m.created_at DESC
         LIMIT 1
       ) AS "lastUserMessage",
       (
         SELECT m.content->>'text'
         FROM tour_manager.assistant_messages m
         WHERE m.conversation_id = c.id AND m.role = 'assistant'
         ORDER BY m.created_at DESC
         LIMIT 1
       ) AS "lastAssistantMessage"
     FROM tour_manager.assistant_conversations c
     LEFT JOIN core.customers cust ON cust.id = c.customer_id
     LEFT JOIN booking.orders o ON o.order_no = c.booking_order_no
     LEFT JOIN tour_manager.tours t ON t.id = c.tour_id
     WHERE c.user_id = $1
     ORDER BY c.updated_at DESC
     LIMIT $2`,
    [input.userId, limit],
  );
}

export async function writeAudit(input: {
  userId: string;
  conversationId?: string;
  action: string;
  payload: unknown;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await query(
    `INSERT INTO tour_manager.assistant_audit_log
       (user_id, conversation_id, action, payload, ip_address, user_agent)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [
      input.userId,
      input.conversationId || null,
      input.action,
      JSON.stringify(input.payload ?? null),
      input.ipAddress || null,
      input.userAgent || null,
    ],
  );
}
