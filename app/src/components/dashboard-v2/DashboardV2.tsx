import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "../../hooks/useQuery";
import { getOrders } from "../../api/orders";
import { getAdminProfile } from "../../api/profile";
import { ordersQueryKey } from "../../lib/queryKeys";
import { useAuthStore } from "../../store/authStore";
import { t, type Lang } from "../../i18n";
import { CreateOrderWizard } from "../orders/CreateOrderWizard";
import { useDashboardMetrics } from "./useDashboardMetrics";
import { AlertBar } from "./AlertBar";
import { KpiRowV2 } from "./KpiRowV2";
import { PipelineBoardV2 } from "./PipelineBoardV2";
import { UpcomingV2 } from "./UpcomingV2";
import { BookingFunnelV2 } from "./BookingFunnelV2";
import { HeatmapV2 } from "./HeatmapV2";
import { PerformanceV2 } from "./PerformanceV2";
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
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const { data: orders = [], loading, error, refetch } = useQuery(
    ordersQueryKey(token),
    () => getOrders(token),
    { enabled: Boolean(token), staleTime: 5 * 60 * 1000 },
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

  const metrics = useDashboardMetrics(orders);

  if (loading) {
    return (
      <div className="dv2-skeleton">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="dv2-skeleton-card" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="dv2-error">
        <p>{error}</p>
        <button type="button" onClick={() => refetch({ force: true })} className="dv2-btn-ghost">
          {t(lang, "dashboard.button.reload")}
        </button>
      </div>
    );
  }

  const now = metrics.today;
  const hour = now.getHours();
  const weekday = WEEKDAYS[lang]?.[now.getDay()] ?? WEEKDAYS.de[now.getDay()];
  const monthName = MONTHS_LONG[lang]?.[now.getMonth()] ?? MONTHS_LONG.de[now.getMonth()];
  const eyebrow = `${weekday} · ${now.getDate()}. ${monthName} ${now.getFullYear()}`;
  const greeting = pickGreeting(hour, lang);
  const name = displayName || t(lang, "nav.admin");

  const weeklyShoots = metrics.upcomingOrders.length + metrics.todayOrders.length;

  return (
    <div className="dv2">
      {/* Header */}
      <div className="dv2-header">
        <div className="dv2-header-left">
          <div className="dv2-eyebrow">
            <span className="dv2-eyebrow-line" />
            {eyebrow}
          </div>
          <h1 className="dv2-greeting">
            {greeting}, {name}.
          </h1>
          <p className="dv2-summary">
            {metrics.overdueCount > 0 && (
              <span className="dv2-summary-danger">
                {metrics.overdueCount} {t(lang, "dashboardV2.summary.overdue")}
              </span>
            )}
            {metrics.overdueCount > 0 && " · "}
            <span>
              {weeklyShoots} {t(lang, "dashboardV2.summary.weekShoots")}
            </span>
            {" · "}
            <span>
              {t(lang, "dashboardV2.summary.capacity")
                .replace("{{kw}}", String(metrics.currentKW))
                .replace("{{pct}}", String(metrics.currentCapacity))}
            </span>
          </p>
        </div>
        <div className="dv2-header-actions">
          <button type="button" className="dv2-btn-outline">
            {t(lang, "dashboardV2.button.customize")}
          </button>
          <button
            type="button"
            className="dv2-btn-primary"
            onClick={() => setShowCreateOrder(true)}
          >
            <Plus size={14} />
            {t(lang, "dashboardV2.button.newOrder")}
          </button>
        </div>
      </div>

      <AlertBar orders={metrics.overdueOrders} lang={lang} />
      <KpiRowV2 metrics={metrics} lang={lang} />

      <div className="dv2-grid-main">
        <PipelineBoardV2 metrics={metrics} lang={lang} />
        <UpcomingV2 metrics={metrics} lang={lang} />
      </div>

      <div className="dv2-grid-bottom">
        <BookingFunnelV2 metrics={metrics} lang={lang} />
        <HeatmapV2 metrics={metrics} lang={lang} />
        <PerformanceV2 metrics={metrics} lang={lang} />
      </div>

      <div className="dv2-footer">{t(lang, "dashboardV2.footer")}</div>

      <CreateOrderWizard
        token={token}
        open={showCreateOrder}
        onOpenChange={setShowCreateOrder}
        onSuccess={() => setShowCreateOrder(false)}
      />
    </div>
  );
}
