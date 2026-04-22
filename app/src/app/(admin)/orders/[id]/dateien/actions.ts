"use server";

import { revalidatePath } from "next/cache";
import { requireOrderEditor, sessionActorId } from "@/lib/auth.server";
import { logOrderEvent } from "@/lib/audit";
import { query } from "@/lib/db";
import { z } from "zod";

const linkSchema = z.object({
  orderNo: z.coerce.number().int().positive(),
  displayName: z.string().min(1).max(200),
  absolutePath: z.string().max(2000).optional().or(z.literal("")),
  nextcloudShareUrl: z.string().url().or(z.string().min(0)),
  folderType: z.enum(["raw_material", "customer_folder"]),
  rootKind: z.enum(["raw", "customer"]),
});

export async function linkOrderFolder(input: unknown) {
  const editor = await requireOrderEditor();
  const p = linkSchema.safeParse(input);
  if (!p.success) {
    return { ok: false as const, error: "Ungültig" };
  }
  const v = p.data;
  const url = v.nextcloudShareUrl || "";
  const rel = v.absolutePath || "/";
  await query(
    `INSERT INTO booking.order_folder_links
      (order_no, folder_type, root_kind, relative_path, absolute_path, display_name, nextcloud_share_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'linked')`,
    [v.orderNo, v.folderType, v.rootKind, rel, v.absolutePath || url, v.displayName, url || null],
  );
  await logOrderEvent(
    v.orderNo,
    "folder_updated",
    { old: {}, new: { action: "link", display: v.displayName, url: url } },
    editor,
  );
  revalidatePath(`/orders/${v.orderNo}/dateien`);
  return { ok: true as const };
}

export async function archiveOrderFolderLink(input: { id: number; orderNo: number }) {
  const editor = await requireOrderEditor();
  await query(
    `UPDATE booking.order_folder_links
     SET archived_at = NOW()
     WHERE id = $1 AND order_no = $2`,
    [input.id, input.orderNo],
  );
  await logOrderEvent(input.orderNo, "note_added", { old: { folderId: input.id }, new: { action: "archive" } }, editor);
  revalidatePath(`/orders/${input.orderNo}/dateien`);
  return { ok: true as const };
}
