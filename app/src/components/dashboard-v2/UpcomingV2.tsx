import { Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { t, type Lang } from "../../i18n";
import type { DashboardMetrics } from "./useDashboardMetrics";
import { paletteForStatus } from "../orders/mapStatusColors";
import type { Order } from "../../api/orders";

interface UpcomingV2Props {
  metrics: DashboardMetrics;
  lang: Lang;
  onHover?: (orderNo: string | null) => void;
}

/** Kompakter Status-Pill — selbe Farben wie OrdersMap-Legende. */
function StatusPill({ status, lang }: { status: string; lang: Lang }) {
  const p = paletteForStatus(status);
  return (
    <span
      className="dv2-upc-status"
      style={{ background: p.bg, color: p.ring, borderColor: p.ring }}
    >
      {t(lang, p.labelKey)}
    </span>
  );
}

function staffShort(o: Order): string {
  const key = o.photographer?.key?.trim();
  if (key) return key;
  const name = o.photographer?.name?.trim();
  if (!name) return "—";
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

export function UpcomingV2({ metrics, lang, onHover }: UpcomingV2Props) {
  const navigate = useNavigate();
  const { today, todayOrders, upcomingOrders } = metrics;
  const todayLabel = `${today.getDate()}. ${MONTHS_SHORT[today.getMonth()]}`;
  const goToOrder = (orderNo: string | number | undefined | null) => {
    if (orderNo == null || orderNo === "") return;
    navigate(`/orders/${orderNo}`);
  };
  const onEnter = (orderNo: string | number | undefined | null) => {
    if (!onHover) return;
    onHover(orderNo == null || orderNo === "" ? null : String(orderNo));
  };
  const onLeave = () => onHover?.(null);

  return (
    <div className="dv2-card">
      <div className="dv2-card-title">
        {t(lang, "dashboardV2.upcoming.today").replace("{{date}}", todayLabel)}
      </div>
      <div className="dv2-upcoming-today-status">
        {todayOrders.length === 0
          ? t(lang, "dashboardV2.upcoming.todayEmpty")
          : todayOrders.map((o) => (
              <button
                key={o.orderNo}
                type="button"
                className="dv2-upcoming-today-item"
                onClick={() => goToOrder(o.orderNo)}
                onMouseEnter={() => onEnter(o.orderNo)}
                onMouseLeave={onLeave}
                onFocus={() => onEnter(o.orderNo)}
                onBlur={onLeave}
              >
                <Camera size={13} className="dv2-upcoming-cam" />
                <span>{o.address ?? "—"}</span>
                {o.appointmentDate && (
                  <span className="dv2-upcoming-time">
                    {new Date(o.appointmentDate).toLocaleTimeString("de-CH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </button>
            ))}
      </div>

      {upcomingOrders.length > 0 && (
        <>
          <div className="dv2-upcoming-section-label">{t(lang, "dashboardV2.upcoming.next")}</div>
          {upcomingOrders.map((o, i) => {
            const d = o.appointmentDate ? new Date(o.appointmentDate) : null;
            const weekday = d ? WEEKDAYS_SHORT[d.getDay()] : "";
            const day = d ? String(d.getDate()) : "";
            const time = d
              ? d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })
              : "";
            const dur = o.schedule?.durationMin ?? null;
            return (
              <button
                key={o.orderNo}
                type="button"
                className={`dv2-upcoming-item${i < upcomingOrders.length - 1 ? " dv2-upcoming-item--border" : ""}`}
                onClick={() => goToOrder(o.orderNo)}
                onMouseEnter={() => onEnter(o.orderNo)}
                onMouseLeave={onLeave}
                onFocus={() => onEnter(o.orderNo)}
                onBlur={onLeave}
              >
                <div className="dv2-upcoming-date-chip">
                  <div className="dv2-upcoming-weekday">{weekday}</div>
                  <div className="dv2-upcoming-day">{day}</div>
                </div>
                <div className="dv2-upcoming-info">
                  <div className="dv2-upcoming-primary">
                    <span className="dv2-upcoming-orderno">#{o.orderNo}</span>
                    {o.customerName ? <span> · {o.customerName}</span> : null}
                  </div>
                  <div className="dv2-upcoming-meta">
                    {o.address ?? "—"}
                    {dur ? ` · ${dur} Min` : ""}
                    {` · ${staffShort(o)}`}
                  </div>
                </div>
                <div className="dv2-upcoming-side">
                  <span className="dv2-upcoming-time">{time}</span>
                  <StatusPill status={o.status} lang={lang} />
                </div>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
