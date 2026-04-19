import { useCallback, useMemo, useRef } from "react";
import { DoorOpen, Home, Layers, MapPin, Plus, Ruler, Trash2 } from "lucide-react";
import { AddressAutocompleteInput, type ParsedAddress, type StreetContext } from "../../ui/AddressAutocompleteInput";
import { randomUUID } from "../../../lib/selekto/randomId";
import { t, type Lang } from "../../../i18n";
import { cn } from "../../../lib/utils";
import type { AddressRow, ObjektForm } from "./types";

const OBJECT_TYPES = [
  { value: "apartment", labelKey: "booking.objectType.apartment" },
  { value: "single_house", labelKey: "booking.objectType.singleHouse" },
  { value: "multi_house", labelKey: "booking.objectType.multiHouse" },
  { value: "commercial", labelKey: "booking.objectType.commercial" },
  { value: "land", labelKey: "booking.objectType.land" },
];

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
  value: ObjektForm;
  onChange: (patch: Partial<ObjektForm>) => void;
};

export function TabObjekt({ lang, value, onChange }: Props) {
  const setAddress = (patch: Partial<AddressRow>) =>
    onChange({ address: { ...value.address, ...patch } });

  const updateAdditional = (idx: number, patch: Partial<ObjektForm["additionalContacts"][number]>) =>
    onChange({
      additionalContacts: value.additionalContacts.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    });

  const removeAdditional = (idx: number) =>
    onChange({ additionalContacts: value.additionalContacts.filter((_, i) => i !== idx) });

  const addAdditional = () =>
    onChange({
      additionalContacts: [
        ...value.additionalContacts,
        { name: "", phone: "", email: "", calendarInvite: false },
      ],
    });

  return (
    <div className="space-y-6">
      {/* Address */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <MapPin className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step1.address")}
        </h3>
        <AddressBlock lang={lang} value={value.address} onChange={setAddress} testIdPrefix="edit-object" />
      </section>

      {/* Object details */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Home className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step1.objectDetails")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>{t(lang, "booking.step1.objectType")}</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {OBJECT_TYPES.map((ot) => (
                <button
                  key={ot.value}
                  type="button"
                  data-testid={`edit-object-type-${ot.value}`}
                  onClick={() => onChange({ type: ot.value })}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium leading-tight transition-all",
                    value.type === ot.value
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--border-strong)]",
                  )}
                >
                  {t(lang, ot.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>
              <Ruler className="mr-1 inline h-3 w-3" /> {t(lang, "booking.step1.area")} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                data-testid="edit-input-area"
                min={1}
                value={value.area}
                onChange={(e) => onChange({ area: e.target.value })}
                className={inputClass}
                placeholder="120"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-subtle)]">m²</span>
            </div>
          </div>
          <div>
            <label className={labelClass}>
              <Layers className="mr-1 inline h-3 w-3" /> {t(lang, "booking.step1.floors")} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={value.floors}
              onChange={(e) => onChange({ floors: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              <DoorOpen className="mr-1 inline h-3 w-3" /> {t(lang, "booking.step1.rooms")}
            </label>
            <input
              type="text"
              value={value.rooms}
              onChange={(e) => onChange({ rooms: e.target.value })}
              className={inputClass}
              placeholder="4.5"
            />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step1.specials")}</label>
            <input
              type="text"
              value={value.specials}
              onChange={(e) => onChange({ specials: e.target.value })}
              className={inputClass}
              placeholder={t(lang, "booking.step1.specialsPlaceholder")}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t(lang, "booking.step1.description")}</label>
            <textarea
              value={value.desc}
              onChange={(e) => onChange({ desc: e.target.value })}
              rows={2}
              className={cn(inputClass, "resize-none")}
              placeholder={t(lang, "booking.step1.descriptionPlaceholder")}
            />
          </div>
        </div>
      </section>

      {/* Onsite contact */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t(lang, "booking.step1.onsiteContact")}
        </h3>
        <p className="mb-4 text-xs text-[var(--text-subtle)]">{t(lang, "booking.step1.onsiteContactHint")}</p>
        <p className="mb-4 text-xs text-[var(--text-subtle)]">{t(lang, "booking.step1.onsiteOnlyOrderHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>
              {t(lang, "booking.step1.onsiteName")} <span className="text-red-500">*</span>
            </label>
            <input
              data-testid="edit-input-onsite-name"
              type="text"
              autoComplete="off"
              value={value.onsiteName}
              onChange={(e) => onChange({ onsiteName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              {t(lang, "booking.step1.onsitePhone")} <span className="text-red-500">*</span>
            </label>
            <input
              data-testid="edit-input-onsite-phone"
              type="tel"
              autoComplete="off"
              value={value.onsitePhone}
              onChange={(e) => onChange({ onsitePhone: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t(lang, "booking.step1.onsiteEmail")}</label>
            <input
              type="email"
              autoComplete="off"
              value={value.onsiteEmail}
              onChange={(e) => onChange({ onsiteEmail: e.target.value })}
              className={inputClass}
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={value.onsiteCalendarInvite}
              onChange={(e) => onChange({ onsiteCalendarInvite: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
            />
            <span className="text-sm leading-snug text-[var(--text-muted)]">
              {t(lang, "booking.step1.onsiteCalendarInvite")}
            </span>
          </label>
        </div>

        {value.additionalContacts.map((row, idx) => (
          <div
            key={idx}
            className="mt-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                {t(lang, "booking.step1.onsiteAdditionalPerson")} ({idx + 2})
              </span>
              <button
                type="button"
                onClick={() => removeAdditional(idx)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t(lang, "booking.step1.onsiteRemovePerson")}
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{t(lang, "booking.step1.onsiteName")}</label>
                <input
                  type="text"
                  autoComplete="off"
                  value={row.name}
                  onChange={(e) => updateAdditional(idx, { name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t(lang, "booking.step1.onsitePhone")}</label>
                <input
                  type="tel"
                  autoComplete="off"
                  value={row.phone}
                  onChange={(e) => updateAdditional(idx, { phone: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t(lang, "booking.step1.onsiteEmail")}</label>
                <input
                  type="email"
                  autoComplete="off"
                  value={row.email}
                  onChange={(e) => updateAdditional(idx, { email: e.target.value })}
                  className={inputClass}
                />
              </div>
              <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={row.calendarInvite}
                  onChange={(e) => updateAdditional(idx, { calendarInvite: e.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
                />
                <span className="text-sm leading-snug text-[var(--text-muted)]">
                  {t(lang, "booking.step1.onsiteCalendarInvite")}
                </span>
              </label>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addAdditional}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-soft)] py-2.5 text-sm font-medium text-[var(--text-subtle)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
        >
          <Plus className="h-4 w-4" /> {t(lang, "booking.step1.onsiteAddPerson")}
        </button>
      </section>
    </div>
  );
}
