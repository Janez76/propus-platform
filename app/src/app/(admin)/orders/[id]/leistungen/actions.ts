"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrderEditor } from "@/lib/auth.server";
import { logOrderEvent } from "@/lib/audit";
import { leistungenFormSchema } from "@/lib/validators/orders/leistungen";
import { getPackageByKey } from "@/lib/pricingCatalog";
import { calculatePricing, VAT_RATE } from "@/lib/pricing";
import { queryOne, withTransaction } from "@/lib/db";
import { requestAdminReschedule } from "@/lib/booking-calendar-sync.server";

type AddonRow = {
  id: string;
  label: string;
  group?: string;
  qty: number;
  price: number;
  priceOverride?: number | null;
};

export type SaveLeistungenOptions = { skipRedirect?: boolean };

export async function saveLeistungen(
  input: unknown,
  options: SaveLeistungenOptions = {},
) {
  const { skipRedirect = false } = options;
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
    status: string | null;
  }>(`SELECT services, pricing, schedule, status FROM booking.orders WHERE order_no = $1`, [v.orderNo]);
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
    vat: String(calc.vat),
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

  const prevDuration = Number((before.schedule as { durationMin?: number } | null)?.durationMin || 0);
  const overrideApplies = v.durationMinOverride != null;
  const durationFromOverride =
    overrideApplies && prevDuration !== v.durationMinOverride
      ? v.durationMinOverride
      : null;
  const sched = before.schedule as { date?: string; time?: string } | null;
  if (
    durationFromOverride != null &&
    sched?.date &&
    sched?.time &&
    String(before.status || "").toLowerCase() !== "cancelled"
  ) {
    await requestAdminReschedule(v.orderNo, {
      date: sched.date,
      time: String(sched.time).slice(0, 5),
      durationMin: durationFromOverride,
    });
  }

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

  // If duration changed, sync the 365/Outlook calendar event (delete old, create new with correct duration).
  // The reschedule endpoint handles this silently (no emails when only duration changes).
  if (
    v.durationMinOverride != null &&
    Number((before.schedule as Record<string, unknown> | null)?.durationMin ?? 0) !== v.durationMinOverride &&
    (before.schedule as Record<string, unknown> | null)?.date &&
    (before.schedule as Record<string, unknown> | null)?.time
  ) {
    try {
      const { cookies } = await import("next/headers");
      const token = (await cookies()).get("admin_session")?.value ?? "";
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";
      await fetch(
        `${apiBase}/api/admin/orders/${encodeURIComponent(String(v.orderNo))}/reschedule`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            date: String((before.schedule as Record<string, unknown>).date),
            time: String((before.schedule as Record<string, unknown>).time),
            durationMin: v.durationMinOverride,
          }),
        },
      );
    } catch (err) {
      console.error("[saveLeistungen] 365 calendar sync failed (non-critical)", err);
    }
  }

  revalidatePath(`/orders/${v.orderNo}/leistungen`);
  revalidatePath(`/orders/${v.orderNo}`);
  if (!skipRedirect) {
    redirect(`/orders/${v.orderNo}/leistungen?saved=1`);
  }
}
