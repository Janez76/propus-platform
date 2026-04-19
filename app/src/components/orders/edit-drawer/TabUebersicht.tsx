import { useCallback, useMemo, useRef } from "react";
import { Building2, CreditCard, MapPin, Plus, Trash2, User } from "lucide-react";
import { AddressAutocompleteInput, type ParsedAddress, type StreetContext } from "../../ui/AddressAutocompleteInput";
import { randomUUID } from "../../../lib/selekto/randomId";
import { t, type Lang } from "../../../i18n";
import { cn } from "../../../lib/utils";
import type { AddressRow, BillingMode, ContactRow, UebersichtForm } from "./types";
import { NEW_CONTACT } from "./types";

const inputClass = cn(
  "w-full rounded-lg border px-3 py-2.5 text-sm transition-colors",
  "bg-[var(--surface-raised)]",
  "border-[var(--border-soft)]",
  "text-[var(--text-main)]",
  "placeholder:text-[var(--text-subtle)]",
  "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] focus:bg-[var(--surface)]",
);

const labelClass = "block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1.5";

type AddressBlockProps = {
  lang: Lang;
  value: AddressRow;
  onChange: (patch: Partial<AddressRow>) => void;
  testIdPrefix?: string;
};

function AddressBlock({ lang, value, onChange, testIdPrefix }: AddressBlockProps) {
  const sessionTokenRef = useRef(randomUUID());
  const streetContext = useMemo<StreetContext | undefined>(() => {
    if (!value.street) return undefined;
    return { street: value.street, zip: value.zip, city: value.city };
  }, [value.street, value.zip, value.city]);

  const zipEditable = Boolean(value.street);
  const zipMissing = Boolean(value.street) && !value.zip;

  const onSelectStreet = useCallback((p: ParsedAddress) => {
    onChange({
      street: p.street,
      houseNumber: p.houseNumber ?? "",
      zip: p.zip,
      city: p.city,
    });
    sessionTokenRef.current = randomUUID();
  }, [onChange]);

  const onSelectHouseNumber = useCallback(
    (payload: { houseNumber: string }) => onChange({ houseNumber: payload.houseNumber }),
    [onChange],
  );

  const tid = (s: string) => (testIdPrefix ? `${testIdPrefix}-${s}` : undefined);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label className={labelClass}>
          {t(lang, "booking.step1.street")} <span className="text-red-500">*</span>
        </label>
        <AddressAutocompleteInput
          data-testid={tid("street")}
          value={value.street}
          onChange={(v) => onChange({ street: v })}
          mode="street"
          allowPartial
          sessionToken={sessionTokenRef.current}
          onSelectParsed={onSelectStreet}
          lang={lang}
          className={inputClass}
          placeholder={t(lang, "booking.step1.streetPlaceholder")}
        />
      </div>
      <div>
        <label className={labelClass}>
          {t(lang, "booking.step1.houseNumber")} <span className="text-red-500">*</span>
        </label>
        {streetContext ? (
          <AddressAutocompleteInput
            data-testid={tid("housenumber")}
            value={value.houseNumber}
            onChange={(v) => onChange({ houseNumber: v })}
            mode="houseNumber"
            streetContext={streetContext}
            sessionToken={sessionTokenRef.current}
            onSelectHouseNumber={onSelectHouseNumber}
            lang={lang}
            className={inputClass}
            placeholder={t(lang, "booking.step1.houseNumberPlaceholder")}
          />
        ) : (
          <input
            type="text"
            disabled
            className={cn(inputClass, "cursor-not-allowed opacity-50")}
            placeholder={t(lang, "booking.step1.houseNumberHint")}
          />
        )}
      </div>
      <div>
        <label className={labelClass}>
          {t(lang, "booking.step1.zip")}
          {zipMissing ? <span className="text-red-500"> *</span> : null}
        </label>
        <input
          type="text"
          readOnly={!zipEditable}
          value={value.zip}
          onChange={(e) => onChange({ zip: e.target.value })}
          className={cn(inputClass, zipEditable ? "" : "cursor-default select-none")}
          placeholder={zipEditable ? "z. B. 8050" : "—"}
          tabIndex={zipEditable ? 0 : -1}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          data-testid={tid("zip")}
        />
        {zipMissing ? (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t(lang, "booking.step1.zipMissingHint")}</p>
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>{t(lang, "booking.step1.city")}</label>
        <input
          type="text"
          readOnly
          value={value.city}
          className={cn(inputClass, "cursor-default select-none")}
          placeholder="—"
          tabIndex={-1}
        />
      </div>
      <div className="sm:col-span-3">
        <label className={labelClass}>{t(lang, "booking.step1.addressSuffix")}</label>
        <input
          data-testid={tid("suffix")}
          type="text"
          autoComplete="off"
          value={value.addressSuffix}
          onChange={(e) => onChange({ addressSuffix: e.target.value })}
          className={inputClass}
          placeholder={t(lang, "booking.step1.addressSuffixPlaceholder")}
        />
      </div>
    </div>
  );
}

type Props = {
  lang: Lang;
  value: UebersichtForm;
  onChange: (patch: Partial<UebersichtForm>) => void;
};

export function TabUebersicht({ lang, value, onChange }: Props) {
  const setMode = (mode: BillingMode) => {
    if (mode === value.mode) return;
    if (mode === "private") {
      onChange({ mode, altBilling: { ...value.altBilling, enabled: false } });
    } else {
      onChange({ mode });
    }
  };

  const setCompany = (patch: Partial<UebersichtForm["company"]>) =>
    onChange({ company: { ...value.company, ...patch } });

  const setCompanyAddress = (patch: Partial<AddressRow>) =>
    setCompany({ address: { ...value.company.address, ...patch } });

  const setContacts = (next: ContactRow[]) => onChange({ contacts: next });
  const updateContact = (idx: number, patch: Partial<ContactRow>) =>
    setContacts(value.contacts.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const addContact = () => setContacts([...value.contacts, NEW_CONTACT()]);
  const removeContact = (idx: number) => setContacts(value.contacts.filter((_, i) => i !== idx));

  const setAltBilling = (patch: Partial<UebersichtForm["altBilling"]>) =>
    onChange({ altBilling: { ...value.altBilling, ...patch } });
  const setAltCompany = (patch: Partial<UebersichtForm["altBilling"]["company"]>) =>
    setAltBilling({ company: { ...value.altBilling.company, ...patch } });
  const setAltAddress = (patch: Partial<AddressRow>) =>
    setAltCompany({ address: { ...value.altBilling.company.address, ...patch } });

  const setPrivate = (patch: Partial<UebersichtForm["privateData"]>) =>
    onChange({ privateData: { ...value.privateData, ...patch } });
  const setPrivateAddress = (patch: Partial<AddressRow>) =>
    setPrivate({ address: { ...value.privateData.address, ...patch } });

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
        <label className={labelClass}>{t(lang, "booking.step4.modeLabel")}</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="edit-billing-mode-company"
            onClick={() => setMode("company")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all",
              value.mode === "company"
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--border-strong)]",
            )}
          >
            <Building2 className="h-4 w-4" /> {t(lang, "booking.step4.mode.company")}
          </button>
          <button
            type="button"
            data-testid="edit-billing-mode-private"
            onClick={() => setMode("private")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all",
              value.mode === "private"
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--border-strong)]",
            )}
          >
            <User className="h-4 w-4" /> {t(lang, "booking.step4.mode.private")}
          </button>
        </div>
      </section>

      {value.mode === "company" && (
        <>
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Building2 className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.companyDetails")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  {t(lang, "booking.step4.company")} <span className="text-red-500">*</span>
                </label>
                <input
                  data-testid="edit-input-company"
                  type="text"
                  autoComplete="off"
                  value={value.company.name}
                  onChange={(e) => setCompany({ name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t(lang, "booking.step4.orderRef")}</label>
                <input
                  type="text"
                  autoComplete="off"
                  value={value.company.orderRef}
                  onChange={(e) => setCompany({ orderRef: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <MapPin className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.address")}
            </h3>
            <AddressBlock
              lang={lang}
              value={value.company.address}
              onChange={setCompanyAddress}
              testIdPrefix="edit-billing"
            />
          </section>

          <ContactsSection
            lang={lang}
            contacts={value.contacts}
            updateContact={updateContact}
            addContact={addContact}
            removeContact={removeContact}
          />

          <label className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-4">
            <input
              type="checkbox"
              checked={value.altBilling.enabled}
              onChange={(e) => setAltBilling({ enabled: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-muted)]">{t(lang, "booking.step4.altBilling")}</span>
          </label>

          {value.altBilling.enabled && (
            <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t(lang, "booking.step4.altBillingTitle")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {t(lang, "booking.step4.company")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={value.altBilling.company.name}
                    onChange={(e) => setAltCompany({ name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>{t(lang, "booking.step4.orderRef")}</label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={value.altBilling.company.orderRef}
                    onChange={(e) => setAltCompany({ orderRef: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="mt-4">
                <AddressBlock
                  lang={lang}
                  value={value.altBilling.company.address}
                  onChange={setAltAddress}
                  testIdPrefix="edit-alt"
                />
              </div>
              <div className="mt-4">
                <label className={labelClass}>{t(lang, "booking.step4.notes")}</label>
                <textarea
                  value={value.altBilling.notes}
                  onChange={(e) => setAltBilling({ notes: e.target.value })}
                  rows={2}
                  className={cn(inputClass, "resize-none")}
                />
              </div>
            </section>
          )}
        </>
      )}

      {value.mode === "private" && (
        <>
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <User className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.privateDetails")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{t(lang, "booking.step4.salutation")}</label>
                <select
                  value={value.privateData.salutation}
                  onChange={(e) => setPrivate({ salutation: e.target.value })}
                  className={inputClass}
                >
                  <option value="">--</option>
                  <option value="Herr">{t(lang, "booking.step4.mr")}</option>
                  <option value="Frau">{t(lang, "booking.step4.mrs")}</option>
                </select>
              </div>
              <div />
              <div>
                <label className={labelClass}>{t(lang, "booking.step4.firstName")}</label>
                <input
                  type="text"
                  autoComplete="off"
                  value={value.privateData.firstName}
                  onChange={(e) => setPrivate({ firstName: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t(lang, "booking.step4.lastName")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={value.privateData.lastName}
                  onChange={(e) => setPrivate({ lastName: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t(lang, "booking.step4.email")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  autoComplete="off"
                  value={value.privateData.email}
                  onChange={(e) => setPrivate({ email: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t(lang, "booking.step4.phone")}</label>
                <input
                  type="tel"
                  autoComplete="off"
                  value={value.privateData.phone}
                  onChange={(e) => setPrivate({ phone: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t(lang, "booking.step4.mobile")}</label>
                <input
                  type="tel"
                  autoComplete="off"
                  value={value.privateData.phoneMobile}
                  onChange={(e) => setPrivate({ phoneMobile: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <MapPin className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.privateAddress")}
            </h3>
            <AddressBlock
              lang={lang}
              value={value.privateData.address}
              onChange={setPrivateAddress}
              testIdPrefix="edit-private"
            />
          </section>
        </>
      )}

      {/* Notes (always visible) */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
        <label className={labelClass}>{t(lang, "ordersDrawer.notes.customer")}</label>
        <textarea
          data-testid="edit-input-customer-notes"
          value={value.customerNotes}
          onChange={(e) => onChange({ customerNotes: e.target.value })}
          rows={3}
          className={cn(inputClass, "resize-none")}
          placeholder={t(lang, "ordersDrawer.notes.customerPlaceholder")}
        />
      </section>

      <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
        <label className={labelClass}>{t(lang, "ordersDrawer.notes.internal")}</label>
        <textarea
          data-testid="edit-input-internal-notes"
          value={value.internalNotes}
          onChange={(e) => onChange({ internalNotes: e.target.value })}
          rows={3}
          className={cn(inputClass, "resize-none")}
          placeholder={t(lang, "ordersDrawer.notes.internalPlaceholder")}
        />
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          {t(lang, "ordersDrawer.notes.internalHint")}
        </p>
      </section>
    </div>
  );
}

type ContactsProps = {
  lang: Lang;
  contacts: ContactRow[];
  updateContact: (idx: number, patch: Partial<ContactRow>) => void;
  addContact: () => void;
  removeContact: (idx: number) => void;
};

function ContactsSection({ lang, contacts, updateContact, addContact, removeContact }: ContactsProps) {
  return (
    <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <CreditCard className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.contactPerson")}
      </h3>
      <p className="mb-4 text-xs text-[var(--text-subtle)]">{t(lang, "booking.step4.contactPersonHint")}</p>

      {contacts.map((c, idx) => (
        <div
          key={idx}
          className={cn(
            "grid gap-4 sm:grid-cols-2",
            idx > 0 && "mt-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 p-4",
          )}
        >
          <div className="sm:col-span-2 -mt-1 mb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
              {idx === 0
                ? t(lang, "ordersDrawer.contact.main")
                : `${t(lang, "booking.step4.contactNumber")} (${idx + 1})`}
            </span>
            {idx > 0 && (
              <button
                type="button"
                onClick={() => removeContact(idx)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t(lang, "booking.step4.removeContact")}
              </button>
            )}
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.salutation")}</label>
            <select
              value={c.salutation}
              onChange={(e) => updateContact(idx, { salutation: e.target.value })}
              className={inputClass}
            >
              <option value="">--</option>
              <option value="Herr">{t(lang, "booking.step4.mr")}</option>
              <option value="Frau">{t(lang, "booking.step4.mrs")}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.department")}</label>
            <input
              type="text"
              autoComplete="off"
              value={c.department}
              onChange={(e) => updateContact(idx, { department: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.firstName")}</label>
            <input
              type="text"
              autoComplete="off"
              value={c.firstName}
              onChange={(e) => updateContact(idx, { firstName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              {t(lang, "booking.step4.lastName")}
              {idx === 0 ? <span className="text-red-500"> *</span> : null}
            </label>
            <input
              type="text"
              autoComplete="off"
              value={c.lastName}
              onChange={(e) => updateContact(idx, { lastName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              {t(lang, "booking.step4.email")}
              {idx === 0 ? <span className="text-red-500"> *</span> : null}
            </label>
            <input
              type="email"
              autoComplete="off"
              value={c.email}
              onChange={(e) => updateContact(idx, { email: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.phone")}</label>
            <input
              type="tel"
              autoComplete="off"
              value={c.phone}
              onChange={(e) => updateContact(idx, { phone: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.mobile")}</label>
            <input
              type="tel"
              autoComplete="off"
              value={c.phoneMobile}
              onChange={(e) => updateContact(idx, { phoneMobile: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addContact}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-soft)] py-2.5 text-sm font-medium text-[var(--text-subtle)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
      >
        <Plus className="h-4 w-4" /> {t(lang, "booking.step4.addContact")}
      </button>
    </section>
  );
}
