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
import { cn } from "../../lib/utils";

const STEPS = [
  { id: 1, titleKey: "booking.step1.title", descKey: "booking.step1.desc" },
  { id: 2, titleKey: "booking.step2.title", descKey: "booking.step2.desc" },
  { id: 3, titleKey: "booking.step3.title", descKey: "booking.step3.desc" },
  { id: 4, titleKey: "booking.step4.title", descKey: "booking.step4.desc" },
];

const LANGS: { value: Lang; label: string }[] = [
  { value: "de", label: "DE" },
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
  { value: "it", label: "IT" },
];

export function BookingWizardPage() {
  const store = useBookingWizardStore();
  const {
    step, setStep, config, configLoading, setConfig, setCatalog, setPhotographers, setConfigLoading,
    submitted, submitting, setSubmitting, setSubmitted,
    selectedPackage, addons, photographer, date, time, billing, altBilling, agbAccepted,
    address, coords, object, discount, keyPickup, provisional,
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
    const keyPickupPrice = keyPickup.enabled ? (config?.keyPickupPrice ?? 50) : 0;
    const subtotal = (selectedPackage?.price ?? 0) + addons.reduce((s, a) => s + a.price * a.qty, 0) + keyPickupPrice;
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
      },
      services: {
        package: selectedPackage ? { key: selectedPackage.key, price: selectedPackage.price, label: selectedPackage.label, labelKey: selectedPackage.labelKey } : null,
        addons: addons.map((a) => ({ id: a.id, group: a.group, label: a.label, labelKey: a.labelKey, price: a.price })),
      },
      schedule: {
        photographer: photographer ?? { key: "any", name: "Egal" },
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
      keyPickup: keyPickup.enabled ? { enabled: true, address: keyPickup.address, info: keyPickup.info } : undefined,
    };

    try {
      const res = await submitBooking(payload);
      if (res.ok || res.orderNo) {
        setSubmitted(res.orderNo);
      } else {
        setSubmitError(t(lang, "booking.submit.error"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t(lang, "booking.submit.error");
      setSubmitError(msg);
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
      <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
        <ThankYouScreen lang={lang} />
      </div>
    );
  }

  if (configLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
        <Loader2 className="h-8 w-8 animate-spin text-[#C5A059]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white/80 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img src="/legacy-booking/assets/brand/logopropus.png" alt="Propus" className="h-7" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <h1 className="font-display text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t(lang, "booking.title")}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {LANGS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => changeLang(l.value)}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                    lang === l.value ? "bg-[#C5A059] text-white" : "text-zinc-500 hover:text-zinc-700",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {STEPS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { if (s.id < step) { setStep(s.id); setErrors([]); } }}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all",
                    step === s.id
                      ? "bg-[#C5A059] text-white shadow-md"
                      : step > s.id
                        ? "bg-[#C5A059]/20 text-[#C5A059] cursor-pointer hover:bg-[#C5A059]/30"
                        : "bg-zinc-200 text-zinc-400 dark:bg-zinc-800",
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
      <SummaryPanel lang={lang} mobile />

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* Step Content */}
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {t(lang, STEPS[step - 1].titleKey)}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
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
                disabled={step <= 1}
                onClick={goPrev}
                className="flex items-center gap-2 rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
              >
                <ArrowLeft className="h-4 w-4" /> {t(lang, "booking.nav.back")}
              </button>
              {step < 4 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex items-center gap-2 rounded-lg bg-[#C5A059] px-5 py-2.5 text-sm font-medium text-white shadow-md transition-colors hover:bg-[#b08f4a]"
                >
                  {t(lang, "booking.nav.next")} <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-[#C5A059] px-6 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-[#b08f4a] disabled:opacity-60"
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
          <SummaryPanel lang={lang} />
        </div>
      </main>
    </div>
  );
}
