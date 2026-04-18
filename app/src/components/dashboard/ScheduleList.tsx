import { useEffect, useMemo, useState } from "react";
import { Calendar, MapPin, User, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import type { Order } from "../../api/orders";
import { getStatusEntry } from "../../lib/status";
import { t, type Lang } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

interface ScheduleListProps {
  orders: Order[];
  days?: number;
  onCreateOrder?: () => void;
}

interface DayBucket {
  key: string;
  date: Date;
  isToday: boolean;
  isTomorrow: boolean;
  orders: Order[];
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Kalendertags-Arithmetik (DST-sicher). `setDate` adjustiert die Stunden
// korrekt bei Sommer-/Winterzeitumstellung in Europe/Zurich — reine
// Millisekunden-Addition würde am Umstellungstag bei 23:00 oder 01:00 landen
// und das horizonExclusive um eine Stunde verschieben.
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ScheduleList({ orders, days = 7, onCreateOrder }: ScheduleListProps) {
  const lang = useAuthStore((s) => s.language);

  // Minutengenauer Ticker: erzwingt Re-Memo, damit abgelaufene Termine
  // aus der Upcoming-Liste fliegen, auch wenn sich `orders` nicht ändert.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const buckets = useMemo<DayBucket[]>(() => {
    const now = new Date(nowTick);
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    // horizon ist die Mitternacht NACH dem letzten gewünschten Tag (exklusiv).
    // days=7 → Termine von jetzt bis Ende Tag 6 inkl., also < today + 7 Tage.
    const horizonExclusive = addDays(today, days);

    const map = new Map<string, DayBucket>();
    for (const order of orders) {
      if (!order.appointmentDate) continue;
      const date = new Date(order.appointmentDate);
      // Invalid Date → getTime() ist NaN; alle Vergleiche unten wären false und
      // der Termin würde durchrutschen. Vorher prüfen, sonst entstehen
      // "NaN-NaN-NaN"-Buckets aus Legacy-Daten.
      if (Number.isNaN(date.getTime())) continue;
      if (date < now || date >= horizonExclusive) continue;
      const day = startOfDay(date);
      const key = dayKey(day);
      if (!map.has(key)) {
        map.set(key, {
          key,
          date: day,
          isToday: day.getTime() === today.getTime(),
          isTomorrow: day.getTime() === tomorrow.getTime(),
          orders: [],
        });
      }
      map.get(key)!.orders.push(order);
    }
    for (const bucket of map.values()) {
      bucket.orders.sort((a, b) => {
        const ta = a.appointmentDate ? new Date(a.appointmentDate).getTime() : 0;
        const tb = b.appointmentDate ? new Date(b.appointmentDate).getTime() : 0;
        return ta - tb;
      });
    }
    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [orders, days, nowTick]);

  const totalCount = buckets.reduce((sum, b) => sum + b.orders.length, 0);

  const headerNode = (
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
  );

  if (totalCount === 0) {
    return (
      <div className="surface-card p-4 sm:p-6">
        {headerNode}
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
      {headerNode}

      <div className="relative max-h-[520px] overflow-y-auto pr-1">
        {buckets.map((bucket) => (
          <DaySection key={bucket.key} bucket={bucket} lang={lang} />
        ))}
      </div>
    </div>
  );
}

interface DaySectionProps {
  bucket: DayBucket;
  lang: Lang;
}

function DaySection({ bucket, lang }: DaySectionProps) {
  const weekday = bucket.date.toLocaleDateString(lang === "de" ? "de-CH" : lang, {
    weekday: "short",
  });
  const dateShort = bucket.date.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
  });
  const prefix = bucket.isToday
    ? t(lang, "schedule.label.today")
    : bucket.isTomorrow
      ? t(lang, "schedule.label.tomorrow")
      : weekday;
  const count = bucket.orders.length;
  const countLabel =
    count === 1
      ? t(lang, "schedule.label.appointment")
      : t(lang, "schedule.label.appointments").replace("{{n}}", String(count));

  return (
    <section className="mb-4 last:mb-0">
      <div
        className={cn(
          "sticky top-0 z-10 -mx-1 mb-2 flex items-center justify-between gap-3 px-1 py-1.5",
          "backdrop-blur",
        )}
        style={{ background: "color-mix(in srgb, var(--surface) 85%, transparent)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
              bucket.isToday
                ? "bg-amber-200/80 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200"
                : bucket.isTomorrow
                  ? "bg-sky-200/80 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200"
                  : "",
            )}
            style={
              !bucket.isToday && !bucket.isTomorrow
                ? { background: "var(--border-strong)", color: "var(--text-muted)" }
                : undefined
            }
          >
            {prefix}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider p-text-muted">
            {dateShort}
          </span>
        </div>
        <span className="text-[11px] font-medium p-text-subtle">{countLabel}</span>
      </div>

      <ul className="space-y-1.5">
        {bucket.orders.map((order) => (
          <ScheduleRow key={order.orderNo} order={order} lang={lang} />
        ))}
      </ul>
    </section>
  );
}

interface ScheduleRowProps {
  order: Order;
  lang: Lang;
}

function ScheduleRow({ order, lang }: ScheduleRowProps) {
  const date = new Date(order.appointmentDate || "");
  const time = date.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const status = getStatusEntry(order.status);

  return (
    <li>
      <Link
        to={`/orders?orderNo=${order.orderNo}`}
        className="group grid grid-cols-[56px,1fr,auto] items-center gap-3 rounded-lg border p-2.5 transition-colors hover:border-[var(--accent)]/40"
        style={{ borderColor: "var(--border-soft)", background: "var(--surface-raised)" }}
      >
        <div className="flex flex-col items-center justify-center rounded-md py-1.5" style={{ background: "var(--surface)" }}>
          <Clock className="mb-0.5 h-3 w-3 p-text-subtle" />
          <span className="text-sm font-bold tabular-nums p-text-main">{time}</span>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 flex-shrink-0 p-text-subtle" />
            <span className="truncate text-sm font-medium p-text-main">
              {order.customerName || t(lang, "schedule.label.noName")}
            </span>
          </div>
          {order.address && (
            <div className="mt-0.5 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 p-text-subtle" />
              <span className="truncate text-xs p-text-muted">{order.address}</span>
            </div>
          )}
        </div>

        <span className={cn("hidden shrink-0 sm:inline-flex", status.badgeClass)}>
          {status.label}
        </span>
      </Link>
    </li>
  );
}
