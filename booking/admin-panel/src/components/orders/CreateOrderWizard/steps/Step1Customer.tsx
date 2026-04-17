import { User } from "lucide-react";
import { CustomerAutocompleteInput } from "../../../ui/CustomerAutocompleteInput";
import { AddressAutocompleteInput } from "../../../ui/AddressAutocompleteInput";
import { DbFieldHint } from "../../../ui/DbFieldHint";
import { useT } from "../../../../hooks/useT";
import { useAuthStore } from "../../../../store/authStore";
import type { Lang } from "../../../../i18n";
import type { CustomerContact } from "../../../../api/customers";
import type { WizardFormState, WizardAction } from "../useWizardForm";
import {
  INPUT_CLASS,
  LABEL_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from "../styles";

type Props = {
  state: WizardFormState;
  dispatch: React.Dispatch<WizardAction>;
  token: string;
  customerContacts: CustomerContact[];
  onSelectCustomer: (customer: Parameters<typeof CustomerAutocompleteInput>[0]["onSelectCustomer"] extends ((c: infer C) => void) | undefined ? C : never) => void;
  onContactListRefresh: (customerId: number) => void;
  errors?: Partial<Record<keyof WizardFormState, string>>;
};

export function Step1Customer({
  state,
  dispatch,
  token,
  customerContacts,
  onSelectCustomer,
  errors = {},
}: Props) {
  const t = useT();
  const lang = useAuthStore((s) => s.language) as Lang;
  const showManual =
    customerContacts.length === 0 || state.selectedContactId === "" || state.selectedContactId === "new";
  const showFilled =
    customerContacts.length > 0 && state.selectedContactId !== "" && state.selectedContactId !== "new";

  return (
    <div className={SECTION_CLASS}>
      <div className={SECTION_TITLE_CLASS}>
        <User className="h-4 w-4 text-[var(--accent)]" />
        {t("wizard.section.customerData")}
      </div>
      <div className="space-y-3">
        <div>
          <label className={LABEL_CLASS}>{t("common.company")}</label>
          <CustomerAutocompleteInput
            value={state.company}
            onChange={(v) => dispatch({ type: "setField", key: "company", value: v })}
            onSelectCustomer={onSelectCustomer}
            selectValue={(c) => c.company || ""}
            token={token}
            className={INPUT_CLASS}
            placeholder={t("wizard.placeholder.company")}
          />
        </div>

        {customerContacts.length > 0 && (
          <div>
            <label className={LABEL_CLASS}>Ansprechpartner</label>
            <select
              value={state.selectedContactId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || val === "new") {
                  dispatch({
                    type: "selectContact",
                    contactId: val,
                    fields: { customerName: "", customerEmail: "", customerPhone: "" },
                  });
                } else {
                  const contact = customerContacts.find((c) => String(c.id) === val);
                  if (contact) {
                    dispatch({
                      type: "selectContact",
                      contactId: val,
                      fields: {
                        salutation: contact.salutation || state.salutation,
                        first_name: contact.first_name || state.first_name,
                        customerName:
                          contact.name ||
                          `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
                        customerEmail: contact.email || state.customerEmail,
                        customerPhone:
                          contact.phone || contact.phone_direct || contact.phone_mobile || state.customerPhone,
                      },
                    });
                  }
                }
              }}
              className={INPUT_CLASS}
            >
              <option value="">— Kontakt auswählen —</option>
              {customerContacts.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim()}
                  {c.role ? ` (${c.role})` : ""}
                </option>
              ))}
              <option value="new">+ Manuell eingeben</option>
            </select>
          </div>
        )}

        {showManual && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>{t("wizard.label.customerRequired")}</label>
              <CustomerAutocompleteInput
                required
                value={state.customerName}
                onChange={(v) => dispatch({ type: "setField", key: "customerName", value: v })}
                onSelectCustomer={onSelectCustomer}
                token={token}
                className={INPUT_CLASS}
                placeholder={t("wizard.placeholder.name")}
              />
              <DbFieldHint fieldPath="billing.name" />
              {errors.customerName && <p className="mt-1 text-xs text-red-500">{errors.customerName}</p>}
            </div>
            <div>
              <label className={LABEL_CLASS}>{t("wizard.label.emailRequired")}</label>
              <CustomerAutocompleteInput
                required
                type="email"
                value={state.customerEmail}
                onChange={(v) => dispatch({ type: "setField", key: "customerEmail", value: v })}
                onSelectCustomer={onSelectCustomer}
                token={token}
                className={INPUT_CLASS}
                placeholder={t("wizard.placeholder.email")}
              />
              <DbFieldHint fieldPath="billing.email" />
              {errors.customerEmail && <p className="mt-1 text-xs text-red-500">{errors.customerEmail}</p>}
            </div>
            <div>
              <label className={LABEL_CLASS}>{t("common.phone")}</label>
              <CustomerAutocompleteInput
                type="tel"
                value={state.customerPhone}
                onChange={(v) => dispatch({ type: "setField", key: "customerPhone", value: v })}
                onSelectCustomer={onSelectCustomer}
                token={token}
                className={INPUT_CLASS}
                placeholder="+41 79 123 45 67"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t("booking.step4.mobile")}</label>
              <input
                type="tel"
                value={state.customerPhoneMobile}
                onChange={(e) =>
                  dispatch({ type: "setField", key: "customerPhoneMobile", value: e.target.value })
                }
                className={INPUT_CLASS}
                placeholder="+41 79 123 45 67"
              />
            </div>
          </div>
        )}

        {showFilled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>{t("wizard.label.customerRequired")}</label>
              <input
                type="text"
                value={state.customerName}
                onChange={(e) => dispatch({ type: "setField", key: "customerName", value: e.target.value })}
                className={INPUT_CLASS}
                placeholder={t("wizard.placeholder.name")}
              />
              <DbFieldHint fieldPath="billing.name" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t("wizard.label.emailRequired")}</label>
              <input
                type="email"
                value={state.customerEmail}
                onChange={(e) => dispatch({ type: "setField", key: "customerEmail", value: e.target.value })}
                className={INPUT_CLASS}
                placeholder={t("wizard.placeholder.email")}
              />
              <DbFieldHint fieldPath="billing.email" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t("common.phone")}</label>
              <input
                type="tel"
                value={state.customerPhone}
                onChange={(e) => dispatch({ type: "setField", key: "customerPhone", value: e.target.value })}
                className={INPUT_CLASS}
                placeholder="+41 79 123 45 67"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t("booking.step4.mobile")}</label>
              <input
                type="tel"
                value={state.customerPhoneMobile}
                onChange={(e) =>
                  dispatch({ type: "setField", key: "customerPhoneMobile", value: e.target.value })
                }
                className={INPUT_CLASS}
                placeholder="+41 79 123 45 67"
              />
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-[var(--border-soft)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-2">
            {t("wizard.section.billingAddress")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>{t("wizard.label.billingStreet")} *</label>
              <AddressAutocompleteInput
                mode="street"
                value={state.billingStreet}
                onChange={(v) => dispatch({ type: "setField", key: "billingStreet", value: v })}
                onSelectParsed={(parsed) => dispatch({ type: "setBillingAddress", parsed })}
                onSelectZipcity={(zipcity) => {
                  if (!zipcity) return;
                  const m = zipcity.match(/^(\d{4,5})\s+(.+)$/);
                  dispatch({
                    type: "patch",
                    patch: {
                      billingZipcity: zipcity,
                      billingZip: m ? m[1] : state.billingZip,
                      billingCity: m ? m[2] : state.billingCity,
                    },
                  });
                }}
                lang={lang}
                className={INPUT_CLASS}
                placeholder="Musterstrasse 12"
                minChars={3}
              />
              <DbFieldHint fieldPath="billing.street" />
              {errors.billingStreet && <p className="mt-1 text-xs text-red-500">{errors.billingStreet}</p>}
            </div>
            <div>
              <label className={LABEL_CLASS}>{t("wizard.label.billingZip")} *</label>
              <input
                type="text"
                value={state.billingZip}
                onChange={(e) => {
                  dispatch({
                    type: "patch",
                    patch: {
                      billingZip: e.target.value,
                      billingZipcity: `${e.target.value} ${state.billingCity}`.trim(),
                    },
                  });
                }}
                className={INPUT_CLASS}
                placeholder="8001"
              />
              {errors.billingZip && <p className="mt-1 text-xs text-red-500">{errors.billingZip}</p>}
            </div>
            <div>
              <label className={LABEL_CLASS}>{t("wizard.label.billingCity")} *</label>
              <input
                type="text"
                value={state.billingCity}
                onChange={(e) => {
                  dispatch({
                    type: "patch",
                    patch: {
                      billingCity: e.target.value,
                      billingZipcity: `${state.billingZip} ${e.target.value}`.trim(),
                    },
                  });
                }}
                className={INPUT_CLASS}
                placeholder="Zürich"
              />
              {errors.billingCity && <p className="mt-1 text-xs text-red-500">{errors.billingCity}</p>}
            </div>
          </div>
        </div>

        <div className="pt-3">
          <label className={LABEL_CLASS}>
            {t("wizard.label.ccEmails")}
            <span className="ml-1 font-normal text-[var(--text-subtle)] text-xs normal-case tracking-normal">
              {t("wizard.hint.ccEmails")}
            </span>
          </label>
          <input
            type="text"
            value={state.attendeeEmails}
            onChange={(e) => dispatch({ type: "setField", key: "attendeeEmails", value: e.target.value })}
            className={INPUT_CLASS}
            placeholder="a@beispiel.ch, b@beispiel.ch"
          />
        </div>
      </div>
    </div>
  );
}
