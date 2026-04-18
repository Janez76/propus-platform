import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { statusMatches } from "../lib/status";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { useOrders } from "../hooks/useOrders";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { HeroGreeting } from "../components/dashboard/HeroGreeting";
import { ProductivityRing } from "../components/dashboard/ProductivityRing";
import { KpiStrip } from "../components/dashboard/KpiStrip";
import { TodayTimeline } from "../components/dashboard/TodayTimeline";
import { OpenTasks } from "../components/dashboard/OpenTasks";
import { PipelineBoard } from "../components/dashboard/PipelineBoard";
import { BookingFunnel } from "../components/dashboard/BookingFunnel";
import { CalendarHeatmap } from "../components/dashboard/CalendarHeatmap";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { TweaksPanel } from "../components/dashboard/TweaksPanel";
import {
  DENSITY_GAPS,
  DENSITY_PADDING,
  useDashState,
  type DashRowId,
  type DashTileId,
} from "../components/dashboard/dashboardState";
import "../components/dashboard/dashboard.css";

function isoWeek(date: Date): number {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function DashboardPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const { orders, loading, error, refresh } = useOrders(token);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [state, setState] = useDashState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (state.editMode) setState({ ...state, editMode: false });
        else if (tweaksOpen) setTweaksOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, setState, tweaksOpen]);

  const metrics = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endToday = startToday + 86400000;
    const thirtyDaysAgo = startToday - 30 * 86400000;
    const sixtyDaysAgo = startToday - 60 * 86400000;
    const startOfWeek = (() => {
      const d = new Date(now);
      const diff = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();
    const startOfPrevWeek = startOfWeek - 7 * 86400000;

    const open = orders.filter(
      (o) =>
        !statusMatches(o.status, "done") &&
        !statusMatches(o.status, "archived") &&
        !statusMatches(o.status, "cancelled"),
    );

    const overdue = open.filter((o) => {
      if (!o.appointmentDate) return false;
      return new Date(o.appointmentDate).getTime() < startToday;
    });

    const todays = orders.filter((o) => {
      if (!o.appointmentDate) return false;
      const ts = new Date(o.appointmentDate).getTime();
      return ts >= startToday && ts < endToday;
    });

    const revenueWindow = (from: number, to: number) =>
      orders
        .filter((o) => {
          const ts = o.appointmentDate ? new Date(o.appointmentDate).getTime() : 0;
          return ts >= from && ts < to;
        })
        .reduce((sum, o) => sum + (o.total || 0), 0);

    const revenue30 = revenueWindow(thirtyDaysAgo, startToday + 86400000);
    const revenuePrev30 = revenueWindow(sixtyDaysAgo, thirtyDaysAgo);
    const revenueTrend =
      revenuePrev30 > 0 ? ((revenue30 - revenuePrev30) / revenuePrev30) * 100 : revenue30 > 0 ? 100 : 0;

    const bookingsThisWeek = orders.filter((o) => {
      const ts = o.appointmentDate ? new Date(o.appointmentDate).getTime() : 0;
      return ts >= startOfWeek && ts < startOfWeek + 7 * 86400000;
    }).length;
    const bookingsPrevWeek = orders.filter((o) => {
      const ts = o.appointmentDate ? new Date(o.appointmentDate).getTime() : 0;
      return ts >= startOfPrevWeek && ts < startOfWeek;
    }).length;

    const revenueToday = todays.reduce((sum, o) => sum + (o.total || 0), 0);

    const upcomingTodayAfterNow = todays
      .filter((o) => new Date(o.appointmentDate || 0).getTime() > now.getTime())
      .sort((a, b) => new Date(a.appointmentDate || 0).getTime() - new Date(b.appointmentDate || 0).getTime());
    const nextDeliveryTime = upcomingTodayAfterNow[0]?.appointmentDate
      ? new Date(upcomingTodayAfterNow[0].appointmentDate).toLocaleTimeString("de-CH", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

    const funnelInquiries = orders.length;
    const funnelOffers = orders.filter(
      (o) =>
        !statusMatches(o.status, "cancelled") &&
        !statusMatches(o.status, "archived"),
    ).length;
    const funnelConfirmed = orders.filter(
      (o) =>
        statusMatches(o.status, "confirmed") ||
        statusMatches(o.status, "completed") ||
        statusMatches(o.status, "done"),
    ).length;
    const funnelCompleted = orders.filter(
      (o) => statusMatches(o.status, "done") || statusMatches(o.status, "completed"),
    ).length;

    return {
      open,
      overdue,
      todays,
      revenue30,
      revenueTrend,
      bookingsThisWeek,
      bookingsDiff: bookingsThisWeek - bookingsPrevWeek,
      revenueToday,
      nextDeliveryTime,
      funnel: {
        inquiries: funnelInquiries,
        offers: funnelOffers,
        confirmed: funnelConfirmed,
        completed: funnelCompleted,
      },
    };
  }, [orders]);

  const rootClass = `pds-dashboard${state.editMode ? " edit-mode" : ""}`;
  const rootStyle = {
    "--gap": DENSITY_GAPS[state.density],
  } as CSSProperties;

  if (loading) {
    return (
      <div className={rootClass} style={rootStyle}>
        <div className="space-y-6">
          <div className="surface-card-strong p-6 lg:p-7">
            <div className="space-y-3">
              <div className="skeleton-line h-3 w-28" />
              <div className="skeleton-line h-8 w-2/3 max-w-lg" />
              <div className="skeleton-line h-4 w-1/2 max-w-sm" />
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="surface-card p-6">
                <div className="skeleton-line mb-4 h-3 w-24" />
                <div className="skeleton-line h-8 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={rootClass} style={rootStyle}>
        <div className="surface-card p-6 text-center">
          <p className="font-medium text-red-700 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="btn-secondary mt-4"
          >
            {t(lang, "dashboard.button.reload")}
          </button>
        </div>
      </div>
    );
  }

  const rowVisible = (rowId: DashRowId): boolean => {
    const tiles = state.tileOrder[rowId] ?? [];
    return tiles.some((id) => !state.hidden.includes(id));
  };

  const tileHidden = (id: DashTileId) => state.hidden.includes(id);

  const panelPad = DENSITY_PADDING[state.density];
  const panelStyle = { padding: panelPad } as CSSProperties;

  const weekLabel = `KW ${isoWeek(new Date())}`;
  const totalBookedMinutes = metrics.todays.length * 90;
  const workdayMinutes = 9 * 60;
  const slotFillPct = Math.min(100, Math.round((totalBookedMinutes / workdayMinutes) * 100));

  const productivityScore = 0;
  const tasksDone = 0;
  const tasksTotal = 0;
  const avgResponse = "—";
  const onTimePct = 0;
  const receivables = 0;
  const overdueInvoices = 0;

  const tiles: Record<DashTileId, () => ReactElement> = {
    greeting: () => (
      <HeroGreeting
        shootingsToday={metrics.todays.length}
        deliveriesToday={metrics.todays.length}
        openInquiries={metrics.open.length}
        revenueToday={metrics.revenueToday}
      />
    ),
    productivity: () => (
      <ProductivityRing
        score={productivityScore}
        tasksDone={tasksDone}
        tasksTotal={tasksTotal}
        avgResponse={avgResponse}
        onTimePct={onTimePct}
        slotFillPct={slotFillPct}
        weekLabel={weekLabel}
      />
    ),
    "kpi-revenue": () => <></>,
    "kpi-bookings": () => <></>,
    "kpi-open": () => <></>,
    "kpi-due": () => <></>,
    "kpi-receivables": () => <></>,
    timeline: () => <TodayTimeline orders={orders} />,
    tasks: () => <OpenTasks />,
    pipeline: () => <PipelineBoard orders={metrics.open} />,
    funnel: () => (
      <BookingFunnel
        inquiries={metrics.funnel.inquiries}
        offers={metrics.funnel.offers}
        confirmed={metrics.funnel.confirmed}
        completed={metrics.funnel.completed}
      />
    ),
    heatmap: () => <CalendarHeatmap orders={orders} />,
    activity: () => <ActivityFeed />,
  };

  return (
    <div className={rootClass} style={rootStyle}>
      <div className="pds-edit-hint">
        {t(lang, "dashboard.editHint")}
      </div>

      <div className="pds-dash-toolbar">
        <button
          type="button"
          className="pds-tweak-trigger"
          onClick={() => setTweaksOpen((v) => !v)}
          aria-pressed={tweaksOpen}
        >
          <SlidersHorizontal />
          {t(lang, "dashboard.tweaks.button")}
        </button>
        <button
          type="button"
          className="pds-tweak-trigger"
          onClick={() => setShowCreateOrder(true)}
        >
          <Plus />
          {t(lang, "dashboard.button.newOrder")}
        </button>
      </div>

      {state.rowOrder.map((rowId) => {
        if (!rowVisible(rowId)) return null;
        const ordered = (state.tileOrder[rowId] ?? []).filter((id) => !tileHidden(id));

        if (rowId === "r-hero") {
          return (
            <div className="pds-hero" data-row={rowId} key={rowId}>
              {ordered.map((id) => (
                <div key={id} style={id === "productivity" ? panelStyle : undefined}>
                  {tiles[id]()}
                </div>
              ))}
            </div>
          );
        }
        if (rowId === "r-kpi") {
          return (
            <div className="pds-kpis" data-row={rowId} key={rowId}>
              <KpiStrip
                revenue30d={metrics.revenue30}
                revenueTrendPct={metrics.revenueTrend}
                newBookingsWeek={metrics.bookingsThisWeek}
                newBookingsDiff={metrics.bookingsDiff}
                openOrders={metrics.open.length}
                overdueOrders={metrics.overdue.length}
                deliveriesToday={metrics.todays.length}
                nextDeliveryTime={metrics.nextDeliveryTime}
                receivables={receivables}
                overdueInvoices={overdueInvoices}
                visibleIds={ordered}
              />
            </div>
          );
        }
        if (rowId === "r-today") {
          return (
            <div className="pds-grid-main" data-row={rowId} key={rowId}>
              {ordered.map((id) => (
                <div key={id}>{tiles[id]()}</div>
              ))}
            </div>
          );
        }
        if (rowId === "r-pipeline") {
          return (
            <div className="pds-grid-full" data-row={rowId} key={rowId}>
              {ordered.map((id) => (
                <div key={id}>{tiles[id]()}</div>
              ))}
            </div>
          );
        }
        if (rowId === "r-bottom") {
          return (
            <div className="pds-grid-3" data-row={rowId} key={rowId}>
              {ordered.map((id) => (
                <div key={id}>{tiles[id]()}</div>
              ))}
            </div>
          );
        }
        return null;
      })}

      <TweaksPanel
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        state={state}
        onChange={setState}
      />

      <CreateOrderWizard
        token={token}
        open={showCreateOrder}
        onOpenChange={setShowCreateOrder}
        onSuccess={() => {
          setShowCreateOrder(false);
          refresh();
        }}
      />
    </div>
  );
}
