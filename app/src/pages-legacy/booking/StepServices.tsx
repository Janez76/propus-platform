import { useState, useMemo, useEffect } from "react";
import { Package, ChevronDown, ChevronUp, Star, X, Key } from "lucide-react";
import { useBookingWizardStore } from "../../store/bookingWizardStore";
import { computeTourPrice, formatCHF } from "../../lib/bookingPricing";
import type { CatalogAddon, CatalogCategory } from "../../api/bookingPublic";
import { t, type Lang } from "../../i18n";
import { cn } from "../../lib/utils";

function addonPrice(addon: CatalogAddon, area: number, floors: number): number {
  if (addon.pricingType === "byArea" || addon.pricingType === "per_area") {
    return computeTourPrice(area);
  }
  if (addon.pricingType === "per_floor" || addon.pricingType === "perFloor") {
    return (addon.unitPrice ?? addon.price) * floors;
  }
  return addon.price;
}

function CategoryAccordion({ category, addons }: { category: CatalogCategory; addons: CatalogAddon[] }) {
  const [open, setOpen] = useState(false);
  const { addons: selectedAddons, upsertAddon, removeAddonGroup, object } = useBookingWizardStore();
  const area = Number(object.area) || 0;
  const floors = object.floors || 1;

  const groupAddons = addons
    .filter((a) => a.categoryKey === category.key)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  if (groupAddons.length === 0) return null;

  const hasSelected = groupAddons.some((a) => selectedAddons.find((s) => s.id === a.id));

  return (
    <div className="rounded-lg border border-[var(--border-soft)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors",
          hasSelected ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--surface-raised)]/60 text-[var(--text-muted)] hover:bg-[var(--surface-raised)]",
        )}
      >
        <span>{category.name}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-1 bg-[var(--surface)] p-3">
          {category.description && (
            <p
              className="mb-2 px-1 text-xs text-[var(--text-subtle)]"
              dangerouslySetInnerHTML={{ __html: category.description }}
            />
          )}
          {groupAddons.map((addon) => {
            const selected = selectedAddons.find((s) => s.id === addon.id);
            const price = addonPrice(addon, area, floors);
            return (
              <label
                key={addon.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 transition-colors",
                  selected ? "bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]/30" : "hover:bg-[var(--surface-raised)]/70",
                )}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!selected}
                    onChange={() => {
                      if (selected) {
                        removeAddonGroup(addon.group);
                      } else {
                        removeAddonGroup(addon.group);
                        upsertAddon({ id: addon.id, group: addon.group, label: addon.label, labelKey: addon.id, price, qty: 1 });
                      }
                    }}
                    className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
                  />
                  <span className="text-sm text-[var(--text-main)]">{addon.label}</span>
                </div>
                <span className="text-sm font-semibold text-[var(--text-subtle)]">{formatCHF(price)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

const HIGHLIGHT_ICONS: Record<string, string> = {
  cinematic: "🎬",
  bestseller: "⭐",
  fullview: "🏠",
};

export function StepServices({ lang }: { lang: Lang }) {
  const { catalog, selectedPackage, setPackage, addons, keyPickup, setKeyPickup } = useBookingWizardStore();

  const hasKeyPickup = addons.some((a) => a.group === "keypickup");

  useEffect(() => {
    if (hasKeyPickup !== keyPickup.enabled) {
      setKeyPickup({ enabled: hasKeyPickup });
    }
  }, [hasKeyPickup, keyPickup.enabled, setKeyPickup]);

  const packages = useMemo(() =>
    (catalog?.packages ?? []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [catalog],
  );
  const addonList = catalog?.addons ?? [];
  const categories = useMemo(() =>
    (catalog?.categories ?? [])
      .filter((c) => c.active)
      .sort((a, b) => a.sort_order - b.sort_order),
    [catalog],
  );

  if (!catalog) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-subtle)]">
        <div className="animate-pulse text-sm">{t(lang, "booking.loading")}</div>
      </div>
    );
  }

  if (packages.length === 0 && addonList.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-raised)]/50 p-10 text-center text-sm text-[var(--text-subtle)]">
        {t(lang, "booking.step2.noCatalog")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pakete */}
      {packages.length > 0 && (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Package className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step2.packages")}
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {packages.map((pkg) => {
              const active = selectedPackage?.key === pkg.key;
              return (
                <button
                  key={pkg.key}
                  type="button"
                  data-testid={`booking-package-${pkg.key}`}
                  onClick={() => setPackage(active ? null : { key: pkg.key, price: pkg.price, label: pkg.label, labelKey: pkg.key })}
                  className={cn(
                    "relative rounded-xl border-2 p-5 text-left transition-all",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-md"
                      : "border-[var(--border-soft)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:shadow-sm dark:hover:shadow-none",
                  )}
                >
                  {active && (
                    <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                      <Star className="h-3 w-3" fill="currentColor" />
                    </div>
                  )}
                  <div className="mb-2 text-2xl">{HIGHLIGHT_ICONS[pkg.key] ?? "📦"}</div>
                  <div className="text-sm font-bold text-[var(--text-main)]">{pkg.label}</div>
                  {pkg.description && (
                    <p
                      className="mt-1 text-xs text-[var(--text-subtle)] line-clamp-3"
                      dangerouslySetInnerHTML={{ __html: pkg.description }}
                    />
                  )}
                  <div className="mt-3 text-lg font-bold text-[var(--accent)]">{formatCHF(pkg.price)}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Modularer Builder */}
      {categories.length > 0 && (
        <section>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {t(lang, "booking.step2.addons")}
          </h3>
          <div className="space-y-2">
            {categories.map((cat) => (
              <CategoryAccordion key={cat.key} category={cat} addons={addonList} />
            ))}
          </div>

          {hasKeyPickup && (
            <div className="mt-3 space-y-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
                <Key className="h-4 w-4" />
                {t(lang, "booking.step4.keyPickup")}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  {t(lang, "booking.step4.keyPickupAddress")}
                </label>
                <input
                  type="text"
                  value={keyPickup.address}
                  onChange={(e) => setKeyPickup({ address: e.target.value })}
                  placeholder={t(lang, "wizard.placeholder.keyPickupAddress")}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm text-[var(--text-main)]",
                    "border-[var(--border-soft)] bg-[var(--surface)]",
                    "focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30",
                    "placeholder:text-[var(--text-subtle)]",
                  )}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  {t(lang, "booking.step4.keyPickupInfo")}
                </label>
                <textarea
                  value={keyPickup.info}
                  onChange={(e) => setKeyPickup({ info: e.target.value })}
                  placeholder={t(lang, "wizard.placeholder.keyPickupInfo")}
                  rows={2}
                  className={cn(
                    "w-full resize-y rounded-lg border px-3 py-2 text-sm text-[var(--text-main)]",
                    "border-[var(--border-soft)] bg-[var(--surface)]",
                    "focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30",
                    "placeholder:text-[var(--text-subtle)]",
                  )}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Ausgewaehlte Addons */}
      {addons.length > 0 && (
        <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)]/50 p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase text-[var(--text-subtle)]">{t(lang, "booking.step2.selected")}</h4>
          <div className="space-y-1">
            {addons.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">{a.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text-subtle)]">{formatCHF(a.price)}</span>
                  <button type="button" onClick={() => useBookingWizardStore.getState().removeAddon(a.id)} className="text-[var(--text-subtle)] hover:text-red-500 dark:hover:text-red-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

