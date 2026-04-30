import { query, queryOne } from "@/lib/db";

const MAX_MEMORIES_PER_USER = 100;
const MAX_BODY_CHARS = 2000;

const FORBIDDEN_PATTERNS = [
  /password/i,
  /api[_-]?key/i,
  /secret/i,
  /(?:[A-Za-z0-9+/]{80,})={0,2}/,
];

export type AssistantMemory = {
  id: string;
  userId: string;
  body: string;
  source: string;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export function validateMemoryBody(body: string): string | null {
  if (!body || body.trim().length === 0) return "Body darf nicht leer sein";
  if (body.length > MAX_BODY_CHARS) return `Body darf max. ${MAX_BODY_CHARS} Zeichen haben`;
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(body)) return "Body enthält potenziell sensible Daten";
  }
  return null;
}

export async function listMemoriesForUser(userId: string, limit = 100): Promise<AssistantMemory[]> {
  const effectiveLimit = Math.min(Math.max(limit, 1), MAX_MEMORIES_PER_USER);
  return query<AssistantMemory>(
    `SELECT id, user_id AS "userId", body, source,
            conversation_id AS "conversationId",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM tour_manager.assistant_memories
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, effectiveLimit],
  );
}

export async function createMemory(
  userId: string,
  body: string,
  source: "explicit_user" | "confirmed_suggestion" | "admin_created",
  conversationId?: string,
): Promise<AssistantMemory> {
  const validationError = validateMemoryBody(body);
  if (validationError) throw new Error(validationError);

  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM tour_manager.assistant_memories
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (Number(countRow?.count || 0) >= MAX_MEMORIES_PER_USER) {
    throw new Error(`Maximal ${MAX_MEMORIES_PER_USER} Erinnerungen pro User erlaubt`);
  }

  const row = await queryOne<AssistantMemory>(
    `INSERT INTO tour_manager.assistant_memories (user_id, body, source, conversation_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id AS "userId", body, source,
               conversation_id AS "conversationId",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [userId, body.trim(), source, conversationId || null],
  );
  if (!row) throw new Error("Erinnerung konnte nicht erstellt werden");
  return row;
}

export async function softDeleteMemory(userId: string, id: string): Promise<boolean> {
  const rows = await query(
    `UPDATE tour_manager.assistant_memories
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );
  return rows.length >= 0;
}
