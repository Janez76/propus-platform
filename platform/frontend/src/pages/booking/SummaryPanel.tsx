import { useState, useCallback } from "react";
import { MapPin, Package, Camera, CalendarDays, Percent, ChevronDown, ChevronUp } from "lucide-react";
import { useBookingWizardStore } from "../../store/bookingWizardStore";
import { computePricing, formatCHF, type PricingConfig } from "../../lib/bookingPricing";
import { validateDiscount } from "../../api/bookingPublic";
import { t, type Lang } from "../../i18n";
import { cn, formatDateCH } from "../../lib/utils";

export function SummaryPanel({ lang, mobile }: { lang: Lang; mobile?: boolean }) {
  const {
    address, selectedPackage, addons, photographer, date, time,
    discount, setDiscount, config, keyPickup,
  } = useBookingWizardStore();

  const [discountInput, setDiscountInput] = useState(discount.code);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountError, setDiscountError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const pricingConfig: PricingConfig = {
    vatRate: config?.vatRate ?? 0.081,
    chfRoundingStep: config?.chfRoundingStep ?? 0.05,
  };
  const keyPickupPrice = keyPickup.enabled ? (config?.keyPickupPrice ?? 50) : 0;
  const subtotal = (selectedPackage?.price ?? 0) + addons.reduce((s, a) => s + a.price * a.qty, 0) + keyPickupPrice;
  const pricing = computePricing(subtotal, discount.percent, pricingConfig);

  const applyDiscount = useCallback(async () => {
    const code = discountInput.trim();
    if (!code) return;
    setDiscountLoading(true);
    setDiscountError("");
    try {
      const res = await validateDiscount(code);
      if (res.valid) {
        setDiscount({ code, percent: res.percent ?? 0, amount: res.amount ?? 0 });
        setDiscountError("");
      } else {
        setDiscountError(t(lang, "booking.summary.discountInvalid"));
        setDiscount({ code: "", percent: 0, amount: 0 });
      }
    } catch {
      setDiscountError(t(lang, "booking.summary.discountError"));
    } finally {
      setDiscountLoading(false);
    }
  }, [discountInput, lang, setDiscount]);

  const hasContent = !!(address || selectedPackage || addons.length > 0 || photographer || date);

  if (mobile) {
    return (
      <div className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {t(lang, "booking.summary.title")} {subtotal > 0 && <span className="ml-2 text-[#C5A059]">{formatCHF(pricing.total)}</span>}
          </span>
          {mobileOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {mobileOpen && <div className="border-t border-zinc-100 px-4 pb-4 dark:border-zinc-800">{renderContent()}</div>}
      </div>
    );
  }

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          {t(lang, "booking.summary.title")}
        </h3>
        {renderContent()}
      </div>
    </aside>
  );

  function renderContent() {
    if (!hasContent) {
      return <p className="text-xs text-zinc-400">{t(lang, "booking.summary.empty")}</p>;
    }

    return (
      <div className="space-y-4 text-sm">
        {address && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C5A059]" />
            <span className="text-zinc-700 dark:text-zinc-300">{address}</span>
          </div>
        )}

        {(selectedPackage || addons.length > 0) && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-zinc-500">
              <Package className="h-3 w-3" /> {t(lang, "booking.summary.services")}
            </div>
            {selectedPackage && (
              <div className="flex justify-between text-zinc-700 dark:text-zinc-300">
                <span>{selectedPackage.label}</span>
                <span className="font-medium">{formatCHF(selectedPackage.price)}</span>
              </div>
            )}
            {addons.map((a) => (
              <div key={a.id} className="flex justify-between text-zinc-700 dark:text-zinc-300">
                <span>{a.label}{a.qty > 1 ? ` x${a.qty}` : ""}</span>
                <span className="font-medium">{formatCHF(a.price * a.qty)}</span>
              </div>
            ))}
            {keyPickup.enabled && (
              <div className="flex justify-between text-zinc-700 dark:text-zinc-300">
                <span>{t(lang, "booking.step4.keyPickup")}</span>
                <span className="font-medium">{formatCHF(keyPickupPrice)}</span>
              </div>
            )}
          </div>
        )}

        {photographer && (
          <div className="flex items-center gap-2">
            <Camera className="h-3.5 w-3.5 text-[#C5A059]" />
            <span className="text-zinc-700 dark:text-zinc-300">{photographer.name}</span>
          </div>
        )}

        {date && (
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-[#C5A059]" />
            <span className="text-zinc-700 dark:text-zinc-300">{formatDateCH(date)}{time ? ` ${time}` : ""}</span>
          </div>
        )}

        {/* Rabattcode */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-zinc-500">
            <Percent className="h-3 w-3" /> {t(lang, "booking.summary.discountCode")}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
              placeholder="CODE"
              className={cn(
                "flex-1 rounded-lg border px-3 py-1.5 text-xs",
                "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800",
                "focus:outline-none focus:ring-1 focus:ring-[#C5A059]/30",
              )}
            />
            <button
              type="button"
              onClick={applyDiscount}
              disabled={discountLoading || !discountInput.trim()}
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {discountLoading ? "..." : t(lang, "booking.summary.apply")}
            </button>
          </div>
          {discount.percent > 0 && (
            <p className="text-xs text-emerald-600">-{discount.percent}%</p>
          )}
          {discountError && <p className="text-xs text-red-500">{discountError}</p>}
        </div>

        {/* Preise */}
        {subtotal > 0 && (
          <div className="space-y-1 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <div className="flex justify-between text-zinc-500">
              <span>{t(lang, "booking.summary.subtotal")}</span>
              <span>{formatCHF(pricing.subtotal)}</span>
            </div>
            {pricing.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>{t(lang, "booking.summary.discount")}</span>
                <span>-{formatCHF(pricing.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-500">
              <span>{t(lang, "booking.summary.vat")} ({((pricingConfig.vatRate) * 100).toFixed(1)}%)</span>
              <span>{formatCHF(pricing.vat)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-zinc-900 dark:text-zinc-100">
              <span>{t(lang, "booking.summary.total")}</span>
              <span className="text-[#C5A059]">{formatCHF(pricing.total)}</span>
            </div>
          </div>
        )}
      </div>
    );
  }
}
