import { useCallback, useMemo, useRef } from "react";
import { Building2, CreditCard, LogIn, MapPin, Plus, Trash2, User } from "lucide-react";
import { randomUUID } from "../../lib/selekto/randomId";
import { AddressAutocompleteInput, type ParsedAddress, type StreetContext } from "../../components/ui/AddressAutocompleteInput";
import {
  useBookingWizardStore,
  type StructuredAddress,
  type BillingMode,
} from "../../store/bookingWizardStore";
import { useAuthStore } from "../../store/authStore";
import { t, type Lang } from "../../i18n";
import { cn } from "../../lib/utils";

const inputClass = cn(
  "w-full rounded-lg border px-3 py-2.5 text-sm transition-colors",
  "bg-[var(--surface-raised)]",
  "border-[var(--border-soft)]",
  "text-[var(--text-main)]",
  "placeholder:text-[var(--text-subtle)]",
  "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] focus:bg-[var(--surface)]",
);
const labelClass = "block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1.5";

type StructuredAddressFieldsProps = {
  lang: Lang;
  address: StructuredAddress;
  onPatch: (patch: Partial<StructuredAddress>) => void;
  testIdPrefix?: string;
};

/** 4-Feld-Adress-Block (Strasse + Hausnummer cascading; PLZ/Ort readonly). */
function StructuredAddressFields({ lang, address, onPatch, testIdPrefix }: StructuredAddressFieldsProps) {
  const sessionTokenRef = useRef(randomUUID());

  const streetContext = useMemo((): StreetContext | undefined => {
    if (!address.street) return undefined;
    return { street: address.street, zip: address.zip, city: address.city };
  }, [address.street, address.zip, address.city]);
  // PLZ-Feld ist editierbar, sobald eine Strasse gesetzt ist (siehe StepLocation
  // für die Begründung — Remount-safe und keystroke-safe).
  const zipEditable = Boolean(address.street);
  const zipMissing = Boolean(address.street) && !address.zip;

  const onSelectStreet = useCallback((p: ParsedAddress) => {
    // Autocomplete kann die Hausnummer, PLZ und Ort mitliefern — alle Felder
    // übernehmen, damit ein Klick die komplette Adresse setzt.
    onPatch({
      street: p.street,
      houseNumber: p.houseNumber ?? "",
      zip: p.zip,
      city: p.city,
      canton: p.canton || "",
      countryCode: p.countryCode || "CH",
      lat: null,
      lng: null,
    });
    sessionTokenRef.current = randomUUID();
  }, [onPatch]);

  const onSelectHouseNumber = useCallback((payload: {
    houseNumber: string;
    lat: number | null;
    lng: number | null;
    zip?: string;
    city?: string;
    canton?: string;
  }) => {
    onPatch({
      houseNumber: payload.houseNumber,
      lat: payload.lat,
      lng: payload.lng,
      ...(payload.zip ? { zip: payload.zip } : {}),
      ...(payload.city ? { city: payload.city } : {}),
      ...(payload.canton ? { canton: payload.canton } : {}),
    });
  }, [onPatch]);

  const testId = (suffix: string) => (testIdPrefix ? `${testIdPrefix}-${suffix}` : undefined);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label className={labelClass}>
          {t(lang, "booking.step1.street")} <span className="text-red-500">*</span>
        </label>
        <AddressAutocompleteInput
          data-testid={testId("street")}
          value={address.street}
          onChange={(v) => onPatch({ street: v })}
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
            data-testid={testId("housenumber")}
            value={address.houseNumber}
            onChange={(v) => onPatch({ houseNumber: v })}
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
          value={address.zip}
          onChange={(e) => onPatch({ zip: e.target.value })}
          className={cn(inputClass, zipEditable ? "" : "cursor-default select-none")}
          placeholder={zipEditable ? "z. B. 8050" : "—"}
          tabIndex={zipEditable ? 0 : -1}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          data-testid={testId("zip")}
        />
        {zipMissing ? (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {t(lang, "booking.step1.zipMissingHint")}
          </p>
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>{t(lang, "booking.step1.city")}</label>
        <input
          type="text"
          readOnly
          value={address.city}
          className={cn(inputClass, "cursor-default select-none")}
          placeholder="—"
          tabIndex={-1}
        />
      </div>
      <div className="sm:col-span-3">
        <label className={labelClass}>{t(lang, "booking.step1.addressSuffix")}</label>
        <input
          data-testid={testId("suffix")}
          type="text"
          autoComplete="off"
          value={address.addressSuffix}
          onChange={(e) => onPatch({ addressSuffix: e.target.value })}
          className={inputClass}
          placeholder={t(lang, "booking.step1.addressSuffixPlaceholder")}
        />
      </div>
    </div>
  );
}

export function StepBilling({ lang }: { lang: Lang }) {
  const {
    billing,
    setBilling,
    altBilling,
    setAltBilling,
    agbAccepted,
    setAgbAccepted,
    setBillingMode,
    setBillingCompany,
    setBillingCompanyAddress,
    setBillingPrivate,
    setBillingPrivateAddress,
    setBillingContact,
    addBillingContact,
    removeBillingContact,
    setBillingAlt,
    setBillingAltCompany,
    setBillingAltCompanyAddress,
  } = useBookingWizardStore();
  const token = useAuthStore((s) => s.token);
  const isLoggedIn = Boolean(token);

  const structured = billing.structured;
  const mode: BillingMode = structured.mode;
  const contacts = structured.contacts;
  const altEnabled = structured.altBilling.enabled;

  /**
   * Wizard V2 speichert alle Billing-Daten in `billing.structured`. Damit bestehende
   * Backend-Pfade und Admin-Views (die noch flache Felder lesen) weiterhin
   * funktionieren, spiegeln wir die wichtigsten Werte in die Legacy-Felder.
   * Beim Submit werden so beide Darstellungen mitgeschickt.
   */
  const setCompanyName = (v: string) => {
    setBillingCompany({ name: v });
    setBilling({ company: v });
  };
  const setCompanyOrderRef = (v: string) => {
    setBillingCompany({ orderRef: v });
    setBilling({ order_ref: v });
  };
  const setCompanyAddress = (patch: Partial<StructuredAddress>) => {
    setBillingCompanyAddress(patch);
    const addr = useBookingWizardStore.getState().billing.structured.company.address;
    setBilling({
      street: [addr.street, addr.houseNumber].filter(Boolean).join(" ").trim(),
      street_suffix: addr.addressSuffix,
      zip: addr.zip,
      city: addr.city,
      zipcity: [addr.zip, addr.city].filter(Boolean).join(" ").trim(),
    });
  };

  const setPrivatePatch = (patch: Partial<typeof structured.private>) => {
    setBillingPrivate(patch);
    const legacyPatch: Record<string, string> = {};
    if (patch.salutation !== undefined) legacyPatch.salutation = patch.salutation;
    if (patch.firstName !== undefined) legacyPatch.first_name = patch.firstName;
    if (patch.lastName !== undefined) legacyPatch.name = patch.lastName;
    if (patch.email !== undefined) legacyPatch.email = patch.email;
    if (patch.phone !== undefined) legacyPatch.phone = patch.phone;
    if (patch.phoneMobile !== undefined) legacyPatch.phone_mobile = patch.phoneMobile;
    if (Object.keys(legacyPatch).length > 0) setBilling(legacyPatch);
  };
  const setPrivateAddress = (patch: Partial<StructuredAddress>) => {
    setBillingPrivateAddress(patch);
    const addr = useBookingWizardStore.getState().billing.structured.private.address;
    setBilling({
      street: [addr.street, addr.houseNumber].filter(Boolean).join(" ").trim(),
      street_suffix: addr.addressSuffix,
      zip: addr.zip,
      city: addr.city,
      zipcity: [addr.zip, addr.city].filter(Boolean).join(" ").trim(),
    });
  };

  /** Haupt-Kontakt (Index 0) spiegelt in die Legacy-Felder name/email/phone. */
  const setMainContact = (patch: Partial<typeof contacts[number]>) => {
    setBillingContact(0, patch);
    const legacyPatch: Record<string, string> = {};
    if (patch.salutation !== undefined) legacyPatch.salutation = patch.salutation;
    if (patch.firstName !== undefined) legacyPatch.first_name = patch.firstName;
    if (patch.lastName !== undefined) legacyPatch.name = patch.lastName;
    if (patch.email !== undefined) legacyPatch.email = patch.email;
    if (patch.phone !== undefined) legacyPatch.phone = patch.phone;
    if (patch.phoneMobile !== undefined) legacyPatch.phone_mobile = patch.phoneMobile;
    if (Object.keys(legacyPatch).length > 0) setBilling(legacyPatch);
  };

  const toggleAlt = (enabled: boolean) => {
    setBillingAlt({ enabled });
    setAltBilling(enabled);
  };

  const setAltCompanyAddress = (patch: Partial<StructuredAddress>) => {
    setBillingAltCompanyAddress(patch);
    const addr = useBookingWizardStore.getState().billing.structured.altBilling.company.address;
    setBilling({
      alt_street: [addr.street, addr.houseNumber].filter(Boolean).join(" ").trim(),
      alt_street_suffix: addr.addressSuffix,
      alt_zip: addr.zip,
      alt_city: addr.city,
      alt_zipcity: [addr.zip, addr.city].filter(Boolean).join(" ").trim(),
    });
  };

  function onModeChange(next: BillingMode) {
    setBillingMode(next);
    if (next === "private") {
      toggleAlt(false);
    }
  }

  return (
    <div className="space-y-6">
      {!isLoggedIn && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-3.5 shadow-sm dark:shadow-none">
          <span className="text-sm text-[var(--text-muted)]">
            {t(lang, "booking.step4.loginHint")}
          </span>
          <a
            href={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#b08f4a]"
          >
            <LogIn className="h-3.5 w-3.5" />
            {t(lang, "booking.step4.loginButton")}
          </a>
        </div>
      )}

      {/* Mode Toggle */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <label className={labelClass}>{t(lang, "booking.step4.modeLabel")}</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="booking-billing-mode-company"
            onClick={() => onModeChange("company")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all",
              mode === "company"
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--border-strong)]",
            )}
          >
            <Building2 className="h-4 w-4" /> {t(lang, "booking.step4.mode.company")}
          </button>
          <button
            type="button"
            data-testid="booking-billing-mode-private"
            onClick={() => onModeChange("private")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all",
              mode === "private"
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--border-strong)]",
            )}
          >
            <User className="h-4 w-4" /> {t(lang, "booking.step4.mode.private")}
          </button>
        </div>
      </section>

      {mode === "company" && (
        <>
          {/* Firmenangaben */}
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Building2 className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.companyDetails")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>{t(lang, "booking.step4.company")} <span className="text-red-500">*</span></label>
                <input
                  data-testid="booking-input-company"
                  type="text"
                  autoComplete="off"
                  value={structured.company.name}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t(lang, "booking.step4.orderRef")}</label>
                <input
                  type="text"
                  autoComplete="off"
                  value={structured.company.orderRef}
                  onChange={(e) => setCompanyOrderRef(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* Rechnungsadresse (Firma) */}
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <MapPin className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.address")}
            </h3>
            <StructuredAddressFields
              lang={lang}
              address={structured.company.address}
              onPatch={setCompanyAddress}
              testIdPrefix="booking-input-billing"
            />
          </section>

          {/* Ansprechpartner */}
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <CreditCard className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.contactPerson")}
            </h3>
            <p className="mb-4 text-xs text-[var(--text-subtle)]">
              {t(lang, "booking.step4.contactPersonHint")}
            </p>

            {contacts.map((c, idx) => (
              <div
                key={idx}
                className={cn(
                  "grid gap-4 sm:grid-cols-2",
                  idx > 0 && "mt-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 p-4",
                )}
              >
                {idx > 0 && (
                  <div className="sm:col-span-2 -mt-1 mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                      {t(lang, "booking.step4.contactNumber")} ({idx + 1})
                    </span>
                    <button
                      type="button"
                      onClick={() => removeBillingContact(idx)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t(lang, "booking.step4.removeContact")}
                    </button>
                  </div>
                )}
                <div>
                  <label className={labelClass}>{t(lang, "booking.step4.salutation")}</label>
                  <select
                    value={c.salutation}
                    onChange={(e) => (idx === 0 ? setMainContact({ salutation: e.target.value }) : setBillingContact(idx, { salutation: e.target.value }))}
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
                    onChange={(e) => (idx === 0 ? setMainContact({ department: e.target.value }) : setBillingContact(idx, { department: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t(lang, "booking.step4.firstName")}</label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={c.firstName}
                    onChange={(e) => (idx === 0 ? setMainContact({ firstName: e.target.value }) : setBillingContact(idx, { firstName: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t(lang, "booking.step4.lastName")} <span className="text-red-500">*</span></label>
                  <input
                    data-testid={idx === 0 ? "booking-input-billing-name" : undefined}
                    type="text"
                    autoComplete="off"
                    value={c.lastName}
                    onChange={(e) => (idx === 0 ? setMainContact({ lastName: e.target.value }) : setBillingContact(idx, { lastName: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t(lang, "booking.step4.email")} <span className="text-red-500">*</span></label>
                  <input
                    data-testid={idx === 0 ? "booking-input-email" : undefined}
                    type="email"
                    autoComplete="off"
                    value={c.email}
                    onChange={(e) => (idx === 0 ? setMainContact({ email: e.target.value }) : setBillingContact(idx, { email: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t(lang, "booking.step4.phone")}</label>
                  <input
                    data-testid={idx === 0 ? "booking-input-phone" : undefined}
                    type="tel"
                    autoComplete="off"
                    value={c.phone}
                    onChange={(e) => (idx === 0 ? setMainContact({ phone: e.target.value }) : setBillingContact(idx, { phone: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t(lang, "booking.step4.mobile")}</label>
                  <input
                    type="tel"
                    autoComplete="off"
                    value={c.phoneMobile}
                    onChange={(e) => (idx === 0 ? setMainContact({ phoneMobile: e.target.value }) : setBillingContact(idx, { phoneMobile: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addBillingContact}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-soft)] py-2.5 text-sm font-medium text-[var(--text-subtle)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
            >
              <Plus className="h-4 w-4" /> {t(lang, "booking.step4.addContact")}
            </button>
          </section>

          {/* Abweichende Rechnungsadresse */}
          <label className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-4 shadow-sm dark:shadow-none">
            <input
              type="checkbox"
              checked={altEnabled}
              onChange={(e) => toggleAlt(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-muted)]">{t(lang, "booking.step4.altBilling")}</span>
          </label>

          {altEnabled && (
            <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t(lang, "booking.step4.altBillingTitle")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>{t(lang, "booking.step4.company")} <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={structured.altBilling.company.name}
                    onChange={(e) => {
                      setBillingAltCompany({ name: e.target.value });
                      setBilling({ alt_company: e.target.value });
                    }}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>{t(lang, "booking.step4.orderRef")}</label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={structured.altBilling.company.orderRef}
                    onChange={(e) => {
                      setBillingAltCompany({ orderRef: e.target.value });
                      setBilling({ alt_order_ref: e.target.value });
                    }}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="mt-4">
                <StructuredAddressFields
                  lang={lang}
                  address={structured.altBilling.company.address}
                  onPatch={setAltCompanyAddress}
                  testIdPrefix="booking-input-alt"
                />
              </div>
              <div className="mt-4 sm:col-span-2">
                <label className={labelClass}>{t(lang, "booking.step4.notes")}</label>
                <textarea
                  value={structured.altBilling.notes}
                  onChange={(e) => {
                    setBillingAlt({ notes: e.target.value });
                    setBilling({ alt_notes: e.target.value });
                  }}
                  rows={3}
                  className={cn(inputClass, "resize-none")}
                />
              </div>
            </section>
          )}
        </>
      )}

      {mode === "private" && (
        <>
          {/* Persönliche Angaben */}
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <User className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.privateDetails")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{t(lang, "booking.step4.salutation")}</label>
                <select
                  value={structured.private.salutation}
                  onChange={(e) => setPrivatePatch({ salutation: e.target.value })}
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
                  value={structured.private.firstName}
                  onChange={(e) => setPrivatePatch({ firstName: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t(lang, "booking.step4.lastName")} <span className="text-red-500">*</span></label>
                <input
                  data-testid="booking-input-billing-name"
                  type="text"
                  autoComplete="off"
                  value={structured.private.lastName}
                  onChange={(e) => setPrivatePatch({ lastName: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t(lang, "booking.step4.email")} <span className="text-red-500">*</span></label>
                <input
                  data-testid="booking-input-email"
                  type="email"
                  autoComplete="off"
                  value={structured.private.email}
                  onChange={(e) => setPrivatePatch({ email: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t(lang, "booking.step4.phone")}</label>
                <input
                  data-testid="booking-input-phone"
                  type="tel"
                  autoComplete="off"
                  value={structured.private.phone}
                  onChange={(e) => setPrivatePatch({ phone: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t(lang, "booking.step4.mobile")}</label>
                <input
                  type="tel"
                  autoComplete="off"
                  value={structured.private.phoneMobile}
                  onChange={(e) => setPrivatePatch({ phoneMobile: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* Privatadresse */}
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <MapPin className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.privateAddress")}
            </h3>
            <StructuredAddressFields
              lang={lang}
              address={structured.private.address}
              onPatch={setPrivateAddress}
              testIdPrefix="booking-input-billing"
            />
          </section>
        </>
      )}

      {/* Bemerkungen (immer sichtbar) */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <label className={labelClass}>{t(lang, "booking.step4.notes")}</label>
        <textarea
          value={billing.notes}
          onChange={(e) => setBilling({ notes: e.target.value })}
          rows={3}
          className={cn(inputClass, "resize-none")}
        />
      </section>

      {/* AGB */}
      <label className="flex items-start gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-4 shadow-sm dark:shadow-none">
        <input
          data-testid="booking-checkbox-agb"
          type="checkbox"
          checked={agbAccepted}
          onChange={(e) => setAgbAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)]"
        />
        <span className="text-sm text-[var(--text-muted)]">
          {t(lang, "booking.step4.agb.prefix")}{" "}
          <a href="https://www.propus.ch/agb/" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]" onClick={(e) => e.stopPropagation()}>
            {t(lang, "booking.step4.agb.agbLink")}
          </a>{" "}
          {t(lang, "booking.step4.agb.and")}{" "}
          <a href="https://www.propus.ch/datenschutz/" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]" onClick={(e) => e.stopPropagation()}>
            {t(lang, "booking.step4.agb.privacyLink")}
          </a>{" "}
          {t(lang, "booking.step4.agb.suffix")}{" "}
          <span className="text-red-500">*</span>
        </span>
      </label>
    </div>
  );
}
