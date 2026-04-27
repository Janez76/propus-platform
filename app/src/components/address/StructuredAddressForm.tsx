import { useMemo, type ChangeEvent } from "react";
import { AddressAutocompleteInput, type ParsedAddress, type StreetContext } from "../ui/AddressAutocompleteInput";
import { t, type Lang } from "../../i18n";
import { cn } from "../../lib/utils";

export type StructuredAddressFormValue = {
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
};

type Props = {
  lang: Lang;
  className: {
    input: string;
    label: string;
  };
  /** Werte: Strasse, Hausnummer, PLZ, Ort. */
  value: StructuredAddressFormValue;
  /** geteilt mit Street- und ggf. Hausnummer-Autocomplete (Places Session). */
  sessionToken: string;
  /**
   * Präfix für `data-testid` pro Feld, z. B. `booking-input` → `booking-input-street`,
   * `booking-input-billing` → `booking-input-billing-street`.
   * Default: `booking-input` (Buchung Schritt 1).
   */
  dataTestIdPrefix?: string;
  /** Wenn true (Default): freieingetippte HN nicht ohne Listenauswahl. */
  requireSelectionHouseNumber?: boolean;
  /** Wenn true: onSelectCoords an die Strassen-Suche hängen (Karten-Pin). */
  enableOnSelectCoords?: boolean;
  onSelectCoords?: (lat: number, lon: number) => void;
  onChangeStreet: (v: string) => void;
  onSelectStreet: (p: ParsedAddress) => void;
  onChangeHouseNumber: (v: string) => void;
  onSelectHouseNumber: (payload: {
    houseNumber: string;
    lat: number | null;
    lng: number | null;
    zip?: string;
    city?: string;
    canton?: string;
  }) => void;
  /** Nur Ziffern, max. 5 — wird intern aus dem Input abgeleitet. */
  onZipDigitsChange: (raw: string) => void;
  /** Optional: macht ORT editierbar (z. B. wenn Autocomplete keinen Ort liefert). */
  onCityChange?: (raw: string) => void;
};

function testIdFor(prefix: string, suffix: string) {
  return `${prefix}-${suffix}`;
}

/**
 * 4-Feld-Block: Strasse (cascade) + Hausnummer (cascade) + PLZ (editierbar mit Strasse) + Ort (read-only).
 * Wiederverwendet in Buchung Schritt 1, Rechnungsschritt, Order-Wizard u. a.
 */
export function StructuredAddressForm({
  lang,
  className: { input: inputClass, label: labelClass },
  value: { street: streetValue, houseNumber: houseNumberValue, zip: zipValue, city: cityValue },
  sessionToken,
  dataTestIdPrefix = "booking-input",
  requireSelectionHouseNumber = true,
  enableOnSelectCoords = false,
  onSelectCoords,
  onChangeStreet,
  onSelectStreet,
  onChangeHouseNumber,
  onSelectHouseNumber,
  onZipDigitsChange,
  onCityChange,
}: Props) {
  const streetContext = useMemo((): StreetContext | undefined => {
    if (!streetValue) return undefined;
    return { street: streetValue, zip: zipValue, city: cityValue };
  }, [streetValue, zipValue, cityValue]);

  const zipEditable = Boolean(streetValue);
  const zipMissing = Boolean(streetValue) && !zipValue;

  const onZip = (e: ChangeEvent<HTMLInputElement>) => {
    onZipDigitsChange(e.target.value.replace(/\D/g, "").slice(0, 5));
  };

  const streetId = testIdFor(dataTestIdPrefix, "street");
  const houseId = testIdFor(dataTestIdPrefix, "housenumber");
  const zipId = testIdFor(dataTestIdPrefix, "zip");
  const cityId = testIdFor(dataTestIdPrefix, "city");

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label className={labelClass}>
          {t(lang, "booking.step1.street")} <span className="text-red-500">*</span>
        </label>
        <AddressAutocompleteInput
          data-testid={streetId}
          value={streetValue}
          onChange={onChangeStreet}
          mode="street"
          allowPartial
          sessionToken={sessionToken}
          onSelectParsed={onSelectStreet}
          onSelectCoords={enableOnSelectCoords ? onSelectCoords : undefined}
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
            data-testid={houseId}
            value={houseNumberValue}
            onChange={onChangeHouseNumber}
            mode="houseNumber"
            streetContext={streetContext}
            sessionToken={sessionToken}
            onSelectHouseNumber={onSelectHouseNumber}
            requireSelection={requireSelectionHouseNumber}
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
          data-testid={zipId}
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          value={zipValue}
          readOnly={!zipEditable}
          tabIndex={zipEditable ? 0 : -1}
          onChange={onZip}
          className={cn(inputClass, !zipEditable && "cursor-not-allowed opacity-75")}
          placeholder={t(lang, "booking.step1.zipAutoPlaceholder")}
          aria-readonly={!zipEditable}
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
          data-testid={cityId}
          type="text"
          value={cityValue}
          readOnly={!onCityChange}
          tabIndex={onCityChange ? 0 : -1}
          onChange={onCityChange ? (e) => onCityChange(e.target.value) : undefined}
          className={cn(inputClass, !onCityChange && "cursor-not-allowed opacity-75")}
          placeholder={t(lang, "booking.step1.cityAutoPlaceholder")}
          aria-readonly={!onCityChange}
        />
      </div>
    </div>
  );
}
