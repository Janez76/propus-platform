import { Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { t, type Lang } from "../../i18n";
import type { DashboardMetrics } from "./useDashboardMetrics";

interface UpcomingV2Props {
  metrics: DashboardMetrics;
  lang: Lang;
}

const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

export function UpcomingV2({ metrics, lang }: UpcomingV2Props) {
  const navigate = useNavigate();
  const { today, todayOrders, upcomingOrders } = metrics;
  const todayLabel = `${today.getDate()}. ${MONTHS_SHORT[today.getMonth()]}`;
  const goToOrder = (orderNo: string | number | undefined | null) => {
    if (orderNo == null || orderNo === "") return;
    navigate(`/orders/${orderNo}`);
  };

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
            return (
              <button
                key={o.orderNo}
                type="button"
                className={`dv2-upcoming-item${i < upcomingOrders.length - 1 ? " dv2-upcoming-item--border" : ""}`}
                onClick={() => goToOrder(o.orderNo)}
              >
                <div className="dv2-upcoming-date-chip">
                  <div className="dv2-upcoming-weekday">{weekday}</div>
                  <div className="dv2-upcoming-day">{day}</div>
                </div>
                <div className="dv2-upcoming-info">
                  <div className="dv2-upcoming-addr">{o.address ?? "—"}</div>
                  <div className="dv2-upcoming-meta">
                    {time} · {o.services?.package?.label ?? "Shooting"}
                  </div>
                </div>
                <Camera size={14} className="dv2-upcoming-cam-sm" />
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
