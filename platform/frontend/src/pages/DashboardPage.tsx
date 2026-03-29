import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, DollarSign, Plus, ShoppingBag, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { statusMatches } from "../lib/status";
import { KpiCard } from "../components/dashboard/KpiCard";
import { ScheduleList } from "../components/dashboard/ScheduleList";
import { StatusOverview } from "../components/dashboard/StatusOverview";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { useOrders } from "../hooks/useOrders";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";

export function DashboardPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const { orders, loading, error, refresh } = useOrders(token);
  const [scheduleDays, setScheduleDays] = useState(7);
  const [showCreateOrder, setShowCreateOrder] = useState(false);

  const kpiData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const openOrders = orders.filter((o) =>
      !statusMatches(o.status, "done") &&
      !statusMatches(o.status, "archived") &&
      !statusMatches(o.status, "cancelled")
    );

    const currentMonthOrders = orders.filter((o) => {
      const date = o.appointmentDate ? new Date(o.appointmentDate) : null;
      return date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    const lastMonthOrders = orders.filter((o) => {
      const date = o.appointmentDate ? new Date(o.appointmentDate) : null;
      return date && date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
    });

    const currentMonthRevenue = currentMonthOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const lastMonthRevenue = lastMonthOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);

    const revenueTrend = lastMonthRevenue > 0 
      ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : 0;

      const openTrend = lastMonthOrders.length > 0
      ? ((openOrders.length - lastMonthOrders.filter(o =>
          !statusMatches(o.status, "done") &&
          !statusMatches(o.status, "archived") &&
          !statusMatches(o.status, "cancelled")
        ).length) / lastMonthOrders.length) * 100
      : 0;

    const nextAppointment = [...orders]
      .filter((o) => o.appointmentDate && new Date(o.appointmentDate) >= now)
      .sort((a, b) => new Date(a.appointmentDate || 0).getTime() - new Date(b.appointmentDate || 0).getTime())[0];

    const monthlyRevenueSeries = Array.from({ length: 6 }).map((_, offset) => {
      const date = new Date(currentYear, currentMonth - (5 - offset), 1);
      const month = date.getMonth();
      const year = date.getFullYear();
      return orders
        .filter((o) => {
          const orderDate = o.appointmentDate ? new Date(o.appointmentDate) : null;
          return orderDate && orderDate.getMonth() === month && orderDate.getFullYear() === year;
        })
        .reduce((sum, o) => sum + (o.total || 0), 0);
    });

    return {
      monthlyRevenue: currentMonthRevenue,
      totalRevenue,
      openOrders: openOrders.length,
      nextAppointment,
      revenueTrend,
      openTrend,
      monthlyRevenueSeries,
    };
  }, [orders]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="surface-card-strong p-6 lg:p-7">
          <div className="space-y-3">
            <div className="skeleton-line h-3 w-28" />
            <div className="skeleton-line h-8 w-2/3 max-w-lg" />
            <div className="skeleton-line h-4 w-1/2 max-w-sm" />
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="surface-card p-6">
              <div className="skeleton-line mb-4 h-3 w-24" />
              <div className="skeleton-line h-8 w-32" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="surface-card p-6">
            <div className="skeleton-line mb-4 h-3 w-28" />
            <div className="space-y-2">
              <div className="skeleton-line h-12 w-full" />
              <div className="skeleton-line h-12 w-full" />
              <div className="skeleton-line h-12 w-full" />
            </div>
          </div>
          <div className="surface-card p-6">
            <div className="skeleton-line mb-4 h-3 w-32" />
            <div className="space-y-3">
              <div className="skeleton-line h-4 w-full" />
              <div className="skeleton-line h-4 w-11/12" />
              <div className="skeleton-line h-4 w-10/12" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface-card p-6 text-center">
        <p className="font-medium text-red-700 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-secondary mt-4"
        >
          {t(lang, "dashboard.button.reload")}
        </button>
      </div>
    );
  }

  const nextDate = kpiData.nextAppointment?.appointmentDate
    ? new Date(kpiData.nextAppointment.appointmentDate).toLocaleDateString("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "-";

  const todayLabel = new Date().toLocaleDateString("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="surface-card-strong p-4 sm:p-6 lg:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] p-text-accent">{t(lang, "dashboard.title")}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight p-text-main sm:text-3xl">
              {t(lang, "dashboard.subtitle")}
            </h1>
            <p className="mt-2 text-sm p-text-muted">
              {todayLabel} · {error ? t(lang, "dashboard.status.checkHints") : t(lang, "dashboard.status.online")}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Link to="/orders" className="btn-primary w-full justify-center sm:w-auto">
              <Plus className="h-4 w-4" />
              {t(lang, "dashboard.button.newOrder")}
            </Link>
            <Link to="/calendar" className="btn-secondary w-full justify-center sm:w-auto">
              <CalendarIcon className="h-4 w-4" />
              {t(lang, "dashboard.button.openCalendar")}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={t(lang, "dashboard.kpi.monthlyRevenue")}
          value={kpiData.monthlyRevenue}
          format="currency"
          emphasis="primary"
          trend={{
            value: Math.round(Math.abs(kpiData.revenueTrend)),
            direction: kpiData.revenueTrend > 0 ? "up" : kpiData.revenueTrend < 0 ? "down" : "neutral",
          }}
          sparkline={kpiData.monthlyRevenueSeries}
          icon={<DollarSign className="h-5 w-5 p-text-accent" />}
        />
        <KpiCard
          title={t(lang, "dashboard.kpi.totalRevenue")}
          value={kpiData.totalRevenue}
          format="currency"
          sparkline={kpiData.monthlyRevenueSeries}
          icon={<TrendingUp className="h-5 w-5 p-text-accent" />}
        />
        <KpiCard
          title={t(lang, "dashboard.kpi.openOrders")}
          value={kpiData.openOrders}
          trend={{
            value: Math.round(Math.abs(kpiData.openTrend)),
            direction: kpiData.openTrend > 0 ? "up" : kpiData.openTrend < 0 ? "down" : "neutral",
          }}
          icon={<ShoppingBag className="h-5 w-5 p-text-accent" />}
        />
        <KpiCard
          title={t(lang, "dashboard.kpi.nextAppointment")}
          value={nextDate}
          format="text"
          icon={<CalendarIcon className="h-5 w-5 p-text-accent" />}
        />
      </div>

      <div className="surface-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="text-sm font-semibold p-text-muted">
            {t(lang, "dashboard.label.showAppointments")}
          </label>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                onClick={() => setScheduleDays(days)}
                className={`min-w-[88px] rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  scheduleDays === days ? "btn-primary" : "btn-secondary"
                }`}
              >
                {t(lang, "dashboard.label.days").replace("{{n}}", String(days))}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ScheduleList orders={orders} days={scheduleDays} onCreateOrder={() => setShowCreateOrder(true)} />
        <StatusOverview orders={orders} />
      </div>

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
