/**
 * Audit-Logging für schreibende Assistant-Aktionen.
 * Schreibt in `assistant.audit_log` (Migration 045).
 */

import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface AuditEntry {
  userId: string;
  conversationId?: string;
  action: string;
  payload: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO assistant.audit_log
         (user_id, conversation_id, action, payload, ip_address, user_agent)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        entry.userId,
        entry.conversationId ?? null,
        entry.action,
        JSON.stringify(entry.payload),
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
      ],
    );
  } catch (err) {
    logger.error("[ASSISTANT_AUDIT] write failed", {
      error: err instanceof Error ? err.message : String(err),
      action: entry.action,
      userId: entry.userId,
    });
  }
}
