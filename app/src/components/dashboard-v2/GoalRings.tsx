import { useMemo } from "react";
import type { Order } from "../../api/orders";
import { formatCHF } from "../../lib/format";
import { statusMatches } from "../../lib/status";
import type { DashboardMetrics } from "./useDashboardMetrics";

interface GoalRingsProps {
  metrics: DashboardMetrics;
  orders: Order[];
}

interface GoalDef {
  id: string;
  title: string;
  current: number;
  target: number;
  format: (v: number) => string;
  hint?: string;
  /** Optional override of ring color; default = brand gold */
  tone?: "gold" | "blue" | "purple" | "green";
}

function quarterStart(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}

function quarterEnd(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q + 3, 1);
}

function quarterLabel(d: Date): string {
  return `Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function Ring({ goal }: { goal: GoalDef }) {
  const pct = Math.max(0, Math.min(100, (goal.current / goal.target) * 100));
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const toneVar =
    goal.tone === "blue"
      ? "var(--d-cat-blue, var(--propus-cat-blue, #4a7aa8))"
      : goal.tone === "purple"
        ? "var(--d-cat-purple, var(--propus-cat-purple, #8a5fb8))"
        : goal.tone === "green"
          ? "var(--d-success, var(--propus-good, #2A7A2A))"
          : "var(--d-gold)";
  return (
    <div className="dv2-goal-ring">
      <svg viewBox="0 0 88 88" aria-hidden role="img" className="dv2-goal-ring-svg">
        <circle cx="44" cy="44" r={r} fill="transparent" stroke="var(--d-border)" strokeWidth="6" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="transparent"
          stroke={toneVar}
          strokeWidth="6"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c / 4}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
        />
      </svg>
      <div className="dv2-goal-ring-pct">
        <strong>{Math.round(pct)}%</strong>
      </div>
      <div className="dv2-goal-ring-meta">
        <div className="dv2-goal-ring-title">{goal.title}</div>
        <div className="dv2-goal-ring-vals">
          <span className="dv2-goal-ring-current">{goal.format(goal.current)}</span>
          <span className="dv2-goal-ring-sep">/</span>
          <span className="dv2-goal-ring-target">{goal.format(goal.target)}</span>
        </div>
        {goal.hint ? <div className="dv2-goal-ring-hint">{goal.hint}</div> : null}
      </div>
    </div>
  );
}

export function GoalRings({ metrics, orders }: GoalRingsProps) {
  const today = metrics.today;

  const goals = useMemo<GoalDef[]>(() => {
    const monthName = today.toLocaleString("de-CH", { month: "long" });
    const qLabel = quarterLabel(today);
    const qStart = quarterStart(today).getTime();
    const qEnd = quarterEnd(today).getTime();
    const quarterOrders = orders.filter((o) => {
      if (statusMatches(o.status, "cancelled") || statusMatches(o.status, "archived")) return false;
      if (!o.appointmentDate) return false;
      const ts = new Date(o.appointmentDate).getTime();
      return ts >= qStart && ts < qEnd;
    });
    const quarterDoneOrders = quarterOrders.filter(
      (o) => statusMatches(o.status, "done") || statusMatches(o.status, "completed"),
    );
    const onTimeRate =
      quarterDoneOrders.length > 0
        ? Math.round(
            (quarterDoneOrders.filter(
              (o) => o.doneAt && o.appointmentDate && new Date(o.doneAt) <= new Date(o.appointmentDate),
            ).length /
              quarterDoneOrders.length) *
              100,
          )
        : 0;

    return [
      {
        id: "month-revenue",
        title: `Umsatz ${monthName}`,
        current: metrics.monthRevenue,
        target: 12_000,
        format: (v) => formatCHF(v),
        hint: "Ziel CHF 12'000",
        tone: "gold",
      },
      {
        id: "quarter-orders",
        title: `${qLabel} Aufträge`,
        current: quarterOrders.length,
        target: 80,
        format: (v) => String(Math.round(v)),
        hint: `${quarterOrders.length} / 80`,
        tone: "blue",
      },
      {
        id: "capacity",
        title: `KW ${metrics.currentKW} Auslastung`,
        current: metrics.currentCapacity,
        target: 80,
        format: (v) => `${Math.round(v)}%`,
        hint: "Ziel ≥ 80%",
        tone: "purple",
      },
      {
        id: "on-time",
        title: `Pünktlichkeit ${qLabel}`,
        current: onTimeRate,
        target: 90,
        format: (v) => `${Math.round(v)}%`,
        hint: "Ziel ≥ 90%",
        tone: "green",
      },
    ];
  }, [orders, metrics, today]);

  return (
    <section className="dv2-goal-rings">
      <header className="dv2-goal-rings-head">
        <span className="dv2-goal-rings-eyebrow">Ziele · Stand heute</span>
      </header>
      <div className="dv2-goal-rings-grid">
        {goals.map((g) => (
          <Ring key={g.id} goal={g} />
        ))}
      </div>
    </section>
  );
}
