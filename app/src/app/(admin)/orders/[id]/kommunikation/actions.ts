"use server";

import { revalidatePath } from "next/cache";
import { requireOrderEditor, sessionActorId } from "@/lib/auth.server";
import { logOrderEvent } from "@/lib/audit";
import { query, queryOne, withTransaction } from "@/lib/db";
import { z } from "zod";

const sendSchema = z.object({
  orderNo: z.coerce.number().int().positive(),
  message: z.string().trim().min(1).max(5000),
  recipient: z.enum(["customer", "photographer", "internal"]),
  isInternal: z.boolean(),
});

export async function sendOrderMessage(input: unknown) {
  const editor = await requireOrderEditor();
  const p = sendSchema.safeParse(input);
  if (!p.success) {
    return { ok: false as const, error: "Ungültige Eingabe" };
  }
  const v = p.data;
  // Existenz-Check vor INSERT — sonst wuerde ein FK-Constraint-Fehler nur
  // als generisches "Internal Server Error" beim Caller landen statt
  // "Bestellung nicht gefunden" (Bug-Hunt T02 MEDIUM).
  const exists = await queryOne<{ order_no: number }>(
    `SELECT order_no FROM booking.orders WHERE order_no = $1`,
    [v.orderNo],
  );
  if (!exists) {
    return { ok: false as const, error: "Bestellung nicht gefunden" };
  }
  const internal = v.recipient === "internal" || v.isInternal;
  const role =
    v.recipient === "customer"
      ? "admin_to_customer"
      : v.recipient === "photographer"
        ? "admin_to_photographer"
        : "internal";
  const name = editor.userName || sessionActorId(editor);
  await withTransaction(async (c) => {
    // Beide Schritte in der gleichen Tx: Message + Audit-Log atomar.
    await c.query(
      `INSERT INTO booking.order_chat_messages
        (order_no, sender_role, sender_id, sender_name, message, is_internal, read_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NOW())`,
      [v.orderNo, role, sessionActorId(editor), name, v.message, internal],
    );
    await logOrderEvent(
      v.orderNo,
      "message_sent",
      { old: {}, new: { role, isInternal: internal, preview: v.message.slice(0, 200) } },
      editor,
      c,
    );
  });
  revalidatePath(`/orders/${v.orderNo}/kommunikation`);
  return { ok: true as const };
}

export async function softDeleteChatMessage(input: { orderNo: number; id: number }) {
  const editor = await requireOrderEditor();
  // Audit-Log MUSS in derselben Tx wie das UPDATE laufen — sonst kann ein
  // Crash zwischen UPDATE und logOrderEvent eine geloeschte Nachricht ohne
  // Audit-Spur hinterlassen (Bug-Hunt T02 MEDIUM).
  await withTransaction(async (c) => {
    await c.query(
      `UPDATE booking.order_chat_messages
       SET deleted_at = NOW(), deleted_by = $3
       WHERE id = $1 AND order_no = $2 AND deleted_at IS NULL`,
      [input.id, input.orderNo, sessionActorId(editor)],
    );
    await logOrderEvent(
      input.orderNo,
      "message_deleted",
      { old: { id: input.id }, new: {} },
      editor,
      c,
    );
  });
  revalidatePath(`/orders/${input.orderNo}/kommunikation`);
  return { ok: true as const };
}
