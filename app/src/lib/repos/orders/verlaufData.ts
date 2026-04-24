import "server-only";
import { query, queryOne } from "@/lib/db";

export type VerlaufFilterInput = {
  eventType?: string;
  from?: string;
  to?: string;
};

export type EventEntry = {
  id: string;
  kind: "event" | "status";
  event_type: string;
  actor: string | null;
  actor_role: string | null;
  description: string;
  from_status?: string | null;
  to_status?: string | null;
  created_at: string;
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  status_changed: "Status geändert",
  billing_updated: "Rechnungsdaten aktualisiert",
  schedule_updated: "Termin aktualisiert",
  services_updated: "Leistungen aktualisiert",
  photographer_assigned: "Mitarbeiter zugewiesen",
  order_created: "Bestellung erstellt",
  confirmation_sent: "Bestätigung gesendet",
  review_requested: "Bewertung angefordert",
  object_updated: "Objekt aktualisiert",
  pricing_updated: "Preis aktualisiert",
  note_added: "Notiz hinzugefügt",
  file_uploaded: "Datei hochgeladen",
  folder_created: "Ordner erstellt",
  calendar_synced: "Kalender synchronisiert",
  message_sent: "Nachricht gesendet",
  message_deleted: "Nachricht gelöscht",
  folder_updated: "Ordner verknüpft",
};

/**
 * Lädt zusammengeführten Event-/Status-Verlauf für eine Bestellung.
 * Wird von `verlauf/page` und dem Order-Edit-Shell-POC wiederverwendet.
 */
export async function loadOrderVerlaufData(
  orderId: string,
  sp: VerlaufFilterInput,
): Promise<EventEntry[] | null> {
  const evF = (sp.eventType ?? "").trim();
  const fromD = sp.from || "";
  const toD = sp.to || "";
  const filterStatusOnly = evF === "status_changed";

  const orderCheck = await queryOne<{ order_no: number }>(`
    SELECT order_no FROM booking.orders WHERE order_no = $1
  `, [orderId]);
  if (!orderCheck) {
    return null;
  }

  const evConds: string[] = ["order_no = $1"];
  const evParams: (string | number)[] = [orderId];
  let p = 2;
  if (evF && !filterStatusOnly) {
    evConds.push(`event_type = $${p}`);
    evParams.push(evF);
    p += 1;
  }
  if (fromD) {
    evConds.push(`created_at::date >= $${p}::date`);
    evParams.push(fromD);
    p += 1;
  }
  if (toD) {
    evConds.push(`created_at::date <= $${p}::date`);
    evParams.push(toD);
    p += 1;
  }

  const stConds: string[] = ["order_no = $1"];
  const stParams: (string | number)[] = [orderId];
  let s = 2;
  if (fromD) {
    stConds.push(`created_at::date >= $${s}::date`);
    stParams.push(fromD);
    s += 1;
  }
  if (toD) {
    stConds.push(`created_at::date <= $${s}::date`);
    stParams.push(toD);
    s += 1;
  }

  const [eventLog, statusAudit] = await Promise.all([
    !filterStatusOnly
      ? query<{
          id: number;
          event_type: string;
          actor_user: string | null;
          actor_role: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        }>(`
        SELECT id, event_type, actor_user, actor_role, metadata, created_at
        FROM booking.order_event_log
        WHERE ${evConds.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT 200
      `, evParams)
      : Promise.resolve([]),

    !evF || filterStatusOnly
      ? query<{
          id: number;
          from_status: string | null;
          to_status: string;
          source: string | null;
          actor_id: string | null;
          created_at: string;
        }>(`
        SELECT id, from_status, to_status, source, actor_id, created_at
        FROM booking.order_status_audit
        WHERE ${stConds.join(" AND ")}
        ORDER BY created_at DESC
      `, stParams)
      : Promise.resolve([]),
  ]);

  return [
    ...eventLog.map((e) => ({
      id: `event-${e.id}`,
      kind: "event" as const,
      event_type: e.event_type,
      actor: e.actor_user,
      actor_role: e.actor_role,
      description: EVENT_TYPE_LABEL[e.event_type] ?? e.event_type,
      created_at: e.created_at,
    })),
    ...statusAudit.map((st) => ({
      id: `status-${st.id}`,
      kind: "status" as const,
      event_type: "status_changed" as const,
      actor: st.actor_id,
      actor_role: st.source,
      description: "Status geändert",
      from_status: st.from_status,
      to_status: st.to_status,
      created_at: st.created_at,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
