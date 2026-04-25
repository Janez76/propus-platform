import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t, type Lang } from "../../i18n";
import { statusMatches } from "../../lib/status";
import type { Order } from "../../api/orders";
import type { DashboardMetrics } from "./useDashboardMetrics";

interface HeatmapV2Props {
  metrics: DashboardMetrics;
  orders: Order[];
  lang: Lang;
}

type ViewMode = "day" | "week" | "month";

const MS_DAY = 86_400_000;

const MONTHS_LONG: Record<Lang, string[]> = {
  de: ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  fr: ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],
  it: ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],
};

const DOW_SHORT: Record<Lang, string[]> = {
  de: ["Mo","Di","Mi","Do","Fr","Sa","So"],
  en: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
  fr: ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"],
  it: ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"],
};

const DOW_LONG: Record<Lang, string[]> = {
  de: ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"],
  en: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
  fr: ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"],
  it: ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"],
};

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = r.getDay();
  r.setDate(r.getDate() - ((day + 6) % 7)); // Monday
  return r;
}
function getISOWeek(d: Date): number {
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const jan4 = new Date(tmp.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((tmp.getTime() - jan4.getTime()) / MS_DAY - 3 + ((jan4.getDay() + 6) % 7)) / 7,
    )
  );
}

function intensity(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  const ratio = count / Math.max(1, max);
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

function timeHHMM(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function durationMin(o: Order): number {
  return o.schedule?.durationMin ?? 60;
}

function statusClass(status: string): string {
  if (statusMatches(status, "confirmed")) return "is-confirmed";
  if (statusMatches(status, "completed") || statusMatches(status, "done")) return "is-completed";
  if (statusMatches(status, "provisional")) return "is-provisional";
  if (statusMatches(status, "pending")) return "is-pending";
  if (statusMatches(status, "paused")) return "is-paused";
  if (statusMatches(status, "cancelled") || statusMatches(status, "archived")) return "is-cancelled";
  return "";
}

function formatDayShort(d: Date, lang: Lang): string {
  const month = MONTHS_LONG[lang][d.getMonth()].slice(0, 3);
  return `${d.getDate().toString().padStart(2, "0")}. ${month}`;
}

function buildAppointmentsByWeekday(orders: Order[], weekStart: Date): Order[][] {
  const cols: Order[][] = Array.from({ length: 7 }, () => []);
  const startMs = weekStart.getTime();
  const endMs = startMs + 7 * MS_DAY;
  for (const o of orders) {
    if (!o.appointmentDate) continue;
    if (statusMatches(o.status, "cancelled") || statusMatches(o.status, "archived")) continue;
    const ts = new Date(o.appointmentDate).getTime();
    if (ts < startMs || ts >= endMs) continue;
    const wd = Math.floor((ts - startMs) / MS_DAY);
    if (wd >= 0 && wd < 7) cols[wd].push(o);
  }
  for (const c of cols) c.sort(byTime);
  return cols;
}

function byTime(a: Order, b: Order): number {
  return new Date(a.appointmentDate ?? 0).getTime() - new Date(b.appointmentDate ?? 0).getTime();
}

export function HeatmapV2({ metrics, orders, lang }: HeatmapV2Props) {
  const [view, setView] = useState<ViewMode>("month");
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOffset, setDayOffset] = useState(0);
  const navigate = useNavigate();

  const today = metrics.today;
  const dowShort = DOW_SHORT[lang] ?? DOW_SHORT.de;
  const dowLong = DOW_LONG[lang] ?? DOW_LONG.de;
  const months = MONTHS_LONG[lang] ?? MONTHS_LONG.de;

  // ── Week-base
  const baseWeekStart = useMemo(() => {
    const ws = startOfWeek(today);
    ws.setDate(ws.getDate() + weekOffset * 7);
    return ws;
  }, [today, weekOffset]);
  const baseWeekEnd = useMemo(() => {
    const we = new Date(baseWeekStart);
    we.setDate(we.getDate() + 6);
    return we;
  }, [baseWeekStart]);
  const baseWeekNo = getISOWeek(baseWeekStart);

  // ── Selected day
  const dayDate = useMemo(() => {
    const d = startOfDay(today);
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [today, dayOffset]);

  // ── Appointments per weekday for current week (used by Week view)
  const weekAppts = useMemo(
    () => buildAppointmentsByWeekday(orders, baseWeekStart),
    [orders, baseWeekStart],
  );

  // ── Day appointments (filtered)
  const dayAppts = useMemo(() => {
    const start = startOfDay(dayDate).getTime();
    const end = start + MS_DAY;
    return orders
      .filter((o) => {
        if (!o.appointmentDate) return false;
        if (statusMatches(o.status, "cancelled") || statusMatches(o.status, "archived")) return false;
        const ts = new Date(o.appointmentDate).getTime();
        return ts >= start && ts < end;
      })
      .sort(byTime);
  }, [orders, dayDate]);

  // ── Range labels
  const weekDateLabel = `${formatDayShort(baseWeekStart, lang)} – ${formatDayShort(baseWeekEnd, lang)}`;
  const dayDateLabel = `${dayDate.getDate()}. ${months[dayDate.getMonth()]} ${dayDate.getFullYear()}`;
  const isOnToday = weekOffset === 0 && dayOffset === 0;
  const todayDow = ((today.getDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  function goPrev() {
    if (view === "day") setDayOffset((o) => o - 1);
    else if (view === "week") setWeekOffset((o) => o - 1);
    else setWeekOffset((o) => o - 4);
  }
  function goNext() {
    if (view === "day") setDayOffset((o) => o + 1);
    else if (view === "week") setWeekOffset((o) => o + 1);
    else setWeekOffset((o) => o + 4);
  }
  function goToday() {
    setWeekOffset(0);
    setDayOffset(0);
  }

  return (
    <section className="dv2-card dv2-heatmap-card">
      <div className="dv2-heatmap-head">
        <div>
          <div className="dv2-card-title">{t(lang, "dashboardV2.heatmap.title")}</div>
          <div className="dv2-heatmap-subtitle">
            {view === "month" && (
              <>
                {months[metrics.currMonth]} {metrics.currYear} · {t(lang, "dashboardV2.heatmap.subtitle")}
              </>
            )}
            {view === "week" && (
              <>
                {t(lang, "dashboardV2.heatmap.weekLabel").replace("{{kw}}", String(baseWeekNo))} ·{" "}
                {weekDateLabel} ·{" "}
                {t(lang, "dashboardV2.heatmap.weekTotal").replace(
                  "{{n}}",
                  String(weekAppts.reduce((s, c) => s + c.length, 0)),
                )}
              </>
            )}
            {view === "day" && (
              <>
                {dowLong[((dayDate.getDay() + 6) % 7)]} · {dayDateLabel} ·{" "}
                {t(lang, "dashboardV2.heatmap.dayTotal").replace(
                  "{{n}}",
                  String(dayAppts.length),
                )}
              </>
            )}
          </div>
        </div>
        <div className="dv2-heatmap-controls">
          <div className="dv2-heatmap-views">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`dv2-heatmap-view${view === v ? " is-active" : ""}`}
                onClick={() => setView(v)}
              >
                {t(lang, `dashboardV2.heatmap.view.${v}`)}
              </button>
            ))}
          </div>
          <div className="dv2-heatmap-nav">
            <button type="button" className="dv2-heatmap-nav-btn" onClick={goPrev} aria-label={t(lang, "dashboardV2.heatmap.prev")}>
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className={`dv2-heatmap-nav-today${isOnToday ? " is-on" : ""}`}
              onClick={goToday}
            >
              {t(lang, "dashboardV2.heatmap.today")}
            </button>
            <button type="button" className="dv2-heatmap-nav-btn" onClick={goNext} aria-label={t(lang, "dashboardV2.heatmap.next")}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {view === "month" && <MonthView metrics={metrics} dowShort={dowShort} />}
      {view === "week" && (
        <WeekView
          appts={weekAppts}
          dowLong={dowLong}
          baseWeekStart={baseWeekStart}
          isCurrentWeek={weekOffset === 0}
          todayDow={todayDow}
          onApptClick={(o) => navigate(`/orders/${o.orderNo}`)}
          lang={lang}
        />
      )}
      {view === "day" && (
        <DayView
          appts={dayAppts}
          isToday={isOnToday}
          onApptClick={(o) => navigate(`/orders/${o.orderNo}`)}
          lang={lang}
        />
      )}
    </section>
  );
}

// ── Month view (existing heatmap with Mon-Sun grid + week labels)
function MonthView({ metrics, dowShort }: { metrics: DashboardMetrics; dowShort: string[] }) {
  const { heatmapData, maxDayCount, daysInMonth, firstDayOfWeek, currMonth, currYear, today } = metrics;
  const todayDay =
    today.getMonth() === currMonth && today.getFullYear() === currYear ? today.getDate() : -1;

  const cells: Array<{ day: number | null; lvl: 0 | 1 | 2 | 3 | 4 }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: null, lvl: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, lvl: intensity(heatmapData[d] ?? 0, maxDayCount) });
  }

  return (
    <>
      <div className="dv2-heatmap-dow">
        {dowShort.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="dv2-heatmap-grid">
        {cells.map((c, i) =>
          c.day === null ? (
            <div key={`pad-${i}`} className="dv2-heatmap-cell dv2-heatmap-cell--empty" />
          ) : (
            <div
              key={c.day}
              className={[
                "dv2-heatmap-cell",
                `dv2-heatmap-cell--l${c.lvl}`,
                c.day === todayDay ? "dv2-heatmap-cell--today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {c.day}
            </div>
          ),
        )}
      </div>
    </>
  );
}

// ── Week view — 7 columns of stacked appointments
function WeekView({
  appts,
  dowLong,
  baseWeekStart,
  isCurrentWeek,
  todayDow,
  onApptClick,
  lang,
}: {
  appts: Order[][];
  dowLong: string[];
  baseWeekStart: Date;
  isCurrentWeek: boolean;
  todayDow: number;
  onApptClick: (o: Order) => void;
  lang: Lang;
}) {
  return (
    <div className="dv2-week-grid">
      {dowLong.map((label, i) => {
        const colDate = new Date(baseWeekStart);
        colDate.setDate(colDate.getDate() + i);
        const isWeekend = i >= 5;
        const isToday = isCurrentWeek && i === todayDow;
        const list = appts[i];
        return (
          <div
            key={label}
            className={`dv2-week-col${isToday ? " is-today" : ""}${isWeekend ? " is-weekend" : ""}`}
          >
            <header className="dv2-week-col-head">
              <div className="dv2-week-col-title">
                <span className="dv2-week-col-day">{label}</span>
                <span className="dv2-week-col-date">
                  {colDate.getDate().toString().padStart(2, "0")}.{(colDate.getMonth() + 1)
                    .toString()
                    .padStart(2, "0")}
                </span>
              </div>
              <span className="dv2-week-col-count">{list.length}</span>
            </header>
            <div className="dv2-week-col-body">
              {list.length === 0 ? (
                <div className="dv2-week-empty">—</div>
              ) : (
                list.map((o) => (
                  <button
                    type="button"
                    key={o.orderNo}
                    className={`dv2-week-appt ${statusClass(o.status)}`}
                    onClick={() => onApptClick(o)}
                  >
                    <div className="dv2-week-appt-time">
                      {timeHHMM(new Date(o.appointmentDate ?? ""))}
                      <span className="dv2-week-appt-dur">· {durationMin(o)}{t(lang, "dashboardV2.heatmap.minutesShort")}</span>
                    </div>
                    <div className="dv2-week-appt-cust">
                      {o.customerName ?? `#${o.orderNo}`}
                    </div>
                    <div className="dv2-week-appt-area">{o.customerZipcity ?? "—"}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Day view — hour grid with absolutely-positioned appointment blocks
function DayView({
  appts,
  isToday,
  onApptClick,
  lang,
}: {
  appts: Order[];
  isToday: boolean;
  onApptClick: (o: Order) => void;
  lang: Lang;
}) {
  const HOURS = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 7), []); // 7..18
  const SLOT_H = 56;
  const GRID_START = 7 * 60;
  const GRID_END = 19 * 60;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= GRID_START && nowMin <= GRID_END;
  const pxFor = (m: number) => ((m - GRID_START) / 60) * SLOT_H;

  return (
    <div className="dv2-day-body">
      <div className="dv2-day-hours">
        {HOURS.map((h) => (
          <div key={h} className="dv2-day-hour-row" style={{ height: SLOT_H }}>
            <span className="dv2-day-hour-label">{`${String(h).padStart(2, "0")}:00`}</span>
            <div className="dv2-day-hour-line" />
          </div>
        ))}
      </div>
      <div className="dv2-day-track">
        {showNow && (
          <div className="dv2-day-now-line" style={{ top: pxFor(nowMin) }}>
            <span className="dv2-day-now-dot" />
            <span className="dv2-day-now-label">{timeHHMM(now)}</span>
          </div>
        )}
        {appts.length === 0 ? (
          <div className="dv2-day-empty">{t(lang, "dashboardV2.heatmap.dayEmpty")}</div>
        ) : (
          appts.map((o) => {
            const start = new Date(o.appointmentDate ?? "");
            const startMin = start.getHours() * 60 + start.getMinutes();
            if (startMin < GRID_START || startMin > GRID_END) return null;
            const dur = durationMin(o);
            const top = pxFor(startMin);
            const h = (dur / 60) * SLOT_H;
            const endMin = startMin + dur;
            return (
              <button
                type="button"
                key={o.orderNo}
                className={`dv2-day-appt ${statusClass(o.status)}`}
                onClick={() => onApptClick(o)}
                style={{ top, height: h }}
              >
                <div className="dv2-day-appt-time">
                  <strong>{timeHHMM(start)}</strong>
                  <span className="dv2-day-appt-end">
                    – {String(Math.floor(endMin / 60)).padStart(2, "0")}:
                    {String(endMin % 60).padStart(2, "0")}
                  </span>
                  <span className="dv2-day-appt-dur">· {dur}{t(lang, "dashboardV2.heatmap.minutesShort")}</span>
                </div>
                <div className="dv2-day-appt-cust">{o.customerName ?? `#${o.orderNo}`}</div>
                <div className="dv2-day-appt-meta">{o.customerZipcity ?? "—"}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
