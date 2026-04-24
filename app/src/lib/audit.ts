import { query } from "@/lib/db";
import type { AdminSession } from "@/lib/auth.server";
import { sessionActorId } from "@/lib/auth.server";

export type OrderEventType =
  | "status_changed"
  | "schedule_updated"
  | "photographer_assigned"
  | "services_updated"
  | "pricing_updated"
  | "object_updated"
  | "billing_updated"
  | "message_sent"
  | "message_deleted"
  | "file_uploaded"
  | "folder_updated"
  | "note_added"
  | "matterport_linked"
  | "matterport_unlinked"
  | "gallery_linked"
  | "gallery_unlinked";

export async function logOrderEvent(
  orderNo: number,
  eventType: OrderEventType,
  diff: { old: unknown; new: unknown },
  actor: AdminSession | { actor_user: string; actor_role: string },
): Promise<void> {
  const actor_user = "userKey" in actor ? sessionActorId(actor as AdminSession) : actor.actor_user;
  const actor_role = "role" in actor ? String((actor as AdminSession).role || "admin") : actor.actor_role;

  await query(
    `INSERT INTO booking.order_event_log (order_no, event_type, actor_user, actor_role, old_value, new_value, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
    [
      orderNo,
      eventType,
      actor_user,
      actor_role,
      JSON.stringify(diff.old ?? null),
      JSON.stringify(diff.new ?? null),
      JSON.stringify({ source: "admin_next" }),
    ],
  );
}

export async function logStatusAuditEntry(params: {
  orderNo: number;
  fromStatus: string;
  toStatus: string;
  source: string;
  actorId: string | null;
  calendarResult?: string;
  errorMessage?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO booking.order_status_audit
      (order_no, from_status, to_status, source, actor_id, calendar_result, error_message, force_slot, override_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.orderNo,
      params.fromStatus,
      params.toStatus,
      params.source,
      params.actorId,
      params.calendarResult ?? "not_required",
      params.errorMessage ? String(params.errorMessage).slice(0, 1000) : null,
      false,
      null,
    ],
  );
}
