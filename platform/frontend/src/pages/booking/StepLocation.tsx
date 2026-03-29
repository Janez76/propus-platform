import { useCallback } from "react";
import { MapPin, Home, Ruler, Layers, DoorOpen } from "lucide-react";
import { AddressAutocompleteInput, type ParsedAddress } from "../../components/ui/AddressAutocompleteInput";
import { useBookingWizardStore } from "../../store/bookingWizardStore";
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

export function StepLocation({ lang }: { lang: Lang }) {
  const { address, setAddress, parsedAddress, setParsedAddress, setCoords, object, setObject, config } = useBookingWizardStore();

  const onSelectParsed = useCallback((p: ParsedAddress) => {
    setParsedAddress({ street: p.street, houseNumber: p.houseNumber, zip: p.zip, city: p.city });
  }, [setParsedAddress]);

  const onSelectCoords = useCallback((lat: number, lon: number) => {
    setCoords({ lat, lng: lon });
  }, [setCoords]);

  const hasMap = !!config?.googleMapsKey;

  return (
    <div className="space-y-6">
      {/* Adresse */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          <MapPin className="h-4 w-4 text-[#C5A059]" /> {t(lang, "booking.step1.address")}
        </h3>
        <label className={labelClass}>{t(lang, "booking.step1.addressLabel")}</label>
        <AddressAutocompleteInput
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
        {!hasMap && (
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
              <Ruler className="mr-1 inline h-3 w-3" /> {t(lang, "booking.step1.area")}
            </label>
            <div className="relative">
              <input
                type="number"
                min={1}
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
              <Layers className="mr-1 inline h-3 w-3" /> {t(lang, "booking.step1.floors")}
            </label>
            <input
              type="number"
              min={1}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{t(lang, "booking.step1.onsiteName")}</label>
            <input type="text" value={object.onsiteName} onChange={(e) => setObject({ onsiteName: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step1.onsitePhone")}</label>
            <input type="tel" value={object.onsitePhone} onChange={(e) => setObject({ onsitePhone: e.target.value })} className={inputClass} />
          </div>
        </div>
      </section>
    </div>
  );
}
