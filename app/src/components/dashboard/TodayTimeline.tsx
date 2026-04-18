import { ArrowUpRight, Building, Camera, GripVertical, User } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import type { Order } from "../../api/orders";

interface TodayTimelineProps {
  orders: Order[];
}

type Pack = "ess" | "prm" | "sig";

function packageBadge(order: Order): { key: Pack; labelKey: string } {
  const key = (order.services?.package?.key || "").toLowerCase();
  if (key.includes("signature")) return { key: "sig", labelKey: "dashboard.pack.signature" };
  if (key.includes("premium")) return { key: "prm", labelKey: "dashboard.pack.premium" };
  return { key: "ess", labelKey: "dashboard.pack.essential" };
}

function formatTime(iso?: string): { hhmm: string; ts: number } {
  if (!iso) return { hhmm: "--:--", ts: 0 };
  const d = new Date(iso);
  return {
    hhmm: d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }),
    ts: d.getTime(),
  };
}

function locationFromOrder(order: Order): string {
  const zipcity = order.customerZipcity || "";
  if (zipcity) {
    const city = zipcity.replace(/^\d{4}\s*/, "").trim();
    return city || zipcity;
  }
  if (order.address) {
    const parts = order.address.split(",").map((p) => p.trim()).filter(Boolean);
    return parts[parts.length - 1] || order.address;
  }
  return "";
}

function addressLine(order: Order): string {
  if (order.address) return order.address;
  if (order.customerStreet) return order.customerStreet;
  return order.listingTitle || order.orderNo;
}

export function TodayTimeline({ orders }: TodayTimelineProps) {
  const lang = useAuthStore((s) => s.language);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

  const todays = orders
    .filter((o) => {
      if (!o.appointmentDate) return false;
      const ts = new Date(o.appointmentDate).getTime();
      return ts >= startOfDay && ts < endOfDay;
    })
    .sort((a, b) => new Date(a.appointmentDate || 0).getTime() - new Date(b.appointmentDate || 0).getTime());

  const dateLabel = now.toLocaleDateString(lang === "de" ? "de-CH" : lang, {
    day: "numeric",
    month: "long",
  });

  let subtitle = t(lang, "dashboard.timeline.empty");
  if (todays.length > 0) {
    const startLabel = formatTime(todays[0].appointmentDate).hhmm;
    const endLabel = formatTime(todays[todays.length - 1].appointmentDate).hhmm;
    subtitle = t(lang, "dashboard.timeline.summary")
      .replace("{{n}}", String(todays.length))
      .replace("{{start}}", startLabel)
      .replace("{{end}}", endLabel);
  }

  const nowTs = now.getTime();
  let nowIdx = -1;
  for (let i = 0; i < todays.length; i++) {
    const ts = new Date(todays[i].appointmentDate || 0).getTime();
    if (ts <= nowTs) nowIdx = i;
    else break;
  }

  return (
    <div className="pds-panel" data-tile="timeline">
      <button className="drag-handle" type="button" aria-label={t(lang, "dashboard.tweaks.drag")}>
        <GripVertical />
      </button>
      <div className="pds-panel-head">
        <div>
          <h2>{t(lang, "dashboard.timeline.title")} · {dateLabel}</h2>
          <div className="sub">{subtitle}</div>
        </div>
        <Link className="see" to="/calendar">
          {t(lang, "nav.calendar")} <ArrowUpRight />
        </Link>
      </div>
      {todays.length === 0 ? (
        <div className="pds-timeline-empty">{t(lang, "dashboard.timeline.empty")}</div>
      ) : (
        <div className="pds-timeline">
          {todays.map((order, idx) => {
            const { hhmm } = formatTime(order.appointmentDate);
            const loc = locationFromOrder(order);
            const pack = packageBadge(order);
            const isNow = idx === nowIdx;
            return (
              <div key={order.orderNo} className={`pds-tl-item${isNow ? " now" : ""}`}>
                <div className="time"><b>{hhmm}</b>{loc}</div>
                <div className="head-row">
                  <h4>{addressLine(order)}</h4>
                  <span className={`pack ${pack.key}`}>{t(lang, pack.labelKey)}</span>
                </div>
                <div className="meta-row">
                  <span><Camera />{order.services?.package?.label || t(lang, "dashboard.pack.shoot")}</span>
                  {order.customerName ? (
                    <span><User />{order.customerName}</span>
                  ) : null}
                  {order.billing?.company ? (
                    <span><Building />{order.billing.company}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
