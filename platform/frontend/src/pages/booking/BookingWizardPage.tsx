import { useEffect, useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Check, Loader2, Send, MapPin, Package, Camera, CalendarDays, CreditCard } from "lucide-react";
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
import { cn, formatDateCH } from "../../lib/utils";
import { bookingBrandLogoUrl } from "../../lib/bookingAssets";
import { BookingThemeToggle } from "./BookingThemeToggle";
import { BookingLangSelect } from "./BookingLangSelect";

const STEPS = [
  { id: 1, titleKey: "booking.step1.title", descKey: "booking.step1.desc", icon: MapPin },
  { id: 2, titleKey: "booking.step2.title", descKey: "booking.step2.desc", icon: Package },
  { id: 3, titleKey: "booking.step3.title", descKey: "booking.step3.desc", icon: Camera },
  { id: 4, titleKey: "booking.step4.title", descKey: "booking.step4.desc", icon: CreditCard },
];

function useStepSummary(lang: Lang) {
  const { address, selectedPackage, addons, photographer, date, time, billing } = useBookingWizardStore();
  return useCallback((stepId: number): string | null => {
    if (stepId === 1) return address || null;
    if (stepId === 2) {
      const parts = [selectedPackage?.label, addons.length > 0 ? `+${addons.length} Addons` : null].filter(Boolean);
      return parts.join(", ") || null;
    }
    if (stepId === 3) {
      const parts = [photographer?.name, date ? formatDateCH(date) : null, time].filter(Boolean);
      return parts.join(" · ") || null;
    }
    if (stepId === 4) return billing.company || billing.name || null;
    return null;
  }, [address, selectedPackage, addons, photographer, date, time, billing]);
}

interface AccordionStepProps {
  stepId: number;
  lang: Lang;
  open: boolean;
  completed: boolean;
  locked: boolean;
  onToggle: () => void;
  summary: string | null;
  errors: ValidationError[];
  children: React.ReactNode;
  footer: React.ReactNode;
}

function AccordionStep({ stepId, lang, open, completed, locked, onToggle, summary, errors, children, footer }: AccordionStepProps) {
  const step = STEPS[stepId - 1];
  const Icon = step.icon;

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-200",
        open
          ? "border-[#C5A059]/40 shadow-md dark:border-[#C5A059]/30"
          : completed
            ? "border-zinc-200 dark:border-zinc-700"
            : "border-zinc-200 dark:border-zinc-800",
        locked && "opacity-50",
      )}
    >
      {/* Header */}
      <button
        type="button"
        disabled={locked}
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-4 px-5 py-4 text-left transition-colors",
          open ? "bg-white dark:bg-zinc-900 rounded-t-2xl" : "bg-white dark:bg-zinc-900 rounded-2xl",
          !locked && "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
          locked && "cursor-not-allowed",
        )}
      >
        {/* Step indicator */}
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
            open
              ? "bg-[#C5A059] text-white shadow-sm"
              : completed
                ? "bg-[#C5A059]/15 text-[#C5A059]"
                : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800",
          )}
        >
          {completed && !open ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </div>

        {/* Title + summary */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-sm font-semibold",
              open ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300",
            )}>
              {t(lang, step.titleKey)}
            </span>
            {completed && !open && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                {t(lang, "booking.accordion.done")}
              </span>
            )}
          </div>
          {!open && summary && (
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{summary}</p>
          )}
          {open && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{t(lang, step.descKey)}</p>
          )}
        </div>

        {/* Chevron */}
        {!locked && (
          <div className="shrink-0 text-zinc-400">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        )}
      </button>

      {/* Body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-100 px-5 pb-5 pt-5 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-b-2xl">
              {children}

              {/* Validation errors */}
              {errors.length > 0 && (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  <ul className="list-inside list-disc space-y-1">
                    {errors.map((e) => <li key={e.field}>{t(lang, e.message)}</li>)}
                  </ul>
                </div>
              )}

              {/* Footer (CTA button) */}
              <div className="mt-6 flex justify-end">
                {footer}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function BookingWizardPage() {
  const store = useBookingWizardStore();
  const {
    step, setStep, config, configLoading, setConfig, setCatalog, setPhotographers, setConfigLoading,
    submitted, submitting, setSubmitting, setSubmitted,
    selectedPackage, addons, photographer, date, time, billing, altBilling, agbAccepted,
    address, coords, object, discount, keyPickup, provisional,
  } = store;

  const [showLanding, setShowLanding] = useState(true);
  const [openStep, setOpenStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("propus-booking-lang");
      if (saved && ["de", "en", "fr", "it"].includes(saved)) return saved as Lang;
    } catch { /* ignore */ }
    const navLang = navigator.language.slice(0, 2);
    return (["de", "en", "fr", "it"].includes(navLang) ? navLang : "de") as Lang;
  });
  const [stepErrors, setStepErrors] = useState<Record<number, ValidationError[]>>({});
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

  const getSummary = useStepSummary(lang);

  function validateStep(id: number): ValidationError[] {
    if (id === 1) return validateStep1({ address, parsedAddress: store.parsedAddress, object });
    if (id === 2) return validateStep2({ selectedPackage, addons });
    if (id === 3) return validateStep3({ photographer, date, time });
    if (id === 4) return validateStep4({ billing, altBilling, agbAccepted });
    return [];
  }

  function handleNext(stepId: number) {
    const errs = validateStep(stepId);
    if (errs.length > 0) {
      setStepErrors((prev) => ({ ...prev, [stepId]: errs }));
      return;
    }
    setStepErrors((prev) => ({ ...prev, [stepId]: [] }));
    setCompletedSteps((prev) => new Set([...prev, stepId]));
    setStep(Math.min(4, stepId + 1));
    if (stepId < 4) setOpenStep(stepId + 1);
  }

  function handleToggle(stepId: number) {
    if (openStep === stepId) {
      setOpenStep(0);
    } else {
      setOpenStep(stepId);
      setStep(stepId);
    }
  }

  async function handleSubmit() {
    const errs = validateStep(4);
    if (errs.length > 0) {
      setStepErrors((prev) => ({ ...prev, 4: errs }));
      return;
    }
    setStepErrors((prev) => ({ ...prev, 4: [] }));
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
        onsiteEmail: object.onsiteEmail,
        onsiteCalendarInvite: object.onsiteCalendarInvite,
        additionalOnsiteContacts: object.additionalOnsiteContacts,
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
            <img src={bookingBrandLogoUrl()} alt="Propus" className="h-7" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <h1 className="font-display text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t(lang, "booking.title")}</h1>
          </div>
          <div className="flex items-center gap-3">
            <BookingThemeToggle lang={lang} />
            <BookingLangSelect lang={lang} onChange={changeLang} />
          </div>
        </div>
      </header>

      {/* Mobile Summary */}
      <SummaryPanel lang={lang} mobile />

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* Accordion */}
          <div className="space-y-3">
            {STEPS.map((s) => {
              const isOpen = openStep === s.id;
              const isCompleted = completedSteps.has(s.id);
              const isLocked = s.id > 1 && !completedSteps.has(s.id - 1) && !isCompleted && openStep !== s.id;
              const errors = stepErrors[s.id] ?? [];

              const footer = s.id < 4 ? (
                <button
                  type="button"
                  onClick={() => handleNext(s.id)}
                  className="flex items-center gap-2 rounded-xl bg-[#C5A059] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#b08f4a]"
                >
                  {t(lang, "booking.nav.next")}
                  <ChevronDown className="h-4 w-4 -rotate-90" />
                </button>
              ) : (
                <div className="flex flex-col items-end gap-2 w-full">
                  {submitError && (
                    <p className="text-sm text-red-500">{submitError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex items-center gap-2 rounded-xl bg-[#C5A059] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#b08f4a] disabled:opacity-60"
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> {t(lang, "booking.submit.submitting")}</>
                    ) : (
                      <><Send className="h-4 w-4" /> {t(lang, "booking.submit.button")}</>
                    )}
                  </button>
                </div>
              );

              return (
                <AccordionStep
                  key={s.id}
                  stepId={s.id}
                  lang={lang}
                  open={isOpen}
                  completed={isCompleted}
                  locked={isLocked}
                  onToggle={() => handleToggle(s.id)}
                  summary={getSummary(s.id)}
                  errors={errors}
                  footer={footer}
                >
                  {s.id === 1 && <StepLocation lang={lang} />}
                  {s.id === 2 && <StepServices lang={lang} />}
                  {s.id === 3 && <StepSchedule lang={lang} />}
                  {s.id === 4 && <StepBilling lang={lang} />}
                </AccordionStep>
              );
            })}
          </div>

          {/* Desktop Summary */}
          <SummaryPanel lang={lang} />
        </div>
      </main>
    </div>
  );
}
