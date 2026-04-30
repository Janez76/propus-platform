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
  expiresAt: string | null;
};

export function validateMemoryBody(body: string): string | null {
  if (!body || body.trim().length === 0) return "Body darf nicht leer sein";
  if (body.length > MAX_BODY_CHARS) return `Body darf max. ${MAX_BODY_CHARS} Zeichen haben`;
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(body)) return "Body enthält potenziell sensible Daten";
  }
  return null;
}

const ACTIVE_MEMORY_CONDITION = `user_id = $1 AND deleted_at IS NULL
     AND (expires_at IS NULL OR expires_at > NOW())`;

export async function listMemoriesForUser(userId: string, limit = 100): Promise<AssistantMemory[]> {
  const effectiveLimit = Math.min(Math.max(limit, 1), MAX_MEMORIES_PER_USER);
  return query<AssistantMemory>(
    `SELECT id, user_id AS "userId", body, source,
            conversation_id AS "conversationId",
            created_at AS "createdAt", updated_at AS "updatedAt",
            expires_at AS "expiresAt"
     FROM tour_manager.assistant_memories
     WHERE ${ACTIVE_MEMORY_CONDITION}
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, effectiveLimit],
  );
}

export function tokenizeForMatch(text: string): Set<string> {
  const raw = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/);
  const out = new Set<string>();
  for (const t of raw) {
    if (t.length >= 3) out.add(t);
  }
  return out;
}

export type MemoryPromptRow = { id: string; body: string; updatedAt: string };

/**
 * Pure ranking: Stichwort-Overlap mit userMessage, dann chronologisch auffüllen.
 */
export function rankMemoryBodiesForPrompt(rows: MemoryPromptRow[], userMessage: string, maxBodies: number): string[] {
  const tokens = tokenizeForMatch(userMessage);
  const scored = rows.map((r) => {
    const bodyTokens = tokenizeForMatch(r.body);
    let score = 0;
    for (const t of tokens) {
      if (bodyTokens.has(t)) score += 1;
    }
    return { row: r, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.row.updatedAt).getTime() - new Date(a.row.updatedAt).getTime();
  });

  const picked: MemoryPromptRow[] = [];
  const seen = new Set<string>();
  for (const { row } of scored) {
    if (row.body.trim() && !seen.has(row.id)) {
      picked.push(row);
      seen.add(row.id);
    }
    if (picked.length >= maxBodies) break;
  }

  if (picked.length < maxBodies) {
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      picked.push(row);
      seen.add(row.id);
      if (picked.length >= maxBodies) break;
    }
  }

  return picked.map((r) => r.body);
}

/**
 * Wählt Erinnerungen für den Prompt: Treffer mit Stichwort-Overlap zur aktuellen Nachricht,
 * ergänzt durch die jüngsten Einträge (Deckel über Zeichenbudget im System-Prompt).
 */
export async function selectMemoriesForPrompt(userId: string, userMessage: string, maxBodies = 35): Promise<string[]> {
  const rows = await query<AssistantMemory>(
    `SELECT id, user_id AS "userId", body, source,
            conversation_id AS "conversationId",
            created_at AS "createdAt", updated_at AS "updatedAt",
            expires_at AS "expiresAt"
     FROM tour_manager.assistant_memories
     WHERE ${ACTIVE_MEMORY_CONDITION}
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, MAX_MEMORIES_PER_USER],
  );

  const slim: MemoryPromptRow[] = rows.map((r) => ({ id: r.id, body: r.body, updatedAt: r.updatedAt }));
  return rankMemoryBodiesForPrompt(slim, userMessage, maxBodies);
}

export async function createMemory(
  userId: string,
  body: string,
  source: "explicit_user" | "confirmed_suggestion" | "admin_created",
  conversationId?: string,
  expiresAt?: Date | null,
): Promise<AssistantMemory> {
  const validationError = validateMemoryBody(body);
  if (validationError) throw new Error(validationError);

  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM tour_manager.assistant_memories
     WHERE user_id = $1 AND deleted_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [userId],
  );
  if (Number(countRow?.count || 0) >= MAX_MEMORIES_PER_USER) {
    throw new Error(`Maximal ${MAX_MEMORIES_PER_USER} Erinnerungen pro User erlaubt`);
  }

  const row = await queryOne<AssistantMemory>(
    `INSERT INTO tour_manager.assistant_memories (user_id, body, source, conversation_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id AS "userId", body, source,
               conversation_id AS "conversationId",
               created_at AS "createdAt", updated_at AS "updatedAt",
               expires_at AS "expiresAt"`,
    [userId, body.trim(), source, conversationId || null, expiresAt ?? null],
  );
  if (!row) throw new Error("Erinnerung konnte nicht erstellt werden");
  return row;
}

export async function softDeleteMemory(userId: string, id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE tour_manager.assistant_memories
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, userId],
  );
  return rows.length > 0;
}
