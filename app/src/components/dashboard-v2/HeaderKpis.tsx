import { Calendar, ListChecks, Banknote, Zap } from "lucide-react";
import { formatCHF } from "../../lib/format";
import { t, type Lang } from "../../i18n";
import type { DashboardMetrics } from "./useDashboardMetrics";

interface HeaderKpisProps {
  metrics: DashboardMetrics;
  lang: Lang;
}

const MONTH_LABEL: Record<Lang, string[]> = {
  de: ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  fr: ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],
  it: ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],
};

interface KpiTileProps {
  label: string;
  value: string;
  trend?: string;
  trendTone?: "up" | "down" | "warn";
  tone?: "gold" | "warn";
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

function KpiTile({ label, value, trend, trendTone, tone, icon: Icon }: KpiTileProps) {
  const cls = `dv2-ph-kpi${tone ? ` dv2-ph-kpi--${tone}` : ""}`;
  return (
    <div className={cls}>
      <div className="dv2-ph-kpi-label">
        <Icon size={11} className="dv2-ph-kpi-label-icon" />
        {label}
      </div>
      <div className={`dv2-ph-kpi-value${tone === "gold" ? " is-gold" : ""}`}>{value}</div>
      {trend && (
        <div className={`dv2-ph-kpi-trend${trendTone ? ` is-${trendTone}` : ""}`}>{trend}</div>
      )}
    </div>
  );
}

export function HeaderKpis({ metrics, lang }: HeaderKpisProps) {
  const monthName = MONTH_LABEL[lang]?.[metrics.currMonth] ?? MONTH_LABEL.de[metrics.currMonth];

  const todayTrend =
    metrics.todayWithoutStaff > 0
      ? t(lang, "dashboardV2.headerKpi.withoutStaff").replace("{{n}}", String(metrics.todayWithoutStaff))
      : undefined;

  const weekTrend =
    metrics.weekDeltaPct === null
      ? undefined
      : metrics.weekDeltaPct === 0
        ? t(lang, "dashboardV2.headerKpi.weekFlat")
        : t(lang, "dashboardV2.headerKpi.weekDelta").replace(
            "{{pct}}",
            `${metrics.weekDeltaPct > 0 ? "+" : ""}${metrics.weekDeltaPct}`,
          );
  const weekTrendTone =
    metrics.weekDeltaPct === null
      ? undefined
      : metrics.weekDeltaPct > 0
        ? "up"
        : metrics.weekDeltaPct < 0
          ? "down"
          : undefined;

  const capacityIsCritical = metrics.currentCapacity >= 80;

  return (
    <div className="dv2-ph-kpis">
      <KpiTile
        icon={Calendar}
        label={t(lang, "dashboardV2.headerKpi.todayAppts")}
        value={String(metrics.todayOrders.length)}
        trend={todayTrend}
        trendTone={metrics.todayWithoutStaff > 0 ? "warn" : undefined}
      />
      <KpiTile
        icon={ListChecks}
        label={t(lang, "dashboardV2.headerKpi.weekOrders").replace("{{kw}}", String(metrics.currentKW))}
        value={String(metrics.weekTotal)}
        trend={weekTrend}
        trendTone={weekTrendTone}
      />
      <KpiTile
        icon={Banknote}
        label={t(lang, "dashboardV2.headerKpi.monthRevenue").replace("{{month}}", monthName)}
        value={formatCHF(metrics.monthRevenue)}
        tone="gold"
      />
      <KpiTile
        icon={Zap}
        label={t(lang, "dashboardV2.headerKpi.capacity")}
        value={`${metrics.currentCapacity} %`}
        trend={
          capacityIsCritical
            ? t(lang, "dashboardV2.headerKpi.capacityCritical")
            : t(lang, "dashboardV2.headerKpi.capacityOk")
        }
        trendTone={capacityIsCritical ? "warn" : "up"}
        tone={capacityIsCritical ? "warn" : undefined}
      />
    </div>
  );
}
