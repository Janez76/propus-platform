import { useMemo } from "react";
import type { Order } from "../../api/orders";
import { statusMatches } from "../../lib/status";

const MS_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = r.getDay();
  r.setDate(r.getDate() - ((day + 6) % 7)); // Monday start
  return r;
}

function getISOWeek(d: Date): number {
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const jan4 = new Date(tmp.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((tmp.getTime() - jan4.getTime()) / MS_DAY - 3 + ((jan4.getDay() + 6) % 7)) / 7,
    )
  );
}

function isOpen(o: Order): boolean {
  return (
    !statusMatches(o.status, "done") &&
    !statusMatches(o.status, "archived") &&
    !statusMatches(o.status, "cancelled")
  );
}

function inWindow(dateStr: string | null | undefined, from: number, to: number): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return t >= from && t < to;
}

/** Pausiert = Termin/Slot faktisch inaktiv — nicht in „heute“/Kapazitaet/Heatmap wie laufende Shootings. */
function countsForScheduleDay(o: Order): boolean {
  return !statusMatches(o.status, "paused");
}

export type DashboardMetrics = ReturnType<typeof useDashboardMetrics>;

export function useDashboardMetrics(orders: Order[], now: Date) {
  const nowMs = now.getTime();
  return useMemo(() => {
    const todayMs = startOfDay(now).getTime();
    const window30 = todayMs - 30 * MS_DAY;
    const window60 = todayMs - 60 * MS_DAY;

    // Overdue orders
    const overdueOrders = orders
      .filter(
        (o) => isOpen(o) && o.appointmentDate && new Date(o.appointmentDate).getTime() < todayMs,
      )
      .sort((a, b) => new Date(a.appointmentDate!).getTime() - new Date(b.appointmentDate!).getTime());

    // Revenue 30d — daily series
    const revenue30d: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = todayMs - i * MS_DAY;
      const dayEnd = dayStart + MS_DAY;
      const v = orders
        .filter((o) => !statusMatches(o.status, "cancelled") && inWindow(o.appointmentDate, dayStart, dayEnd))
        .reduce((s, o) => s + (o.total ?? 0), 0);
      revenue30d.push(v);
    }
    const totalRevenue30d = revenue30d.reduce((s, v) => s + v, 0);
    const totalRevenuePrev30d = orders
      .filter((o) => !statusMatches(o.status, "cancelled") && inWindow(o.appointmentDate, window60, window30))
      .reduce((s, o) => s + (o.total ?? 0), 0);
    let revenueDeltaPct: number | null = null;
    let revenueIsNew = false;
    if (totalRevenuePrev30d > 0) {
      revenueDeltaPct = ((totalRevenue30d - totalRevenuePrev30d) / totalRevenuePrev30d) * 100;
    } else if (totalRevenue30d > 0) {
      revenueIsNew = true;
    }

    // Bookings weekly — 8 weeks
    const bookingsWeekly: number[] = [];
    for (let i = 7; i >= 0; i--) {
      const wStart = todayMs - (i + 1) * 7 * MS_DAY;
      const wEnd = todayMs - i * 7 * MS_DAY;
      bookingsWeekly.push(orders.filter((o) => inWindow(o.provisionalBookedAt, wStart, wEnd)).length);
    }
    const bookingsThisWeek = bookingsWeekly[bookingsWeekly.length - 1];
    const bookingsPrevWeek = bookingsWeekly[bookingsWeekly.length - 2] ?? 0;
    const bookingsDelta = bookingsThisWeek - bookingsPrevWeek;

    // Open orders trend over 8 weeks
    const ordersOverTime: number[] = [];
    for (let i = 7; i >= 0; i--) {
      const atMs = todayMs - i * 7 * MS_DAY;
      ordersOverTime.push(
        orders.filter(
          (o) => o.appointmentDate && new Date(o.appointmentDate).getTime() < atMs && isOpen(o),
        ).length,
      );
    }

    // Capacity last 10 weeks — shootings * 90min / (5days * 540min)
    const capacityData: number[] = [];
    for (let i = 9; i >= 0; i--) {
      const wStart = todayMs - (i + 1) * 7 * MS_DAY;
      const wEnd = todayMs - i * 7 * MS_DAY;
      const shootings = orders.filter(
        (o) => countsForScheduleDay(o) && inWindow(o.appointmentDate, wStart, wEnd),
      ).length;
      const capRatio = (shootings * 90) / 2700;
      capacityData.push(Math.min(100, Math.round(capRatio * 100)));
    }
    const currentKW = getISOWeek(now);
    const currentCapacity = capacityData[capacityData.length - 1];

    // Pipeline buckets
    const isAngefragt = (o: Order) => statusMatches(o.status, "pending");
    const isGeplant = (o: Order) =>
      (statusMatches(o.status, "provisional") || statusMatches(o.status, "confirmed")) &&
      !!o.appointmentDate &&
      new Date(o.appointmentDate).getTime() >= todayMs;
    const isInProgress = (o: Order) =>
      (statusMatches(o.status, "provisional") || statusMatches(o.status, "confirmed")) &&
      !!o.appointmentDate &&
      new Date(o.appointmentDate).getTime() < todayMs;
    const isGeliefert = (o: Order) =>
      statusMatches(o.status, "done") || statusMatches(o.status, "completed");

    const byAppt = (a: Order, b: Order) =>
      new Date(a.appointmentDate ?? 0).getTime() - new Date(b.appointmentDate ?? 0).getTime();
    const byDoneDesc = (a: Order, b: Order) =>
      (b.doneAt ? new Date(b.doneAt).getTime() : 0) -
      (a.doneAt ? new Date(a.doneAt).getTime() : 0);

    const pipelineAngefragt = orders.filter(isAngefragt).sort(byAppt).slice(0, 4);
    const pipelineGeplant = orders.filter(isGeplant).sort(byAppt).slice(0, 4);
    const pipelineInProgress = orders.filter(isInProgress).sort(byAppt).slice(0, 4);
    const pipelineGeliefert = orders.filter(isGeliefert).sort(byDoneDesc).slice(0, 4);
    const pipelineCounts = {
      angefragt: orders.filter(isAngefragt).length,
      geplant: orders.filter(isGeplant).length,
      inProgress: orders.filter(isInProgress).length,
      geliefert: orders.filter(isGeliefert).length,
    };

    // Today + upcoming
    const todayOrders = orders
      .filter(
        (o) => countsForScheduleDay(o) && inWindow(o.appointmentDate, todayMs, todayMs + MS_DAY),
      )
      .sort(byAppt);
    const upcomingOrders = orders
      .filter(
        (o) =>
          countsForScheduleDay(o) &&
          o.appointmentDate &&
          new Date(o.appointmentDate).getTime() >= todayMs + MS_DAY,
      )
      .sort(byAppt)
      .slice(0, 3);

    // Funnel — last 30 days (using provisionalBookedAt as entry point)
    const recentOrders = orders.filter((o) => inWindow(o.provisionalBookedAt, window30, todayMs + MS_DAY));
    const funnelInquiries = recentOrders.length;
    const funnelOffers = recentOrders.filter(
      (o) =>
        statusMatches(o.status, "provisional") ||
        statusMatches(o.status, "confirmed") ||
        statusMatches(o.status, "completed") ||
        statusMatches(o.status, "done"),
    ).length;
    const funnelConfirmed = recentOrders.filter(
      (o) =>
        statusMatches(o.status, "confirmed") ||
        statusMatches(o.status, "completed") ||
        statusMatches(o.status, "done"),
    ).length;
    const funnelCompleted = recentOrders.filter(
      (o) => statusMatches(o.status, "completed") || statusMatches(o.status, "done"),
    ).length;

    // Heatmap — current month
    const currMonth = now.getMonth();
    const currYear = now.getFullYear();
    const daysInMonth = new Date(currYear, currMonth + 1, 0).getDate();
    const firstDayOfWeek = (new Date(currYear, currMonth, 1).getDay() + 6) % 7; // 0=Mon
    const heatmapData: Record<number, number> = {};
    orders.forEach((o) => {
      if (!o.appointmentDate || !countsForScheduleDay(o)) return;
      const d = new Date(o.appointmentDate);
      if (d.getMonth() !== currMonth || d.getFullYear() !== currYear) return;
      const day = d.getDate();
      heatmapData[day] = (heatmapData[day] ?? 0) + 1;
    });
    const maxDayCount = Math.max(1, ...Object.values(heatmapData));

    // Performance
    const doneOrders30d = orders.filter(
      (o) =>
        inWindow(o.appointmentDate, window30, todayMs + MS_DAY) &&
        (statusMatches(o.status, "done") || statusMatches(o.status, "completed")),
    );
    const onTimeCount = doneOrders30d.filter(
      (o) => o.doneAt && o.appointmentDate && new Date(o.doneAt) <= new Date(o.appointmentDate),
    ).length;
    const onTimePct = doneOrders30d.length > 0 ? Math.round((onTimeCount / doneOrders30d.length) * 100) : null;
    const avgOrderValue =
      doneOrders30d.length > 0
        ? doneOrders30d.reduce((s, o) => s + (o.total ?? 0), 0) / doneOrders30d.length
        : null;
    const weekStartMs = startOfWeek(now).getTime();
    const weekOrders = orders.filter(
      (o) => countsForScheduleDay(o) && inWindow(o.appointmentDate, weekStartMs, weekStartMs + 7 * MS_DAY),
    );
    const weekDone = weekOrders.filter(
      (o) => statusMatches(o.status, "done") || statusMatches(o.status, "completed"),
    ).length;

    // Phase A — KPIs in header
    const prevWeekStartMs = weekStartMs - 7 * MS_DAY;
    const weekPrevOrders = orders.filter(
      (o) => countsForScheduleDay(o) && inWindow(o.appointmentDate, prevWeekStartMs, weekStartMs),
    );
    const weekDeltaPct =
      weekPrevOrders.length > 0
        ? Math.round(((weekOrders.length - weekPrevOrders.length) / weekPrevOrders.length) * 100)
        : null;

    const monthStartMs = new Date(currYear, currMonth, 1).getTime();
    const monthEndMs = new Date(currYear, currMonth + 1, 1).getTime();
    const monthRevenue = orders
      .filter((o) => !statusMatches(o.status, "cancelled") && inWindow(o.appointmentDate, monthStartMs, monthEndMs))
      .reduce((s, o) => s + (o.total ?? 0), 0);

    const hasStaff = (o: Order) =>
      Boolean(o.photographer?.key || o.photographer?.name);
    const todayWithoutStaff = todayOrders.filter((o) => !hasStaff(o)).length;
    const withoutStaffCount = orders.filter((o) => isOpen(o) && !hasStaff(o)).length;
    const invoicesToCreate = orders.filter(
      (o) =>
        (statusMatches(o.status, "done") || statusMatches(o.status, "completed")) &&
        !o.exxasOrderNumber,
    ).length;

    return {
      overdueOrders,
      revenue30d,
      totalRevenue30d,
      revenueDeltaPct,
      revenueIsNew,
      bookingsWeekly,
      bookingsThisWeek,
      bookingsDelta,
      ordersOverTime,
      capacityData,
      currentKW,
      currentCapacity,
      openOrdersCount: orders.filter(isOpen).length,
      overdueCount: overdueOrders.length,
      pipelineAngefragt,
      pipelineGeplant,
      pipelineInProgress,
      pipelineGeliefert,
      pipelineCounts,
      todayOrders,
      upcomingOrders,
      funnelInquiries,
      funnelOffers,
      funnelConfirmed,
      funnelCompleted,
      heatmapData,
      maxDayCount,
      daysInMonth,
      firstDayOfWeek,
      currMonth,
      currYear,
      onTimePct,
      avgOrderValue,
      weekDone,
      weekTotal: weekOrders.length,
      weekPrevTotal: weekPrevOrders.length,
      weekDeltaPct,
      monthRevenue,
      todayWithoutStaff,
      withoutStaffCount,
      invoicesToCreate,
      today: now,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-memoize when wallclock changes
  }, [orders, nowMs]);
}
