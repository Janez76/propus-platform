import { useEffect } from "react";
import { CreditCard, LogIn, MapPin } from "lucide-react";
import { AddressAutocompleteInput, type ParsedAddress } from "../../components/ui/AddressAutocompleteInput";
import { useBookingWizardStore, type BillingData } from "../../store/bookingWizardStore";
import { useAuthStore } from "../../store/authStore";
import { isKundenRole } from "../../lib/permissions";
import { useCustomerProfile } from "../../hooks/useCustomerProfile";
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

export function StepBilling({ lang }: { lang: Lang }) {
  const { billing, setBilling, altBilling, setAltBilling, agbAccepted, setAgbAccepted } = useBookingWizardStore();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const isLoggedIn = Boolean(token);
  const isKunden = isKundenRole(role);
  const { profile } = useCustomerProfile();

  // Billing-Felder vorausfüllen, sobald Kundenprofil geladen ist
  useEffect(() => {
    if (!profile) return;
    const updates: Partial<BillingData> = {};
    if (!billing.email && profile.email) updates.email = profile.email;
    if (!billing.company && profile.company) updates.company = profile.company;
    if (!billing.name && profile.name) updates.name = profile.name;
    if (!billing.phone && profile.phone) updates.phone = profile.phone;
    if (!billing.street && profile.street) updates.street = profile.street;
    if (!billing.zip && !billing.city && profile.zipcity) {
      // Schweizer PLZ = 4 Ziffern. Zusätzlich optionales CH-Präfix tolerieren (z.B. "CH-8001 Zürich").
      const match = profile.zipcity.trim().match(/^(?:CH-?)?(\d{4})\s+(.+)$/i);
      if (match) {
        updates.zip = match[1];
        updates.city = match[2].trim();
        updates.zipcity = `${match[1]} ${match[2].trim()}`;
      }
    }
    if (Object.keys(updates).length > 0) setBilling(updates);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  function onAddressParsed(p: ParsedAddress) {
    setBilling({ street: `${p.street} ${p.houseNumber}`.trim(), zip: p.zip, city: p.city, zipcity: `${p.zip} ${p.city}` });
  }

  function onAltAddressParsed(p: ParsedAddress) {
    setBilling({ alt_street: `${p.street} ${p.houseNumber}`.trim(), alt_zip: p.zip, alt_city: p.city, alt_zipcity: `${p.zip} ${p.city}` });
  }

  return (
    <div className="space-y-6">
      {/* Login-Hinweis für nicht angemeldete Benutzer */}
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
      {/* Angemeldet als Kunde — Profil verwendet */}
      {isLoggedIn && isKunden && profile && (
        <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-5 py-3 text-sm text-[var(--text-muted)]">
          {t(lang, "booking.step4.profilePrefilled")}
        </div>
      )}

      {/* Firma & Kontakt */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <CreditCard className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.billing")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>{t(lang, "booking.step4.company")} *</label>
            <input data-testid="booking-input-company" type="text" value={billing.company} onChange={(e) => setBilling({ company: e.target.value })} className={inputClass} />
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
            <input data-testid="booking-input-billing-name" type="text" value={billing.name} onChange={(e) => setBilling({ name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.email")} *</label>
            <input data-testid="booking-input-email" type="email" value={billing.email} onChange={(e) => setBilling({ email: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.phone")}</label>
            <input data-testid="booking-input-phone" type="tel" value={billing.phone} onChange={(e) => setBilling({ phone: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.mobile")}</label>
            <input type="tel" value={billing.phone_mobile} onChange={(e) => setBilling({ phone_mobile: e.target.value })} className={inputClass} />
          </div>
        </div>
      </section>

      {/* Rechnungsadresse */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <MapPin className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step4.address")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>{t(lang, "booking.step4.street")} *</label>
            <AddressAutocompleteInput
              data-testid="booking-input-billing-street"
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
            <input data-testid="booking-input-zip" type="text" value={billing.zip} onChange={(e) => setBilling({ zip: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.city")} *</label>
            <input data-testid="booking-input-city" type="text" value={billing.city} onChange={(e) => setBilling({ city: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t(lang, "booking.step4.orderRef")}</label>
            <input type="text" value={billing.order_ref} onChange={(e) => setBilling({ order_ref: e.target.value })} className={inputClass} />
          </div>
        </div>
      </section>

      {/* Abweichende Adresse */}
      <label className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-4 shadow-sm dark:shadow-none">
        <input type="checkbox" checked={altBilling} onChange={(e) => setAltBilling(e.target.checked)} className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)]" />
        <span className="text-sm text-[var(--text-muted)]">{t(lang, "booking.step4.altBilling")}</span>
      </label>

      {altBilling && (
        <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
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
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <label className={labelClass}>{t(lang, "booking.step4.notes")}</label>
        <textarea value={billing.notes} onChange={(e) => setBilling({ notes: e.target.value })} rows={3} className={cn(inputClass, "resize-none")} />
      </section>

      {/* AGB */}
      <label className="flex items-start gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-4 shadow-sm dark:shadow-none">
        <input data-testid="booking-checkbox-agb" type="checkbox" checked={agbAccepted} onChange={(e) => setAgbAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)]" />
        <span className="text-sm text-[var(--text-muted)]">
          {t(lang, "booking.step4.agb.prefix")}{" "}
          <a href="https://www.propus.ch/agb/" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]" onClick={(e) => e.stopPropagation()}>
            {t(lang, "booking.step4.agb.agbLink")}
          </a>{" "}
          {t(lang, "booking.step4.agb.and")}{" "}
          <a href="https://www.propus.ch/datenschutz/" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]" onClick={(e) => e.stopPropagation()}>
            {t(lang, "booking.step4.agb.privacyLink")}
          </a>{" "}
          {t(lang, "booking.step4.agb.suffix")}
        </span>
      </label>
    </div>
  );
}

