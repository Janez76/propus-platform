import type { ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarPlus,
  ClipboardList,
  Clock,
  FileText,
  GripVertical,
  Timer,
  TriangleAlert,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import type { DashTileId } from "./dashboardState";

interface TrendInfo {
  direction: "up" | "down" | "neutral";
  text: string;
  hint?: string;
}

interface KpiTileProps {
  id: DashTileId;
  labelKey: string;
  icon: LucideIcon;
  value: string;
  unit?: string;
  trend?: TrendInfo;
}

function KpiTile({ id, labelKey, icon: Icon, value, unit, trend }: KpiTileProps) {
  const lang = useAuthStore((s) => s.language);
  let trendNode: ReactNode = null;
  if (trend) {
    const cls =
      trend.direction === "up"
        ? "trend"
        : trend.direction === "down"
          ? "trend down"
          : "trend n";
    const TrendIcon =
      trend.direction === "up"
        ? ArrowUpRight
        : trend.direction === "down"
          ? trend.text.includes("%") || trend.text.startsWith("+") || trend.text.startsWith("-")
            ? ArrowDownRight
            : TriangleAlert
          : Clock;
    trendNode = (
      <div className={cls}>
        <TrendIcon />
        {trend.text}
        {trend.hint ? <em>{trend.hint}</em> : null}
      </div>
    );
  }

  return (
    <div className="pds-kpi" data-tile={id}>
      <button className="drag-handle" type="button" aria-label={t(lang, "dashboard.tweaks.drag")}>
        <GripVertical />
      </button>
      <div className="r">
        <span className="label">{t(lang, labelKey)}</span>
        <span className="ic"><Icon /></span>
      </div>
      <div className="value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      {trendNode}
    </div>
  );
}

interface KpiStripProps {
  revenue30d: number;
  revenueTrendPct: number;
  newBookingsWeek: number;
  newBookingsDiff: number;
  openOrders: number;
  overdueOrders: number;
  deliveriesToday: number;
  nextDeliveryTime: string | null;
  receivables: number;
  overdueInvoices: number;
  visibleIds: DashTileId[];
}

function formatChf(n: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0,
  }).format(n);
}

export function KpiStrip({
  revenue30d,
  revenueTrendPct,
  newBookingsWeek,
  newBookingsDiff,
  openOrders,
  overdueOrders,
  deliveriesToday,
  nextDeliveryTime,
  receivables,
  overdueInvoices,
  visibleIds,
}: KpiStripProps) {
  const lang = useAuthStore((s) => s.language);

  const revenueDir: TrendInfo["direction"] =
    revenueTrendPct > 0 ? "up" : revenueTrendPct < 0 ? "down" : "neutral";
  const bookingsDir: TrendInfo["direction"] =
    newBookingsDiff > 0 ? "up" : newBookingsDiff < 0 ? "down" : "neutral";

  const tiles: Record<Exclude<DashTileId, "greeting" | "productivity" | "timeline" | "tasks" | "pipeline" | "funnel" | "heatmap" | "activity">, KpiTileProps> = {
    "kpi-revenue": {
      id: "kpi-revenue",
      labelKey: "dashboard.kpi.revenue30d",
      icon: TrendingUp,
      value: formatChf(revenue30d),
      trend: {
        direction: revenueDir,
        text: `${revenueTrendPct > 0 ? "+" : ""}${revenueTrendPct.toFixed(1)} %`,
        hint: t(lang, "dashboard.kpi.vsPrevMonth"),
      },
    },
    "kpi-bookings": {
      id: "kpi-bookings",
      labelKey: "dashboard.kpi.newBookings",
      icon: CalendarPlus,
      value: String(newBookingsWeek),
      unit: t(lang, "dashboard.kpi.thisWeek"),
      trend: {
        direction: bookingsDir,
        text: `${newBookingsDiff > 0 ? "+" : ""}${newBookingsDiff}`,
        hint: t(lang, "dashboard.kpi.vsPrevWeek"),
      },
    },
    "kpi-open": {
      id: "kpi-open",
      labelKey: "dashboard.kpi.openOrders",
      icon: ClipboardList,
      value: String(openOrders),
      trend:
        overdueOrders > 0
          ? {
              direction: "down",
              text: t(lang, "dashboard.kpi.overdueCount").replace("{{n}}", String(overdueOrders)),
            }
          : undefined,
    },
    "kpi-due": {
      id: "kpi-due",
      labelKey: "dashboard.kpi.dueToday",
      icon: Timer,
      value: String(deliveriesToday),
      unit: t(lang, "dashboard.kpi.deliveries"),
      trend: nextDeliveryTime
        ? {
            direction: "neutral",
            text: t(lang, "dashboard.kpi.next").replace("{{time}}", nextDeliveryTime),
          }
        : undefined,
    },
    "kpi-receivables": {
      id: "kpi-receivables",
      labelKey: "dashboard.kpi.receivables",
      icon: FileText,
      value: formatChf(receivables),
      trend:
        overdueInvoices > 0
          ? {
              direction: "down",
              text: t(lang, "dashboard.kpi.overdueInvoices").replace("{{n}}", String(overdueInvoices)),
            }
          : undefined,
    },
  };

  return (
    <>
      {visibleIds.map((id) => {
        const props = tiles[id as keyof typeof tiles];
        if (!props) return null;
        return <KpiTile key={id} {...props} />;
      })}
    </>
  );
}
