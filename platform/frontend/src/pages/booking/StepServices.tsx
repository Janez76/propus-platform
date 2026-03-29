import { useState, useMemo } from "react";
import { Package, ChevronDown, ChevronUp, Star, X } from "lucide-react";
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
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors",
          hasSelected ? "bg-[#C5A059]/10 text-[#C5A059]" : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:text-zinc-300 dark:hover:bg-zinc-800",
        )}
      >
        <span>{category.name}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-1 bg-white p-3 dark:bg-zinc-900">
          {groupAddons.map((addon) => {
            const selected = selectedAddons.find((s) => s.id === addon.id);
            const price = addonPrice(addon, area, floors);
            return (
              <label
                key={addon.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 transition-colors",
                  selected ? "bg-[#C5A059]/5 ring-1 ring-[#C5A059]/30" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
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
                    className="h-4 w-4 rounded border-zinc-300 text-[#C5A059] focus:ring-[#C5A059]/30"
                  />
                  <span className="text-sm text-zinc-800 dark:text-zinc-200">{addon.label}</span>
                </div>
                <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">{formatCHF(price)}</span>
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
  const { catalog, selectedPackage, setPackage, addons } = useBookingWizardStore();

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
      <div className="flex items-center justify-center py-20 text-zinc-400">
        <div className="animate-pulse text-sm">{t(lang, "booking.loading")}</div>
      </div>
    );
  }

  if (packages.length === 0 && addonList.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50">
        {t(lang, "booking.step2.noCatalog")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pakete */}
      {packages.length > 0 && (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
            <Package className="h-4 w-4 text-[#C5A059]" /> {t(lang, "booking.step2.packages")}
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {packages.map((pkg) => {
              const active = selectedPackage?.key === pkg.key;
              return (
                <button
                  key={pkg.key}
                  type="button"
                  onClick={() => setPackage(active ? null : { key: pkg.key, price: pkg.price, label: pkg.label, labelKey: pkg.key })}
                  className={cn(
                    "relative rounded-xl border-2 p-5 text-left transition-all",
                    active
                      ? "border-[#C5A059] bg-[#C5A059]/5 shadow-md"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600",
                  )}
                >
                  {active && (
                    <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#C5A059] text-white">
                      <Star className="h-3 w-3" fill="currentColor" />
                    </div>
                  )}
                  <div className="mb-2 text-2xl">{HIGHLIGHT_ICONS[pkg.key] ?? "📦"}</div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{pkg.label}</div>
                  {pkg.description && (
                    <p className="mt-1 text-xs text-zinc-500 line-clamp-3">{pkg.description}</p>
                  )}
                  <div className="mt-3 text-lg font-bold text-[#C5A059]">{formatCHF(pkg.price)}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Modularer Builder */}
      {categories.length > 0 && (
        <section>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
            {t(lang, "booking.step2.addons")}
          </h3>
          <div className="space-y-2">
            {categories.map((cat) => (
              <CategoryAccordion key={cat.key} category={cat} addons={addonList} />
            ))}
          </div>
        </section>
      )}

      {/* Ausgewaehlte Addons */}
      {addons.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
          <h4 className="mb-2 text-xs font-semibold uppercase text-zinc-500">{t(lang, "booking.step2.selected")}</h4>
          <div className="space-y-1">
            {addons.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">{a.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-600 dark:text-zinc-400">{formatCHF(a.price)}</span>
                  <button type="button" onClick={() => useBookingWizardStore.getState().removeAddon(a.id)} className="text-zinc-400 hover:text-red-500">
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
