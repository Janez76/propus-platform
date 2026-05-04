"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrderEditor } from "@/lib/auth.server";
import { logOrderEvent } from "@/lib/audit";
import { leistungenFormSchema } from "@/lib/validators/orders/leistungen";
import { getPackageByKey } from "@/lib/pricingCatalog";
import { calculatePricing } from "@/lib/pricing";
import { queryOne, withTransaction } from "@/lib/db";
import { enqueueOutbox } from "@/lib/outbox";
import type { BulkTxOptions } from "../_bulk-tx";

type AddonRow = {
  id: string;
  label: string;
  group?: string;
  qty: number;
  price: number;
  priceOverride?: number | null;
};

export type SaveLeistungenOptions = { skipRedirect?: boolean } & BulkTxOptions;

export async function saveLeistungen(
  input: unknown,
  options: SaveLeistungenOptions = {},
) {
  const { skipRedirect = false, tx, postCommit } = options;
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
    created_at: string | null;
  }>(`SELECT services, pricing, schedule, status, created_at::text AS created_at FROM booking.orders WHERE order_no = $1`, [v.orderNo], tx);
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
  // VAT-Historie: orderdate-basiert (created_at) statt heutigem Default-Satz
  // (CodeRabbit Major). vatRate aus calc-Result persistieren statt
  // hardcoded VAT_RATE — sonst Fehler bei Re-Berechnung alter Bestellungen.
  const calc = calculatePricing({
    packagePrice: packageNum,
    addons: pricedAddons,
    travelZonePrice: 0,
    keyPickupActive: false,
    discount: Number.isFinite(discount) ? discount : 0,
    effectiveDate: before.created_at,
  });
  const pricingPatch = {
    subtotal: String(calc.subtotal),
    discount: String(calc.discount),
    vat: String(calc.vat),
    total: String(calc.total),
    vatRate: String(calc.vatRate),
  };

  const schedPatch: Record<string, unknown> = {
    ...((before.schedule as object) || {}),
  };
  if (v.durationMinOverride != null) {
    schedPatch.durationMin = v.durationMinOverride;
  }

  // Calendar-Reschedule wandert in die booking.order_outbox: Sync-
  // Operation persistiert atomar mit dem Order-UPDATE, der Outbox-Worker
  // dispatcht via performAdminReschedule (PR Phase 2b, Bug-Hunt T07).
  // Ein Server-Crash zwischen DB-Commit und Calendar-API kann die
  // Operation nicht mehr verlieren.
  const prevDuration = Number((before.schedule as { durationMin?: number } | null)?.durationMin || 0);
  const sched = before.schedule as { date?: string; time?: string } | null;
  const durationChanged =
    v.durationMinOverride != null && prevDuration !== v.durationMinOverride;
  const shouldEnqueueReschedule =
    durationChanged &&
    !!sched?.date &&
    !!sched?.time &&
    String(before.status || "").toLowerCase() !== "cancelled";

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
    await logOrderEvent(
      v.orderNo,
      "services_updated",
      { old: { services: before.services, pricing: before.pricing }, new: { services: servicesPatch, pricing: pricingPatch } },
      editor,
      c,
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
        c,
      );
    }

    if (shouldEnqueueReschedule) {
      await enqueueOutbox(c, v.orderNo, "calendar_reschedule", {
        date: String(sched!.date),
        time: String(sched!.time).slice(0, 5),
        durationMin: v.durationMinOverride,
      });
    }
  }, tx);

  if (tx) return;

  revalidatePath(`/orders/${v.orderNo}/leistungen`);
  revalidatePath(`/orders/${v.orderNo}`);
  if (!skipRedirect) {
    redirect(`/orders/${v.orderNo}/leistungen?saved=1`);
  }
}
