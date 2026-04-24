"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { requireOrderEditor } from "@/lib/auth.server";
import { logOrderEvent } from "@/lib/audit";
import { suggestSplitName } from "@/lib/nameSplit";
import { parseFormDataToUebersicht } from "@/lib/validators/orders/uebersicht";

export type UpdateOverviewOptions = { skipRedirect?: boolean };

export async function updateOrderOverview(formData: FormData, options: UpdateOverviewOptions = {}) {
  const { skipRedirect = false } = options;
  const editor = await requireOrderEditor();
  const p = parseFormDataToUebersicht(formData);
  if (!p.success) {
    const first = p.error.issues[0];
    throw new Error(first?.message || "Validierung fehlgeschlagen");
  }
  const v = p.data;
  const orderNo = String(v.order_no);
  if (!orderNo) throw new Error("Fehlende Bestellungsnummer");

  const split = suggestSplitName(v.contact_first_name, v.contact_last_name);
  const first = split ? split.first : v.contact_first_name.trim();
  const last = split ? split.last : v.contact_last_name.trim();
  if (!first || !last) {
    throw new Error("Vor- und Nachname (oder ein gemeinsames Namensfeld) sind erforderlich");
  }

  const before = await queryOne<Record<string, unknown>>(
    `SELECT billing FROM booking.orders WHERE order_no = $1`,
    [orderNo],
  );

  const companyName = v.booking_type === "firma" ? (v.company_name || null) : null;

  const billingPatch = {
    company: companyName,
    order_ref: (v.order_reference as string) || null,
    street: v.billing_street,
    zip: v.billing_zip,
    city: v.billing_city,
    salutation: v.contact_salutation,
    first_name: first,
    name: last,
    email: v.contact_email,
    phone: (v.contact_phone as string) || null,
  };

  await query(
    `UPDATE booking.orders
     SET billing = billing || $1::jsonb,
         updated_at = NOW()
     WHERE order_no = $2`,
    [JSON.stringify(billingPatch), orderNo],
  );

  if (before?.billing) {
    await logOrderEvent(
      Number(orderNo),
      "billing_updated",
      { old: { billing: before.billing }, new: { billing: { ...((before.billing as object) || {}), ...billingPatch } } },
      editor,
    );
  }

  revalidatePath(`/orders/${orderNo}`);
  if (!skipRedirect) {
    redirect(`/orders/${orderNo}?saved=1`);
  }
}
