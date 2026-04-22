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
  const internal = v.recipient === "internal" || v.isInternal;
  const role =
    v.recipient === "customer"
      ? "admin_to_customer"
      : v.recipient === "photographer"
        ? "admin_to_photographer"
        : "internal";
  const name = editor.userName || sessionActorId(editor);
  await query(
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
  );
  revalidatePath(`/orders/${v.orderNo}/kommunikation`);
  return { ok: true as const };
}

export async function softDeleteChatMessage(input: { orderNo: number; id: number }) {
  const editor = await requireOrderEditor();
  await withTransaction(async (c) => {
    await c.query(
      `UPDATE booking.order_chat_messages
       SET deleted_at = NOW(), deleted_by = $3
       WHERE id = $1 AND order_no = $2 AND deleted_at IS NULL`,
      [input.id, input.orderNo, sessionActorId(editor)],
    );
  });
  await logOrderEvent(
    input.orderNo,
    "message_deleted",
    { old: { id: input.id }, new: {} },
    editor,
  );
  revalidatePath(`/orders/${input.orderNo}/kommunikation`);
  return { ok: true as const };
}
