"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrderEditor, sessionActorId } from "@/lib/auth.server";
import { query, queryOne } from "@/lib/db";
import { logOrderEvent, logStatusAuditEntry } from "@/lib/audit";

export type DuplicateOrderResult =
  | { ok: true; orderNo: number }
  | { ok: false; error: string };

/**
 * Dupliziert eine bestehende Bestellung als neue Bestellung im Status `pending`.
 *
 * Kopiert die fachlichen Inhalte (billing, object, services, pricing, photographer,
 * address) — **ohne** Termin (schedule), ohne Audit-Verlauf der Original-Bestellung,
 * ohne Dateien, ohne E-Mails. Der Benutzer kann das Duplikat anschließend im
 * Termin-Tab vollständig konfigurieren und planen.
 *
 * Die nächste freie Order-Nummer wird per `MAX(order_no)+1` allokiert; die
 * UNIQUE-Constraint auf `order_no` schützt vor Race-Conditions.
 */
export async function duplicateOrder(
  sourceOrderNo: number,
): Promise<DuplicateOrderResult> {
  if (!Number.isInteger(sourceOrderNo) || sourceOrderNo <= 0) {
    return { ok: false, error: "Ungültige Bestell-Nummer" };
  }

  const editor = await requireOrderEditor();

  const source = await queryOne<{
    address: string | null;
    billing: unknown;
    object: unknown;
    services: unknown;
    pricing: unknown;
    photographer: unknown;
    photographer_key: string | null;
    onsite_contacts: unknown;
    key_pickup: unknown;
  }>(
    `SELECT address, billing, object, services, pricing, photographer,
            photographer_key, onsite_contacts, key_pickup
     FROM booking.orders
     WHERE order_no = $1
     LIMIT 1`,
    [sourceOrderNo],
  );

  if (!source) {
    return { ok: false, error: "Quell-Bestellung nicht gefunden" };
  }

  const next = await queryOne<{ next_no: number }>(
    `SELECT COALESCE(MAX(order_no), 0) + 1 AS next_no FROM booking.orders`,
  );
  const newOrderNo = Number(next?.next_no ?? 0);
  if (!Number.isInteger(newOrderNo) || newOrderNo <= 0) {
    return { ok: false, error: "Konnte keine neue Bestell-Nummer ermitteln" };
  }

  try {
    await query(
      `INSERT INTO booking.orders (
         order_no, status, source, created_at, updated_at,
         address, billing, object, services, pricing,
         photographer, photographer_key, onsite_contacts, key_pickup,
         schedule
       )
       VALUES (
         $1, 'pending', 'duplicate', now(), now(),
         $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb,
         $7::jsonb, $8, $9::jsonb, $10::jsonb,
         '{}'::jsonb
       )`,
      [
        newOrderNo,
        source.address ?? null,
        JSON.stringify(source.billing ?? {}),
        JSON.stringify(source.object ?? {}),
        JSON.stringify(source.services ?? {}),
        JSON.stringify(source.pricing ?? {}),
        JSON.stringify(source.photographer ?? {}),
        source.photographer_key ?? null,
        JSON.stringify(source.onsite_contacts ?? []),
        JSON.stringify(source.key_pickup ?? {}),
      ],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Insert fehlgeschlagen";
    return { ok: false, error: `Duplizieren fehlgeschlagen: ${msg}` };
  }

  await logStatusAuditEntry({
    orderNo: newOrderNo,
    fromStatus: "",
    toStatus: "pending",
    source: "duplicate",
    actorId: sessionActorId(editor),
  });
  await logOrderEvent(
    newOrderNo,
    "note_added",
    {
      old: {},
      new: { duplicatedFrom: sourceOrderNo },
    },
    editor,
  );

  revalidatePath("/orders");
  redirect(`/orders/${newOrderNo}?edit=1`);
}
