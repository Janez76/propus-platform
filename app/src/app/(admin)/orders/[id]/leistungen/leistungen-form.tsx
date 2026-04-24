"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useFieldArray, useForm, FormProvider, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ListChecks, Plus, Receipt, Tag, Trash2 } from "lucide-react";
import { leistungenFormSchema, type LeistungenFormValues } from "@/lib/validators/orders/leistungen";
import { getAddonCatalog, PACKAGE_CATALOG } from "@/lib/pricingCatalog";
import { calculatePricing, VAT_RATE } from "@/lib/pricing";
import { saveLeistungen } from "./actions";
import { Section, Empty, formatCHF } from "../_shared";

type Props = {
  order: {
    order_no: number;
    discount_chf: number;
    package_key: string | null;
    package_label: string | null;
    package_price: string | null;
    addons: {
      id?: string;
      label: string;
      price?: number;
      qty?: number;
      group?: string;
      priceOverride?: number;
    }[] | null;
    duration_min: number | null;
    pricing_subtotal: string | null;
    pricing_discount: string | null;
    pricing_vat: string | null;
    pricing_total: string | null;
  };
};

function defaults(p: Props["order"]): LeistungenFormValues {
  return {
    orderNo: p.order_no,
    packageKey: p.package_key,
    addons: (p.addons ?? []).map((a) => ({
      id: a.id || a.label,
      label: a.label,
      group: a.group,
      qty: a.qty && a.qty > 0 ? a.qty : 1,
      price: Number(a.price ?? 0),
      priceOverride: a.priceOverride ?? null,
    })),
    durationMinOverride: p.duration_min,
  };
}

function PriceSidebar({ form, discountChf }: { form: ReturnType<typeof useForm<LeistungenFormValues>>; discountChf: number }) {
  const w = useWatch({ control: form.control });
  const pkg = PACKAGE_CATALOG.find((x) => x.key === w?.packageKey);
  const packagePrice = pkg?.price ?? 0;
  const addons = (w?.addons ?? []).map((a) => ({
    price: Number(
      a.priceOverride != null ? a.priceOverride : a.price ?? 0,
    ),
    qty: Math.max(1, Number(a.qty ?? 1)),
  }));
  const discount = Math.max(0, discountChf);
  const calc = useMemo(() => {
    return calculatePricing({
      packagePrice,
      addons,
      travelZonePrice: 0,
      keyPickupActive: false,
      discount,
    });
  }, [packagePrice, addons, discount]);
  return (
    <div className="mt-2 space-y-1 text-sm">
      <div className="flex justify-between text-white/60">
        <span>Zwischensumme</span>
        <span className="tabular-nums">{formatCHF(calc.subtotal)}</span>
      </div>
      <div className="flex justify-between text-white/60">
        <span>MwSt. ({Math.round(VAT_RATE * 1000) / 10} %)</span>
        <span className="tabular-nums">{formatCHF(calc.vat)}</span>
      </div>
      <div className="flex justify-between font-semibold text-white">
        <span>Total</span>
        <span className="tabular-nums">{formatCHF(calc.total)}</span>
      </div>
    </div>
  );
}

export function LeistungenForm({ order }: Props) {
  const catalog = getAddonCatalog();
  const [err, setErr] = useState("");
  const [pen, start] = useTransition();
  const form = useForm<LeistungenFormValues>({
    resolver: zodResolver(leistungenFormSchema) as import("react-hook-form").Resolver<LeistungenFormValues>,
    defaultValues: { ...defaults(order) },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "addons" });
  const [addSelect, setAddSelect] = useState(catalog[0]?.id ?? "");

  const onSubmit = useCallback(
    (v: LeistungenFormValues) => {
      setErr("");
      start(async () => {
        const r = await saveLeistungen(v);
        if (r && "ok" in r && r.ok === false) {
          setErr(r.error);
        }
      });
    },
    [],
  );

  return (
    <FormProvider {...form}>
      <form id="order-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {err && <p className="text-rose-400 text-sm">{err}</p>}

        <Section title="Paket" icon={<Tag className="h-4 w-4" />}>
          <select
            className="max-w-md w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
            {...form.register("packageKey", { setValueAs: (v) => (v === "" ? null : v) })}
          >
            <option value="">Kein Paket</option>
            {PACKAGE_CATALOG.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label} — {formatCHF(p.price)}
              </option>
            ))}
          </select>
        </Section>

        <Section title="Zusatzleistungen" icon={<ListChecks className="h-4 w-4" />}>
          <div className="mb-3 flex max-w-lg flex-wrap gap-2">
            <select
              className="flex-1 min-w-[200px] rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm"
              value={addSelect}
              onChange={(e) => setAddSelect(e.target.value)}
            >
              {catalog.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {formatCHF(a.price)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-sm"
              onClick={() => {
                const a = catalog.find((x) => x.id === addSelect);
                if (a) {
                  append({ id: a.id, label: a.label, group: a.group, price: a.price, qty: a.defaultQty || 1, priceOverride: null });
                }
              }}
            >
              <Plus className="mr-1 inline h-4 w-4" />
              Hinzufügen
            </button>
          </div>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div
                key={f.id}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3"
              >
                <div className="min-w-0 flex-1 text-sm font-medium">{form.watch(`addons.${i}.label`)}</div>
                <div>
                  <span className="text-xs text-white/50">Menge</span>
                  <input
                    type="number"
                    min={1}
                    className="w-16 rounded border border-white/10 bg-white/[0.03] px-1 py-0.5 text-sm"
                    {...form.register(`addons.${i}.qty`, { valueAsNumber: true })}
                  />
                </div>
                <div>
                  <span className="text-xs text-white/50" title="Nur wenn vom Katalog abweichend">Override</span>
                  <input
                    type="number"
                    step="0.05"
                    className="w-20 rounded border border-amber-500/30 bg-white/[0.03] px-1 py-0.5 text-sm"
                    placeholder="CHF"
                    {...form.register(`addons.${i}.priceOverride`, {
                      valueAsNumber: true,
                      setValueAs: (v) => (v === "" || Number.isNaN(v) ? null : v),
                    })}
                  />
                </div>
                <button
                  type="button"
                  className="p-1 text-rose-400"
                  onClick={() => remove(i)}
                  title="Entfernen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {fields.length === 0 && <Empty>Keine Zusatzleistungen</Empty>}
          </div>
        </Section>

        <Section title="Dauer" icon={<Receipt className="h-4 w-4" />}>
          <p className="mb-1 text-xs text-white/50">Override für Dauer in Minuten (wenn leer, bleibt die Dauer aus dem Termin unverändert).</p>
          <input
            type="number"
            min={15}
            step={15}
            className="max-w-xs rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm"
            {...form.register("durationMinOverride", { valueAsNumber: true, setValueAs: (v) => (v === "" ? null : v) })}
          />
        </Section>

        <Section title="Preisübersicht (live)" icon={<Receipt className="h-4 w-4" />}>
          <PriceSidebar form={form} discountChf={order.discount_chf} />
        </Section>
        {pen && <p className="text-xs text-white/40">Wird gespeichert…</p>}
      </form>
    </FormProvider>
  );
}
