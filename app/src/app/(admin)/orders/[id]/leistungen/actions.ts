"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrderEditor } from "@/lib/auth.server";
import { logOrderEvent } from "@/lib/audit";
import { leistungenFormSchema } from "@/lib/validators/orders/leistungen";
import { getPackageByKey } from "@/lib/pricingCatalog";
import { calculatePricing, VAT_RATE } from "@/lib/pricing";
import { queryOne, withTransaction } from "@/lib/db";

type AddonRow = {
  id: string;
  label: string;
  group?: string;
  qty: number;
  price: number;
  priceOverride?: number | null;
};

export async function saveLeistungen(input: unknown) {
  const editor = await requireOrderEditor();
  const p = leistungenFormSchema.safeParse(input);
  if (!p.success) {
    return { ok: false as const, error: "Validierung fehlgeschlagen" };
  }
  const v = p.data;

  const before = await queryOne<{
    services: Record<string, unknown> | null;
    pricing: Record<string, unknown> | null;
    schedule: Record<string, unknown> | null;
  }>(`SELECT services, pricing, schedule FROM booking.orders WHERE order_no = $1`, [v.orderNo]);
  if (!before) {
    return { ok: false as const, error: "Bestellung nicht gefunden" };
  }

  const pkg = getPackageByKey(v.packageKey);
  const oldServices = (before.services || {}) as Record<string, unknown>;
  const servicesPatch: Record<string, unknown> = {
    ...oldServices,
    package:
      v.packageKey && pkg
        ? { key: v.packageKey, label: pkg.label, price: String(pkg.price) }
        : v.packageKey
          ? { key: v.packageKey, label: v.packageKey, price: "0" }
          : null,
    addons: v.addons.map((a) => ({
      id: a.id,
      label: a.label,
      group: a.group,
      qty: a.qty,
      price: a.priceOverride != null ? a.priceOverride : a.price,
    })) as unknown[],
  };

  const packageNum = pkg ? pkg.price : 0;
  const addonRows: AddonRow[] = v.addons.map((a) => ({
    id: a.id,
    label: a.label,
    group: a.group,
    qty: a.qty,
    price: a.price,
    priceOverride: a.priceOverride,
  }));
  const pricedAddons = addonRows.map((a) => ({
    price: a.priceOverride != null ? a.priceOverride : a.price,
    qty: a.qty,
  }));
  const discount = Number(
    (before.pricing as { discount?: string } | null)?.discount ?? 0
  ) || 0;
  const calc = calculatePricing({
    packagePrice: packageNum,
    addons: pricedAddons,
    travelZonePrice: 0,
    keyPickupActive: false,
    discount: Number.isFinite(discount) ? discount : 0,
  });
  const pricingPatch = {
    subtotal: String(calc.subtotal),
    discount: String(calc.discount),
    vat: `CHF ${calc.vat.toFixed(2)}`,
    total: String(calc.total),
    vatRate: String(VAT_RATE),
  };

  const schedPatch: Record<string, unknown> = {
    ...((before.schedule as object) || {}),
  };
  if (v.durationMinOverride != null) {
    schedPatch.durationMin = v.durationMinOverride;
  }

  await withTransaction(async (c) => {
    await c.query(
      `UPDATE booking.orders SET
         services = $2::jsonb,
         pricing = COALESCE(pricing, '{}'::jsonb) || $3::jsonb,
         schedule = COALESCE(schedule, '{}'::jsonb) || $4::jsonb,
         updated_at = NOW()
       WHERE order_no = $1`,
      [v.orderNo, JSON.stringify(servicesPatch), JSON.stringify(pricingPatch), JSON.stringify(schedPatch)],
    );
  });

  await logOrderEvent(
    v.orderNo,
    "services_updated",
    { old: { services: before.services, pricing: before.pricing }, new: { services: servicesPatch, pricing: pricingPatch } },
    editor,
  );
  if (
    String((before.pricing as { total?: string } | null)?.total ?? "") !==
    String(pricingPatch.total)
  ) {
    await logOrderEvent(
      v.orderNo,
      "pricing_updated",
      { old: before.pricing, new: pricingPatch },
      editor,
    );
  }

  revalidatePath(`/orders/${v.orderNo}/leistungen`);
  revalidatePath(`/orders/${v.orderNo}`);
  redirect(`/orders/${v.orderNo}/leistungen?saved=1`);
}
