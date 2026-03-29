import type { Order } from "../../api/orders";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";
import { getStatusLabel, getStatusBarColor, normalizeStatusKey } from "../../lib/status";
import { cn } from "../../lib/utils";

type Props = { orders: Order[] };

export function StatusBars({ orders }: Props) {
  const uiMode = useAuthStore((s) => s.uiMode);
  const lang = useAuthStore((s) => s.language);

  const countMap = new Map<string, number>();
  for (const o of orders) {
    const key = normalizeStatusKey(o.status) ?? (o.status || "unknown");
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  const stats = Array.from(countMap.entries()).map(([key, count]) => ({ key, count }));
  const max = Math.max(1, ...stats.map((s) => s.count));

  return (
    <div className={uiMode === "modern" ? "surface-card p-4" : "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"}>
      <h3 className="mb-3 text-sm font-bold">{t(lang, "statusBars.title")}</h3>
      <div className="space-y-2">
        {stats.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="w-28 truncate text-xs text-zinc-600">{getStatusLabel(s.key)}</div>
            <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
              <div
                className={cn("h-full", getStatusBarColor(s.key))}
                style={{ width: `${(s.count / max) * 100}%` }}
              />
            </div>
            <div className="w-8 text-right text-xs font-semibold">{s.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
