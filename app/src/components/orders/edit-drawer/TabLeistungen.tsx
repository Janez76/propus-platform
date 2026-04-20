import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { fetchCatalog, type CatalogAddon, type CatalogData, type CatalogPackage } from "../../../api/bookingPublic";
import { computePricing, formatCHF } from "../../../lib/bookingPricing";
import { addonPrice } from "../../catalog/addonPrice";
import { useCatalogSync } from "../../../lib/useCatalogSync";
import { useT } from "../../../hooks/useT";
import type { LeistungenAddon, LeistungenForm, ObjektForm } from "./types";
import { cn } from "../../../lib/utils";

type Props = {
  value: LeistungenForm;
  objekt: ObjektForm;
  onChange: (patch: Partial<LeistungenForm>) => void;
};

const PACKAGE_ICONS: Record<string, string> = {
  bestseller: "⭐",
  cinematic: "🎬",
  fullview: "🏠",
};

const SECTION_GROUPS: Array<{
  group: string;
  labelKey: string;
  mode: "single" | "multi-qty" | "toggle";
}> = [
  { group: "camera", labelKey: "ordersDrawer.leistungen.bodenfotos", mode: "single" },
  { group: "dronePhoto", labelKey: "ordersDrawer.leistungen.luftaufnahmen", mode: "single" },
  { group: "tour", labelKey: "ordersDrawer.leistungen.tour360", mode: "single" },
  { group: "floorplans", labelKey: "ordersDrawer.leistungen.grundriss", mode: "single" },
  { group: "groundVideo", labelKey: "ordersDrawer.leistungen.bodenvideo", mode: "single" },
  { group: "droneVideo", labelKey: "ordersDrawer.leistungen.drohnenvideo", mode: "single" },
  { group: "staging", labelKey: "ordersDrawer.leistungen.staging", mode: "multi-qty" },
];

function genManualId(): string {
  const r = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `manual-${t}-${r}`;
}

function PackageRadio({
  packages,
  selectedKey,
  onSelect,
  t,
}: {
  packages: CatalogPackage[];
  selectedKey: string;
  onSelect: (pkg: CatalogPackage | null) => void;
  t: (k: string) => string;
}) {
  if (!packages.length) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {t("ordersDrawer.leistungen.paket")}
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {packages.map((pkg) => {
          const active = selectedKey === pkg.key;
          return (
            <button
              key={pkg.key}
              type="button"
              onClick={() => onSelect(active ? null : pkg)}
              className={cn(
                "rounded-xl border-2 p-4 text-left transition-colors",
                active
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border-soft)] bg-[var(--surface)] hover:border-[var(--border-strong)]",
              )}
            >
              <div className="mb-1 text-2xl">{PACKAGE_ICONS[pkg.key] ?? "📦"}</div>
              <div className="text-sm font-bold text-[var(--text-main)]">{pkg.label}</div>
              <div className="mt-2 text-base font-semibold text-[var(--accent)]">{formatCHF(pkg.price)}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AddonRadioRow({
  addons,
  selectedAddon,
  area,
  floors,
  labelKey,
  onChange,
  t,
}: {
  addons: CatalogAddon[];
  selectedAddon: LeistungenAddon | null;
  area: number;
  floors: number;
  labelKey: string;
  onChange: (next: LeistungenAddon | null) => void;
  t: (k: string) => string;
}) {
  if (!addons.length) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {t(labelKey)}
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs",
            !selectedAddon
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]",
          )}
        >
          {t("ordersDrawer.leistungen.none")}
        </button>
        {addons.map((a) => {
          const price = addonPrice(a, area, floors);
          const active = selectedAddon?.id === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                onChange({ id: a.id, group: a.group, label: a.label, price, ...(a.pricingType === "per_floor" || a.pricingType === "perFloor" ? { qty: floors } : {}) })
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
                active
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border-soft)] hover:bg-[var(--surface-raised)]",
              )}
            >
              <span>{a.label}</span>
              <span className="font-semibold opacity-80">{formatCHF(price)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AddonQtyGroup({
  addons,
  selected,
  area,
  floors,
  labelKey,
  onChangeAddons,
  t,
}: {
  addons: CatalogAddon[];
  selected: LeistungenAddon[];
  area: number;
  floors: number;
  labelKey: string;
  onChangeAddons: (next: LeistungenAddon[]) => void;
  t: (k: string) => string;
}) {
  if (!addons.length) return null;
  const setQty = (addon: CatalogAddon, qty: number) => {
    const others = selected.filter((s) => s.id !== addon.id);
    if (qty <= 0) {
      onChangeAddons(others);
      return;
    }
    const unit = addonPrice(addon, area, floors);
    onChangeAddons([
      ...others,
      { id: addon.id, group: addon.group, label: addon.label, price: unit * qty, qty },
    ]);
  };
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {t(labelKey)}
      </h3>
      <div className="space-y-2">
        {addons.map((a) => {
          const cur = selected.find((s) => s.id === a.id);
          const unit = addonPrice(a, area, floors);
          const qty = cur?.qty ?? 0;
          return (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-[var(--border-soft)] px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm text-[var(--text-main)]">{a.label}</span>
                <span className="text-xs text-[var(--text-subtle)]">{formatCHF(unit)} / {t("ordersDrawer.leistungen.qty")}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={qty}
                  onChange={(e) => setQty(a, Math.max(0, Number(e.target.value) || 0))}
                  className="w-20 rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 text-right text-sm"
                />
                <span className="w-24 text-right text-sm font-medium">{formatCHF(unit * qty)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function TabLeistungen({ value, objekt, onChange }: Props) {
  const t = useT();
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    fetchCatalog()
      .then(setCatalog)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);
  useCatalogSync(reload);

  const area = Number(objekt.area) || 0;
  const floors = Number(objekt.floors) || 1;

  const packages = useMemo(
    () => (catalog?.packages ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [catalog],
  );
  const addonsByGroup = useMemo(() => {
    const map = new Map<string, CatalogAddon[]>();
    for (const a of catalog?.addons ?? []) {
      const arr = map.get(a.group) || [];
      arr.push(a);
      map.set(a.group, arr);
    }
    for (const list of map.values()) {
      list.sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
    }
    return map;
  }, [catalog]);

  const setAddonForGroup = (group: string, next: LeistungenAddon | null) => {
    const others = value.addons.filter((a) => a.group !== group);
    onChange({ addons: next ? [...others, next] : others });
  };

  const setManyAddons = (group: string, list: LeistungenAddon[]) => {
    const others = value.addons.filter((a) => a.group !== group);
    onChange({ addons: [...others, ...list] });
  };

  const toggleSimpleAddon = (id: string, group: string, label: string, price: number, on: boolean) => {
    const others = value.addons.filter((a) => a.id !== id);
    onChange({ addons: on ? [...others, { id, group, label, price }] : others });
  };

  const expressOn = value.addons.some((a) => a.id === "express:24h");
  const keyPickupOn = value.keyPickup.enabled;
  const expressAddon = (catalog?.addons || []).find((a) => a.id === "express:24h");
  const keyAddon = (catalog?.addons || []).find((a) => a.id === "keypickup:main");

  const manualAddons = value.addons.filter((a) => a.id.startsWith("manual-"));
  const travelZoneAddon = value.addons.find((a) => a.group === "travel_zone");

  const subtotal = useMemo(() => {
    return value.packagePrice + value.addons.reduce((s, a) => s + (Number(a.price) || 0), 0);
  }, [value.packagePrice, value.addons]);
  const pricing = useMemo(
    () => computePricing(subtotal, value.discountPercent || 0),
    [subtotal, value.discountPercent],
  );

  const updateManual = (id: string, patch: Partial<LeistungenAddon>) => {
    onChange({
      addons: value.addons.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  };
  const removeAddonById = (id: string) => {
    onChange({ addons: value.addons.filter((a) => a.id !== id) });
  };
  const addManualProduct = () => {
    onChange({
      addons: [
        ...value.addons,
        { id: genManualId(), group: "manual", label: "", price: 0 },
      ],
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--text-subtle)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("ordersDrawer.leistungen.noCatalog")}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pricing Strip */}
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/50 p-3 text-sm sm:grid-cols-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
            {t("ordersDrawer.leistungen.subtotal")}
          </div>
          <div className="font-semibold text-[var(--text-main)]">{formatCHF(pricing.subtotal)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
            {t("ordersDrawer.leistungen.discount")}
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={value.discountPercent}
              onChange={(e) => onChange({ discountPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
              className="w-14 rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-0.5 text-right text-sm"
            />
            <span className="text-xs text-[var(--text-subtle)]">% · {formatCHF(pricing.discountAmount)}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
            {t("ordersDrawer.leistungen.vat")}
          </div>
          <div className="font-semibold text-[var(--text-main)]">{formatCHF(pricing.vat)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
            {t("ordersDrawer.leistungen.total")}
          </div>
          <div className="text-base font-bold text-[var(--accent)]">{formatCHF(pricing.total)}</div>
        </div>
      </div>

      <PackageRadio
        packages={packages}
        selectedKey={value.packageKey}
        onSelect={(pkg) =>
          onChange(
            pkg
              ? { packageKey: pkg.key, packageLabel: pkg.label, packagePrice: pkg.price }
              : { packageKey: "", packageLabel: "", packagePrice: 0 },
          )
        }
        t={t}
      />

      {SECTION_GROUPS.map((sec) => {
        const list = addonsByGroup.get(sec.group) || [];
        if (!list.length) return null;
        const selectedInGroup = value.addons.filter((a) => a.group === sec.group);
        if (sec.mode === "multi-qty") {
          return (
            <AddonQtyGroup
              key={sec.group}
              addons={list}
              selected={selectedInGroup}
              area={area}
              floors={floors}
              labelKey={sec.labelKey}
              onChangeAddons={(next) => setManyAddons(sec.group, next)}
              t={t}
            />
          );
        }
        return (
          <AddonRadioRow
            key={sec.group}
            addons={list}
            selectedAddon={selectedInGroup[0] || null}
            area={area}
            floors={floors}
            labelKey={sec.labelKey}
            onChange={(next) => setAddonForGroup(sec.group, next)}
            t={t}
          />
        );
      })}

      {/* Express + Schluessel */}
      <section className="space-y-3">
        {expressAddon && (
          <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-soft)] px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={expressOn}
                onChange={(e) =>
                  toggleSimpleAddon(
                    expressAddon.id,
                    expressAddon.group,
                    expressAddon.label,
                    expressAddon.price,
                    e.target.checked,
                  )
                }
              />
              <span className="text-sm font-medium text-[var(--text-main)]">
                {t("ordersDrawer.leistungen.express24h")}
              </span>
            </div>
            <span className="text-sm text-[var(--text-subtle)]">{formatCHF(expressAddon.price)}</span>
          </label>
        )}

        {keyAddon && (
          <div className="rounded-lg border border-[var(--border-soft)] px-3 py-2">
            <label className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={keyPickupOn}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    if (enabled) {
                      toggleSimpleAddon(keyAddon.id, keyAddon.group, keyAddon.label, keyAddon.price, true);
                      onChange({ keyPickup: { ...value.keyPickup, enabled: true } });
                    } else {
                      toggleSimpleAddon(keyAddon.id, keyAddon.group, keyAddon.label, keyAddon.price, false);
                      onChange({ keyPickup: { ...value.keyPickup, enabled: false } });
                    }
                  }}
                />
                <span className="text-sm font-medium text-[var(--text-main)]">
                  {t("ordersDrawer.leistungen.schluesselabholung")}
                </span>
              </div>
              <span className="text-sm text-[var(--text-subtle)]">{formatCHF(keyAddon.price)}</span>
            </label>
            {keyPickupOn && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={value.keyPickup.address}
                  onChange={(e) => onChange({ keyPickup: { ...value.keyPickup, address: e.target.value } })}
                  placeholder={t("ordersDrawer.leistungen.schluesselabholungAddress")}
                  className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 text-sm"
                />
                <input
                  type="text"
                  value={value.keyPickup.notes}
                  onChange={(e) => onChange({ keyPickup: { ...value.keyPickup, notes: e.target.value } })}
                  placeholder={t("ordersDrawer.leistungen.schluesselabholungInfo")}
                  className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 text-sm"
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Manual products */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t("ordersDrawer.leistungen.manuellesProdukt")}
          </h3>
          <button
            type="button"
            onClick={addManualProduct}
            className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> {t("ordersDrawer.leistungen.addManualProduct")}
          </button>
        </div>
        <div className="space-y-2">
          {manualAddons.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg border border-[var(--border-soft)] px-3 py-2">
              <input
                type="text"
                value={m.label}
                onChange={(e) => updateManual(m.id, { label: e.target.value })}
                placeholder={t("ordersDrawer.leistungen.manualProductName")}
                className="flex-1 rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 text-sm"
              />
              <input
                type="number"
                min={0}
                step={0.05}
                value={m.price}
                onChange={(e) => updateManual(m.id, { price: Number(e.target.value) || 0 })}
                placeholder={t("ordersDrawer.leistungen.manualProductPrice")}
                className="w-28 rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 text-right text-sm"
              />
              <button
                type="button"
                onClick={() => removeAddonById(m.id)}
                className="text-[var(--text-subtle)] hover:text-red-500"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Travel zone */}
      <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 px-3 py-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[var(--text-main)]">{t("ordersDrawer.leistungen.anfahrtZone")}</span>
          <span className="text-[var(--text-subtle)]">
            {travelZoneAddon
              ? `${travelZoneAddon.label} · ${travelZoneAddon.price === 0 ? t("ordersDrawer.leistungen.zoneIncluded") : formatCHF(travelZoneAddon.price)}`
              : t("ordersDrawer.leistungen.zoneIncluded")}
          </span>
        </div>
      </section>
    </div>
  );
}
