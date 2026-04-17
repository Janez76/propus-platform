import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import type { Order } from "../../api/orders";
import { getStatusEntry } from "../../lib/status";
import { t, type Lang } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

interface StatusOverviewProps {
  orders: Order[];
}

interface StatusStat {
  key: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

const DONUT_SIZE = 180;
const DONUT_STROKE = 22;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export function StatusOverview({ orders }: StatusOverviewProps) {
  const lang = useAuthStore((s) => s.language);

  const { stats, total } = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of orders) {
      const key = (order.status || "unknown").toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    }
    const tot = orders.length;
    const list: StatusStat[] = Array.from(map.entries())
      .map(([key, count]) => {
        const entry = getStatusEntry(key);
        return {
          key,
          label: entry.label,
          count,
          percentage: tot > 0 ? (count / tot) * 100 : 0,
          color: entry.eventColor,
        };
      })
      .sort((a, b) => b.count - a.count);
    return { stats: list, total: tot };
  }, [orders]);

  if (total === 0) {
    return (
      <div className="surface-card p-4 sm:p-6">
        <Header lang={lang} />
        <p className="py-8 text-center text-sm p-text-muted">
          {t(lang, "statusOverview.empty")}
        </p>
      </div>
    );
  }

  // Donut: top 3 + "others" if any
  const TOP = 3;
  const top = stats.slice(0, TOP);
  const restCount = stats.slice(TOP).reduce((s, x) => s + x.count, 0);
  const segments: StatusStat[] = [...top];
  if (restCount > 0) {
    segments.push({
      key: "__others__",
      label: t(lang, "statusOverview.label.others"),
      count: restCount,
      percentage: (restCount / total) * 100,
      color: "var(--border-strong)",
    });
  }

  // build donut paths
  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const length = (seg.percentage / 100) * DONUT_CIRCUMFERENCE;
    const offset = cumulative;
    cumulative += length;
    return { seg, length, offset };
  });

  return (
    <div className="surface-card p-4 sm:p-6">
      <Header lang={lang} />

      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="relative flex-shrink-0" style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
          <svg
            width={DONUT_SIZE}
            height={DONUT_SIZE}
            viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
            className="-rotate-90"
            aria-hidden="true"
          >
            <circle
              cx={DONUT_SIZE / 2}
              cy={DONUT_SIZE / 2}
              r={DONUT_RADIUS}
              fill="none"
              stroke="var(--border-soft)"
              strokeWidth={DONUT_STROKE}
            />
            {arcs.map(({ seg, length, offset }) => (
              <circle
                key={seg.key}
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={DONUT_RADIUS}
                fill="none"
                stroke={seg.color}
                strokeWidth={DONUT_STROKE}
                strokeDasharray={`${length} ${DONUT_CIRCUMFERENCE - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tabular-nums p-text-main">{total}</span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider p-text-subtle">
              {t(lang, "statusOverview.label.orders")}
            </span>
          </div>
        </div>

        <ul className="flex w-full min-w-0 flex-col gap-1.5">
          {stats.map((stat, idx) => (
            <li
              key={stat.key}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5"
              style={{
                background: idx < TOP ? "var(--surface-raised)" : "transparent",
              }}
            >
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ background: stat.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm p-text-main">{stat.label}</span>
              <span className="text-sm font-bold tabular-nums p-text-main">{stat.count}</span>
              <span className="w-12 text-right text-xs tabular-nums p-text-muted">
                {stat.percentage.toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Header({ lang }: { lang: Lang }) {
  return (
    <div className="mb-5 flex items-center gap-3 sm:mb-6">
      <div className="rounded-lg p-2" style={{ background: "var(--surface-raised)" }}>
        <BarChart3 className="h-5 w-5" style={{ color: "var(--accent)" }} />
      </div>
      <h3 className="section-title">{t(lang, "statusOverview.title")}</h3>
    </div>
  );
}
