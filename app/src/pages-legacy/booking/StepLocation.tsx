import { useCallback, useEffect, useMemo, useRef } from "react";
import { MapPin, Home, Ruler, Layers, DoorOpen, Plus, Trash2 } from "lucide-react";
import { randomUUID } from "../../lib/selekto/randomId";
import { type ParsedAddress } from "../../components/ui/AddressAutocompleteInput";
import { StructuredAddressForm } from "../../components/address/StructuredAddressForm";
import { useBookingWizardStore, type OnsiteContactRow } from "../../store/bookingWizardStore";
import { AddressPreviewMap } from "./AddressPreviewMap";
import { t, type Lang } from "../../i18n";
import { cn } from "../../lib/utils";
import { API_BASE } from "../../api/client";

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

const emptyOnsiteRow = (): OnsiteContactRow => ({
  name: "",
  phone: "",
  email: "",
  calendarInvite: false,
});

export function StepLocation({ lang }: { lang: Lang }) {
  const {
    address, coords, setAddress, parsedAddress, setParsedAddress, setCoords,
    object, setObject, setObjectAddress, config, upsertAddon, removeAddonGroup,
  } = useBookingWizardStore();

  const prevZipRef = useRef("");
  const cantonRef = useRef(object.address.canton || "");
  // Single session token shared across street + house-number autocomplete calls.
  const sessionTokenRef = useRef(randomUUID());
  // Monotonic token: protects gegen Out-of-Order-Responses, wenn User
  // die editierbare PLZ in schneller Folge korrigiert.
  const travelZoneReqRef = useRef(0);

  const streetValue = object.address.street;
  const houseNumberValue = object.address.houseNumber;
  const zipValue = object.address.zip;
  const cityValue = object.address.city;

  async function lookupTravelZone(canton: string, zip: string) {
    if (!canton && !zip) return;
    const reqId = ++travelZoneReqRef.current;
    try {
      const base = API_BASE || "";
      const url = new URL(`/api/travel-zone?canton=${encodeURIComponent(canton)}&zip=${encodeURIComponent(zip)}`, base || window.location.origin);
      const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (reqId !== travelZoneReqRef.current) return;
      if (!r.ok) return;
      const data = await r.json() as { ok?: boolean; zone?: string; productCode?: string; price?: number; label?: string };
      if (reqId !== travelZoneReqRef.current) return;
      if (!data.ok || !data.productCode) return;
      removeAddonGroup("travel_zone");
      upsertAddon({
        id: data.productCode,
        group: "travel_zone",
        label: data.label || `Anfahrt Zone ${data.zone}`,
        labelKey: data.productCode,
        price: Number(data.price ?? 0),
        qty: 1,
      });
    } catch { /* travel zone lookup failed silently */ }
  }

  useEffect(() => {
    const zip = (object.address.zip || parsedAddress?.zip || "").trim();
    // Lookup nur bei vollständiger PLZ (CH/FL: 4-stellig, DE/AT: 5-stellig).
    // Trim, damit gepastete Werte wie "8050 " (mit Whitespace) nicht am
    // Regex-Gate scheitern — validateStep4 akzeptiert sie ebenfalls getrimmt.
    if (!/^\d{4,5}$/.test(zip)) return;
    if (zip === prevZipRef.current) return;
    prevZipRef.current = zip;
    lookupTravelZone(cantonRef.current, zip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object.address.zip]);

  function updateAdditionalAt(index: number, patch: Partial<OnsiteContactRow>) {
    const next = object.additionalOnsiteContacts.map((row, i) => (i === index ? { ...row, ...patch } : row));
    setObject({ additionalOnsiteContacts: next });
  }

  function removeAdditionalAt(index: number) {
    setObject({ additionalOnsiteContacts: object.additionalOnsiteContacts.filter((_, i) => i !== index) });
  }

  function addAdditional() {
    setObject({ additionalOnsiteContacts: [...object.additionalOnsiteContacts, emptyOnsiteRow()] });
  }

  const onSelectStreet = useCallback((p: ParsedAddress) => {
    // Autocomplete kann eine komplette Adresse liefern (Strasse + Hausnummer +
    // PLZ + Ort). Bewusst nur Felder uebernehmen, die der Vorschlag tatsaechlich
    // setzt — so loescht ein Strassen-only-Treffer keine vorher korrekt
    // ausgewaehlte Hausnummer/PLZ/Ort. (Bug D: keine undefined-Overrides.)
    const patch: Partial<{
      street: string; houseNumber: string; zip: string; city: string;
      canton: string; countryCode: string; lat: number | null; lng: number | null;
    }> = {
      street: p.street,
      canton: p.canton || "",
      countryCode: p.countryCode || "CH",
      lat: null,
      lng: null,
    };
    if (p.houseNumber) patch.houseNumber = p.houseNumber;
    if (p.zip) patch.zip = p.zip;
    if (p.city) patch.city = p.city;
    setObjectAddress(patch);
    const nextHn = p.houseNumber || parsedAddress?.houseNumber || "";
    const nextZip = p.zip || zipValue;
    const nextCity = p.city || cityValue;
    setParsedAddress({ street: p.street, houseNumber: nextHn, zip: nextZip, city: nextCity });
    const streetLine = nextHn ? `${p.street} ${nextHn}` : p.street;
    const zipCityLine = [nextZip, nextCity].filter(Boolean).join(" ");
    setAddress(zipCityLine ? `${streetLine}, ${zipCityLine}` : streetLine);
    cantonRef.current = p.canton || "";
    if (nextZip) lookupTravelZone(p.canton || "", nextZip);
    // Rotate session token so house-number search opens a fresh billing session.
    sessionTokenRef.current = randomUUID();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setObjectAddress, setParsedAddress, setAddress, parsedAddress?.houseNumber, zipValue, cityValue]);

  const onSelectCoords = useCallback((lat: number, lon: number) => {
    setCoords({ lat, lng: lon });
  }, [setCoords]);

  const onSelectHouseNumber = useCallback((payload: {
    houseNumber: string;
    lat: number | null;
    lng: number | null;
    zip?: string;
    city?: string;
    canton?: string;
  }) => {
    setObjectAddress({
      houseNumber: payload.houseNumber,
      lat: payload.lat,
      lng: payload.lng,
      ...(payload.zip ? { zip: payload.zip } : {}),
      ...(payload.city ? { city: payload.city } : {}),
      ...(payload.canton ? { canton: payload.canton } : {}),
    });
    const addr = useBookingWizardStore.getState().object.address;
    setParsedAddress({ street: addr.street, houseNumber: addr.houseNumber, zip: addr.zip, city: addr.city });
    setAddress(addr.formatted || `${addr.street} ${addr.houseNumber}, ${addr.zip} ${addr.city}`);
    if (payload.lat !== null && payload.lng !== null) {
      setCoords({ lat: payload.lat, lng: payload.lng });
    }
  }, [setObjectAddress, setParsedAddress, setAddress, setCoords]);

  const onZipDigitsChange = useCallback((raw: string) => {
    setObjectAddress({ zip: raw });
    if (parsedAddress) {
      setParsedAddress({ ...parsedAddress, zip: raw });
    }
    setAddress(useBookingWizardStore.getState().object.address.formatted);
  }, [setObjectAddress, setParsedAddress, setAddress, parsedAddress]);

  const onCityChange = useCallback((raw: string) => {
    setObjectAddress({ city: raw });
    if (parsedAddress) {
      setParsedAddress({ ...parsedAddress, city: raw });
    }
    setAddress(useBookingWizardStore.getState().object.address.formatted);
  }, [setObjectAddress, setParsedAddress, setAddress, parsedAddress]);

  const onChangeHouseNumber = useCallback((v: string) => {
    setObjectAddress({ houseNumber: v });
  }, [setObjectAddress]);

  return (
    <div className="space-y-6">
      {/* Adresse */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <MapPin className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step1.address")}
        </h3>
        <StructuredAddressForm
          lang={lang}
          className={{ input: inputClass, label: labelClass }}
          value={{
            street: streetValue,
            houseNumber: houseNumberValue,
            zip: zipValue,
            city: cityValue,
          }}
          sessionToken={sessionTokenRef.current}
          dataTestIdPrefix="booking-input"
          requireSelectionHouseNumber={false}
          enableOnSelectCoords
          onSelectCoords={onSelectCoords}
          onChangeStreet={(v) => setObjectAddress({ street: v })}
          onSelectStreet={onSelectStreet}
          onChangeHouseNumber={onChangeHouseNumber}
          onSelectHouseNumber={onSelectHouseNumber}
          onZipDigitsChange={onZipDigitsChange}
          onCityChange={onCityChange}
        />
        {config?.googleMapsKey ? (
          <AddressPreviewMap
            apiKey={config.googleMapsKey}
            address={object.address.formatted || address}
            coords={coords}
            onCoordsChange={(c) => {
              setCoords(c);
              setObjectAddress({ lat: c.lat, lng: c.lng });
            }}
            lang={lang}
          />
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-[var(--border-soft)] bg-[var(--surface-raised)]/50 p-4 text-center text-xs text-[var(--text-subtle)]">
            {t(lang, "booking.step1.mapUnavailable")}
          </div>
        )}
      </section>

      {/* Objektdaten */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
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
                  data-testid={`booking-object-type-${ot.value}`}
                  onClick={() => setObject({ type: ot.value })}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium leading-tight transition-all",
                    object.type === ot.value
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
                data-testid="booking-input-area"
                min={1}
                required
                value={object.area}
                onChange={(e) => setObject({ area: e.target.value })}
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
              required
              value={object.floors}
              onChange={(e) => setObject({ floors: Math.max(1, parseInt(e.target.value) || 1) })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              <DoorOpen className="mr-1 inline h-3 w-3" /> {t(lang, "booking.step1.rooms")}
            </label>
            <input
              type="text"
              value={object.rooms}
              onChange={(e) => setObject({ rooms: e.target.value })}
              className={inputClass}
              placeholder="4.5"
            />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step1.specials")}</label>
            <input
              type="text"
              value={object.specials}
              onChange={(e) => setObject({ specials: e.target.value })}
              className={inputClass}
              placeholder={t(lang, "booking.step1.specialsPlaceholder")}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t(lang, "booking.step1.description")}</label>
            <textarea
              value={object.desc}
              onChange={(e) => setObject({ desc: e.target.value })}
              rows={2}
              className={cn(inputClass, "resize-none")}
              placeholder={t(lang, "booking.step1.descriptionPlaceholder")}
            />
          </div>
        </div>
      </section>

      {/* Kontakt vor Ort */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t(lang, "booking.step1.onsiteContact")}
        </h3>
        <p className="mb-4 text-xs text-[var(--text-subtle)]">
          {t(lang, "booking.step1.onsiteContactHint")}
        </p>
        <p className="mb-4 text-xs text-[var(--text-subtle)]">
          {t(lang, "booking.step1.onsiteOnlyOrderHint")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{t(lang, "booking.step1.onsiteName")} <span className="text-red-500">*</span></label>
            <input
              data-testid="booking-input-onsite-name"
              type="text"
              required
              autoComplete="off"
              value={object.onsiteName}
              onChange={(e) => setObject({ onsiteName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step1.onsitePhone")} <span className="text-red-500">*</span></label>
            <input
              data-testid="booking-input-onsite-phone"
              type="tel"
              required
              autoComplete="off"
              value={object.onsitePhone}
              onChange={(e) => setObject({ onsitePhone: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t(lang, "booking.step1.onsiteEmail")}</label>
            <input
              type="email"
              autoComplete="off"
              value={object.onsiteEmail}
              onChange={(e) => setObject({ onsiteEmail: e.target.value })}
              className={inputClass}
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={object.onsiteCalendarInvite}
              onChange={(e) => setObject({ onsiteCalendarInvite: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
            />
            <span className="text-sm leading-snug text-[var(--text-muted)]">{t(lang, "booking.step1.onsiteCalendarInvite")}</span>
          </label>
        </div>

        {object.additionalOnsiteContacts.map((row, idx) => (
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
                onClick={() => removeAdditionalAt(idx)}
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
                  onChange={(e) => updateAdditionalAt(idx, { name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t(lang, "booking.step1.onsitePhone")}</label>
                <input
                  type="tel"
                  autoComplete="off"
                  value={row.phone}
                  onChange={(e) => updateAdditionalAt(idx, { phone: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t(lang, "booking.step1.onsiteEmail")}</label>
                <input
                  type="email"
                  autoComplete="off"
                  value={row.email}
                  onChange={(e) => updateAdditionalAt(idx, { email: e.target.value })}
                  className={inputClass}
                />
              </div>
              <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={row.calendarInvite}
                  onChange={(e) => updateAdditionalAt(idx, { calendarInvite: e.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
                />
                <span className="text-sm leading-snug text-[var(--text-muted)]">{t(lang, "booking.step1.onsiteCalendarInvite")}</span>
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
