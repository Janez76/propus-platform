import { useState } from "react";
import { AlertTriangle, ArrowUpRight, Circle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Order } from "../../api/orders";
import { t, type Lang } from "../../i18n";

interface AlertBarProps {
  orders: Order[];
  lang: Lang;
}

function daysOverdue(order: Order): number {
  if (!order.appointmentDate) return 0;
  const diff = Date.now() - new Date(order.appointmentDate).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function AlertBar({ orders, lang }: AlertBarProps) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  if (orders.length === 0) {
    return (
      <div className="dv2-alert dv2-alert--ok">
        <span className="dv2-alert-ok-dot" />
        {t(lang, "dashboardV2.alert.emptyOk")}
      </div>
    );
  }

  const visible = showAll ? orders : orders.slice(0, 3);

  return (
    <div className="dv2-alert dv2-alert--danger">
      <div className="dv2-alert-header">
        <div className="dv2-alert-title">
          <AlertTriangle size={15} />
          <strong>
            {t(lang, "dashboardV2.alert.title").replace("{{count}}", String(orders.length))}
          </strong>
          <span className="dv2-alert-sub">{t(lang, "dashboardV2.alert.subtitle")}</span>
        </div>
        <button className="dv2-btn-ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll
            ? t(lang, "dashboardV2.alert.showLess")
            : t(lang, "dashboardV2.alert.showAll").replace("{{count}}", String(orders.length))}
          <ArrowUpRight size={12} />
        </button>
      </div>
      {visible.map((o) => {
        const days = daysOverdue(o);
        return (
          <div
            key={o.orderNo}
            className="dv2-alert-row"
            onClick={() => navigate(`/orders/${o.orderNo}`)}
          >
            <span className="dv2-alert-id">#{o.orderNo}</span>
            <span className="dv2-alert-addr">{o.address ?? "—"}</span>
            <span className="dv2-alert-client">{o.customerName ?? "—"}</span>
            <span className="dv2-alert-overdue">
              <Circle size={6} className="dv2-alert-dot" />
              {t(lang, "dashboardV2.alert.daysOverdue").replace("{{days}}", String(days))}
            </span>
            <ArrowUpRight size={13} className="dv2-alert-chevron" />
          </div>
        );
      })}
    </div>
  );
}
