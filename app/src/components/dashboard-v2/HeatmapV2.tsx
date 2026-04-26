import { useMemo, useState, type ReactElement } from "react";
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
type WxKind = "sun" | "psun" | "cloud" | "rain" | "storm" | "fog";

interface DayWx {
  kind: WxKind;
  tHigh: number;
  tLow: number;
  precip: number;
}

interface ApptWx {
  kind: WxKind;
  t: number;
}

const MS_DAY = 86_400_000;

const WX_KINDS: WxKind[] = ["sun", "psun", "psun", "cloud", "cloud", "rain", "fog", "storm"];

const WX_LABELS: Record<Lang, Record<WxKind, string>> = {
  de: { sun: "Sonnig", psun: "Heiter", cloud: "Bewölkt", rain: "Regen", storm: "Gewitter", fog: "Nebel" },
  en: { sun: "Sunny", psun: "Partly sunny", cloud: "Cloudy", rain: "Rain", storm: "Storm", fog: "Fog" },
  fr: { sun: "Ensoleillé", psun: "Éclaircies", cloud: "Nuageux", rain: "Pluie", storm: "Orage", fog: "Brouillard" },
  it: { sun: "Soleggiato", psun: "Variabile", cloud: "Nuvoloso", rain: "Pioggia", storm: "Temporale", fog: "Nebbia" },
};

const WX_ICONS: Record<WxKind, ReactElement> = {
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4" />
    </svg>
  ),
  psun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />
      <path d="M8 1.5v1.5M1.5 8h1.5M3.3 3.3l1.1 1.1M12.7 3.3l-1.1 1.1" />
      <path d="M8 14a4 4 0 0 0 0 8h8a4 4 0 0 0 .5-7.97A6 6 0 0 0 5 13a4 4 0 0 0 3 1Z" fill="rgba(255,255,255,0.6)" />
    </svg>
  ),
  cloud: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 18a5 5 0 0 1 0-10 6 6 0 0 1 11.5 1.5A4.5 4.5 0 0 1 18 18Z" fill="currentColor" fillOpacity="0.15" />
    </svg>
  ),
  rain: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 14a5 5 0 0 1 0-10 6 6 0 0 1 11.5 1.5A4.5 4.5 0 0 1 18 14Z" fill="currentColor" fillOpacity="0.15" />
      <path d="M9 17l-1 4M13 17l-1 4M17 17l-1 4" />
    </svg>
  ),
  storm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 13a5 5 0 0 1 0-10 6 6 0 0 1 11.5 1.5A4.5 4.5 0 0 1 18 13Z" fill="currentColor" fillOpacity="0.15" />
      <path d="m12 14-3 5h3l-2 4 5-6h-3l2-3Z" fill="currentColor" fillOpacity="0.4" />
    </svg>
  ),
  fog: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 9h18M5 13h14M3 17h16M7 21h12" />
    </svg>
  ),
};

// Deterministic synthetic weather (no API) — ISO week + weekday seed.
function getDayWeather(isoWeek: number, weekday: number): DayWx {
  const k = (isoWeek * 13 + weekday * 7 + 3) % WX_KINDS.length;
  const kind = WX_KINDS[k];
  const tHigh = 8 + ((isoWeek * 5 + weekday * 3) % 18); // 8-25°C
  const tLow = tHigh - 4 - ((isoWeek + weekday) % 4);
  const precip =
    kind === "rain" || kind === "storm"
      ? 60 + ((weekday * 7) % 40)
      : kind === "cloud"
        ? 10 + ((weekday * 3) % 15)
        : 0;
  return { kind, tHigh, tLow, precip };
}

// Per-appointment weather — slight drift by hour + area seed.
function getApptWeather(isoWeek: number, weekday: number, hour: number, areaSeed: number): ApptWx {
  const baseKind = WX_KINDS[(isoWeek * 13 + weekday * 7 + 3) % WX_KINDS.length];
  const drift = (hour >= 14 ? 1 : 0) + (areaSeed % 3 === 0 ? 1 : 0);
  const idx = WX_KINDS.indexOf(baseKind);
  const kind = WX_KINDS[Math.max(0, Math.min(WX_KINDS.length - 1, idx + drift - 1))];
  const t = 6 + ((isoWeek * 3 + weekday * 5 + hour) % 22);
  return { kind, t };
}

function areaSeedFor(o: Order): number {
  return (o.customerZipcity ?? "").charCodeAt(0) || 0;
}

// Weather badge with hover tooltip.
function WxBadge({
  wx,
  size,
  anchor,
  lang,
}: {
  wx: DayWx | ApptWx;
  size?: "sm" | "md";
  anchor?: "left" | "right";
  lang: Lang;
}) {
  const cls = [
    "dv2-wx-badge",
    size === "sm" ? "dv2-wx-badge--sm" : size === "md" ? "dv2-wx-badge--md" : "",
    anchor === "left" ? "is-left" : anchor === "right" ? "is-right" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const high = "tHigh" in wx ? wx.tHigh : wx.t;
  const low = "tLow" in wx ? wx.tLow : null;
  const precip = "precip" in wx ? wx.precip : null;
  const labels = WX_LABELS[lang] ?? WX_LABELS.de;
  return (
    <span className={cls} data-wx={wx.kind} tabIndex={0} aria-label={labels[wx.kind]}>
      {WX_ICONS[wx.kind]}
      <span className="dv2-wx-pop" role="tooltip">
        <span className="dv2-wx-pop-head">
          <span className="dv2-wx-pop-icon" data-wx={wx.kind}>{WX_ICONS[wx.kind]}</span>
          <span className="dv2-wx-pop-temps">
            <strong>{high}°C</strong>
            {low != null && <span>↓ {low}°</span>}
          </span>
        </span>
        <dl className="dv2-wx-pop-body">
          <dt>{t(lang, "dashboardV2.heatmap.wx.condition")}</dt>
          <dd>{labels[wx.kind]}</dd>
          {precip != null && precip > 0 && (
            <>
              <dt>{t(lang, "dashboardV2.heatmap.wx.precip")}</dt>
              <dd>{precip} %</dd>
            </>
          )}
          {low != null && (
            <>
              <dt>{t(lang, "dashboardV2.heatmap.wx.range")}</dt>
              <dd>{low}° – {high}°</dd>
            </>
          )}
        </dl>
      </span>
    </span>
  );
}

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

      {view === "month" && (
        <MonthView
          metrics={metrics}
          orders={orders}
          dowShort={dowShort}
          dowLong={dowLong}
          lang={lang}
          onApptClick={(o) => navigate(`/orders/${o.orderNo}`)}
        />
      )}
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
          dayDate={dayDate}
          isToday={isOnToday}
          onApptClick={(o) => navigate(`/orders/${o.orderNo}`)}
          lang={lang}
        />
      )}
    </section>
  );
}

// ── Month view (existing heatmap with Mon-Sun grid + week labels)
function MonthView({
  metrics,
  orders,
  dowShort,
  dowLong,
  lang,
  onApptClick,
}: {
  metrics: DashboardMetrics;
  orders: Order[];
  dowShort: string[];
  dowLong: string[];
  lang: Lang;
  onApptClick: (o: Order) => void;
}) {
  const { heatmapData, maxDayCount, daysInMonth, firstDayOfWeek, currMonth, currYear, today } = metrics;
  const todayDay =
    today.getMonth() === currMonth && today.getFullYear() === currYear ? today.getDate() : -1;

  type Cell = {
    day: number | null;
    lvl: 0 | 1 | 2 | 3 | 4;
    wx?: DayWx;
    weekday?: number;
    isoWeek?: number;
    count?: number;
  };

  const cells: Cell[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: null, lvl: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(currYear, currMonth, d);
    const weekday = (date.getDay() + 6) % 7;
    const isoWeek = getISOWeek(date);
    const count = heatmapData[d] ?? 0;
    cells.push({
      day: d,
      lvl: intensity(count, maxDayCount),
      wx: getDayWeather(isoWeek, weekday),
      weekday,
      isoWeek,
      count,
    });
  }

  function ordersForDay(day: number): Order[] {
    return orders
      .filter((o) => {
        if (!o.appointmentDate) return false;
        if (statusMatches(o.status, "cancelled") || statusMatches(o.status, "archived")) return false;
        const d = new Date(o.appointmentDate);
        return d.getFullYear() === currYear && d.getMonth() === currMonth && d.getDate() === day;
      })
      .sort(byTime);
  }

  return (
    <>
      <div className="dv2-heatmap-dow">
        {dowShort.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="dv2-heatmap-grid">
        {cells.map((c, i) => {
          if (c.day === null) {
            return <div key={`pad-${i}`} className="dv2-heatmap-cell dv2-heatmap-cell--empty" />;
          }
          const dayAppts = c.count && c.count > 0 ? ordersForDay(c.day) : [];
          const popAnchorRight = c.weekday != null && c.weekday >= 5;
          const popAnchorLeft = c.weekday === 0;
          return (
            <div
              key={c.day}
              data-lv={c.lvl}
              className={[
                "dv2-heatmap-cell",
                `dv2-heatmap-cell--l${c.lvl}`,
                c.day === todayDay ? "dv2-heatmap-cell--today" : "",
                c.count && c.count > 0 ? "dv2-heatmap-cell--has" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {c.wx && (
                <span className="dv2-hm-wx" data-wx={c.wx.kind}>{WX_ICONS[c.wx.kind]}</span>
              )}
              <span className="dv2-hm-num">{c.day}</span>
              {c.count && c.count > 0 && c.wx && c.weekday != null && c.isoWeek != null && (
                <div
                  className={[
                    "dv2-hm-pop",
                    popAnchorLeft ? "is-left" : "",
                    popAnchorRight ? "is-right" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="tooltip"
                >
                  <div className="dv2-hm-pop-head">
                    <div>
                      <strong>{dowLong[c.weekday]}</strong>
                      <span className="dv2-hm-pop-meta">
                        {t(lang, "dashboardV2.heatmap.weekLabel").replace("{{kw}}", String(c.isoWeek))} ·{" "}
                        {t(lang, "dashboardV2.heatmap.dayTotal").replace("{{n}}", String(c.count))}
                      </span>
                    </div>
                    <div className="dv2-hm-pop-wx" data-wx={c.wx.kind}>
                      {WX_ICONS[c.wx.kind]}
                      <span>
                        {c.wx.tHigh}°<span className="dv2-hm-pop-low">/{c.wx.tLow}°</span>
                      </span>
                    </div>
                  </div>
                  <div className="dv2-hm-pop-list">
                    {dayAppts.slice(0, 6).map((o) => {
                      const start = new Date(o.appointmentDate ?? "");
                      const aWx = getApptWeather(c.isoWeek!, c.weekday!, start.getHours(), areaSeedFor(o));
                      return (
                        <button
                          type="button"
                          key={o.orderNo}
                          className={`dv2-hm-pop-row ${statusClass(o.status)}`}
                          onClick={() => onApptClick(o)}
                        >
                          <span className="dv2-hm-pop-time">
                            {timeHHMM(start)}
                            <span className="dv2-hm-pop-dur">·{durationMin(o)}′</span>
                          </span>
                          <span className="dv2-hm-pop-info">
                            <span className="dv2-hm-pop-cust">{o.customerName ?? `#${o.orderNo}`}</span>
                            <span className="dv2-hm-pop-area">{o.customerZipcity ?? "—"}</span>
                          </span>
                          <span className="dv2-hm-pop-wx-mini" data-wx={aWx.kind}>
                            {WX_ICONS[aWx.kind]}
                          </span>
                        </button>
                      );
                    })}
                    {dayAppts.length > 6 && (
                      <div className="dv2-hm-pop-more">
                        +{dayAppts.length - 6} {t(lang, "dashboardV2.heatmap.more")}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
        const isoWeek = getISOWeek(colDate);
        const dWx = getDayWeather(isoWeek, i);
        const anchor: "left" | "right" | undefined =
          i === 0 ? "left" : i >= 5 ? "right" : undefined;
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
                <span className="dv2-week-col-wx">
                  <WxBadge wx={dWx} anchor={anchor} lang={lang} />
                  <span className="dv2-week-col-temp">
                    {dWx.tHigh}°<span className="dv2-week-col-low">/{dWx.tLow}°</span>
                  </span>
                  {dWx.precip > 0 && (
                    <span className="dv2-week-col-precip">{dWx.precip}%</span>
                  )}
                </span>
              </div>
              <span className="dv2-week-col-count">{list.length}</span>
            </header>
            <div className="dv2-week-col-body">
              {list.length === 0 ? (
                <div className="dv2-week-empty">—</div>
              ) : (
                list.map((o) => {
                  const start = new Date(o.appointmentDate ?? "");
                  const aWx = getApptWeather(isoWeek, i, start.getHours(), areaSeedFor(o));
                  return (
                    <button
                      type="button"
                      key={o.orderNo}
                      className={`dv2-week-appt ${statusClass(o.status)}`}
                      onClick={() => onApptClick(o)}
                    >
                      <div className="dv2-week-appt-row">
                        <div className="dv2-week-appt-time">
                          {timeHHMM(start)}
                          <span className="dv2-week-appt-dur">· {durationMin(o)}{t(lang, "dashboardV2.heatmap.minutesShort")}</span>
                        </div>
                        <WxBadge wx={aWx} anchor={anchor} lang={lang} />
                      </div>
                      <div className="dv2-week-appt-cust">
                        {o.customerName ?? `#${o.orderNo}`}
                      </div>
                      <div className="dv2-week-appt-area">{o.customerZipcity ?? "—"}</div>
                    </button>
                  );
                })
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
  dayDate,
  isToday,
  onApptClick,
  lang,
}: {
  appts: Order[];
  dayDate: Date;
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

  const dayIsoWeek = getISOWeek(dayDate);
  const dayWeekday = (dayDate.getDay() + 6) % 7;
  const dayWx = getDayWeather(dayIsoWeek, dayWeekday);
  const labels = WX_LABELS[lang] ?? WX_LABELS.de;

  return (
    <>
      <div className="dv2-day-wx" data-wx={dayWx.kind}>
        <span className="dv2-day-wx-icon">{WX_ICONS[dayWx.kind]}</span>
        <div className="dv2-day-wx-info">
          <strong>{dayWx.tHigh}°C</strong>
          <span>
            ↓{dayWx.tLow}° · {dayWx.precip}% · {labels[dayWx.kind]}
          </span>
        </div>
      </div>
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
              const aWx = getApptWeather(dayIsoWeek, dayWeekday, start.getHours(), areaSeedFor(o));
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
                  <div className="dv2-day-appt-meta">
                    <span>{o.customerZipcity ?? "—"}</span>
                    <WxBadge wx={aWx} size="md" anchor="right" lang={lang} />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
