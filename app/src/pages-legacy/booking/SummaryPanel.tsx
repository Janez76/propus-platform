import { useState, useCallback, useEffect } from "react";
import { MapPin, Package, Camera, CalendarDays, Percent, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useBookingWizardStore } from "../../store/bookingWizardStore";
import { computePricing, formatCHF, type PricingConfig } from "../../lib/bookingPricing";
import { validateDiscount } from "../../api/bookingPublic";
import { t, type Lang } from "../../i18n";
import { bookingPhotographerLabel } from "../../lib/bookingLabels";
import { cn, formatDateCH } from "../../lib/utils";

export function SummaryPanel({
  lang,
  mobile,
  onDraftRestart,
}: {
  lang: Lang;
  mobile?: boolean;
  /** Nach Zurücksetzen z. B. Validierungsfehler in der Wizard-Seite leeren */
  onDraftRestart?: () => void;
}) {
  const {
    address, selectedPackage, addons, photographer, date, time,
    discount, setDiscount, config, reset,
  } = useBookingWizardStore();

  const [discountInput, setDiscountInput] = useState(discount.code);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountError, setDiscountError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setDiscountInput(discount.code);
  }, [discount.code]);

  const pricingConfig: PricingConfig = {
    vatRate: config?.vatRate ?? 0.081,
    chfRoundingStep: config?.chfRoundingStep ?? 0.05,
  };
  const subtotal = (selectedPackage?.price ?? 0) + addons.reduce((s, a) => s + a.price * a.qty, 0);
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

  function handleRestart() {
    if (!window.confirm(t(lang, "booking.summary.restartConfirm"))) return;
    reset();
    setDiscountInput("");
    setDiscountError("");
    onDraftRestart?.();
    window.scrollTo(0, 0);
  }

  const hasContent = !!(address || selectedPackage || addons.length > 0 || photographer || date);

  if (mobile) {
    return (
      <div className="sticky top-0 z-30 border-b border-[var(--border-soft)] bg-[var(--surface)]/95 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <span className="text-sm font-semibold text-[var(--text-muted)]">
            {t(lang, "booking.summary.title")} {subtotal > 0 && <span className="ml-2 text-[var(--accent)]">{formatCHF(pricing.total)}</span>}
          </span>
          {mobileOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {mobileOpen && <div className="border-t border-[var(--border-soft)] px-4 pb-4">{renderContent()}</div>}
      </div>
    );
  }

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-6 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t(lang, "booking.summary.title")}
        </h3>
        {renderContent()}
      </div>
    </aside>
  );

  function renderContent() {
    if (!hasContent) {
      return (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-subtle)]">{t(lang, "booking.summary.empty")}</p>
          <button
            type="button"
            onClick={handleRestart}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-soft)] py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-raised)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t(lang, "booking.summary.restart")}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4 text-sm">
        {address && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            <span className="text-[var(--text-muted)]">{address}</span>
          </div>
        )}

        {(selectedPackage || addons.length > 0) && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--text-subtle)]">
              <Package className="h-3 w-3" /> {t(lang, "booking.summary.services")}
            </div>
            {selectedPackage && (
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>{selectedPackage.label}</span>
                <span className="font-medium">{formatCHF(selectedPackage.price)}</span>
              </div>
            )}
            {addons.map((a) => (
              <div key={a.id} className="flex justify-between text-[var(--text-muted)]">
                <span>{a.label}{a.qty > 1 ? ` x${a.qty}` : ""}</span>
                <span className="font-medium">{formatCHF(a.price * a.qty)}</span>
              </div>
            ))}
          </div>
        )}

        {photographer && (
          <div className="flex items-center gap-2">
            <Camera className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="text-[var(--text-muted)]">{bookingPhotographerLabel(lang, photographer)}</span>
          </div>
        )}

        {date && (
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="text-[var(--text-muted)]">{formatDateCH(date)}{time ? ` ${time}` : ""}</span>
          </div>
        )}

        {/* Rabattcode */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--text-subtle)]">
            <Percent className="h-3 w-3" /> {t(lang, "booking.summary.discountCode")}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
              placeholder="CODE"
              className={cn(
                "flex-1 rounded-lg border px-3 py-1.5 text-xs text-[var(--text-main)]",
                "border-[var(--border-soft)] bg-[var(--surface-raised)]",
                "focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30 focus:bg-[var(--surface)]",
              )}
            />
            <button
              type="button"
              onClick={applyDiscount}
              disabled={discountLoading || !discountInput.trim()}
              className="rounded-lg bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:opacity-90 disabled:opacity-50"
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
          <div className="space-y-1 border-t border-[var(--border-soft)] pt-3">
            <div className="flex justify-between text-[var(--text-subtle)]">
              <span>{t(lang, "booking.summary.subtotal")}</span>
              <span>{formatCHF(pricing.subtotal)}</span>
            </div>
            {pricing.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>{t(lang, "booking.summary.discount")}</span>
                <span>-{formatCHF(pricing.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[var(--text-subtle)]">
              <span>{t(lang, "booking.summary.vat")} ({((pricingConfig.vatRate) * 100).toFixed(1)}%)</span>
              <span>{formatCHF(pricing.vat)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-[var(--text-main)]">
              <span>{t(lang, "booking.summary.total")}</span>
              <span className="text-[var(--accent)]">{formatCHF(pricing.total)}</span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleRestart}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-soft)] py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-raised)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t(lang, "booking.summary.restart")}
        </button>
      </div>
    );
  }
}

