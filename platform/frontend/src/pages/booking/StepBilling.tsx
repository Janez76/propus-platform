import { CreditCard, MapPin } from "lucide-react";
import { AddressAutocompleteInput, type ParsedAddress } from "../../components/ui/AddressAutocompleteInput";
import { useBookingWizardStore } from "../../store/bookingWizardStore";
import { t, type Lang } from "../../i18n";
import { cn } from "../../lib/utils";

const inputClass = cn(
  "w-full rounded-lg border px-3 py-2.5 text-sm transition-colors",
  "bg-white dark:bg-zinc-800",
  "border-zinc-200 dark:border-zinc-700",
  "text-zinc-900 dark:text-zinc-100",
  "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
  "focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 focus:border-[#C5A059]",
);
const labelClass = "block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5";

export function StepBilling({ lang }: { lang: Lang }) {
  const { billing, setBilling, altBilling, setAltBilling, agbAccepted, setAgbAccepted } = useBookingWizardStore();

  function onAddressParsed(p: ParsedAddress) {
    setBilling({ street: `${p.street} ${p.houseNumber}`.trim(), zip: p.zip, city: p.city, zipcity: `${p.zip} ${p.city}` });
  }

  function onAltAddressParsed(p: ParsedAddress) {
    setBilling({ alt_street: `${p.street} ${p.houseNumber}`.trim(), alt_zip: p.zip, alt_city: p.city, alt_zipcity: `${p.zip} ${p.city}` });
  }

  return (
    <div className="space-y-6">
      {/* Firma & Kontakt */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          <CreditCard className="h-4 w-4 text-[#C5A059]" /> {t(lang, "booking.step4.billing")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>{t(lang, "booking.step4.company")} *</label>
            <input type="text" value={billing.company} onChange={(e) => setBilling({ company: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.salutation")}</label>
            <select value={billing.salutation} onChange={(e) => setBilling({ salutation: e.target.value })} className={inputClass}>
              <option value="">--</option>
              <option value="Herr">{t(lang, "booking.step4.mr")}</option>
              <option value="Frau">{t(lang, "booking.step4.mrs")}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.firstName")}</label>
            <input type="text" value={billing.first_name} onChange={(e) => setBilling({ first_name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.lastName")} *</label>
            <input type="text" value={billing.name} onChange={(e) => setBilling({ name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.email")} *</label>
            <input type="email" value={billing.email} onChange={(e) => setBilling({ email: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.phone")}</label>
            <input type="tel" value={billing.phone} onChange={(e) => setBilling({ phone: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.mobile")}</label>
            <input type="tel" value={billing.phone_mobile} onChange={(e) => setBilling({ phone_mobile: e.target.value })} className={inputClass} />
          </div>
        </div>
      </section>

      {/* Rechnungsadresse */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          <MapPin className="h-4 w-4 text-[#C5A059]" /> {t(lang, "booking.step4.address")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>{t(lang, "booking.step4.street")} *</label>
            <AddressAutocompleteInput
              value={billing.street}
              onChange={(v) => setBilling({ street: v })}
              mode="combined"
              onSelectParsed={onAddressParsed}
              lang={lang}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.zip")} *</label>
            <input type="text" value={billing.zip} onChange={(e) => setBilling({ zip: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.city")} *</label>
            <input type="text" value={billing.city} onChange={(e) => setBilling({ city: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.orderRef")}</label>
            <input type="text" value={billing.order_ref} onChange={(e) => setBilling({ order_ref: e.target.value })} className={inputClass} />
          </div>
        </div>
      </section>

      {/* Abweichende Adresse */}
      <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-700 dark:bg-zinc-900">
        <input type="checkbox" checked={altBilling} onChange={(e) => setAltBilling(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 text-[#C5A059]" />
        <span className="text-sm text-zinc-700 dark:text-zinc-300">{t(lang, "booking.step4.altBilling")}</span>
      </label>

      {altBilling && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
            {t(lang, "booking.step4.altBillingTitle")}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>{t(lang, "booking.step4.company")} *</label>
              <input type="text" value={billing.alt_company} onChange={(e) => setBilling({ alt_company: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t(lang, "booking.step4.firstName")}</label>
              <input type="text" value={billing.alt_first_name} onChange={(e) => setBilling({ alt_first_name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t(lang, "booking.step4.lastName")} *</label>
              <input type="text" value={billing.alt_name} onChange={(e) => setBilling({ alt_name: e.target.value })} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>{t(lang, "booking.step4.street")} *</label>
              <AddressAutocompleteInput
                value={billing.alt_street}
                onChange={(v) => setBilling({ alt_street: v })}
                mode="combined"
                onSelectParsed={onAltAddressParsed}
                lang={lang}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t(lang, "booking.step4.zip")} *</label>
              <input type="text" value={billing.alt_zip} onChange={(e) => setBilling({ alt_zip: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t(lang, "booking.step4.city")} *</label>
              <input type="text" value={billing.alt_city} onChange={(e) => setBilling({ alt_city: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t(lang, "booking.step4.email")}</label>
              <input type="email" value={billing.alt_email} onChange={(e) => setBilling({ alt_email: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t(lang, "booking.step4.orderRef")}</label>
              <input type="text" value={billing.alt_order_ref} onChange={(e) => setBilling({ alt_order_ref: e.target.value })} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>{t(lang, "booking.step4.notes")}</label>
              <textarea
                value={billing.alt_notes}
                onChange={(e) => setBilling({ alt_notes: e.target.value })}
                rows={3}
                className={cn(inputClass, "resize-none")}
              />
            </div>
          </div>
        </section>
      )}

      {/* Bemerkungen */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <label className={labelClass}>{t(lang, "booking.step4.notes")}</label>
        <textarea value={billing.notes} onChange={(e) => setBilling({ notes: e.target.value })} rows={3} className={cn(inputClass, "resize-none")} />
      </section>

      {/* AGB */}
      <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-700 dark:bg-zinc-900">
        <input type="checkbox" checked={agbAccepted} onChange={(e) => setAgbAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-[#C5A059]" />
        <span className="text-sm text-zinc-700 dark:text-zinc-300">
          {t(lang, "booking.step4.agb")}
        </span>
      </label>
    </div>
  );
}
