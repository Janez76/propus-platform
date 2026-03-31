import type { Order } from "../../api/orders";
import { formatCurrency, formatDateTime } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";

type Props = { orders: Order[] };

export function KpiCards({ orders }: Props) {
  const uiMode = useAuthStore((s) => s.uiMode);
  const lang = useAuthStore((s) => s.language);
  const open = orders.filter((o) => !["done", "archived", "cancelled"].includes((o.status || "").toLowerCase())).length;
  const total = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const month = new Date().getMonth();
  const currentMonthTotal = orders.reduce((sum, o) => {
    const d = o.appointmentDate ? new Date(o.appointmentDate) : null;
    if (!d || Number.isNaN(d.getTime())) return sum;
    return d.getMonth() === month ? sum + (o.total || 0) : sum;
  }, 0);
  const next = [...orders]
    .filter((o) => o.appointmentDate)
    .sort((a, b) => new Date(a.appointmentDate || 0).getTime() - new Date(b.appointmentDate || 0).getTime())[0];

  const cardClass = uiMode === "modern" ? "surface-card p-4" : "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className={cardClass}><div className="text-xs text-zinc-500">{t(lang, "dashboard.kpi.monthlyRevenue")}</div><div className="text-2xl font-bold">{formatCurrency(currentMonthTotal)}</div></div>
      <div className={cardClass}><div className="text-xs text-zinc-500">{t(lang, "dashboard.kpi.totalRevenue")}</div><div className="text-2xl font-bold">{formatCurrency(total)}</div></div>
      <div className={cardClass}><div className="text-xs text-zinc-500">{t(lang, "dashboard.kpi.openOrders")}</div><div className="text-2xl font-bold">{open}</div></div>
      <div className={cardClass}><div className="text-xs text-zinc-500">{t(lang, "dashboard.kpi.nextAppointment")}</div><div className="text-sm font-bold">{next ? formatDateTime(next.appointmentDate) : "-"}</div></div>
    </div>
  );
}

