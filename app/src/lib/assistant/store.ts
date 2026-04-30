import { query, queryOne } from "@/lib/db";

export type AssistantToolCallRecord = {
  name: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  error?: string;
};

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
