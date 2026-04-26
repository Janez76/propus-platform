import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent } from "../../api/calendar";
import type { WeatherForecastDay } from "../../api/weather";
import { weatherEmoji } from "../../api/weather";
import { getStatusEventColor, getStatusEntry } from "../../lib/status";
import { normalizeMojibakeText, type CalendarClickedEvent } from "./CalendarView";

export type CalendarView = "day" | "week" | "month";

type Props = {
  events: CalendarEvent[];
  view: CalendarView;
  anchor: Date;
  onChangeView: (v: CalendarView) => void;
  onChangeAnchor: (d: Date) => void;
  onEventClick?: (e: CalendarClickedEvent) => void;
  onDateClick?: (iso: string) => void;
  forecastByDate?: ReadonlyMap<string, WeatherForecastDay> | null;
};

const DAY_HOURS_START = 7;
const DAY_HOURS_END = 20;
const HOUR_HEIGHT_PX = 64;
const TOTAL_HOURS = DAY_HOURS_END - DAY_HOURS_START;

const DOW_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
const DOW_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}
function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfMonthGrid(d: Date): Date {
  return startOfWeek(startOfMonth(d));
}

function clampMinutes(date: Date | null | undefined, dayStart: Date, dayEnd: Date): number | null {
  if (!date) return null;
  if (date.getTime() <= dayStart.getTime()) return 0;
  if (date.getTime() >= dayEnd.getTime()) return Math.floor((dayEnd.getTime() - dayStart.getTime()) / 60_000);
  return Math.floor((date.getTime() - dayStart.getTime()) / 60_000);
}

type EventLayout = {
  ev: CalendarEvent;
  topPx: number;
  heightPx: number;
  color: string;
  status: string;
};

function buildDayLayout(
  events: CalendarEvent[],
  day: Date,
): EventLayout[] {
  const dayStart = new Date(day);
  dayStart.setHours(DAY_HOURS_START, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(DAY_HOURS_END, 0, 0, 0);
  const out: EventLayout[] = [];
  for (const ev of events) {
    if (!ev.start) continue;
    const start = new Date(ev.start);
    const endRaw = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60 * 60_000);
    if (Number.isNaN(start.getTime())) continue;
    if (!isSameDay(start, day) && !(start < dayStart && endRaw > dayStart)) continue;
    const startMin = clampMinutes(start, dayStart, dayEnd);
    const endMin = clampMinutes(endRaw, dayStart, dayEnd);
    if (startMin == null || endMin == null) continue;
    const durMin = Math.max(28, endMin - startMin);
    const topPx = (startMin / 60) * HOUR_HEIGHT_PX;
    const heightPx = (durMin / 60) * HOUR_HEIGHT_PX;
    const status = String(ev.status || "");
    const color = getStatusEventColor(status);
    out.push({ ev, topPx, heightPx, color, status });
  }
  return out;
}

function fmtTimeRange(ev: CalendarEvent): string {
  if (!ev.start) return "";
  const s = new Date(ev.start);
  const e = ev.end ? new Date(ev.end) : null;
  const sLabel = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`;
  if (!e) return sLabel;
  const eLabel = `${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
  return `${sLabel} – ${eLabel}`;
}

function durationMinutesLabel(ev: CalendarEvent): string {
  if (!ev.start || !ev.end) return "";
  const s = new Date(ev.start).getTime();
  const e = new Date(ev.end).getTime();
  const min = Math.max(0, Math.round((e - s) / 60_000));
  if (!min) return "";
  return `${min}'`;
}

function clickedFrom(ev: CalendarEvent): CalendarClickedEvent {
  return {
    id: String(ev.id),
    title: normalizeMojibakeText(ev.title),
    start: ev.start,
    end: ev.end,
    allDay: ev.allDay,
    type: ev.type,
    orderNo: ev.orderNo != null ? String(ev.orderNo) : undefined,
    address: ev.address,
    photographerKey: ev.photographerKey,
    photographerName: ev.photographerName,
    grund: ev.grund,
    status: ev.status,
  };
}

function nowLineTopPx(day: Date): number | null {
  const now = new Date();
  if (!isSameDay(now, day)) return null;
  const dayStart = new Date(day);
  dayStart.setHours(DAY_HOURS_START, 0, 0, 0);
  const min = (now.getTime() - dayStart.getTime()) / 60_000;
  if (min < 0 || min > TOTAL_HOURS * 60) return null;
  return (min / 60) * HOUR_HEIGHT_PX;
}

export function HandoffCalendarView({
  events,
  view,
  anchor,
  onChangeView,
  onChangeAnchor,
  onEventClick,
  onDateClick,
  forecastByDate,
}: Props) {
  const today = new Date();

  const headerTitle = useMemo(() => {
    if (view === "day") {
      return new Intl.DateTimeFormat("de-CH", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(anchor);
    }
    if (view === "week") {
      const ws = startOfWeek(anchor);
      const we = addDays(ws, 6);
      const sameMonth = ws.getMonth() === we.getMonth();
      const left = `${ws.getDate()}. ${MONTHS[ws.getMonth()]}`;
      const right = `${we.getDate()}. ${MONTHS[we.getMonth()]}${sameMonth ? "" : ""} ${we.getFullYear()}`;
      return `${left} – ${right}`;
    }
    return new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric" }).format(anchor);
  }, [view, anchor]);

  function shiftAnchor(direction: -1 | 1) {
    const d = new Date(anchor);
    if (view === "day") d.setDate(d.getDate() + direction);
    else if (view === "week") d.setDate(d.getDate() + direction * 7);
    else d.setMonth(d.getMonth() + direction);
    onChangeAnchor(d);
  }

  return (
    <div className="cal-main">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, #FFFEFA, #FBF8F0)",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <button type="button" className="btn-icon" onClick={() => shiftAnchor(-1)} aria-label="Zurück">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn-icon"
            style={{ width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 600 }}
            onClick={() => onChangeAnchor(new Date())}
          >
            Heute
          </button>
          <button type="button" className="btn-icon" onClick={() => shiftAnchor(1)} aria-label="Vor">
            <ChevronRight className="h-4 w-4" />
          </button>
          <strong
            style={{
              marginLeft: 12,
              fontSize: 14,
              color: "var(--ink)",
              letterSpacing: "-0.005em",
              fontWeight: 600,
            }}
          >
            {headerTitle}
          </strong>
        </div>
        <div className="view-toggle">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={view === v ? "on" : ""}
              onClick={() => onChangeView(v)}
            >
              {v === "day" ? "Tag" : v === "week" ? "Woche" : "Monat"}
            </button>
          ))}
        </div>
      </div>

      {view === "day" ? (
        <DayView
          anchor={anchor}
          events={events}
          today={today}
          onEventClick={onEventClick}
          onDateClick={onDateClick}
          forecastByDate={forecastByDate}
        />
      ) : null}
      {view === "week" ? (
        <WeekView
          anchor={anchor}
          events={events}
          today={today}
          onEventClick={onEventClick}
          onDateClick={onDateClick}
          forecastByDate={forecastByDate}
        />
      ) : null}
      {view === "month" ? (
        <MonthView
          anchor={anchor}
          events={events}
          today={today}
          onEventClick={onEventClick}
          onDateClick={onDateClick}
          forecastByDate={forecastByDate}
          onPickDay={(iso) => {
            onChangeAnchor(new Date(`${iso}T00:00:00`));
            onChangeView("day");
          }}
        />
      ) : null}
    </div>
  );
}

/* ─────────────────────────  Day View  ───────────────────────── */

function DayView({
  anchor,
  events,
  today,
  onEventClick,
  onDateClick,
  forecastByDate,
}: {
  anchor: Date;
  events: CalendarEvent[];
  today: Date;
  onEventClick?: (e: CalendarClickedEvent) => void;
  onDateClick?: (iso: string) => void;
  forecastByDate?: ReadonlyMap<string, WeatherForecastDay> | null;
}) {
  const layout = useMemo(() => buildDayLayout(events, anchor), [events, anchor]);
  const dayCount = layout.length;
  const fc = forecastByDate?.get(isoDate(anchor)) ?? null;
  const nowTop = nowLineTopPx(anchor);
  const isToday = isSameDay(anchor, today);
  const dow = (anchor.getDay() + 6) % 7;

  return (
    <div className="day-view">
      <div className="dv-head">
        <div className="dv-head-l">
          <div className="dv-dow">{DOW_LONG[dow]}</div>
          <div className="dv-date">
            {anchor.getDate()}. {MONTHS[anchor.getMonth()]}
          </div>
        </div>
        <div className="dv-head-r">
          {fc ? (
            <div className="dv-wx">
              <span style={{ fontSize: 32, lineHeight: 1 }} aria-hidden>
                {weatherEmoji(fc.kind)}
              </span>
              <div>
                <strong>{fc.t_max}°</strong>
                <span>
                  ↓{fc.t_min}° · {fc.precip}%
                </span>
              </div>
            </div>
          ) : null}
          <div className="dv-count">
            <strong>{dayCount}</strong>
            <span>{dayCount === 1 ? "Termin" : "Termine"}</span>
          </div>
        </div>
      </div>

      <div className="dv-body">
        <div className="dv-hours">
          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
            <div
              key={i}
              className="dv-hour-label"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              <span>{pad2(DAY_HOURS_START + i)}:00</span>
            </div>
          ))}
        </div>
        <div className="dv-track" style={{ height: TOTAL_HOURS * HOUR_HEIGHT_PX, position: "relative" }}>
          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Buchung anlegen ${pad2(DAY_HOURS_START + i)}:00`}
              className="dv-cell"
              style={{
                height: HOUR_HEIGHT_PX,
                width: "100%",
                background: "transparent",
                border: 0,
                borderBottom: "1px solid var(--border-soft)",
                cursor: onDateClick ? "pointer" : "default",
              }}
              onClick={() =>
                onDateClick?.(
                  `${isoDate(anchor)}T${pad2(DAY_HOURS_START + i)}:00`,
                )
              }
            />
          ))}
          {layout.map((l, i) => (
            <button
              key={`${l.ev.id}-${i}`}
              type="button"
              className={`dv-event status-${(l.status || "").toLowerCase() || "pending"}`}
              style={
                {
                  top: l.topPx,
                  height: l.heightPx,
                  ["--ev-color" as never]: l.color,
                  ["--ev-bg" as never]: `color-mix(in srgb, ${l.color} 10%, var(--paper-strip))`,
                } as React.CSSProperties
              }
              onClick={() => onEventClick?.(clickedFrom(l.ev))}
            >
              <div className="dv-event-time">
                {fmtTimeRange(l.ev)} · {durationMinutesLabel(l.ev)}
              </div>
              <div className="dv-event-title">{normalizeMojibakeText(l.ev.title)}</div>
              <div className="dv-event-meta">
                {l.ev.zipcity ? <span>{l.ev.zipcity}</span> : null}
                {l.ev.customerName ? <span>· {l.ev.customerName}</span> : null}
                {l.ev.photographerName ? <span>· {l.ev.photographerName}</span> : null}
              </div>
            </button>
          ))}
          {isToday && nowTop != null ? (
            <div className="dv-now-line" style={{ top: nowTop }}>
              <div className="dv-now-dot" />
              <div className="dv-now-label">{`${pad2(today.getHours())}:${pad2(today.getMinutes())}`}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Week View  ───────────────────────── */

function WeekView({
  anchor,
  events,
  today,
  onEventClick,
  onDateClick,
  forecastByDate,
}: {
  anchor: Date;
  events: CalendarEvent[];
  today: Date;
  onEventClick?: (e: CalendarClickedEvent) => void;
  onDateClick?: (iso: string) => void;
  forecastByDate?: ReadonlyMap<string, WeatherForecastDay> | null;
}) {
  const ws = useMemo(() => startOfWeek(anchor), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws]);
  const layouts = useMemo(() => days.map((d) => buildDayLayout(events, d)), [days, events]);

  return (
    <div className="week-view">
      <div className="week-view-head">
        <div className="wv-hour-pad" />
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          const fc = forecastByDate?.get(isoDate(d)) ?? null;
          const count = layouts[i].length;
          return (
            <div key={isoDate(d)} className={`wv-day-head${isToday ? " today" : ""}`}>
              <div className="wv-day-meta">
                <span className="wv-dow">{DOW_LONG[i]}</span>
                <span className="wv-date">{d.getDate()}.</span>
                <span className="wv-month">{MONTHS[d.getMonth()]}</span>
              </div>
              <div className="wv-day-meta-right">
                <span className="wv-day-count">{count}</span>
                {fc ? (
                  <span className="wv-wx" data-wx={fc.kind}>
                    <span style={{ fontSize: 14 }} aria-hidden>
                      {weatherEmoji(fc.kind)}
                    </span>
                    <span>
                      {fc.t_max}°/{fc.t_min}°
                    </span>
                    <span style={{ color: "var(--fg-3)", fontWeight: 500 }}>{fc.precip}%</span>
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="week-view-body">
        <div className="wv-hours" style={{ height: TOTAL_HOURS * HOUR_HEIGHT_PX }}>
          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
            <div key={i} className="wv-hour-label" style={{ height: HOUR_HEIGHT_PX }}>
              <span>{pad2(DAY_HOURS_START + i)}:00</span>
            </div>
          ))}
        </div>
        {days.map((d, di) => {
          const isToday = isSameDay(d, today);
          const dayLayout = layouts[di];
          const nowTop = nowLineTopPx(d);
          return (
            <div
              key={isoDate(d)}
              className={`wv-day-col${isToday ? " today" : ""}`}
              style={{ height: TOTAL_HOURS * HOUR_HEIGHT_PX, position: "relative" }}
            >
              {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className="wv-cell"
                  aria-label={`Buchung anlegen ${pad2(DAY_HOURS_START + i)}:00`}
                  style={{
                    height: HOUR_HEIGHT_PX,
                    width: "100%",
                    background: "transparent",
                    border: 0,
                    cursor: onDateClick ? "pointer" : "default",
                  }}
                  onClick={() =>
                    onDateClick?.(
                      `${isoDate(d)}T${pad2(DAY_HOURS_START + i)}:00`,
                    )
                  }
                />
              ))}
              {dayLayout.map((l, i) => (
                <button
                  key={`${l.ev.id}-${i}`}
                  type="button"
                  className={`wv-event status-${(l.status || "").toLowerCase() || "pending"}`}
                  style={
                    {
                      top: l.topPx,
                      height: l.heightPx,
                      ["--ev-color" as never]: l.color,
                      ["--ev-bg" as never]: `color-mix(in srgb, ${l.color} 10%, var(--paper-strip))`,
                    } as React.CSSProperties
                  }
                  onClick={() => onEventClick?.(clickedFrom(l.ev))}
                  title={normalizeMojibakeText(l.ev.title)}
                >
                  <div className="wv-event-time">
                    <span>{fmtTimeRange(l.ev)}</span>
                    <span>{durationMinutesLabel(l.ev)}</span>
                  </div>
                  <div className="wv-event-title">{normalizeMojibakeText(l.ev.title)}</div>
                  {l.ev.zipcity ? <div className="wv-event-meta">{l.ev.zipcity}</div> : null}
                </button>
              ))}
              {isToday && nowTop != null ? (
                <div className="wv-now-line" style={{ top: nowTop }}>
                  <div className="wv-now-dot" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────  Month View  ───────────────────────── */

function MonthView({
  anchor,
  events,
  today,
  onEventClick,
  onDateClick: _onDateClick,
  onPickDay,
  forecastByDate,
}: {
  anchor: Date;
  events: CalendarEvent[];
  today: Date;
  onEventClick?: (e: CalendarClickedEvent) => void;
  onDateClick?: (iso: string) => void;
  onPickDay?: (iso: string) => void;
  forecastByDate?: ReadonlyMap<string, WeatherForecastDay> | null;
}) {
  const monthStart = useMemo(() => startOfMonth(anchor), [anchor]);
  const gridStart = useMemo(() => startOfMonthGrid(anchor), [anchor]);
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (!ev.start) continue;
      const k = String(ev.start).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const arr = m.get(k) ?? [];
      arr.push(ev);
      m.set(k, arr);
    }
    return m;
  }, [events]);

  return (
    <div className="month-view">
      <div className="mv-dow-row">
        {DOW_LONG.map((d) => (
          <div key={d} className="mv-dow">
            {d}
          </div>
        ))}
      </div>
      <div className="mv-grid">
        {cells.map((d) => {
          const iso = isoDate(d);
          const inMonth = d.getMonth() === monthStart.getMonth();
          const isToday = isSameDay(d, today);
          const fc = forecastByDate?.get(iso) ?? null;
          const dayEvents = eventsByDay.get(iso) ?? [];
          const visible = dayEvents.slice(0, 3);
          const more = Math.max(0, dayEvents.length - visible.length);
          return (
            <div
              key={iso}
              className={`mv-cell${inMonth ? "" : " out"}${isToday ? " today" : ""}`}
              onClick={() => onPickDay?.(iso)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onPickDay?.(iso);
              }}
            >
              <div className="mv-cell-head">
                <span className="mv-num">{d.getDate()}</span>
                {fc ? (
                  <span className="mv-wx" data-wx={fc.kind}>
                    <span aria-hidden>{weatherEmoji(fc.kind)}</span>
                    <span>{fc.t_max}°</span>
                  </span>
                ) : null}
              </div>
              <div className="mv-events">
                {visible.map((ev, i) => {
                  const status = String(ev.status || "");
                  const color = getStatusEventColor(status);
                  const label = getStatusEntry(status).label;
                  return (
                    <button
                      key={`${ev.id}-${i}`}
                      type="button"
                      className="mv-event"
                      title={`${label} · ${normalizeMojibakeText(ev.title)}`}
                      style={
                        {
                          ["--ev-color" as never]: color,
                          ["--ev-bg" as never]: `color-mix(in srgb, ${color} 10%, var(--paper-strip))`,
                        } as React.CSSProperties
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(clickedFrom(ev));
                      }}
                    >
                      <span className="mv-event-time">{fmtTimeRange(ev).slice(0, 5)}</span>
                      <span className="mv-event-title">{normalizeMojibakeText(ev.title)}</span>
                    </button>
                  );
                })}
                {more > 0 ? <span className="mv-more">+{more} weitere</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { DOW_SHORT };
