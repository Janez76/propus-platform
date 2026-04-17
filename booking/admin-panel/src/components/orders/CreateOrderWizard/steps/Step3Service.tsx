import { Package } from "lucide-react";
import { Package as PackageIcon } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { useT } from "../../../../hooks/useT";
import type { Product } from "../../../../api/products";
import type { WizardFormState, WizardAction } from "../useWizardForm";
import { estimatePrice } from "../useWizardForm";
import { INPUT_CLASS, LABEL_CLASS, SECTION_CLASS, SECTION_TITLE_CLASS } from "../styles";
import { EmptyState } from "../../../ui/empty-state";

type Props = {
  state: WizardFormState;
  dispatch: React.Dispatch<WizardAction>;
  catalog: Product[];
  errors?: Partial<Record<keyof WizardFormState, string>>;
};

export function Step3Service({ state, dispatch, catalog, errors = {} }: Props) {
  const t = useT();
  const packages = catalog.filter((p) => p.kind === "package");
  const addons = catalog.filter((p) => p.kind === "addon" && p.group_key !== "travel_zone");

  return (
    <div className="space-y-5">
      <div className={SECTION_CLASS}>
        <div className={SECTION_TITLE_CLASS}>
          <Package className="h-4 w-4 text-[var(--accent)]" />
          {t("wizard.section.servicePackage")}
        </div>
        {packages.length === 0 && addons.length === 0 ? (
          <EmptyState
            icon={<PackageIcon className="h-6 w-6 text-[var(--text-subtle)]" />}
            title={t("catalog.searchPlaceholder")}
            description={t("wizard.hint.addonFormat")}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>{t("orderDetail.label.package")}</label>
              <select
                value={state.selectedPackageCode}
                onChange={(e) => {
                  const code = e.target.value;
                  const pkg = catalog.find((p) => p.code === code);
                  dispatch({
                    type: "selectPackage",
                    code,
                    label: pkg?.name || "",
                    price: pkg ? estimatePrice(pkg, state.floors, state.area) : 0,
                  });
                }}
                className={INPUT_CLASS}
              >
                <option value="">{t("wizard.select.noPackage")}</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
              {errors.selectedPackageCode && (
                <p className="mt-1 text-xs text-red-500">{errors.selectedPackageCode}</p>
              )}
            </div>
            <div>
              <label className={LABEL_CLASS}>{t("wizard.label.packagePrice")}</label>
              <input
                type="number"
                step="0.01"
                value={state.packagePrice}
                onChange={(e) =>
                  dispatch({ type: "setField", key: "packagePrice", value: e.target.value })
                }
                className={INPUT_CLASS}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>{t("wizard.label.products")}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 max-h-40 overflow-auto rounded-lg border border-[var(--border-soft)] p-2">
                {addons.map((addon) => (
                  <label key={addon.id} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.selectedAddonCodes.includes(addon.code)}
                      onChange={(e) =>
                        dispatch({ type: "toggleAddon", code: addon.code, checked: e.target.checked })
                      }
                    />
                    <span>{addon.name}</span>
                  </label>
                ))}
              </div>
              <label className={LABEL_CLASS}>{t("wizard.label.addons")}</label>
              <textarea
                value={state.addonsText}
                onChange={(e) => dispatch({ type: "setField", key: "addonsText", value: e.target.value })}
                className={INPUT_CLASS}
                rows={3}
                placeholder={"Drohnenaufnahmen;500\nVirtuelle Tour;800"}
              />
              <p className="text-xs text-[var(--text-subtle)] mt-1">{t("wizard.hint.addonFormat")}</p>
            </div>

            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={state.keyPickupActive}
                  onChange={(e) => dispatch({ type: "toggleKeyPickup", active: e.target.checked })}
                />
                {t("orderDetail.label.keyPickup")}
              </label>
              {state.keyPickupActive && (
                <textarea
                  value={state.keyPickupAddress}
                  onChange={(e) => dispatch({ type: "setKeyPickupAddress", address: e.target.value })}
                  className={cn(INPUT_CLASS, "mt-2")}
                  rows={2}
                  placeholder={t("wizard.placeholder.keyPickupInfo")}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className={SECTION_CLASS}>
        <div className={SECTION_TITLE_CLASS}>
          <Package className="h-4 w-4 text-[var(--accent)]" />
          {t("wizard.label.discountCode")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>{t("wizard.label.discount")}</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={state.discount}
                onChange={(e) => dispatch({ type: "setDiscount", value: e.target.value })}
                className={cn(INPUT_CLASS, "pr-12")}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-subtle)] pointer-events-none">
                CHF
              </span>
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t("wizard.label.discountCode")}</label>
            <input
              type="text"
              value={state.discountCode}
              onChange={(e) =>
                dispatch({ type: "setField", key: "discountCode", value: e.target.value })
              }
              className={INPUT_CLASS}
              placeholder="z.B. SUMMER10"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
