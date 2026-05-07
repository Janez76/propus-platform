import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "../../hooks/useQuery";
import { getOrders, type Order } from "../../api/orders";
import { getAdminProfile } from "../../api/profile";
import { ordersQueryKey } from "../../lib/queryKeys";
import { useAuthStore } from "../../store/authStore";
import { t, type Lang } from "../../i18n";
import { CreateOrderWizard } from "../orders/CreateOrderWizard";
import { useNow } from "../../hooks/useNow";
import { usePermissions } from "../../hooks/usePermissions";
import { useDashboardMetrics } from "./useDashboardMetrics";
import { AlertBar } from "./AlertBar";
import { DashAlerts } from "./DashAlerts";
import { HeaderKpis } from "./HeaderKpis";
import { PipelineBoardV2 } from "./PipelineBoardV2";
import { UpcomingV2 } from "./UpcomingV2";
import { TicketsCard } from "./TicketsCard";
import { MailsCard } from "./MailsCard";
import { BriefingCard } from "../cockpit";
import { getWeatherForecast, type WeatherForecastDay } from "../../api/weather";
import { TodayCard } from "./TodayCard";
import "./today-card.css";
import { PipelineDonut } from "./PipelineDonut";
import "./pipeline-donut.css";
import { BookingFunnelV2 } from "./BookingFunnelV2";
import { HeatmapV2 } from "./HeatmapV2";
import { PerformanceV2 } from "./PerformanceV2";
import { OrdersMap } from "./OrdersMap";
import { GoalRings } from "./GoalRings";
import { ServiceMixDonut } from "./ServiceMixDonut";
import { TopCustomersTable } from "./TopCustomersTable";
import { DashboardV2TweaksModal } from "./DashboardV2TweaksModal";
import { useGeolocation } from "../cockpit/useGeolocation";
import {
  loadDashV2Preferences,
  saveDashV2Preferences,
  type DashV2Preferences,
  type DashV2SectionId,
} from "./dashboardV2Preferences";
import "./dashboard-v2.css";
import "./dashboard-v2-mockup-overlay.css";

const WEEKDAYS: Record<Lang, string[]> = {
  de: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  fr: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  it: ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"],
};
const MONTHS_LONG: Record<Lang, string[]> = {
  de: ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  fr: ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],
  it: ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],
};

function pickGreeting(hour: number, lang: Lang): string {
  if (hour < 11) return t(lang, "dashboardV2.greeting.morning");
  if (hour < 18) return t(lang, "dashboardV2.greeting.afternoon");
  return t(lang, "dashboardV2.greeting.evening");
}

function firstName(raw: string | undefined | null): string {
  if (!raw?.trim()) return "";
  return raw.trim().split(/\s+/)[0].replace(/[,.]$/, "");
}

export function DashboardV2() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const { can } = usePermissions();
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showTweaks, setShowTweaks] = useState(false);
  const [prefs, setPrefs] = useState<DashV2Preferences>(loadDashV2Preferences);
  const [displayName, setDisplayName] = useState("");
  const [hoveredOrderNo, setHoveredOrderNo] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherForecastDay[] | null>(null);
  /** Live-Standort für die Mission-Timeline-Drive-Time. Eigener storage-Key,
   *  damit die Cockpit-Propi-Permission davon getrennt bleibt — UI-CTA für
   *  „Standort teilen" wird im UpcomingV2 selbst gerendert (Pill mit MapPin). */
  // Profil-zentraler Standort-Key — Default an, deaktivierbar nur im Profil.
  const geo = useGeolocation();
  const liveOrigin = geo.position ? { lat: geo.position.lat, lng: geo.position.lng } : null;
  const requestLocation = useCallback(() => {
    void geo.request();
  }, [geo]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getWeatherForecast(token, { days: 7, region: "zurich" })
      .then((res) => { if (!cancelled) setWeather(res.days.slice(0, 7)); })
      .catch(() => { if (!cancelled) setWeather([]); });
    return () => { cancelled = true; };
  }, [token]);

  const setPrefsAndSave = (next: DashV2Preferences) => {
    setPrefs(next);
    saveDashV2Preferences(next);
  };
  const isSec = (id: DashV2SectionId) => !prefs.hidden.includes(id);
  const showOrders = can("orders.read");
  const showCal = can("calendar.view");
  const showFin = can("finance.read");
  const showDas = can("dashboard.view");
  const showAlerts = isSec("alerts") && showOrders && showDas;
  const showOverdueList = isSec("overdueList") && showOrders && showDas;
  const showKpi = isSec("kpi") && showDas && (showOrders || showFin);
  const showPipeline = isSec("pipeline") && showOrders;
  const showUpcoming = isSec("upcoming") && showOrders;
  const showTickets = isSec("tickets") && can("tickets.read");
  const showMails = isSec("mails") && showDas;
  const showFunnel = isSec("funnel") && showOrders;
  const showHeat = isSec("heatmap") && (showCal || showOrders) && showDas;
  const showPerf = isSec("perf") && showOrders;
  const showMap = isSec("map") && showOrders;
  const showGoals = isSec("goals") && showDas && showOrders;
  const showServiceMix = isSec("serviceMix") && showOrders && (showFin || showDas);
  const showTopCustomers = isSec("topCustomers") && showOrders;
  const mainSingleCol = (showPipeline && !showUpcoming) || (!showPipeline && showUpcoming);
  const inboxSingleCol = (showTickets && !showMails) || (!showTickets && showMails);

  const wallNow = useNow();
  const fetchOrders = useCallback((): Promise<Order[]> => {
    if (!token) return Promise.resolve([]);
    return getOrders(token);
  }, [token]);
  const { data: orders = [], loading, error, refetch, isFetching, updatedAt } = useQuery(
    ordersQueryKey(token),
    fetchOrders,
    {
      enabled: Boolean(token),
      /** Kurze Staleness, damit Fokus-Refetch schnell wirkt. */
      staleTime: 15 * 1000,
      refetchInterval: 20 * 1000,
      refetchOnWindowFocus: true,
    },
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getAdminProfile(token)
      .then((data) => {
        if (cancelled) return;
        setDisplayName(firstName(data.profile?.name) || firstName(data.profile?.user));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const metrics = useDashboardMetrics(orders, wallNow);

  if (loading) {
    return (
      <div className="padmin-shell dv2 dv2-skeleton">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="dv2-skeleton-card" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="padmin-shell dv2 dv2-error">
        <p>{error}</p>
        <button type="button" onClick={() => refetch({ force: true })} className="dv2-btn-ghost">
          {t(lang, "dashboard.button.reload")}
        </button>
      </div>
    );
  }

  const hour = wallNow.getHours();
  const weekday = WEEKDAYS[lang]?.[wallNow.getDay()] ?? WEEKDAYS.de[wallNow.getDay()];
  const monthName = MONTHS_LONG[lang]?.[wallNow.getMonth()] ?? MONTHS_LONG.de[wallNow.getMonth()];
  const eyebrow = `${weekday} · ${wallNow.getDate()}. ${monthName} ${wallNow.getFullYear()}`;
  const greeting = pickGreeting(hour, lang);
  const name = displayName || t(lang, "nav.admin");

  return (
    <div className={`padmin-shell dv2 dv2--density-${prefs.density}`}>
      {/* Header */}
      <div className="dv2-header">
        <div className="dv2-header-top">
          <div className="dv2-header-left">
            <div className="dv2-eyebrow">
              <span className="dv2-eyebrow-line" />
              {eyebrow}
            </div>
            <h1 className="dv2-greeting">
              {greeting}, <span className="dv2-greeting-name">{name}</span>.
            </h1>
            <p className="dv2-summary">
              {t(lang, "dashboardV2.summary.intro")}{" — "}
              <span>
                {t(lang, "dashboardV2.summary.todayAppts")
                  .replace("{{n}}", String(metrics.todayOrders.length))}
              </span>
              {", "}
              <span>
                {t(lang, "dashboardV2.summary.openOrders")
                  .replace("{{n}}", String(metrics.openOrdersCount))}
              </span>
              {", "}
              {metrics.overdueCount > 0 ? (
                <span className="dv2-summary-danger">
                  {t(lang, "dashboardV2.summary.overdueTail")
                    .replace("{{n}}", String(metrics.overdueCount))}
                </span>
              ) : (
                <span>{t(lang, "dashboardV2.summary.allGood")}</span>
              )}
              {"."}
            </p>
          </div>
          <div className="dv2-header-actions">
            <button
              type="button"
              className="dv2-btn-outline"
              onClick={() => setShowTweaks(true)}
              aria-haspopup="dialog"
              aria-expanded={showTweaks}
            >
              {t(lang, "dashboardV2.button.customize")}
            </button>
            {can("orders.create") ? (
              <button
                type="button"
                className="dv2-btn-primary"
                onClick={() => setShowCreateOrder(true)}
              >
                <Plus size={14} />
                {t(lang, "dashboardV2.button.newOrder")}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Polish-Pass 1: AI-Tagesbriefing als prominenter Hero (vor KPIs) */}
      {showDas ? (
        <section className="dv2-briefing-hero">
          <BriefingCard metrics={orders ? metrics : null} weather={weather} />
        </section>
      ) : null}

      {showKpi && showDas ? <HeaderKpis metrics={metrics} lang={lang} /> : null}

      {/* Sprint 13: TodayCard — Datum-Display + 7-Tage-Wetter + Termine-Timeline */}
      {/* Sprint 17: Wetter wird gemeinsam mit BriefingCard genutzt (kein duplicate fetch) */}
      {showDas && showOrders ? (
        <TodayCard metrics={metrics} lang={lang} onHover={setHoveredOrderNo} weather={weather} />
      ) : null}

      {showAlerts ? <DashAlerts metrics={metrics} lang={lang} /> : null}
      {showOverdueList ? <AlertBar orders={metrics.overdueOrders} lang={lang} /> : null}

      {showPipeline || showUpcoming ? (
        <div className={`dv2-grid-main${mainSingleCol ? " dv2-grid-main--single" : ""}`}>
          {showPipeline ? <PipelineBoardV2 metrics={metrics} lang={lang} /> : null}
          {showUpcoming ? (
            <UpcomingV2
              metrics={metrics}
              lang={lang}
              weather={weather}
              liveOrigin={liveOrigin}
              onShareLocation={requestLocation}
              onHover={setHoveredOrderNo}
              onCreateOrder={can("orders.create") ? () => setShowCreateOrder(true) : undefined}
            />
          ) : null}
        </div>
      ) : null}

      {showTickets || showMails ? (
        <div className={`dv2-grid-inbox${inboxSingleCol ? " dv2-grid-inbox--single" : ""}`}>
          {showTickets ? <TicketsCard lang={lang} /> : null}
          {showMails ? <MailsCard lang={lang} /> : null}
        </div>
      ) : null}

      {showGoals ? <GoalRings metrics={metrics} orders={orders} /> : null}

      {showTopCustomers ? <TopCustomersTable orders={orders} lang={lang} /> : null}

      {showHeat ? <HeatmapV2 metrics={metrics} orders={orders} lang={lang} /> : null}

      {showMap ? <OrdersMap orders={orders} lang={lang} hoveredOrderNo={hoveredOrderNo} /> : null}

      {showFunnel || showPerf || showPipeline || showServiceMix ? (
        (() => {
          const count =
            (showFunnel ? 1 : 0) +
            (showPipeline ? 1 : 0) +
            (showServiceMix ? 1 : 0) +
            (showPerf ? 1 : 0);
          const tpl =
            count >= 4 ? "repeat(4, minmax(0, 1fr))"
            : count >= 3 ? "repeat(3, minmax(0, 1fr))"
            : count === 2 ? "repeat(2, minmax(0, 1fr))"
            : "1fr";
          return (
            <div className="dv2-grid-bottom dv2-grid-bottom--charts" style={{ gridTemplateColumns: tpl }}>
              {showFunnel ? <BookingFunnelV2 metrics={metrics} lang={lang} /> : null}
              {/* Sprint 15: Donut neben Funnel (Mockup-V3.1-Match) */}
              {showPipeline ? <PipelineDonut metrics={metrics} /> : null}
              {/* Polish-Pass 2 · 4.3: Service-Mix-Donut neben Pipeline-Donut */}
              {showServiceMix ? <ServiceMixDonut orders={orders} lang={lang} /> : null}
              {showPerf ? <PerformanceV2 metrics={metrics} lang={lang} /> : null}
            </div>
          );
        })()
      ) : null}

      <div className="dv2-footer">
        {t(lang, "dashboardV2.footer")}
        {token && (
          <span className="dv2-footer-refresh" aria-live="polite">
            {isFetching
              ? t(lang, "dashboardV2.dataRefreshing")
              : updatedAt
                ? t(lang, "dashboardV2.dataUpdated").replace(
                    "{{time}}",
                    new Date(updatedAt).toLocaleTimeString(lang === "de" ? "de-CH" : lang === "fr" ? "fr-CH" : lang === "it" ? "it-CH" : "en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  )
                : null}
          </span>
        )}
      </div>

      {can("orders.create") ? (
        <CreateOrderWizard
          token={token}
          open={showCreateOrder}
          onOpenChange={setShowCreateOrder}
          onSuccess={() => setShowCreateOrder(false)}
        />
      ) : null}
      <DashboardV2TweaksModal
        open={showTweaks}
        lang={lang}
        prefs={prefs}
        onClose={() => setShowTweaks(false)}
        onChange={setPrefsAndSave}
      />
    </div>
  );
}
