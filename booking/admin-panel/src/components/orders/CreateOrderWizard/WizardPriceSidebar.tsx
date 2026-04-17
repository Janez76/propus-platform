import { Receipt } from "lucide-react";
import { useT } from "../../../hooks/useT";
import type { WizardFormState } from "./useWizardForm";
import type { PricingSelection } from "./useWizardForm";
import { KEY_PICKUP_PRICE } from "../../../lib/pricing";

type Props = {
  state: WizardFormState;
  pricing: PricingSelection;
};

export function WizardPriceSidebar({ state, pricing }: Props) {
  const t = useT();
  const hasAnyLine =
    pricing.packagePrice > 0 ||
    pricing.addonLines.length > 0 ||
    pricing.keyPickupCharged ||
    !!state.travelZone ||
    pricing.subtotal > 0;

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)]/60 p-5 flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-[var(--accent)]" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-subtle)]">
          {t("wizard.priceSidebar.title")}
        </h4>
      </header>

      {!hasAnyLine ? (
        <p className="text-sm text-[var(--text-subtle)] italic">
          {t("wizard.priceSidebar.empty")}
        </p>
      ) : (
        <>
          {state.packageLabel && pricing.packagePrice > 0 && (
            <div className="flex justify-between text-sm gap-3">
              <span className="text-[var(--text-muted)] truncate">{state.packageLabel}</span>
              <span className="font-semibold text-[var(--text-main)] tabular-nums">
                CHF {pricing.packagePrice.toFixed(2)}
              </span>
            </div>
          )}

          {pricing.addonLines.map((addon) => (
            <div key={addon.code} className="flex justify-between text-sm gap-3">
              <span className="text-[var(--text-subtle)] pl-3 flex items-center gap-1 truncate">
                <span className="text-[var(--accent)] text-xs">+</span>
                <span className="truncate">{addon.name}</span>
              </span>
              <span className="tabular-nums text-[var(--text-muted)]">
                CHF {addon.price.toFixed(2)}
              </span>
            </div>
          ))}

          {pricing.keyPickupCharged && (
            <div className="flex justify-between text-sm gap-3">
              <span className="text-[var(--text-subtle)] pl-3 flex items-center gap-1">
                <span className="text-[var(--accent)] text-xs">+</span>
                {t("orderDetail.label.keyPickupShort")}
              </span>
              <span className="tabular-nums text-[var(--text-muted)]">
                CHF {KEY_PICKUP_PRICE.toFixed(2)}
              </span>
            </div>
          )}

          {state.travelZone && (
            <div className="flex justify-between text-sm gap-3">
              <span className="text-[var(--text-subtle)] pl-3 flex items-center gap-1 truncate">
                <span className="text-[var(--accent)] text-xs">+</span>
                <span className="truncate">
                  {state.travelZoneLabel || `${t("wizard.travelZone.label")} ${state.travelZone}`}
                </span>
              </span>
              <span className="tabular-nums text-[var(--text-muted)]">
                {state.travelZonePrice > 0
                  ? `CHF ${state.travelZonePrice.toFixed(2)}`
                  : t("wizard.travelZone.included")}
              </span>
            </div>
          )}

          <div className="border-t border-[var(--border-soft)] pt-2 space-y-1.5">
            <div className="flex justify-between text-sm text-[var(--text-subtle)]">
              <span>{t("wizard.label.subtotal")}</span>
              <span className="tabular-nums">CHF {pricing.subtotal.toFixed(2)}</span>
            </div>
            {pricing.discount > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                <span>
                  {t("wizard.label.discount")}
                  {state.discountCode ? ` (${state.discountCode})` : ""}
                </span>
                <span className="tabular-nums">− CHF {pricing.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-[var(--text-subtle)]">
              <span>{t("wizard.label.vat")} (8.1%)</span>
              <span className="tabular-nums">CHF {pricing.vat.toFixed(2)}</span>
            </div>
          </div>

          <div className="border-t-2 border-[var(--accent)]/30 pt-3 flex justify-between items-center">
            <span className="font-bold text-base text-[var(--text-main)]">
              {t("wizard.label.total")}
            </span>
            <span className="text-xl font-bold text-[var(--accent)] tabular-nums">
              CHF {pricing.total.toFixed(2)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
