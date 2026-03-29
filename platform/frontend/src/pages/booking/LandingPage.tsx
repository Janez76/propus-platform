import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, ChevronDown, Star } from "lucide-react";
import { t, type Lang } from "../../i18n";
import { apiRequest } from "../../api/client";
import type { CatalogAddon, CatalogCategory, CatalogData } from "../../api/bookingPublic";

type Review = { author: string; rating: number; text: string; relativeTime?: string };
type ReviewsData = { ok: boolean; rating?: number; total?: number; reviews: Review[] };

const FALLBACK_PACKAGES: { key: string; titleKey: string; subtitleKey: string; priceLabel: string; featuresKey: string; popular?: boolean; modular?: boolean }[] = [
  { key: "bestseller",  titleKey: "landing.pkg.bestseller",  subtitleKey: "landing.pkg.bestseller.sub",  priceLabel: "CHF 399", featuresKey: "landing.pkg.bestseller.features",  popular: true },
  { key: "cinematic",   titleKey: "landing.pkg.cinematic",   subtitleKey: "landing.pkg.cinematic.sub",   priceLabel: "CHF 549", featuresKey: "landing.pkg.cinematic.features" },
  { key: "fullview",    titleKey: "landing.pkg.fullview",    subtitleKey: "landing.pkg.fullview.sub",    priceLabel: "CHF 649", featuresKey: "landing.pkg.fullview.features" },
  { key: "modular",     titleKey: "landing.pkg.modular",     subtitleKey: "landing.pkg.modular.sub",     priceLabel: "ab CHF 229", featuresKey: "landing.pkg.modular.features", modular: true },
];

const PACKAGE_IMAGES: Record<string, string> = {
  bestseller: "/legacy-booking/assets/landing/packages/package-bestseller.png",
  cinematic:  "/legacy-booking/assets/landing/packages/package-cinematic.png",
  fullview:   "/legacy-booking/assets/landing/packages/package-fullview.png",
  modular:    "/legacy-booking/assets/landing/packages/package-modular.png",
};

const FALLBACK_REVIEW: Review = {
  author: "Maklerbüro Zürich · Google",
  rating: 5,
  text: "Schnelle Abwicklung, professionelle Qualität. Das Inserat war innerhalb weniger Tage vergeben — wir buchen definitiv wieder über Propus.",
};

function formatCHF(n: number | undefined | null) {
  if (n == null || !Number.isFinite(n)) return "CHF –";
  return `CHF ${n.toLocaleString("de-CH")}`;
}

function Stars({ count }: { count: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < Math.round(count) ? "fill-[#C5A059] text-[#C5A059]" : "text-zinc-300"}`} />
      ))}
    </span>
  );
}

function AnimatedCounter({ target, suffix = "", delay = 0 }: { target: number; suffix?: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-20%" });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const start = performance.now();
    const duration = 1800;
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - start - delay) / duration, 1);
      if (t < 0) { raf = requestAnimationFrame(tick); return; }
      const ease = 1 - Math.pow(1 - t, 3);
      setValue(Math.floor(target * ease));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isInView, target, delay]);

  return (
    <span ref={ref} className="tabular-nums">
      {isInView ? `${value.toLocaleString("de-CH")}${suffix}` : "—"}
    </span>
  );
}

interface LandingPageProps {
  lang: Lang;
  onStart: () => void;
}

function PriceLabel({ addon, lang }: { addon: CatalogAddon; lang: Lang }) {
  if (addon.pricingType === "byArea" || addon.pricingType === "per_area") {
    return <>{formatCHF(addon.price)}–{formatCHF((addon.price ?? 0) * 2)} <span className="text-xs font-normal text-zinc-400">(+{formatCHF(addon.unitPrice ?? 79)}/100 m²)</span></>;
  }
  if (addon.pricingType === "per_floor" || addon.pricingType === "perFloor") {
    return <>{formatCHF(addon.unitPrice ?? addon.price)} <span className="text-xs font-normal text-zinc-400">/ {t(lang, "landing.pricelist.perFloor")}</span></>;
  }
  if (addon.pricingType === "per_unit" || addon.pricingType === "perUnit") {
    return <>{formatCHF(addon.unitPrice ?? addon.price)} <span className="text-xs font-normal text-zinc-400">/ {t(lang, "landing.pricelist.perUnit")}</span></>;
  }
  return <>{formatCHF(addon.price)}</>;
}

const CATEGORY_DESC_KEYS: Record<string, string> = {
  camera:      "landing.catdesc.camera",
  dronePhoto:  "landing.catdesc.dronePhoto",
  tour:        "landing.catdesc.tour",
  floorplans:  "landing.catdesc.floorplans",
  groundVideo: "landing.catdesc.groundVideo",
  droneVideo:  "landing.catdesc.droneVideo",
  staging:     "landing.catdesc.staging",
  express:     "landing.catdesc.express",
  keyPickup:   "landing.catdesc.keyPickup",
};

function PriceListCategory({ category, addons, defaultOpen, lang }: { category: CatalogCategory; addons: CatalogAddon[]; defaultOpen?: boolean; lang: Lang }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const items = addons
    .filter((a) => a.categoryKey === category.key)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  if (items.length === 0) return null;

  const descKey = CATEGORY_DESC_KEYS[category.key];
  const desc = descKey ? t(lang, descKey) : "";
  const showDesc = desc && desc !== descKey;

  const sharedNotes = items.filter((a) => a.pricingNote).map((a) => a.pricingNote!);
  const allSameNote = sharedNotes.length > 0 && sharedNotes.every((n) => n === sharedNotes[0]);
  const categoryNote = allSameNote ? sharedNotes[0] : null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200/60 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-zinc-50"
      >
        <div className="min-w-0 flex-1">
          <span className="text-sm font-bold text-zinc-800">{category.name}</span>
          {showDesc && (
            <span className="ml-2 text-xs font-normal text-zinc-400">{desc}</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-zinc-100">
          {items.map((addon, i) => (
            <div
              key={addon.id}
              className={`flex items-center justify-between px-5 py-3 ${i < items.length - 1 ? "border-b border-zinc-100/80" : ""}`}
            >
              <div className="flex-1 pr-4">
                <div className="text-sm text-zinc-700">{addon.label}</div>
                {!categoryNote && addon.pricingNote && (
                  <div className="mt-0.5 text-xs text-zinc-400">{addon.pricingNote}</div>
                )}
              </div>
              <div className="text-sm font-bold text-[#C5A059] whitespace-nowrap">
                <PriceLabel addon={addon} lang={lang} />
              </div>
            </div>
          ))}
          {categoryNote && (
            <div className="border-t border-zinc-100/80 bg-zinc-50/50 px-5 py-2.5">
              <p className="text-xs text-zinc-400">{categoryNote}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LandingPage({ lang, onStart }: LandingPageProps) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [reviews, setReviews] = useState<Review[]>([FALLBACK_REVIEW]);
  const [reviewMeta, setReviewMeta] = useState<{ rating: number; total: number } | null>(null);
  const [currentReview, setCurrentReview] = useState(0);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const servicesRef = useRef<HTMLElement>(null);
  const priceListRef = useRef<HTMLElement>(null);

  const prices = useMemo(() => {
    const map: Record<string, number> = {};
    (catalog?.packages ?? []).forEach((p) => {
      if (Number.isFinite(p.price)) map[p.key] = p.price;
    });
    return map;
  }, [catalog]);

  const sortedCategories = useMemo(() =>
    (catalog?.categories ?? [])
      .filter((c) => c.active)
      .sort((a, b) => a.sort_order - b.sort_order),
    [catalog],
  );

  const sortedPackages = useMemo(() =>
    (catalog?.packages ?? []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [catalog],
  );

  useEffect(() => {
    apiRequest<CatalogData>("/api/catalog/products")
      .then(setCatalog)
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiRequest<ReviewsData>("/api/reviews")
      .then((data) => {
        if (data?.ok && data.reviews?.length) {
          const fiveStars = data.reviews.filter((r) => Math.round(r.rating) === 5);
          if (fiveStars.length > 0) setReviews(fiveStars);
          if (data.rating) setReviewMeta({ rating: data.rating, total: data.total ?? 0 });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (reviews.length <= 1) return;
    autoRef.current = setInterval(() => setCurrentReview((c) => (c + 1) % reviews.length), 5000);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [reviews.length]);

  const stopAuto = useCallback(() => {
    if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; }
  }, []);

  const goReview = (dir: -1 | 1) => {
    stopAuto();
    setCurrentReview((c) => (c + dir + reviews.length) % reviews.length);
  };

  const scrollToPackages = () => {
    servicesRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToPrices = () => {
    priceListRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const counters = [
    { target: 1200, suffix: "+", labelKey: "landing.counter.orders" },
    { target: 48,   suffix: "h", labelKey: "landing.counter.deliveryPhoto" },
    { target: 72,   suffix: "h", labelKey: "landing.counter.deliveryVideo" },
    { target: 3,    suffix: "",  labelKey: "landing.counter.packages" },
  ];

  const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f1e8] text-zinc-800">
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-200/60 bg-white/88 px-6 py-4 shadow-sm backdrop-blur-xl sm:px-10">
        <img
          src="/legacy-booking/assets/brand/logopropus.png"
          alt="Propus"
          className="h-9 w-auto object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <button
          type="button"
          onClick={onStart}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#C5A059] to-[#b08f4a] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#9e8649]/30 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#9e8649]/40"
        >
          {t(lang, "landing.nav.cta")}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </nav>

      {/* Hero */}
      <section className="relative flex min-h-[92vh] flex-col items-center justify-center px-6 py-28 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mx-auto max-w-[780px] text-[clamp(2.4rem,5.5vw,4.2rem)] font-extrabold leading-[1.1] tracking-tight"
        >
          {t(lang, "landing.hero.line1")}<br />
          <span className="text-[#C5A059]">{t(lang, "landing.hero.line2")}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto mt-5 max-w-[520px] text-base leading-relaxed text-zinc-600/80 font-medium"
        >
          {t(lang, "landing.hero.sub")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <button
            type="button"
            onClick={onStart}
            className="group inline-flex items-center gap-2.5 rounded-full bg-gradient-to-br from-[#C5A059] to-[#b08f4a] px-8 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#9e8649]/30 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#9e8649]/40 active:translate-y-0.5 active:scale-[.98]"
          >
            {t(lang, "landing.hero.cta")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={scrollToPackages}
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-zinc-200/80 bg-white/80 px-7 py-3.5 text-[15px] font-bold backdrop-blur transition-all hover:border-[#C5A059] hover:text-[#C5A059] hover:shadow-lg"
          >
            {t(lang, "landing.hero.packages")}
          </button>
          <button
            type="button"
            onClick={scrollToPrices}
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-zinc-200/80 bg-white/80 px-7 py-3.5 text-[15px] font-bold backdrop-blur transition-all hover:border-[#C5A059] hover:text-[#C5A059] hover:shadow-lg"
          >
            {t(lang, "landing.hero.prices")}
          </button>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 1 }}
          className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">
            {t(lang, "landing.scroll")}
          </span>
          <div className="h-9 w-px origin-top animate-pulse bg-gradient-to-b from-[#C5A059] to-transparent" />
        </motion.div>
      </section>

      {/* Counters */}
      <section className="grid grid-cols-2 border-y border-zinc-200/70 bg-white/90 shadow-sm md:grid-cols-4">
        {counters.map((c, i) => (
          <motion.div
            key={c.labelKey}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="group relative border-r border-zinc-200/70 px-6 py-9 text-center last:border-r-0"
          >
            <div className="text-[2.4rem] font-extrabold leading-none tracking-tight text-[#C5A059]">
              <AnimatedCounter target={c.target} suffix={c.suffix} delay={i * 100} />
            </div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[.12em] text-zinc-500">
              {t(lang, c.labelKey)}
            </div>
            <div className="absolute bottom-0 left-1/2 h-0.5 w-0 -translate-x-1/2 bg-[#C5A059] transition-all duration-300 group-hover:w-[36%]" />
          </motion.div>
        ))}
      </section>

      {/* Packages */}
      <section ref={servicesRef} className="mx-auto mb-20 mt-20 max-w-[1120px] px-6 scroll-mt-24">
        <p className="text-center text-[11px] font-bold uppercase tracking-[.18em] text-[#C5A059]">
          {t(lang, "landing.packages.eyebrow")}
        </p>
        <h2 className="mt-2 text-center text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight">
          {t(lang, "landing.packages.title")}
        </h2>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {FALLBACK_PACKAGES.map((pkg, i) => {
            const dynamicPrice = prices[pkg.key];
            const displayPrice = dynamicPrice != null
              ? (pkg.modular ? `ab ${formatCHF(dynamicPrice)}` : formatCHF(dynamicPrice))
              : pkg.priceLabel;
            const features = t(lang, pkg.featuresKey).split("\n").filter(Boolean);
            const imgSrc = PACKAGE_IMAGES[pkg.key];

            return (
              <motion.button
                key={pkg.key}
                type="button"
                onClick={onStart}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200/60 bg-white text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A059]"
              >
                {pkg.popular && (
                  <div className="absolute right-4 top-4 z-10 rounded-full bg-[#C5A059] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                    {t(lang, "landing.pkg.popular")}
                  </div>
                )}
                {imgSrc && (
                  <div className="overflow-hidden bg-[#f6f1e8]/60">
                    <img
                      src={imgSrc}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <div className="text-sm font-extrabold uppercase tracking-wider text-zinc-900">
                    {t(lang, pkg.titleKey)}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {t(lang, pkg.subtitleKey)}
                  </div>
                  <div className="mt-3 text-2xl font-extrabold text-[#C5A059]">{displayPrice}</div>
                  <ul className="mt-4 flex-1 space-y-1.5">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-zinc-600">
                        <span className="mt-1 block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#C5A059]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Price List */}
      {catalog && (sortedPackages.length > 0 || (catalog.addons ?? []).length > 0) && (
        <section ref={priceListRef} className="mx-auto mb-20 max-w-[1120px] px-6 scroll-mt-24">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-center text-[11px] font-bold uppercase tracking-[.18em] text-[#C5A059]">
              {t(lang, "landing.pricelist.eyebrow")}
            </p>
            <h2 className="mt-2 text-center text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight">
              {t(lang, "landing.pricelist.title")}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-center text-sm text-zinc-500">
              {t(lang, "landing.pricelist.sub")}
            </p>
          </motion.div>

          <div className="mt-10 space-y-8">
            {/* Package comparison table */}
            {sortedPackages.length > 0 && (
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                <h3 className="mb-4 text-xs font-bold uppercase tracking-[.16em] text-zinc-500">
                  {t(lang, "landing.pricelist.packages")}
                </h3>
                <div className="overflow-hidden rounded-xl border border-zinc-200/60 bg-white">
                  {sortedPackages.map((pkg, i) => (
                    <div
                      key={pkg.key}
                      className={`flex items-center justify-between px-5 py-4 ${i < sortedPackages.length - 1 ? "border-b border-zinc-100" : ""}`}
                    >
                      <div className="flex-1 pr-4">
                        <div className="text-sm font-bold text-zinc-800">{pkg.label}</div>
                        {pkg.description && (
                          <div className="mt-0.5 text-xs text-zinc-400 line-clamp-1">{pkg.description}</div>
                        )}
                      </div>
                      <div className="text-base font-extrabold text-[#C5A059] whitespace-nowrap">
                        {formatCHF(pkg.price)}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Addon categories */}
            {sortedCategories.length > 0 && (
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <h3 className="mb-4 text-xs font-bold uppercase tracking-[.16em] text-zinc-500">
                  {t(lang, "landing.pricelist.services")}
                </h3>
                <div className="space-y-3">
                  {sortedCategories.map((cat, i) => (
                    <PriceListCategory
                      key={cat.key}
                      category={cat}
                      addons={catalog.addons ?? []}
                      defaultOpen={i === 0}
                      lang={lang}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Note + CTA */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-center"
            >
              <p className="text-sm text-zinc-400">{t(lang, "landing.pricelist.note")}</p>
              <button
                type="button"
                onClick={onStart}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#C5A059] to-[#b08f4a] px-7 py-3 text-sm font-bold text-white shadow-lg shadow-[#9e8649]/30 transition-all hover:-translate-y-0.5 hover:shadow-xl"
              >
                {t(lang, "landing.pricelist.cta")}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          </div>
        </section>
      )}

      {/* Reviews */}
      <section className="mx-auto mb-20 max-w-[700px] px-6">
        <p className="text-center text-[11px] font-bold uppercase tracking-[.18em] text-[#C5A059]">
          {t(lang, "landing.reviews.eyebrow")}
        </p>
        {reviewMeta && (
          <div className="mt-2 flex items-center justify-center gap-2 text-sm text-zinc-600">
            <span className="font-bold">{reviewMeta.rating.toFixed(1)}</span>
            <Stars count={reviewMeta.rating} />
            <span className="text-zinc-400">({reviewMeta.total} {t(lang, "landing.reviews.count")})</span>
          </div>
        )}

        <div className="relative mt-8 overflow-hidden rounded-2xl border border-zinc-200/60 bg-white p-8 shadow-sm">
          {reviews.map((rv, i) => (
            <motion.div
              key={i}
              initial={false}
              animate={{ opacity: i === currentReview ? 1 : 0, x: i === currentReview ? 0 : 40 }}
              transition={{ duration: 0.4 }}
              className={i === currentReview ? "" : "pointer-events-none absolute inset-0 p-8"}
            >
              <Stars count={rv.rating} />
              <p className="mt-4 text-base leading-relaxed text-zinc-700">{rv.text}</p>
              <div className="mt-4 text-sm font-semibold text-zinc-500">{rv.author}</div>
            </motion.div>
          ))}
        </div>

        {reviews.length > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button type="button" onClick={() => goReview(-1)} className="rounded-full border border-zinc-200 p-2 transition hover:border-[#C5A059] hover:text-[#C5A059]" aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex gap-1.5">
              {reviews.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { stopAuto(); setCurrentReview(i); }}
                  className={`h-2 w-2 rounded-full transition-all ${i === currentReview ? "bg-[#C5A059] scale-125" : "bg-zinc-300"}`}
                  aria-label={`Review ${i + 1}`}
                />
              ))}
            </div>
            <button type="button" onClick={() => goReview(1)} className="rounded-full border border-zinc-200 p-2 transition hover:border-[#C5A059] hover:text-[#C5A059]" aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>

      {/* Final CTA */}
      <footer className="mb-0 px-6 pb-20 pt-12 text-center">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight">
            {t(lang, "landing.final.line1")}<br />
            <em className="not-italic text-[#C5A059]">{t(lang, "landing.final.line2")}</em>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base text-zinc-600">
            {t(lang, "landing.final.sub")}
          </p>
          <button
            type="button"
            onClick={onStart}
            className="group mt-8 inline-flex items-center gap-2.5 rounded-full bg-gradient-to-br from-[#C5A059] to-[#b08f4a] px-8 py-4 text-base font-bold text-white shadow-lg shadow-[#9e8649]/30 transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0.5 active:scale-[.98]"
          >
            {t(lang, "landing.final.cta")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <div className="mt-3 text-sm text-zinc-400">{t(lang, "landing.final.note")}</div>
        </motion.div>
      </footer>
    </div>
  );
}
