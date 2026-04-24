import "server-only";
import { cache } from "react";
import { queryOne } from "@/lib/db";
import { DURATION_MIN_FROM_SCHEDULE } from "@/lib/repos/orders/durationFromScheduleSql";

/**
 * Vollständiger Order-Datensatz für künftige Order-Edit-Shell (Stufe 2, additiv).
 * Union der Felder aus: Root/Übersicht, Objekt, Leistungen, Termin, plus Layout-Meta.
 * Wird pro Request per `cache()` dedupliziert, sobald importiert.
 */
export type OrderContext = {
  id: number;
  order_no: number;
  status: string;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  /** Layout / Termin */
  schedule_date: string | null;
  schedule_time: string | null;
  duration_min: number | null;
  total_chf: number | null;
  photographer_name: string | null;
  photographer_email: string | null;
  photographer_phone: string | null;
  photographer_key: string | null;
  /** Übersicht (aus billing) */
  booking_type: "firma" | "privat";
  company_name: string | null;
  order_reference: string | null;
  billing_street: string | null;
  billing_zip: string | null;
  billing_city: string | null;
  contact_salutation: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  /** Objekt */
  address: string | null;
  object_type: string | null;
  object_area: string | null;
  object_floors: string | null;
  object_rooms: string | null;
  object_desc: string | null;
  onsite_contacts: unknown;
  key_pickup: unknown;
  /** Leistungen (services/pricing) */
  package_key: string | null;
  package_label: string | null;
  package_price: string | null;
  addons: unknown;
  pricing_subtotal: string | null;
  pricing_discount: string | null;
  pricing_vat: string | null;
  pricing_total: string | null;
  /** Volle JSON-Blöcke (Migration / erweiterte Logik) */
  raw_billing: Record<string, unknown>;
  raw_object: Record<string, unknown>;
  raw_services: Record<string, unknown>;
  raw_pricing: Record<string, unknown>;
  raw_schedule: Record<string, unknown>;
  raw_photographer: Record<string, unknown>;
};

export const loadOrderContext = cache(
  async (orderNo: number): Promise<OrderContext | null> => {
    return queryOne<OrderContext>(
      `
      SELECT
        o.id,
        o.order_no,
        o.status,
        o.created_at,
        o.updated_at,
        o.done_at,
        o.schedule_date,
        o.schedule_time,
        ${DURATION_MIN_FROM_SCHEDULE.o} AS duration_min,
        (o.pricing->>'total')::numeric AS total_chf,
        p.name AS photographer_name,
        o.photographer->>'email' AS photographer_email,
        o.photographer->>'phone' AS photographer_phone,
        o.photographer->>'key' AS photographer_key,
        CASE
          WHEN o.billing->>'company' IS NOT NULL AND o.billing->>'company' != ''
          THEN 'firma'
          ELSE 'privat'
        END AS booking_type,
        o.billing->>'company' AS company_name,
        o.billing->>'order_ref' AS order_reference,
        o.billing->>'street' AS billing_street,
        o.billing->>'zip' AS billing_zip,
        o.billing->>'city' AS billing_city,
        o.billing->>'salutation' AS contact_salutation,
        o.billing->>'first_name' AS contact_first_name,
        o.billing->>'name' AS contact_last_name,
        o.billing->>'email' AS contact_email,
        o.billing->>'phone' AS contact_phone,
        o.address,
        o.object->>'type' AS object_type,
        o.object->>'area' AS object_area,
        o.object->>'floors' AS object_floors,
        o.object->>'rooms' AS object_rooms,
        o.object->>'desc' AS object_desc,
        o.onsite_contacts,
        o.key_pickup,
        o.services->'package'->>'key' AS package_key,
        o.services->'package'->>'label' AS package_label,
        o.services->'package'->>'price' AS package_price,
        o.services->'addons' AS addons,
        o.pricing->>'subtotal' AS pricing_subtotal,
        o.pricing->>'discount' AS pricing_discount,
        o.pricing->>'vat' AS pricing_vat,
        o.pricing->>'total' AS pricing_total,
        o.billing AS raw_billing,
        o.object AS raw_object,
        o.services AS raw_services,
        o.pricing AS raw_pricing,
        o.schedule AS raw_schedule,
        o.photographer AS raw_photographer
      FROM booking.orders o
      LEFT JOIN booking.photographers p ON p.key = o.photographer_key
      WHERE o.order_no = $1
      LIMIT 1
      `,
      [orderNo],
    );
  },
);
