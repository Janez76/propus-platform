import { Building2, Users, UserPlus } from "lucide-react";
import { AddressAutocompleteInput } from "../../../ui/AddressAutocompleteInput";
import { DbFieldHint } from "../../../ui/DbFieldHint";
import { useT } from "../../../../hooks/useT";
import { useAuthStore } from "../../../../store/authStore";
import type { Lang } from "../../../../i18n";
import type { Product } from "../../../../api/products";
import type { CustomerContact } from "../../../../api/customers";
import type { WizardFormState, WizardAction } from "../useWizardForm";
import { estimatePrice } from "../useWizardForm";
import { INPUT_CLASS, LABEL_CLASS, SECTION_CLASS, SECTION_TITLE_CLASS } from "../styles";

type Props = {
  state: WizardFormState;
  dispatch: React.Dispatch<WizardAction>;
  catalog: Product[];
  customerContacts: CustomerContact[];
  onLookupTravelZone: (canton: string, zip: string) => void;
  onChangeTravelZoneProduct: (productCode: string) => void;
  isObjectAddressComplete: boolean;
  errors?: Partial<Record<keyof WizardFormState, string>>;
};

export function Step2Object({
  state,
  dispatch,
  catalog,
  customerContacts,
  onLookupTravelZone,
  onChangeTravelZoneProduct,
  isObjectAddressComplete,
  errors = {},
}: Props) {
  const t = useT();
  const lang = useAuthStore((s) => s.language) as Lang;

  return (
    <div className={SECTION_CLASS}>
      <div className={SECTION_TITLE_CLASS}>
        <Building2 className="h-4 w-4 text-[var(--accent)]" />
        {t("wizard.section.objectData")}
      </div>
      <div className="space-y-3">
        <div>
          <label className={LABEL_CLASS}>{t("wizard.label.addressRequired")}</label>
          <AddressAutocompleteInput
            required
            mode="street"
            value={state.address}
            onChange={(v) => dispatch({ type: "setField", key: "address", value: v })}
            onBlur={() => {
              if (!state.travelZone) {
                const zip =
                  state.zip ||
                  (state.address.match(/\b(\d{4})\b/)?.[1] ?? "");
                if (zip) onLookupTravelZone(state.objectCanton || "", zip);
              }
            }}
            onSelectParsed={(parsed) => {
              dispatch({ type: "setObjectAddress", parsed });
              if (parsed.canton || parsed.zip) {
                onLookupTravelZone(parsed.canton || "", parsed.zip || "");
              }
            }}
            onSelectZipcity={(zipcity) => {
              if (!zipcity) return;
              dispatch({ type: "setField", key: "zipcity", value: zipcity });
              const zipFromZipcity = zipcity.match(/^(\d{4})/)?.[1] || "";
              if (zipFromZipcity) onLookupTravelZone("", zipFromZipcity);
            }}
            lang={lang}
            className={INPUT_CLASS}
            placeholder="Bahnhofstrasse 12, 8001 Zürich"
            minChars={3}
          />
          <DbFieldHint fieldPath="address.text" />
          <p className="mt-1 text-xs text-[var(--text-subtle)]">
            {t("wizard.hint.fullStreetWithHouseNumber")}
          </p>
          {state.address && !isObjectAddressComplete && (
            <p className="mt-1 text-xs text-amber-500">{t("wizard.hint.addressNeedsHouseNumber")}</p>
          )}
          {errors.address && <p className="mt-1 text-xs text-red-500">{errors.address}</p>}

          {state.travelZone && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--accent)]/5 border border-[var(--accent)]/20 px-3 py-2">
              <span className="text-xs font-bold text-[var(--accent)]">
                {t("wizard.travelZone.label")}:
              </span>
              <select
                value={state.travelZoneProduct}
                onChange={(e) => onChangeTravelZoneProduct(e.target.value)}
                className="text-xs rounded-md bg-[var(--surface)] border border-[var(--border-soft)] px-2 py-1 text-[var(--text-main)]"
              >
                {catalog
                  .filter((p) => p.group_key === "travel_zone")
                  .map((p) => {
                    const price = estimatePrice(p, state.floors, state.area);
                    return (
                      <option key={p.code} value={p.code}>
                        {p.name}{" "}
                        {price > 0 ? `(CHF ${price})` : `(${t("wizard.travelZone.included")})`}
                      </option>
                    );
                  })}
              </select>
              <span className="text-xs text-[var(--text-subtle)]">
                {t("wizard.travelZone.auto")}
              </span>
            </div>
          )}
        </div>

        {/* Vor-Ort-Kontakt */}
        <div className="pt-3 border-t border-[var(--border-soft)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-2 flex items-center gap-1.5">
            {customerContacts.length > 0 ? (
              <Users className="h-3.5 w-3.5" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            {t("wizard.section.onsiteContact")}
          </p>

          {customerContacts.length > 0 && (
            <div className="mb-3">
              <label className={LABEL_CLASS}>Kontakt auswählen</label>
              <select
                value={state.selectedContactId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    dispatch({
                      type: "selectContact",
                      contactId: val,
                      fields: { onsiteName: "", onsitePhone: "" },
                    });
                  } else {
                    const contact = customerContacts.find((c) => String(c.id) === val);
                    if (contact) {
                      dispatch({
                        type: "selectContact",
                        contactId: val,
                        fields: {
                          onsiteName:
                            contact.name ||
                            `${contact.first_name || ""} ${contact.last_name || ""}`.trim() ||
                            state.onsiteName,
                          onsitePhone:
                            contact.phone ||
                            contact.phone_direct ||
                            contact.phone_mobile ||
                            state.onsitePhone,
                        },
                      });
                    }
                  }
                }}
                className={INPUT_CLASS}
              >
                <option value="">— Kein Kontakt vorausfüllen —</option>
                {customerContacts.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim()}
                    {c.role ? ` (${c.role})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>{t("wizard.label.onsiteName")}</label>
              <input
                type="text"
                value={state.onsiteName}
                onChange={(e) => dispatch({ type: "setField", key: "onsiteName", value: e.target.value })}
                className={INPUT_CLASS}
                placeholder="Vor-Ort-Name (optional)"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t("wizard.label.onsitePhone")}</label>
              <input
                type="tel"
                value={state.onsitePhone}
                onChange={(e) =>
                  dispatch({ type: "setField", key: "onsitePhone", value: e.target.value })
                }
                className={INPUT_CLASS}
                placeholder="+41 79 123 45 67"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3">
          <div>
            <label className={LABEL_CLASS}>{t("wizard.label.objectType")}</label>
            <select
              value={state.objectType}
              onChange={(e) => dispatch({ type: "setField", key: "objectType", value: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="apartment">{t("wizard.objectType.apartment")}</option>
              <option value="single_house">{t("wizard.objectType.singleHouse")}</option>
              <option value="multi_house">{t("wizard.objectType.multiHouse")}</option>
              <option value="commercial">{t("wizard.objectType.commercial")}</option>
              <option value="land">{t("wizard.objectType.land")}</option>
            </select>
            <DbFieldHint fieldPath="object.type" />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t("orderDetail.label.area")}</label>
            <input
              type="number"
              value={state.area}
              onChange={(e) => dispatch({ type: "setField", key: "area", value: e.target.value })}
              className={INPUT_CLASS}
              placeholder="120"
            />
            <DbFieldHint fieldPath="object.area" />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t("orderDetail.label.floors")}</label>
            <input
              type="number"
              value={state.floors}
              onChange={(e) => dispatch({ type: "setField", key: "floors", value: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t("orderDetail.label.rooms")}</label>
            <input
              type="text"
              value={state.rooms}
              onChange={(e) => dispatch({ type: "setField", key: "rooms", value: e.target.value })}
              className={INPUT_CLASS}
              placeholder="4.5"
            />
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>{t("wizard.label.description")}</label>
          <textarea
            value={state.desc}
            onChange={(e) => dispatch({ type: "setField", key: "desc", value: e.target.value })}
            className={INPUT_CLASS}
            rows={3}
            placeholder={t("wizard.placeholder.description")}
          />
        </div>
      </div>
    </div>
  );
}
