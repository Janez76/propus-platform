import { ArrowUpRight, GripVertical } from "lucide-react";
import { Link } from "react-router-dom";
import { t, type Lang } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import type { Order } from "../../api/orders";
import { normalizeStatusKey } from "../../lib/status";

interface PipelineBoardProps {
  orders: Order[];
}

type ColumnKey = "requested" | "scheduled" | "inProgress" | "delivered";

interface Column {
  key: ColumnKey;
  titleKey: string;
  orders: Order[];
}

function bucketOf(order: Order): ColumnKey {
  const key = normalizeStatusKey(order.status);
  if (!key) return "requested";
  if (key === "pending") return "requested";
  if (key === "provisional" || key === "confirmed") return "scheduled";
  if (key === "paused" || key === "completed") return "inProgress";
  if (key === "done" || key === "archived") return "delivered";
  return "requested";
}

function formatDueLabel(order: Order, lang: Lang): { text: string; urgent: boolean } {
  if (!order.appointmentDate) return { text: "—", urgent: false };
  const dt = new Date(order.appointmentDate);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startTomorrow = startToday + 86400000;
  const ts = dt.getTime();
  if (ts < startToday) {
    const days = Math.floor((startToday - ts) / 86400000);
    return {
      text: t(lang, "dashboard.pipeline.overdue").replace("{{n}}", String(days)),
      urgent: true,
    };
  }
  if (ts < startTomorrow) {
    return {
      text: t(lang, "dashboard.pipeline.todayAt").replace(
        "{{time}}",
        dt.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }),
      ),
      urgent: false,
    };
  }
  return {
    text: dt.toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" }),
    urgent: false,
  };
}

function addressLine(order: Order): string {
  return order.address || order.customerStreet || order.listingTitle || order.orderNo;
}

function customerLine(order: Order): string {
  return order.customerName || order.billing?.company || order.customerEmail || "";
}

export function PipelineBoard({ orders }: PipelineBoardProps) {
  const lang = useAuthStore((s) => s.language);

  const columns: Column[] = [
    { key: "requested", titleKey: "dashboard.pipeline.requested", orders: [] },
    { key: "scheduled", titleKey: "dashboard.pipeline.scheduled", orders: [] },
    { key: "inProgress", titleKey: "dashboard.pipeline.inProgress", orders: [] },
    { key: "delivered", titleKey: "dashboard.pipeline.delivered", orders: [] },
  ];

  for (const order of orders) {
    const bucket = bucketOf(order);
    const col = columns.find((c) => c.key === bucket);
    if (col) col.orders.push(order);
  }

  for (const c of columns) {
    c.orders.sort(
      (a, b) => new Date(a.appointmentDate || 0).getTime() - new Date(b.appointmentDate || 0).getTime(),
    );
    if (c.key === "delivered") c.orders.reverse();
  }

  return (
    <div className="pds-panel" data-tile="pipeline">
      <button className="drag-handle" type="button" aria-label={t(lang, "dashboard.tweaks.drag")}>
        <GripVertical />
      </button>
      <div className="pds-panel-head">
        <div>
          <h2>{t(lang, "dashboard.pipeline.title")}</h2>
          <div className="sub">{t(lang, "dashboard.pipeline.subtitle")}</div>
        </div>
        <Link className="see" to="/orders">
          {t(lang, "dashboard.pipeline.openBoard")} <ArrowUpRight />
        </Link>
      </div>
      <div className="pds-board">
        {columns.map((col) => (
          <div key={col.key} className={`pds-col${col.key === "delivered" ? " done" : ""}`}>
            <div className="pds-col-head">
              <span>{t(lang, col.titleKey)}</span>
              <b>{col.orders.length}</b>
            </div>
            {col.orders.length === 0 ? (
              <div className="pds-col-empty">{t(lang, "dashboard.pipeline.empty")}</div>
            ) : (
              col.orders.slice(0, 4).map((order) => {
                const due = formatDueLabel(order, lang);
                return (
                  <Link key={order.orderNo} to={`/orders?focus=${encodeURIComponent(order.orderNo)}`} className="pds-card">
                    <div className="id">{order.orderNo}</div>
                    <strong>{addressLine(order)}</strong>
                    <div className="c-meta">
                      <span>{customerLine(order)}</span>
                      <span className={`due${due.urgent ? " urgent" : ""}`}>{due.text}</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
