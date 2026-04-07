import { useCallback, useEffect, useRef } from "react";
import { MapPin, Home, Ruler, Layers, DoorOpen, Plus, Trash2 } from "lucide-react";
import { AddressAutocompleteInput, type ParsedAddress } from "../../components/ui/AddressAutocompleteInput";
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
  const { address, coords, setAddress, parsedAddress, setParsedAddress, setCoords, object, setObject, config, addons, upsertAddon, removeAddonGroup } = useBookingWizardStore();

  const prevZipRef = useRef("");
  const cantonRef = useRef("");

  async function lookupTravelZone(canton: string, zip: string) {
    if (!canton && !zip) return;
    try {
      const base = API_BASE || "";
      const url = new URL(`/api/travel-zone?canton=${encodeURIComponent(canton)}&zip=${encodeURIComponent(zip)}`, base || window.location.origin);
      const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!r.ok) return;
      const data = await r.json() as { ok?: boolean; zone?: string; productCode?: string; price?: number; label?: string };
      if (!data.ok || !data.productCode) return;
      // Alte Zone entfernen bevor neue gesetzt wird
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
    const zip = parsedAddress?.zip || "";
    if (!zip) return;
    // Fallback fuer manuelle Eingabe ohne onSelectParsed (kein Kanton bekannt)
    // onSelectParsed loest bereits lookupTravelZone mit korrektem Kanton aus
    if (zip === prevZipRef.current) return;
    prevZipRef.current = zip;
    lookupTravelZone(cantonRef.current, zip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedAddress?.zip]);

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

  const onSelectParsed = useCallback((p: ParsedAddress) => {
    setParsedAddress({ street: p.street, houseNumber: p.houseNumber, zip: p.zip, city: p.city });
    // Kanton separat merken (Store-Typ hat kein canton-Feld)
    cantonRef.current = p.canton || "";
    if (p.zip) lookupTravelZone(p.canton || "", p.zip);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setParsedAddress]);

  const onSelectCoords = useCallback((lat: number, lon: number) => {
    setCoords({ lat, lng: lon });
  }, [setCoords]);

  return (
    <div className="space-y-6">
      {/* Adresse */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <MapPin className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step1.address")}
        </h3>
        <label className={labelClass}>{t(lang, "booking.step1.addressLabel")}</label>
        <AddressAutocompleteInput
          data-testid="booking-input-address"
          value={address}
          onChange={setAddress}
          mode="combined"
          onSelectParsed={onSelectParsed}
          onSelectCoords={onSelectCoords}
          lang={lang}
          className={inputClass}
          placeholder={t(lang, "booking.step1.addressPlaceholder")}
        />
        {parsedAddress && (
          <p className="mt-2 text-xs text-[var(--text-subtle)]">
            {parsedAddress.street} {parsedAddress.houseNumber}, {parsedAddress.zip} {parsedAddress.city}
          </p>
        )}
        {config?.googleMapsKey ? (
          <AddressPreviewMap apiKey={config.googleMapsKey} address={address} coords={coords} />
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {OBJECT_TYPES.map((ot) => (
                <button
                  key={ot.value}
                  type="button"
                  data-testid={`booking-object-type-${ot.value}`}
                  onClick={() => setObject({ type: ot.value })}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium transition-all",
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
            <input data-testid="booking-input-onsite-name" type="text" required value={object.onsiteName} onChange={(e) => setObject({ onsiteName: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step1.onsitePhone")} <span className="text-red-500">*</span></label>
            <input data-testid="booking-input-onsite-phone" type="tel" required value={object.onsitePhone} onChange={(e) => setObject({ onsitePhone: e.target.value })} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t(lang, "booking.step1.onsiteEmail")}</label>
            <input type="email" value={object.onsiteEmail} onChange={(e) => setObject({ onsiteEmail: e.target.value })} className={inputClass} />
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
                <input type="text" value={row.name} onChange={(e) => updateAdditionalAt(idx, { name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t(lang, "booking.step1.onsitePhone")}</label>
                <input type="tel" value={row.phone} onChange={(e) => updateAdditionalAt(idx, { phone: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t(lang, "booking.step1.onsiteEmail")}</label>
                <input type="email" value={row.email} onChange={(e) => updateAdditionalAt(idx, { email: e.target.value })} className={inputClass} />
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

