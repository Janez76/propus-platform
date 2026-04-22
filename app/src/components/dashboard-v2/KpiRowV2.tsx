import { Banknote, Calendar, Package, Target, Zap } from "lucide-react";
import { KpiCardV2 } from "./KpiCardV2";
import { Sparkline } from "./Sparkline";
import { MiniBars } from "./MiniBars";
import { formatCHF } from "../../lib/format";
import { t, type Lang } from "../../i18n";
import type { DashboardMetrics } from "./useDashboardMetrics";

interface KpiRowV2Props {
  metrics: DashboardMetrics;
  lang: Lang;
}

export function KpiRowV2({ metrics, lang }: KpiRowV2Props) {
  const {
    revenue30d,
    totalRevenue30d,
    revenueDeltaPct,
    revenueIsNew,
    bookingsWeekly,
    bookingsThisWeek,
    bookingsDelta,
    ordersOverTime,
    openOrdersCount,
    overdueCount,
    capacityData,
    currentCapacity,
    currentKW,
  } = metrics;

  const revenueDir = revenueIsNew
    ? "up"
    : revenueDeltaPct === null
      ? "neutral"
      : revenueDeltaPct > 0
        ? "up"
        : revenueDeltaPct < 0
          ? "down"
          : "neutral";
  const revenueDeltaStr =
    revenueIsNew
      ? t(lang, "dashboardV2.kpi.revenueNew")
      : revenueDeltaPct !== null
        ? `${revenueDeltaPct >= 0 ? "+" : ""}${Math.round(revenueDeltaPct)} %`
        : undefined;
  const revenueSparklineDanger = !revenueIsNew && revenueDeltaPct !== null && revenueDeltaPct < 0;
  const bookingsDir = bookingsDelta > 0 ? "up" : bookingsDelta < 0 ? "down" : "neutral";

  return (
    <div className="dv2-kpi-row">
      <KpiCardV2
        label={t(lang, "dashboardV2.kpi.revenue30d")}
        value={formatCHF(totalRevenue30d)}
        delta={revenueDeltaStr}
        deltaDir={revenueDir}
        icon={Banknote}
      >
        <Sparkline
          data={revenue30d}
          color={revenueSparklineDanger ? "var(--d-danger)" : "var(--d-gold)"}
        />
      </KpiCardV2>

      <KpiCardV2
        label={t(lang, "dashboardV2.kpi.newBookings")}
        value={String(bookingsThisWeek)}
        sublabel={t(lang, "dashboardV2.kpi.thisWeek")}
        delta={bookingsDelta !== 0 ? `${bookingsDelta > 0 ? "+" : ""}${bookingsDelta}` : undefined}
        deltaDir={bookingsDir}
        icon={Calendar}
      >
        <MiniBars data={bookingsWeekly} />
      </KpiCardV2>

      <KpiCardV2
        label={t(lang, "dashboardV2.kpi.openOrders")}
        value={String(openOrdersCount)}
        sublabel={
          overdueCount > 0 ? (
            <span className="dv2-kpi-sublabel--danger">
              {overdueCount} {t(lang, "dashboardV2.kpi.overdue")}
            </span>
          ) : undefined
        }
        icon={Package}
      >
        <Sparkline data={ordersOverTime} />
      </KpiCardV2>

      <KpiCardV2
        label={t(lang, "dashboardV2.kpi.capacity").replace("{{kw}}", String(currentKW))}
        value={`${currentCapacity} %`}
        sublabel={t(lang, "dashboardV2.kpi.slots")}
        icon={Zap}
      >
        <Sparkline data={capacityData} />
      </KpiCardV2>

      <KpiCardV2
        label={t(lang, "dashboardV2.kpi.receivables")}
        value="CHF 0"
        sublabel="—"
        icon={Target}
      >
        <div className="dv2-kpi-empty-chart">{t(lang, "dashboardV2.kpi.noReceivables")}</div>
      </KpiCardV2>
    </div>
  );
}
