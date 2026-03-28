import type { Order } from "../../api/orders";
import { useState } from "react";
import { formatDateTime } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";

type Props = { orders: Order[] };

export function UpcomingList({ orders }: Props) {
  const uiMode = useAuthStore((s) => s.uiMode);
  const lang = useAuthStore((s) => s.language);
  const [now] = useState(() => Date.now());
  const in7 = now + 7 * 24 * 60 * 60 * 1000;
  const list = orders
    .filter((o) => o.appointmentDate)
    .filter((o) => {
      const t = new Date(o.appointmentDate || 0).getTime();
      return t >= now && t <= in7;
    })
    .sort((a, b) => new Date(a.appointmentDate || 0).getTime() - new Date(b.appointmentDate || 0).getTime())
    .slice(0, 8);

  return (
    <div className={uiMode === "modern" ? "surface-card p-4" : "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"}>
      <h3 className="mb-3 text-sm font-bold">{t(lang, "upcoming.title")}</h3>
      <div className="space-y-2">
        {list.map((o) => (
          <div key={o.orderNo} className="rounded border border-zinc-100 p-2 text-sm">
            <div className="font-semibold">#{o.orderNo} {o.customerName || ""}</div>
            <div className="text-xs text-zinc-600">{formatDateTime(o.appointmentDate)}</div>
          </div>
        ))}
        {!list.length ? <p className="text-sm text-zinc-500">{t(lang, "upcoming.empty")}</p> : null}
      </div>
    </div>
  );
}
