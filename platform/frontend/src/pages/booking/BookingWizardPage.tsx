import { useEffect, useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import { useBookingWizardStore } from "../../store/bookingWizardStore";
import { fetchConfig, fetchCatalog, fetchPhotographers, submitBooking, type BookingPayload } from "../../api/bookingPublic";
import { useCatalogSync } from "../../lib/useCatalogSync";
import { computePricing, type PricingConfig } from "../../lib/bookingPricing";
import { validateStep1, validateStep2, validateStep3, validateStep4, type ValidationError } from "../../lib/bookingValidation";
import { LandingPage } from "./LandingPage";
import { StepLocation } from "./StepLocation";
import { StepServices } from "./StepServices";
import { StepSchedule } from "./StepSchedule";
import { StepBilling } from "./StepBilling";
import { SummaryPanel } from "./SummaryPanel";
import { ThankYouScreen } from "./ThankYouScreen";
import { t, type Lang } from "../../i18n";
import { bookingPhotographerForPayload } from "../../lib/bookingLabels";
import { cn } from "../../lib/utils";
import { bookingBrandLogoUrl } from "../../lib/bookingAssets";
import { BookingThemeToggle } from "./BookingThemeToggle";
import { BookingLangSelect } from "./BookingLangSelect";
import { BookingPublicFooter } from "./BookingPublicFooter";

const STEPS = [
  { id: 1, titleKey: "booking.step1.title", descKey: "booking.step1.desc" },
  { id: 2, titleKey: "booking.step2.title", descKey: "booking.step2.desc" },
  { id: 3, titleKey: "booking.step3.title", descKey: "booking.step3.desc" },
  { id: 4, titleKey: "booking.step4.title", descKey: "booking.step4.desc" },
];

export function BookingWizardPage() {
  const store = useBookingWizardStore();
  const {
    step, setStep, config, configLoading, setConfig, setCatalog, setPhotographers, setConfigLoading,
    submitted, submitting, setSubmitting, setSubmitted,
    selectedPackage, addons, photographer, date, time, billing, altBilling, agbAccepted,
    address, coords, object, discount, provisional, keyPickup,
  } = store;

  const [showLanding, setShowLanding] = useState(true);
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("propus-booking-lang");
      if (saved && ["de", "en", "fr", "it"].includes(saved)) return saved as Lang;
    } catch { /* ignore */ }
    const navLang = navigator.language.slice(0, 2);
    return (["de", "en", "fr", "it"].includes(navLang) ? navLang : "de") as Lang;
  });
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [submitError, setSubmitError] = useState("");

  const changeLang = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem("propus-booking-lang", l); } catch { /* ignore */ }
  };

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    Promise.all([fetchConfig(), fetchCatalog(), fetchPhotographers()])
      .then(([cfg, cat, phot]) => {
        if (cancelled) return;
        setConfig(cfg);
        setCatalog(cat);
        setPhotographers(phot);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setConfigLoading(false); });
    return () => { cancelled = true; };
  }, [setConfig, setCatalog, setPhotographers, setConfigLoading]);

  const reloadCatalog = useCallback(() => {
    fetchCatalog().then(setCatalog).catch(() => {});
  }, [setCatalog]);

  useCatalogSync(reloadCatalog);

  /** Validierungsbanner: Fehler verschwinden, sobald Nutzer:in die Felder korrigiert (nicht erst beim nächsten «Weiter»). */
  useEffect(() => {
    if (step !== 3) return;
    setErrors((errs) =>
      errs.filter((e) => {
        if (e.field === "time" && time.trim()) return false;
        if (e.field === "date" && date.trim()) return false;
        if (e.field === "photographer" && photographer) return false;
        return true;
      }),
    );
  }, [time, date, photographer, step]);

  function validateCurrentStep(): boolean {
    let errs: ValidationError[] = [];
    if (step === 1) errs = validateStep1({ address, parsedAddress: store.parsedAddress, object });
    else if (step === 2) errs = validateStep2({ selectedPackage, addons });
    else if (step === 3) errs = validateStep3({ photographer, date, time });
    else if (step === 4) errs = validateStep4({ billing, altBilling, agbAccepted });
    setErrors(errs);
    return errs.length === 0;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    setStep(Math.min(4, step + 1));
    setErrors([]);
    window.scrollTo(0, 0);
  }

  function goPrev() {
    setStep(Math.max(1, step - 1));
    setErrors([]);
    window.scrollTo(0, 0);
  }

  async function handleSubmit() {
    if (!validateCurrentStep()) return;
    setSubmitting(true);
    setSubmitError("");

    const pricingConfig: PricingConfig = {
      vatRate: config?.vatRate ?? 0.081,
      chfRoundingStep: config?.chfRoundingStep ?? 0.05,
    };
    const subtotal = (selectedPackage?.price ?? 0) + addons.reduce((s, a) => s + a.price * a.qty, 0);
    const pricing = computePricing(subtotal, discount.percent, pricingConfig);

    const payload: BookingPayload = {
      address: { text: address, coords },
      object: {
        type: object.type,
        area: object.area,
        floors: object.floors,
        rooms: object.rooms,
        specials: object.specials,
        desc: object.desc,
        onsiteName: object.onsiteName,
        onsitePhone: object.onsitePhone,
        onsiteEmail: object.onsiteEmail,
        onsiteCalendarInvite: object.onsiteCalendarInvite,
        additionalOnsiteContacts: object.additionalOnsiteContacts,
      },
      services: {
        package: selectedPackage ? { key: selectedPackage.key, price: selectedPackage.price, label: selectedPackage.label, labelKey: selectedPackage.labelKey } : null,
        addons: addons.map((a) => ({ id: a.id, group: a.group, label: a.label, labelKey: a.labelKey, price: a.price })),
      },
      schedule: {
        photographer: bookingPhotographerForPayload(lang, photographer),
        date,
        time,
        provisional,
      },
      billing: {
        ...billing,
        language: lang,
      },
      pricing,
      discountCode: discount.code || undefined,
      keyPickup: addons.some((a) => a.group === "keypickup")
        ? { enabled: true, address: keyPickup.address, info: keyPickup.info }
        : undefined,
    };

    try {
      const res = await submitBooking(payload);
      const rawNo = res?.orderNo as unknown;
      const orderNoNum =
        typeof rawNo === "number" && Number.isFinite(rawNo)
          ? rawNo
          : typeof rawNo === "string" && rawNo.trim() !== ""
            ? Number(rawNo)
            : NaN;
      const hasOrderNo = Number.isFinite(orderNoNum) && orderNoNum > 0;
      const success = res?.ok === true || hasOrderNo;
      if (success) {
        setShowLanding(false);
        setSubmitError("");
        setSubmitted(hasOrderNo ? orderNoNum : null);
        window.scrollTo(0, 0);
      } else {
        const r = res as unknown as { error?: unknown } | null | undefined;
        const apiErr =
          r && typeof r.error === "string" ? String(r.error).trim() : "";
        setSubmitError(apiErr || t(lang, "booking.submit.error"));
        window.scrollTo(0, 0);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t(lang, "booking.submit.error");
      setSubmitError(msg);
      window.scrollTo(0, 0);
    } finally {
      setSubmitting(false);
    }
  }

  if (showLanding && !submitted) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="landing"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: -30 }}
          transition={{ duration: 0.35 }}
        >
          <LandingPage
            lang={lang}
            onLangChange={changeLang}
            onStart={() => {
              setShowLanding(false);
              window.scrollTo(0, 0);
            }}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (submitted) {
    return (
      <div data-testid="booking-thank-you-root" className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
        <div className="flex-1">
          <ThankYouScreen lang={lang} />
        </div>
        <BookingPublicFooter lang={lang} className="shrink-0 bg-[var(--surface)]/80" />
      </div>
    );
  }

  if (configLoading) {
    return (
      <div data-testid="booking-wizard-loading" className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        </div>
        <BookingPublicFooter lang={lang} className="shrink-0 bg-[var(--surface)]/80" />
      </div>
    );
  }

  return (
    <div data-testid="booking-wizard" className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
      {/* Header */}
      <header className="border-b border-[var(--border-soft)] bg-[var(--surface)]/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img src={bookingBrandLogoUrl()} alt="Propus" className="h-7" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <h1 className="font-display text-xl font-semibold text-[var(--text-main)]">{t(lang, "booking.title")}</h1>
          </div>
          <div className="flex items-center gap-3">
            <BookingThemeToggle lang={lang} />
            <BookingLangSelect lang={lang} onChange={changeLang} />
            <div className="flex gap-1.5">
              {STEPS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { if (s.id < step) { setStep(s.id); setErrors([]); } }}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all",
                    step === s.id
                      ? "bg-[var(--accent)] text-white shadow-md"
                      : step > s.id
                        ? "bg-[var(--accent)]/20 text-[var(--accent)] cursor-pointer hover:bg-[var(--accent)]/30"
                        : "bg-[var(--surface-raised)] text-[var(--text-subtle)]",
                  )}
                >
                  {s.id}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Summary */}
      <SummaryPanel
        lang={lang}
        mobile
        onDraftRestart={() => {
          setErrors([]);
          setSubmitError("");
        }}
      />

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* Step Content */}
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-[var(--text-main)]">
                {t(lang, STEPS[step - 1].titleKey)}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-subtle)]">
                {t(lang, STEPS[step - 1].descKey)}
              </p>
            </div>

            {step === 1 && <StepLocation lang={lang} />}
            {step === 2 && <StepServices lang={lang} />}
            {step === 3 && <StepSchedule lang={lang} />}
            {step === 4 && <StepBilling lang={lang} />}

            {/* Validation Errors */}
            {errors.length > 0 && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                <ul className="list-inside list-disc space-y-1">
                  {errors.map((e) => <li key={e.field}>{t(lang, e.message)}</li>)}
                </ul>
              </div>
            )}

            {submitError && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {submitError}
              </div>
            )}

            {/* Navigation */}
            <div className="mt-8 flex justify-between">
              <button
                type="button"
                data-testid="booking-nav-back"
                disabled={step <= 1}
                onClick={goPrev}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-soft)] px-5 py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-raised)] disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> {t(lang, "booking.nav.back")}
              </button>
              {step < 4 ? (
                <button
                  type="button"
                  data-testid="booking-nav-next"
                  onClick={goNext}
                  className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white shadow-md transition-colors hover:bg-[#b08f4a]"
                >
                  {t(lang, "booking.nav.next")} <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="booking-nav-submit"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-[#b08f4a] disabled:opacity-60"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t(lang, "booking.submit.submitting")}</>
                  ) : (
                    <><Send className="h-4 w-4" /> {t(lang, "booking.submit.button")}</>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Desktop Summary */}
          <SummaryPanel
            lang={lang}
            onDraftRestart={() => {
              setErrors([]);
              setSubmitError("");
            }}
          />
        </div>
      </main>

      <BookingPublicFooter lang={lang} className="mt-auto shrink-0 bg-[var(--surface)]/70" />
    </div>
  );
}

