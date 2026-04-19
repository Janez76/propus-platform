import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Order } from "../../api/orders";
import { getStatusEntry, normalizeStatusKey } from "../../lib/status";
import { addDays, isoWeek, sameDay, startOfWeek } from "../../lib/orderTermin";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  orders: Order[];
  onOpenDetail: (orderNo: string) => void;
};

const DAY_NAMES_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_NAMES_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_FR = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const DAY_NAMES_IT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

const SLOT_HEIGHT_PX = 48;
const START_HOUR = 7;
const END_HOUR = 19;
const SHOWN_HOURS = END_HOUR - START_HOUR;

function monthNameDE(m: number): string {
  return ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"][m] ?? "";
}
function monthNameEN(m: number): string {
  return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m] ?? "";
}
function monthName(lang: string, m: number): string {
  if (lang === "en") return monthNameEN(m);
  return monthNameDE(m);
}

function pickDayNames(lang: string): string[] {
  if (lang === "en") return DAY_NAMES_EN;
  if (lang === "fr") return DAY_NAMES_FR;
  if (lang === "it") return DAY_NAMES_IT;
  return DAY_NAMES_DE;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

type PositionedEvent = {
  order: Order;
  start: Date;
  end: Date;
  topPx: number;
  heightPx: number;
};

function eventColorStyle(statusKey: string): { bg: string; border: string; text: string } {
  const entry = getStatusEntry(statusKey);
  const color = entry.eventColor;
  return {
    bg: `color-mix(in srgb, ${color} 18%, transparent)`,
    border: color,
    text: color,
  };
}

function computeEvent(order: Order): PositionedEvent | null {
  if (!order.appointmentDate) return null;
  const start = new Date(order.appointmentDate);
  if (Number.isNaN(start.getTime())) return null;
  const durationMin = Number(order.schedule?.durationMin) > 0 ? Number(order.schedule?.durationMin) : 60;
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  const startHourFloat = start.getHours() + start.getMinutes() / 60;
  const endHourFloat = end.getHours() + end.getMinutes() / 60;
  const clampedStart = Math.max(startHourFloat, START_HOUR);
  const clampedEnd = Math.min(endHourFloat, END_HOUR);
  const topPx = (clampedStart - START_HOUR) * SLOT_HEIGHT_PX;
  const heightPx = Math.max(22, (clampedEnd - clampedStart) * SLOT_HEIGHT_PX);

  return { order, start, end, topPx, heightPx };
}

export function OrderWeekCalendar({ orders, onOpenDetail }: Props) {
  const lang = useAuthStore((s) => s.language);
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const weekStart = useMemo(() => startOfWeek(anchor, true), [anchor]);
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PositionedEvent[]>();
    for (const d of days) map.set(d.toDateString(), []);
    for (const o of orders) {
      const ev = computeEvent(o);
      if (!ev) continue;
      const key = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate()).toDateString();
      if (map.has(key)) map.get(key)!.push(ev);
    }
    for (const list of map.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());
    return map;
  }, [orders, days]);

  const weekEnd = addDays(weekStart, 4);
  const weekLabel = `${t(lang, "orders.calendar.weekShort")} ${isoWeek(weekStart)} · ${pad(weekStart.getDate())}. – ${pad(weekEnd.getDate())}. ${monthName(lang, weekEnd.getMonth())} ${weekEnd.getFullYear()}`;
  const dayNames = pickDayNames(lang);

  const hours = useMemo(() => Array.from({ length: SHOWN_HOURS }, (_, i) => START_HOUR + i), []);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-3">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor(addDays(weekStart, -7))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-soft)] text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
            aria-label={t(lang, "orders.calendar.prevWeek")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[220px] text-center text-sm font-semibold text-[var(--text-main)]">{weekLabel}</span>
          <button
            type="button"
            onClick={() => setAnchor(addDays(weekStart, 7))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-soft)] text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
            aria-label={t(lang, "orders.calendar.nextWeek")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="ml-1 rounded-md border border-[var(--border-soft)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
          >
            {t(lang, "orders.calendar.today")}
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: `56px repeat(5, minmax(0, 1fr))` }}>
        {/* Header row */}
        <div className="border-b border-[var(--border-soft)] bg-[var(--surface-raised)]" />
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div
              key={d.toDateString()}
              className={`border-b border-l border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-center ${isToday ? "text-[var(--accent)]" : ""}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">{dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
              <div className={`mt-0.5 text-sm font-semibold ${isToday ? "text-[var(--accent)]" : "text-[var(--text-main)]"}`}>{d.getDate()}</div>
            </div>
          );
        })}

        {/* Time column */}
        <div className="relative border-r border-[var(--border-soft)]">
          {hours.map((h) => (
            <div
              key={h}
              className="flex h-[48px] items-start justify-end pr-2 pt-1 text-[10px] text-[var(--text-subtle)]"
            >
              {pad(h)}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d) => {
          const events = eventsByDay.get(d.toDateString()) || [];
          return (
            <div
              key={d.toDateString()}
              className="relative border-l border-[var(--border-soft)]"
              style={{ minHeight: `${SHOWN_HOURS * SLOT_HEIGHT_PX}px` }}
            >
              {hours.map((h) => (
                <div key={h} className="h-[48px] border-b border-[var(--border-soft)]" />
              ))}
              {events.map((ev) => {
                const key = normalizeStatusKey(ev.order.status) ?? "pending";
                const color = eventColorStyle(key);
                const address = ev.order.address || ev.order.billing?.street || "";
                const employee = ev.order.photographer?.name || ev.order.photographer?.key || "";
                const customer = ev.order.billing?.company || ev.order.customerName || "";
                const startHM = `${pad(ev.start.getHours())}:${pad(ev.start.getMinutes())}`;
                const endHM = `${pad(ev.end.getHours())}:${pad(ev.end.getMinutes())}`;
                return (
                  <button
                    key={ev.order.orderNo}
                    type="button"
                    onClick={() => onOpenDetail(ev.order.orderNo)}
                    className="absolute left-1 right-1 overflow-hidden rounded-md border-l-[3px] px-2 py-1.5 text-left text-[11px] transition-transform hover:z-10 hover:scale-[1.01] focus:z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    style={{
                      top: `${ev.topPx}px`,
                      height: `${ev.heightPx}px`,
                      background: color.bg,
                      borderLeftColor: color.border,
                      color: color.text,
                    }}
                    title={`#${ev.order.orderNo} · ${customer}`}
                  >
                    <div className="font-semibold">{startHM} – {endHM}</div>
                    <div className="truncate font-medium text-[var(--text-main)]">#{ev.order.orderNo} {customer}</div>
                    <div className="truncate text-[10px] text-[var(--text-muted)]">{address}{employee ? ` · ${employee}` : ""}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
