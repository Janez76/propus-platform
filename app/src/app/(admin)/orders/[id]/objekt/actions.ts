"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrderEditor, sessionActorId } from "@/lib/auth.server";
import { logOrderEvent } from "@/lib/audit";
import { joinAddressLine } from "@/lib/parseOrderAddress";
import { objektFormSchema } from "@/lib/validators/orders/objekt";
import { queryOne, withTransaction } from "@/lib/db";

export async function saveOrderObjekt(input: unknown) {
  const editor = await requireOrderEditor();
  const parsed = objektFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Validierung fehlgeschlagen" };
  }
  const v = parsed.data;

  const before = await queryOne<{
    address: string | null;
    object: Record<string, unknown> | null;
    onsite_contacts: unknown;
  }>(`SELECT address, object, onsite_contacts FROM booking.orders WHERE order_no = $1`, [v.orderNo]);
  if (!before) {
    return { ok: false as const, error: "Bestellung nicht gefunden" };
  }

  const objectPatch: Record<string, unknown> = {};
  if (v.objectType != null) objectPatch.type = v.objectType;
  if (v.objectAreaM2 != null) objectPatch.area = String(v.objectAreaM2);
  if (v.objectFloors != null) objectPatch.floors = String(v.objectFloors);
  if (v.objectRooms != null) objectPatch.rooms = String(v.objectRooms);
  if (v.objectDesc != null && v.objectDesc !== "") objectPatch.desc = v.objectDesc;

  const addressLine = joinAddressLine(v.street, v.zip, v.city);
  const contacts = v.onsiteContacts.map((c) => ({
    name: c.name,
    email: c.email || undefined,
    phone: c.phone || undefined,
    role: c.role || undefined,
  }));

  await withTransaction(async (c) => {
    await c.query(
      `UPDATE booking.orders SET
         address = $2,
         object = COALESCE(object, '{}'::jsonb) || $3::jsonb,
         onsite_contacts = $4::jsonb,
         updated_at = NOW()
       WHERE order_no = $1`,
      [v.orderNo, addressLine, JSON.stringify(objectPatch), JSON.stringify(contacts)],
    );
  });

  await logOrderEvent(
    v.orderNo,
    "object_updated",
    {
      old: { address: before.address, object: before.object, onsite: before.onsite_contacts },
      new: { address: addressLine, object: objectPatch, onsite: contacts },
    },
    editor,
  );

  revalidatePath(`/orders/${v.orderNo}/objekt`);
  revalidatePath(`/orders/${v.orderNo}`);
  redirect(`/orders/${v.orderNo}/objekt?saved=1`);
}
