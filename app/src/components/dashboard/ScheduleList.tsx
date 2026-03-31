import { Calendar, MapPin, User, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { formatSwissDate } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Order } from "../../api/orders";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

interface ScheduleListProps {
  orders: Order[];
  days?: number;
  onCreateOrder?: () => void;
}

export function ScheduleList({ orders, days = 7, onCreateOrder }: ScheduleListProps) {
  const lang = useAuthStore((s) => s.language);
  const now = new Date();
  const maxDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const upcomingOrders = orders
    .filter((order) => {
      if (!order.appointmentDate) return false;
      const appointmentDate = new Date(order.appointmentDate);
      return appointmentDate >= now && appointmentDate <= maxDate;
    })
    .sort((a, b) => {
      const dateA = new Date(a.appointmentDate || 0);
      const dateB = new Date(b.appointmentDate || 0);
      return dateA.getTime() - dateB.getTime();
    })
    .slice(0, 8);

  if (upcomingOrders.length === 0) {
    return (
      <div className="surface-card p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="p-2 rounded-lg p-bg-raised">
            <Calendar className="h-5 w-5 p-text-accent" />
          </div>
          <h3 className="section-title">
            {t(lang, "schedule.title").replace("{{n}}", String(days))}
          </h3>
        </div>
        <p className="text-sm p-text-muted text-center py-8">
          {t(lang, "schedule.empty")}
        </p>
        <div className="flex justify-center">
          <button type="button" onClick={onCreateOrder} className="btn-secondary">
            {t(lang, "schedule.button.createOrder")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg p-bg-raised">
            <Calendar className="h-5 w-5 p-text-accent" />
          </div>
          <h3 className="section-title">
            {t(lang, "schedule.title").replace("{{n}}", String(days))}
          </h3>
        </div>
        <Link
          to="/calendar"
          className="whitespace-nowrap text-xs font-semibold p-text-accent p-hover-accent transition-colors"
        >
          {t(lang, "schedule.link.showAll")}
        </Link>
      </div>

      <div className="space-y-3">
        {upcomingOrders.map((order, index) => {
          const appointmentDate = new Date(order.appointmentDate || "");
          const isToday = appointmentDate.toDateString() === now.toDateString();
          const isTomorrow = appointmentDate.toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
          const dayLabel = isToday ? t(lang, "schedule.label.today") : isTomorrow ? t(lang, "schedule.label.tomorrow") : formatSwissDate(order.appointmentDate || "");
          const timeLabel = appointmentDate.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });

          return (
            <div key={order.orderNo} className="grid grid-cols-[16px,minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[20px,minmax(0,1fr),70px] sm:gap-3">
              <div className="flex flex-col items-center pt-2">
                <span className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  isToday ? "bg-amber-500" : isTomorrow ? "bg-sky-500" : "bg-zinc-400"
                )} />
                {index < upcomingOrders.length - 1 ? (
                  <span className="mt-1 h-full w-px" style={{ background: "var(--border-soft)" }} />
                ) : null}
              </div>

              <Link
                to={`/orders?orderNo=${order.orderNo}`}
                className={cn(
                  "block rounded-lg border p-3 transition-all duration-200 hover:shadow-md sm:p-4",
                  isToday
                    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50"
                    : "p-bg-raised"
                )}
                style={isToday ? undefined : { borderColor: "var(--border-soft)" }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      isToday
                        ? "bg-amber-200/80 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200"
                        : isTomorrow
                          ? "bg-sky-200/80 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200"
                          : undefined
                    )}
                    style={!isToday && !isTomorrow ? { background: "var(--border-strong)", color: "var(--text-muted)" } : undefined}
                  >
                    {dayLabel}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <User className="h-3.5 w-3.5 p-text-subtle mt-0.5 flex-shrink-0" />
                    <span className="text-sm p-text-main font-medium">
                      {order.customerName || t(lang, "schedule.label.noName")}
                    </span>
                  </div>
                  {order.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 p-text-subtle mt-0.5 flex-shrink-0" />
                      <span className="text-xs p-text-muted line-clamp-1">
                        {order.address}
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-2 sm:hidden">
                  <div className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold p-text-muted" style={{ background: "var(--surface-raised)" }}>
                    <Clock className="h-3.5 w-3.5" />
                    {timeLabel}
                  </div>
                </div>
              </Link>

              <div className="hidden pt-2 text-right sm:block">
                <div className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold p-text-muted" style={{ background: "var(--surface-raised)" }}>
                  <Clock className="h-3.5 w-3.5" />
                  {timeLabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

