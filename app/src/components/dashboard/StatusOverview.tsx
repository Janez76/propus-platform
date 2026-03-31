import { BarChart3 } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Order } from "../../api/orders";
import { getStatusLabel, getStatusBarColor } from "../../lib/status";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

interface StatusOverviewProps {
  orders: Order[];
}

interface StatusStat {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export function StatusOverview({ orders }: StatusOverviewProps) {
  const lang = useAuthStore((s) => s.language);
  const statusMap = new Map<string, number>();
  
  orders.forEach((order) => {
    const status = order.status?.toLowerCase() || "unknown";
    statusMap.set(status, (statusMap.get(status) || 0) + 1);
  });

  const totalOrders = orders.length || 1;

  const stats: StatusStat[] = Array.from(statusMap.entries())
    .map(([status, count]) => ({
      label: getStatusLabel(status),
      count,
      percentage: (count / totalOrders) * 100,
      color: getStatusBarColor(status),
    }))
    .sort((a, b) => b.count - a.count);
  const topStats = stats.slice(0, 2);
  const otherStats = stats.slice(2);

  return (
    <div className="surface-card p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3 sm:mb-6">
        <div className="p-2 bg-[var(--surface-raised)] rounded-lg">
          <BarChart3 className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <h3 className="section-title">
          {t(lang, "statusOverview.title")}
        </h3>
      </div>

      {topStats.length > 0 ? (
        <div className="mb-5 grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          {topStats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-[#394157] dark:bg-[#242b3a]/75">
              <div className="mb-2 inline-flex rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-semibold text-[#A3823F] dark:text-[#D8BA74]">
                {t(lang, "statusOverview.topStatus")}
              </div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800 text-[var(--text-main)]">{stat.label}</span>
                <span className="text-sm font-bold text-[var(--text-main)]">{stat.count}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#1a1f2b]">
                <div className={cn("h-full rounded-full transition-all duration-500", stat.color)} style={{ width: `${stat.percentage}%` }} />
              </div>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">{stat.percentage.toFixed(1)}% {t(lang, "statusOverview.ofAllOrders")}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2.5 sm:space-y-3">
        {otherStats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-slate-100 p-2 border-[var(--border-soft)] sm:p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--text-muted)]">
                {stat.label}
              </span>
              <span className="text-sm font-bold text-[var(--text-main)]">
                {stat.count} ({stat.percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full bg-[var(--surface-raised)] rounded-full h-2.5 overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-500 rounded-full",
                  stat.color
                )}
                style={{ width: `${stat.percentage}%` }}
              />
            </div>
          </div>
        ))}

        {stats.length === 0 && (
          <p className="text-sm text-[var(--text-subtle)] text-center py-4">
            {t(lang, "statusOverview.empty")}
          </p>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-[var(--border-soft)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            {t(lang, "statusOverview.total")}
          </span>
          <span className="text-lg font-bold text-[var(--accent)]">
            {totalOrders}
          </span>
        </div>
      </div>
    </div>
  );
}

