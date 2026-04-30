/**
 * Audit-Logging für alle Assistant-Aktionen.
 * Kritisch für SCHREIBENDE Operationen — Nachvollziehbarkeit.
 */

export interface AuditEntry {
  userId: string;
  conversationId?: string;
  action: string;
  payload: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  // TODO: an deinen DB-Client anbinden.
  //
  // Beispiel mit pg:
  //   await pool.query(
  //     `INSERT INTO assistant_audit_log
  //       (user_id, conversation_id, action, payload, ip_address, user_agent)
  //      VALUES ($1, $2, $3, $4, $5, $6)`,
  //     [entry.userId, entry.conversationId ?? null, entry.action,
  //      JSON.stringify(entry.payload), entry.ipAddress ?? null, entry.userAgent ?? null],
  //   );

  // Fallback: Console-Log
  console.log('[ASSISTANT_AUDIT]', JSON.stringify(entry));
}
