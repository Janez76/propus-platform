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
import { BookingFunnelV2 } from "./BookingFunnelV2";
import { HeatmapV2 } from "./HeatmapV2";
import { PerformanceV2 } from "./PerformanceV2";
import { OrdersMap } from "./OrdersMap";
import { DashboardV2TweaksModal } from "./DashboardV2TweaksModal";
import {
  loadDashV2Preferences,
  saveDashV2Preferences,
  type DashV2Preferences,
  type DashV2SectionId,
} from "./dashboardV2Preferences";
import "./dashboard-v2.css";

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
  const mainSingleCol = (showPipeline && !showUpcoming) || (!showPipeline && showUpcoming);
  const inboxSingleCol = (showTickets && !showMails) || (!showTickets && showMails);
  const nBottom = [showFunnel, showHeat, showPerf].filter(Boolean).length;

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
        {showKpi && showDas ? <HeaderKpis metrics={metrics} lang={lang} /> : null}
      </div>

      {showAlerts ? <DashAlerts metrics={metrics} lang={lang} /> : null}
      {showOverdueList ? <AlertBar orders={metrics.overdueOrders} lang={lang} /> : null}

      {showPipeline || showUpcoming ? (
        <div className={`dv2-grid-main${mainSingleCol ? " dv2-grid-main--single" : ""}`}>
          {showPipeline ? <PipelineBoardV2 metrics={metrics} lang={lang} /> : null}
          {showUpcoming ? <UpcomingV2 metrics={metrics} lang={lang} /> : null}
        </div>
      ) : null}

      {showTickets || showMails ? (
        <div className={`dv2-grid-inbox${inboxSingleCol ? " dv2-grid-inbox--single" : ""}`}>
          {showTickets ? <TicketsCard lang={lang} /> : null}
          {showMails ? <MailsCard lang={lang} /> : null}
        </div>
      ) : null}

      {nBottom > 0 ? (
        <div
          className="dv2-grid-bottom"
          style={nBottom < 3 ? { gridTemplateColumns: `repeat(${nBottom}, minmax(0, 1fr))` } : undefined}
        >
          {showFunnel ? <BookingFunnelV2 metrics={metrics} lang={lang} /> : null}
          {showHeat ? <HeatmapV2 metrics={metrics} orders={orders} lang={lang} /> : null}
          {showPerf ? <PerformanceV2 metrics={metrics} lang={lang} /> : null}
        </div>
      ) : null}

      {showMap ? <OrdersMap orders={orders} lang={lang} /> : null}

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
