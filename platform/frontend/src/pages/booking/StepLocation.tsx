import { useCallback } from "react";
import { MapPin, Home, Ruler, Layers, DoorOpen, Plus, Trash2 } from "lucide-react";
import { AddressAutocompleteInput, type ParsedAddress } from "../../components/ui/AddressAutocompleteInput";
import { useBookingWizardStore, type OnsiteContactRow } from "../../store/bookingWizardStore";
import { AddressPreviewMap } from "./AddressPreviewMap";
import { t, type Lang } from "../../i18n";
import { cn } from "../../lib/utils";

const OBJECT_TYPES = [
  { value: "apartment", labelKey: "booking.objectType.apartment" },
  { value: "single_house", labelKey: "booking.objectType.singleHouse" },
  { value: "multi_house", labelKey: "booking.objectType.multiHouse" },
  { value: "commercial", labelKey: "booking.objectType.commercial" },
  { value: "land", labelKey: "booking.objectType.land" },
];

const inputClass = cn(
  "w-full rounded-lg border px-3 py-2.5 text-sm transition-colors",
  "bg-white dark:bg-zinc-800",
  "border-zinc-200 dark:border-zinc-700",
  "text-zinc-900 dark:text-zinc-100",
  "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
  "focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 focus:border-[#C5A059]",
);

const labelClass = "block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5";

const emptyOnsiteRow = (): OnsiteContactRow => ({
  name: "",
  phone: "",
  email: "",
  calendarInvite: false,
});

export function StepLocation({ lang }: { lang: Lang }) {
  const { address, coords, setAddress, parsedAddress, setParsedAddress, setCoords, object, setObject, config } = useBookingWizardStore();

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
  }, [setParsedAddress]);

  const onSelectCoords = useCallback((lat: number, lon: number) => {
    setCoords({ lat, lng: lon });
  }, [setCoords]);

  return (
    <div className="space-y-6">
      {/* Adresse */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          <MapPin className="h-4 w-4 text-[#C5A059]" /> {t(lang, "booking.step1.address")}
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
          <p className="mt-2 text-xs text-zinc-500">
            {parsedAddress.street} {parsedAddress.houseNumber}, {parsedAddress.zip} {parsedAddress.city}
          </p>
        )}
        {config?.googleMapsKey ? (
          <AddressPreviewMap apiKey={config.googleMapsKey} address={address} coords={coords} />
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center text-xs text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800/50">
            {t(lang, "booking.step1.mapUnavailable")}
          </div>
        )}
      </section>

      {/* Objektdaten */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          <Home className="h-4 w-4 text-[#C5A059]" /> {t(lang, "booking.step1.objectDetails")}
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
                      ? "border-[#C5A059] bg-[#C5A059]/10 text-[#C5A059]"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400",
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
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">m²</span>
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
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          {t(lang, "booking.step1.onsiteContact")}
        </h3>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          {t(lang, "booking.step1.onsiteContactHint")}
        </p>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
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
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#C5A059] focus:ring-[#C5A059]/30"
            />
            <span className="text-sm leading-snug text-zinc-700 dark:text-zinc-300">{t(lang, "booking.step1.onsiteCalendarInvite")}</span>
          </label>
        </div>

        {object.additionalOnsiteContacts.map((row, idx) => (
          <div
            key={idx}
            className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-600 dark:bg-zinc-800/40"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#C5A059]">
                {t(lang, "booking.step1.onsiteAdditionalPerson")} ({idx + 2})
              </span>
              <button
                type="button"
                onClick={() => removeAdditionalAt(idx)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#C5A059] focus:ring-[#C5A059]/30"
                />
                <span className="text-sm leading-snug text-zinc-700 dark:text-zinc-300">{t(lang, "booking.step1.onsiteCalendarInvite")}</span>
              </label>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addAdditional}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:border-[#C5A059]/50 hover:text-[#C5A059] dark:border-zinc-600 dark:text-zinc-400"
        >
          <Plus className="h-4 w-4" /> {t(lang, "booking.step1.onsiteAddPerson")}
        </button>
      </section>
    </div>
  );
}
