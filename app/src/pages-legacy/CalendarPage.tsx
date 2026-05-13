import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  Plus,
  RotateCw,
  User as UserIcon,
} from "lucide-react";
import { assignPhotographer, getOrders, rescheduleOrder, updateOrderStatus, type Order } from "../api/orders";
import { OrderStatusSelect } from "../components/orders/OrderStatusSelect";
import { getPhotographers, type Photographer } from "../api/photographers";
import {
  getCalendarEventsWithMeta,
  type CalendarEvent,
  type CalendarOutlookMeta,
  type CalendarBkbnMeta,
} from "../api/calendar";
import { OrdersMap } from "../components/dashboard-v2/OrdersMap";
import "../components/dashboard-v2/dashboard-v2.css";
import { type CalendarClickedEvent, normalizeMojibakeText } from "../components/calendar/CalendarView";
import { CalMiniMonth } from "../components/calendar/CalMiniMonth";
type CalendarViewKind = "day" | "week" | "month";
import {
  getWeatherForecast,
  indexForecastByDate,
  weatherEmoji,
  type WeatherForecastDay,
} from "../api/weather";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { formatDateTime } from "../lib/utils";
import { getStatusLabel, STATUS_KEYS, statusMatches } from "../lib/status";
import "../styles/calendar-page.css";

const STATUS_DOT_COLOR: Record<string, string> = {
  pending: "var(--orange)",
  provisional: "var(--indigo)",
  disposition_offen: "var(--purple)",
  confirmed: "var(--blue)",
  paused: "var(--text-4)",
  completed: "var(--orange)",
  done: "var(--green)",
  cancelled: "var(--red)",
  archived: "var(--teal)",
};

function addDaysDate(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}
function startOfWeekMon(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return r;
}
function fmtRangeLabel(anchor: Date, view: CalendarViewKind): string {
  if (view === "day") {
    return new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "long", year: "numeric" }).format(anchor);
  }
  if (view === "week") {
    const ws = startOfWeekMon(anchor);
    const we = addDaysDate(ws, 6);
    const sameMonth = ws.getMonth() === we.getMonth();
    const left = sameMonth
      ? `${ws.getDate()}.`
      : `${ws.getDate()}. ${new Intl.DateTimeFormat("de-CH", { month: "short" }).format(ws)}`;
    const right = new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "long", year: "numeric" }).format(we);
    return `${left} – ${right}`;
  }
  return new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric" }).format(anchor);
}

const HOUR_HEIGHT = 52;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 20; // 13 visible slots: 07..19

function evTone(ev: CalendarEvent): string {
  if (ev.type === "outlook") return "outlook";
  if (ev.type === "bkbn" || ev.source === "bkbn") return "bkbn";
  const s = (ev.status || "").toLowerCase();
  if (s === "confirmed") return "bestaetigt";
  if (s === "pending" || s === "disposition_offen") return "ausstehend";
  if (s === "provisional") return "provisorisch";
  if (s === "done" || s === "archived") return "erledigt";
  if (s === "completed") return "ausstehend";
  if (s === "paused") return "paused";
  if (s === "cancelled") return "cancelled";
  return "bestaetigt";
}

function fmtHHmm(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function isoDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function evPosition(ev: CalendarEvent): { top: number; height: number; clippedTop: boolean; clippedBottom: boolean } | null {
  if (!ev.start || ev.allDay) return null;
  const s = new Date(ev.start);
  if (Number.isNaN(s.getTime())) return null;
  const e = ev.end ? new Date(ev.end) : new Date(s.getTime() + 60 * 60_000);
  if (Number.isNaN(e.getTime())) return null;
  // Window in minutes relative to DAY_START_HOUR
  const totalMin = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const rawStart = (s.getHours() * 60 + s.getMinutes()) - DAY_START_HOUR * 60;
  const rawEnd = Math.max(rawStart + 15, (e.getHours() * 60 + e.getMinutes()) - DAY_START_HOUR * 60);
  // Drop events entirely outside the visible window
  if (rawEnd <= 0 || rawStart >= totalMin) return null;
  const clippedTop = rawStart < 0;
  const clippedBottom = rawEnd > totalMin;
  const startMin = Math.max(0, rawStart);
  const endMin = Math.min(totalMin, rawEnd);
  const top = (startMin / 60) * HOUR_HEIGHT;
  const height = Math.max(22, ((endMin - startMin) / 60) * HOUR_HEIGHT);
  return { top, height, clippedTop, clippedBottom };
}

function nowLineTop(): number | null {
  const now = new Date();
  const hour = now.getHours();
  if (hour < DAY_START_HOUR || hour >= DAY_END_HOUR) return null;
  return ((hour - DAY_START_HOUR) + now.getMinutes() / 60) * HOUR_HEIGHT;
}

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events
    .filter((ev) => {
      if (!ev.start) return false;
      const s = new Date(ev.start);
      return !Number.isNaN(s.getTime()) && sameDay(s, day);
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function toClicked(ev: CalendarEvent): CalendarClickedEvent {
  return {
    id: ev.id,
    title: ev.title,
    start: ev.start,
    end: ev.end,
    allDay: ev.allDay,
    type: ev.type,
    source: ev.source,
    orderNo: ev.orderNo != null ? String(ev.orderNo) : undefined,
    address: ev.address,
    photographerKey: ev.photographerKey,
    photographerName: ev.photographerName,
    grund: ev.grund,
    status: ev.status,
    category: ev.category,
    bodyPreview: ev.bodyPreview,
    webLink: ev.webLink,
    showAs: ev.showAs,
    mailbox: ev.mailbox,
    mailboxes: ev.mailboxes,
    organizerEmail: ev.organizerEmail,
    organizerName: ev.organizerName,
    color: ev.color,
  };
}

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 65% 60%), hsl(${(hue + 24) % 360} 60% 42%))`;
}
function initialsFor(name?: string | null, key?: string | null): string {
  const src = name?.trim() || key?.trim() || "";
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase() || src.charAt(0).toUpperCase();
}

const DEFAULT_STATUS_EMAIL_TARGETS = {
  customer: false,
  office: false,
  photographer: false,
  cc: false,
};

function toDateTimeLocal(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const OUTLOOK_TOGGLE_KEY = "calendar.showOutlook";
const OUTLOOK_CATEGORY_KEY = "calendar.outlookCategory";
const BKBN_TOGGLE_KEY = "calendar.showBkbn";

function readBoolStorage(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function readStringStorage(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

function isoDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CalendarPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [filter, setFilter] = useState("all");
  const [photographerFilter, setPhotographerFilter] = useState("all");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CalendarClickedEvent | null>(null);
  const [status, setStatus] = useState("pending");
  const [originalStatus, setOriginalStatus] = useState("pending");
  const [sendStatusEmails, setSendStatusEmails] = useState(false);
  const [statusEmailTargets, setStatusEmailTargets] = useState(DEFAULT_STATUS_EMAIL_TARGETS);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [photographerKey, setPhotographerKey] = useState("");
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>(undefined);
  const [miniMonthAnchor, setMiniMonthAnchor] = useState(() => new Date());
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  const [calendarView, setCalendarView] = useState<CalendarViewKind>("week");
  const [forecastByDate, setForecastByDate] = useState<ReadonlyMap<string, WeatherForecastDay>>(
    () => new Map(),
  );
  const [showOutlook, setShowOutlook] = useState<boolean>(() => readBoolStorage(OUTLOOK_TOGGLE_KEY, true));
  const [outlookCategory, setOutlookCategory] = useState<string>(() =>
    readStringStorage(OUTLOOK_CATEGORY_KEY, "all"),
  );
  const [outlookMeta, setOutlookMeta] = useState<CalendarOutlookMeta | null>(null);
  const [showBkbn, setShowBkbn] = useState<boolean>(() => readBoolStorage(BKBN_TOGGLE_KEY, true));
  const [bkbnMeta, setBkbnMeta] = useState<CalendarBkbnMeta | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [miniCalOpen, setMiniCalOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!openDropdown && !miniCalOpen) return;
    function onDocClick(e: MouseEvent) {
      const root = toolbarRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) {
        setOpenDropdown(null);
        setMiniCalOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openDropdown, miniCalOpen]);

  const outlookRange = useMemo(() => {
    const base = calendarAnchor;
    const from = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const to = new Date(base.getFullYear(), base.getMonth() + 2, 0);
    return { from: isoDateOnly(from), to: isoDateOnly(to) };
  }, [calendarAnchor]);

  async function load() {
    const [resp, staff, ordersRows] = await Promise.all([
      getCalendarEventsWithMeta(token, {
        includeOutlook: showOutlook,
        includeBkbn: showBkbn,
        outlookFrom: outlookRange.from,
        outlookTo: outlookRange.to,
      }),
      getPhotographers(token),
      getOrders(token).catch(() => [] as Order[]),
    ]);
    setEvents(resp.events);
    setOutlookMeta(resp.outlook ?? null);
    setBkbnMeta(resp.bkbn ?? null);
    setPhotographers(staff);
    setOrders(ordersRows);
  }

  const dateParam = searchParams.get("date");
  useEffect(() => {
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    const [yy, mo, da] = dateParam.split("-").map((x) => Number(x));
    if (!yy || !mo || !da) return;
    const parsed = new Date(yy, mo - 1, da);
    if (Number.isNaN(parsed.getTime())) return;
    setCalendarAnchor(parsed);
    setMiniMonthAnchor(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    setCalendarView("day");
  }, [dateParam]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getCalendarEventsWithMeta(token, {
        includeOutlook: showOutlook,
        includeBkbn: showBkbn,
        outlookFrom: outlookRange.from,
        outlookTo: outlookRange.to,
      }),
      getPhotographers(token),
    ])
      .then(([resp, staff]) => {
        if (!alive) return;
        setEvents(resp.events);
        setOutlookMeta(resp.outlook ?? null);
        setBkbnMeta(resp.bkbn ?? null);
        setPhotographers(staff);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : t(lang, "common.error"));
      });
    return () => { alive = false; };
    // reloadTick is intentional: triggers manual refresh from the toolbar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, showOutlook, showBkbn, outlookRange.from, outlookRange.to, reloadTick]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    getOrders(token)
      .then((rows) => {
        if (alive) setOrders(rows);
      })
      .catch(() => {
        /* Karte ist optional – Fehler werden hier ignoriert. */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(OUTLOOK_TOGGLE_KEY, showOutlook ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [showOutlook]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(BKBN_TOGGLE_KEY, showBkbn ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [showBkbn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(OUTLOOK_CATEGORY_KEY, outlookCategory);
    } catch {
      /* ignore */
    }
  }, [outlookCategory]);

  useEffect(() => {
    let alive = true;
    // Open-Meteo erlaubt nur 16 Tage. Wir starten am Wochenanfang der
    // aktuellen Calendar-Ansicht (oder Heute, falls die Ansicht in der
    // Vergangenheit liegt), damit der heutige Tag immer im geladenen
    // Fenster liegt — sonst zeigt der Header-Chip "—" und die Tag-Header
    // hätten kein Wetter.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = startOfWeekMon(calendarAnchor);
    weekStart.setHours(0, 0, 0, 0);
    const startD = weekStart.getTime() < today.getTime() ? today : weekStart;
    const fromIso = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, "0")}-${String(startD.getDate()).padStart(2, "0")}`;
    getWeatherForecast(token, { from: fromIso, days: 16, region: "zurich" })
      .then((resp) => {
        if (!alive) return;
        setForecastByDate(indexForecastByDate(resp));
      })
      .catch(() => {
        /* Wetter ist optional */
      });
    return () => {
      alive = false;
    };
  }, [token, calendarAnchor]);

  const outlookCategories = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      if (e.type === "outlook" && e.category) set.add(e.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
  }, [events]);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (e.type === "bkbn" || e.source === "bkbn") {
          return showBkbn;
        }
        if (e.type === "outlook") {
          if (!showOutlook) return false;
          if (outlookCategory !== "all" && (e.category || "") !== outlookCategory) return false;
          return true;
        }
        const statusOk = statusMatches(e.status, filter);
        const employeeOk = photographerFilter === "all" || e.photographerKey === photographerFilter;
        return statusOk && employeeOk;
      }),
    [events, filter, photographerFilter, showOutlook, showBkbn, outlookCategory],
  );

  const eventCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered) {
      const d = String(e.start || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [filtered]);

  function openEvent(ev: CalendarClickedEvent) {
    setSelected(ev);
    setStatus(ev.status || "pending");
    setOriginalStatus(ev.status || "pending");
    setSendStatusEmails(false);
    setStatusEmailTargets(DEFAULT_STATUS_EMAIL_TARGETS);
    setScheduleLocal(toDateTimeLocal(ev.start));
    setPhotographerKey(ev.photographerKey || "");
  }

  function toDateInputValue(dateIso: string): string | undefined {
    const date = String(dateIso || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  }

  function openCreateBooking(dateIso?: string) {
    setPrefilledDate(dateIso ? toDateInputValue(dateIso) : undefined);
    setShowCreate(true);
  }

  function prepareNewBooking(dateIso: string) {
    openCreateBooking(dateIso);
  }

  async function saveStatusWithOverride(orderNo: string, nextStatus: string) {
    try {
      await updateOrderStatus(token, orderNo, nextStatus, {
        sendEmails: sendStatusEmails,
        sendEmailTargets: statusEmailTargets,
      });
      return;
    } catch (error) {
      const conflict = error as Error & { code?: string; canOverride?: boolean };
      if (conflict?.code !== "SLOT_OCCUPIED_CAN_OVERRIDE" || !conflict?.canOverride) {
        throw error;
      }
      const shouldOverride = window.confirm("Der Slot ist durch eine andere Buchung belegt. Trotzdem speichern?");
      if (!shouldOverride) {
        const cancelled = new Error("Speichern abgebrochen.");
        (cancelled as Error & { cancelledByUser?: boolean }).cancelledByUser = true;
        throw cancelled;
      }
      await updateOrderStatus(token, orderNo, nextStatus, {
        sendEmails: sendStatusEmails,
        sendEmailTargets: statusEmailTargets,
        forceSlot: true,
        overrideReason: "Admin-Override nach Warnung: Slot belegt",
      });
    }
  }

  async function saveOrderChanges() {
    if (!selected?.orderNo) return;
    const orderNo = String(selected.orderNo);
    const scheduleChanged = scheduleLocal !== toDateTimeLocal(selected.start);
    const photographerChanged = photographerKey !== (selected.photographerKey || "");
    const statusChanged = status !== originalStatus;
    if (!statusChanged && !scheduleChanged && !photographerChanged) return;
    setError("");
    try {
      const cancelled = status.toLowerCase() === "cancelled" || originalStatus.toLowerCase() === "cancelled";
      const paused = status.toLowerCase() === "paused";
      if ((cancelled || paused) && scheduleLocal && scheduleLocal !== toDateTimeLocal(selected.start)) {
        setError(paused ? "Bei Pausierung kann kein neuer Termin gesetzt werden." : t(lang, "calendar.error.cancelledReschedule"));
        return;
      }
      setSaving(true);
      if (statusChanged) {
        await saveStatusWithOverride(orderNo, status);
      }
      if (scheduleLocal) {
        const [date, time] = scheduleLocal.split("T");
        if (!cancelled && !paused && date && time) await rescheduleOrder(token, orderNo, date, time);
        if (!date || !time) {
          setError(t(lang, "orderDetail.error.invalidDateTime"));
          return;
        }
      }
      if (photographerKey) {
        await assignPhotographer(token, orderNo, photographerKey);
      }
      await load();
      setOriginalStatus(status);
      setSendStatusEmails(false);
      setStatusEmailTargets(DEFAULT_STATUS_EMAIL_TARGETS);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      if ((e as Error & { cancelledByUser?: boolean })?.cancelledByUser) {
        setSaving(false);
        return;
      }
      if (status !== originalStatus) {
        setStatus(originalStatus);
      }
      setError(e instanceof Error ? e.message : t(lang, "calendar.error.changeFailed"));
    } finally {
      setSaving(false);
    }
  }

  const selectedHasChanges = selected
    ? status !== originalStatus ||
      scheduleLocal !== toDateTimeLocal(selected.start) ||
      photographerKey !== (selected.photographerKey || "")
    : false;

  // Today's weather for the header chip
  const todayFc = useMemo(() => {
    const d = new Date();
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return forecastByDate.get(k) ?? null;
  }, [forecastByDate]);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric" }).format(calendarAnchor),
    [calendarAnchor],
  );
  const dateRangeLabel = useMemo(
    () => fmtRangeLabel(calendarAnchor, calendarView),
    [calendarAnchor, calendarView],
  );

  // Status counts for the dropdown
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      const k = String(e.status || "").toLowerCase();
      if (k) counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  const statusLabel = filter === "all"
    ? t(lang, "common.all") || "Alle"
    : getStatusLabel(filter);
  const photographerLabel = photographerFilter === "all"
    ? t(lang, "common.all") || "Alle"
    : (photographers.find((p) => p.key === photographerFilter)?.name || photographerFilter);
  const quellenCount = (showOutlook ? 1 : 0) + (showBkbn ? 1 : 0);
  const quellenLabel = quellenCount === 0
    ? "Keine"
    : quellenCount === 2
      ? "Alle"
      : (showOutlook ? "365-Kalender" : "Backbone-Aufträge");

  function shiftAnchor(direction: -1 | 1) {
    const d = new Date(calendarAnchor);
    if (calendarView === "day") d.setDate(d.getDate() + direction);
    else if (calendarView === "week") d.setDate(d.getDate() + direction * 7);
    else d.setMonth(d.getMonth() + direction);
    setCalendarAnchor(d);
  }

  return (
    <div className="cal-page-v2">
      <div className="cp-page">
        {/* Header card */}
        <header className="cp-header-card">
          <div className="cp-header-text">
            <div className="cp-header-meta">
              <span className="cp-events-badge">{filtered.length} Events</span>
              <span>{monthLabel}</span>
            </div>
            <h1 className="cp-page-title">{t(lang, "nav.calendar") || "Kalender"}</h1>
            <p className="cp-page-sub">{t(lang, "calendar.label.filterDesc")}</p>
          </div>
          <div className="cp-header-actions">
            <span className="cp-weather-chip" title={todayFc ? `Wetter heute · ${todayFc.kind}` : "Wetter heute"}>
              <span className="cp-weather-icon" aria-hidden>
                {todayFc ? weatherEmoji(todayFc.kind) : "☀"}
              </span>
              <span className="cp-weather-temp">{todayFc ? `${todayFc.t_max}°` : "—"}</span>
              <span className="cp-weather-loc">Zürich</span>
            </span>
            <button type="button" className="cp-ghost-btn" onClick={() => setReloadTick((n) => n + 1)}>
              <RotateCw />
              <span>{t(lang, "common.refresh") || "Aktualisieren"}</span>
            </button>
            <button type="button" className="cp-primary-btn" onClick={() => openCreateBooking()}>
              <Plus />
              <span>{t(lang, "calendar.button.createBooking") || "Buchung erstellen"}</span>
            </button>
          </div>
        </header>

        {error ? <p className="cp-hint is-error">{error}</p> : null}
        {savedOk ? <p className="cp-hint is-saved">{t(lang, "common.saved")}</p> : null}

        {/* Calendar card */}
        <div className="cp-card">
          <div className="cp-toolbar" ref={toolbarRef}>
            <div className="cp-nav">
              <button type="button" className="cp-nav-btn" onClick={() => shiftAnchor(-1)} aria-label="Zurück">
                <ChevronLeft />
              </button>
              <button type="button" className="cp-today" onClick={() => setCalendarAnchor(new Date())}>
                {t(lang, "orders.calendar.today") || "Heute"}
              </button>
              <button type="button" className="cp-nav-btn" onClick={() => shiftAnchor(1)} aria-label="Vor">
                <ChevronRight />
              </button>
            </div>

            <div className={`cp-date-pill-wrap${miniCalOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="cp-date-pill"
                onClick={() => {
                  setOpenDropdown(null);
                  setMiniCalOpen((v) => !v);
                }}
              >
                <span>{dateRangeLabel}</span>
                <ChevronDown />
              </button>
              <div className="cp-mini-cal-popover">
                <CalMiniMonth
                  anchor={miniMonthAnchor}
                  onChangeAnchor={setMiniMonthAnchor}
                  onPickDay={(dateKey) => {
                    setCalendarAnchor(new Date(`${dateKey}T00:00:00`));
                    setCalendarView("day");
                    setMiniCalOpen(false);
                  }}
                  eventCounts={eventCounts}
                  forecastByDate={forecastByDate}
                  selectedDateIso={(() => {
                    const y = calendarAnchor.getFullYear();
                    const m = String(calendarAnchor.getMonth() + 1).padStart(2, "0");
                    const d = String(calendarAnchor.getDate()).padStart(2, "0");
                    return `${y}-${m}-${d}`;
                  })()}
                />
              </div>
            </div>

            <span className="cp-toolbar-divider" />

            {/* Status dropdown */}
            <div className={`cp-dropdown${openDropdown === "status" ? " is-open" : ""}`}>
              <button
                type="button"
                className="cp-dd-trigger"
                onClick={() => {
                  setMiniCalOpen(false);
                  setOpenDropdown((p) => (p === "status" ? null : "status"));
                }}
              >
                <span className="cp-dd-dots">
                  <span className="cp-dd-dot" style={{ background: filter === "all" ? "var(--blue)" : STATUS_DOT_COLOR[filter] ?? "var(--text-4)" }} />
                </span>
                <span className="cp-dd-label">{t(lang, "calendar.label.status")}:</span>
                <span className="cp-dd-value">{statusLabel}</span>
                <ChevronDown className="cp-dd-chev" />
              </button>
              <div className="cp-dd-menu">
                <button
                  type="button"
                  className={`cp-dd-item${filter === "all" ? " is-selected" : ""}`}
                  onClick={() => {
                    setFilter("all");
                    setOpenDropdown(null);
                  }}
                >
                  <Check className="cp-dd-check" />
                  <span>{t(lang, "common.all") || "Alle"}</span>
                  <span className="cp-dd-count">{events.length}</span>
                </button>
                <div className="cp-dd-divider" />
                {STATUS_KEYS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`cp-dd-item${filter === s ? " is-selected" : ""}`}
                    onClick={() => {
                      setFilter(s);
                      setOpenDropdown(null);
                    }}
                  >
                    <Check className="cp-dd-check" />
                    <span className="cp-dd-dot" style={{ background: STATUS_DOT_COLOR[s] ?? "var(--text-4)" }} />
                    <span>{getStatusLabel(s)}</span>
                    <span className="cp-dd-count">{statusCounts[s] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mitarbeiter dropdown */}
            <div className={`cp-dropdown${openDropdown === "mitarbeiter" ? " is-open" : ""}`}>
              <button
                type="button"
                className="cp-dd-trigger"
                onClick={() => {
                  setMiniCalOpen(false);
                  setOpenDropdown((p) => (p === "mitarbeiter" ? null : "mitarbeiter"));
                }}
              >
                <UserIcon className="cp-dd-lead" />
                <span className="cp-dd-label">{t(lang, "calendar.label.employee")}:</span>
                <span className="cp-dd-value">{photographerLabel}</span>
                <ChevronDown className="cp-dd-chev" />
              </button>
              <div className="cp-dd-menu">
                <button
                  type="button"
                  className={`cp-dd-item${photographerFilter === "all" ? " is-selected" : ""}`}
                  onClick={() => {
                    setPhotographerFilter("all");
                    setOpenDropdown(null);
                  }}
                >
                  <Check className="cp-dd-check" />
                  <span>{t(lang, "common.all") || "Alle Mitarbeiter"}</span>
                </button>
                {photographers.length > 0 ? <div className="cp-dd-divider" /> : null}
                {photographers.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`cp-dd-item${photographerFilter === p.key ? " is-selected" : ""}`}
                    onClick={() => {
                      setPhotographerFilter(p.key);
                      setOpenDropdown(null);
                    }}
                  >
                    <Check className="cp-dd-check" />
                    <span
                      className="cp-dd-mini-avatar"
                      style={{ background: gradientFor(p.key || p.name || "x") }}
                      aria-hidden
                    >
                      {initialsFor(p.name, p.key)}
                    </span>
                    <span>{p.name || p.key}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quellen (Outlook + BKBN toggles) */}
            <div className={`cp-dropdown${openDropdown === "quellen" ? " is-open" : ""}`}>
              <button
                type="button"
                className="cp-dd-trigger"
                onClick={() => {
                  setMiniCalOpen(false);
                  setOpenDropdown((p) => (p === "quellen" ? null : "quellen"));
                }}
              >
                <Layers className="cp-dd-lead" />
                <span className="cp-dd-label">Quellen:</span>
                <span className="cp-dd-value">{quellenLabel}</span>
                <ChevronDown className="cp-dd-chev" />
              </button>
              <div className="cp-dd-menu">
                <button
                  type="button"
                  className={`cp-dd-item${showOutlook ? " is-selected" : ""}`}
                  onClick={() => setShowOutlook((v) => !v)}
                >
                  <Check className="cp-dd-check" />
                  <span className="cp-dd-dot" style={{ background: "var(--purple)" }} />
                  <span>365-Kalender</span>
                  {outlookMeta?.user ? <span className="cp-dd-count" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{outlookMeta.user.split('@')[0]}</span> : null}
                </button>
                <button
                  type="button"
                  className={`cp-dd-item${showBkbn ? " is-selected" : ""}`}
                  onClick={() => setShowBkbn((v) => !v)}
                >
                  <Check className="cp-dd-check" />
                  <span className="cp-dd-dot" style={{ background: "var(--orange)" }} />
                  <span>Backbone-Aufträge</span>
                  {showBkbn && bkbnMeta?.enabled ? <span className="cp-dd-count">{bkbnMeta.count}</span> : null}
                </button>
                {showOutlook && outlookCategories.length > 0 ? (
                  <>
                    <div className="cp-dd-divider" />
                    <div className="cp-dd-section">365-Kategorie</div>
                    <button
                      type="button"
                      className={`cp-dd-item${outlookCategory === "all" ? " is-selected" : ""}`}
                      onClick={() => setOutlookCategory("all")}
                    >
                      <Check className="cp-dd-check" />
                      <span>Alle Kategorien</span>
                    </button>
                    {outlookCategories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`cp-dd-item${outlookCategory === c ? " is-selected" : ""}`}
                        onClick={() => setOutlookCategory(c)}
                      >
                        <Check className="cp-dd-check" />
                        <span>{c}</span>
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            </div>

            {/* View switch */}
            <div className="cp-view-switch">
              {(["day", "week", "month"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`cp-view-btn${calendarView === v ? " is-active" : ""}`}
                  onClick={() => setCalendarView(v)}
                >
                  {v === "day" ? "Tag" : v === "week" ? "Woche" : "Monat"}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            // Build the week / day / month grid inline so the layout
            // matches the macOS spec end-to-end.
            const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
            const today = new Date();
            const MONTHS = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
            const DOW_SHORT = ["So","Mo","Di","Mi","Do","Fr","Sa"];

            if (calendarView === "day") {
              const day = calendarAnchor;
              const dayEvents = eventsForDay(filtered, day);
              const isToday = sameDay(day, today);
              const nowTop = isToday ? nowLineTop() : null;
              const dow = day.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const dayFc = forecastByDate.get(isoDateKey(day));
              return (
                <>
                  <div className="cp-week-head is-day">
                    <div className="cp-day-col" />
                    <div className={`cp-day-col${isToday ? " is-today" : ""}${isWeekend ? " is-weekend" : ""}`}>
                      <div className="cp-day-name">{DOW_SHORT[dow]}{isToday ? " · Heute" : ""}</div>
                      <div className="cp-day-num">
                        <span className="cp-day-n">{day.getDate()}</span>
                        <span className="cp-day-month">{MONTHS[day.getMonth()]}</span>
                      </div>
                      {dayFc ? (
                        <div className="cp-day-weather" title={`${dayFc.kind} · ${dayFc.precip}% Niederschlag`}>
                          <span className="cp-day-w-icon" aria-hidden>{weatherEmoji(dayFc.kind)}</span>
                          <span className="cp-day-w-temp">{dayFc.t_max}°</span>
                          <span className="cp-day-w-low">/ {dayFc.t_min}°</span>
                        </div>
                      ) : null}
                      {dayEvents.length > 0 ? <span className="cp-day-count">{dayEvents.length}</span> : null}
                    </div>
                  </div>
                  <div className="cp-week-body is-day">
                    <div className="cp-time-col">
                      {HOURS.map((h) => (
                        <div key={h} className="cp-time-slot">{String(h).padStart(2, "0")}:00</div>
                      ))}
                    </div>
                    <div
                      className={`cp-col-body${isToday ? " is-today" : ""}${isWeekend ? " is-weekend" : ""}`}
                      onClick={() => prepareNewBooking(isoDateKey(day))}
                    >
                      {HOURS.slice(1).map((h) => (
                        <div key={h} className="cp-grid-line" style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT }} />
                      ))}
                      {nowTop != null ? <div className="cp-now-line" style={{ top: nowTop }} /> : null}
                      {dayEvents.map((ev) => {
                        const pos = evPosition(ev);
                        if (!pos) return null;
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            className="cp-event"
                            data-tone={evTone(ev)}
                            data-clip-top={pos.clippedTop ? "true" : undefined}
                            data-clip-bottom={pos.clippedBottom ? "true" : undefined}
                            style={{ top: pos.top, height: pos.height }}
                            onClick={(e) => { e.stopPropagation(); openEvent(toClicked(ev)); }}
                          >
                            <div className="cp-ev-time">{fmtHHmm(ev.start)}{ev.end ? ` – ${fmtHHmm(ev.end)}` : ""}</div>
                            <div className="cp-ev-title">{normalizeMojibakeText(ev.address) || normalizeMojibakeText(ev.title) || "—"}</div>
                            {ev.photographerName || ev.zipcity ? (
                              <div className="cp-ev-meta">{[normalizeMojibakeText(ev.zipcity), ev.photographerName].filter(Boolean).join(" · ")}</div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            }

            if (calendarView === "week") {
              const ws = startOfWeekMon(calendarAnchor);
              const days = Array.from({ length: 7 }, (_, i) => addDaysDate(ws, i));
              return (
                <>
                  <div className="cp-week-head">
                    <div className="cp-day-col" />
                    {days.map((day) => {
                      const isToday = sameDay(day, today);
                      const dow = day.getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      const cnt = eventsForDay(filtered, day).length;
                      const dayFc = forecastByDate.get(isoDateKey(day));
                      return (
                        <div
                          key={day.toISOString()}
                          className={`cp-day-col${isToday ? " is-today" : ""}${isWeekend ? " is-weekend" : ""}`}
                        >
                          <div className="cp-day-name">{DOW_SHORT[dow]}{isToday ? " · Heute" : ""}</div>
                          <div className="cp-day-num">
                            <span className="cp-day-n">{day.getDate()}</span>
                            <span className="cp-day-month">{MONTHS[day.getMonth()]}</span>
                          </div>
                          {dayFc ? (
                            <div className="cp-day-weather" title={`${dayFc.kind} · ${dayFc.precip}% Niederschlag`}>
                              <span className="cp-day-w-icon" aria-hidden>{weatherEmoji(dayFc.kind)}</span>
                              <span className="cp-day-w-temp">{dayFc.t_max}°</span>
                            </div>
                          ) : null}
                          {cnt > 0 ? <span className="cp-day-count">{cnt}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="cp-week-body">
                    <div className="cp-time-col">
                      {HOURS.map((h) => (
                        <div key={h} className="cp-time-slot">{String(h).padStart(2, "0")}:00</div>
                      ))}
                    </div>
                    {days.map((day) => {
                      const dayEvents = eventsForDay(filtered, day);
                      const isToday = sameDay(day, today);
                      const dow = day.getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      const nowTop = isToday ? nowLineTop() : null;
                      return (
                        <div
                          key={`b-${day.toISOString()}`}
                          className={`cp-col-body${isToday ? " is-today" : ""}${isWeekend ? " is-weekend" : ""}`}
                          onClick={() => prepareNewBooking(isoDateKey(day))}
                        >
                          {HOURS.slice(1).map((h) => (
                            <div key={h} className="cp-grid-line" style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT }} />
                          ))}
                          {nowTop != null ? <div className="cp-now-line" style={{ top: nowTop }} /> : null}
                          {dayEvents.map((ev) => {
                            const pos = evPosition(ev);
                            if (!pos) return null;
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                className="cp-event"
                                data-tone={evTone(ev)}
                                data-clip-top={pos.clippedTop ? "true" : undefined}
                                data-clip-bottom={pos.clippedBottom ? "true" : undefined}
                                style={{ top: pos.top, height: pos.height }}
                                onClick={(e) => { e.stopPropagation(); openEvent(toClicked(ev)); }}
                              >
                                <div className="cp-ev-time">{fmtHHmm(ev.start)}{ev.end ? ` – ${fmtHHmm(ev.end)}` : ""}</div>
                                <div className="cp-ev-title">{normalizeMojibakeText(ev.address) || normalizeMojibakeText(ev.title) || "—"}</div>
                                {ev.photographerName ? (
                                  <div className="cp-ev-meta">{ev.photographerName}</div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            }

            // Month view
            const mAnchor = calendarAnchor;
            const firstOfMonth = new Date(mAnchor.getFullYear(), mAnchor.getMonth(), 1);
            const gridStart = startOfWeekMon(firstOfMonth);
            const cells = Array.from({ length: 42 }, (_, i) => addDaysDate(gridStart, i));
            return (
              <div>
                <div className="cp-month-grid" style={{ gridTemplateRows: "auto" }}>
                  {["Mo","Di","Mi","Do","Fr","Sa","So"].map((d) => (
                    <div key={d} className="cp-month-dayname">{d}</div>
                  ))}
                </div>
                <div className="cp-month-grid">
                  {cells.map((day) => {
                    const inMonth = day.getMonth() === mAnchor.getMonth();
                    const isToday = sameDay(day, today);
                    const dayEvents = eventsForDay(filtered, day);
                    const visible = dayEvents.slice(0, 3);
                    const overflow = dayEvents.length - visible.length;
                    return (
                      <div
                        key={day.toISOString()}
                        className={`cp-month-cell${!inMonth ? " is-muted" : ""}${isToday ? " is-today" : ""}`}
                        onClick={() => prepareNewBooking(isoDateKey(day))}
                      >
                        <div className="cp-month-cell-head">
                          <span className="cp-month-day">{day.getDate()}</span>
                        </div>
                        {visible.map((ev) => (
                          <div
                            key={ev.id}
                            className="cp-month-event"
                            data-tone={evTone(ev)}
                            onClick={(e) => { e.stopPropagation(); openEvent(toClicked(ev)); }}
                            title={ev.title}
                          >
                            {fmtHHmm(ev.start)} {normalizeMojibakeText(ev.address) || normalizeMojibakeText(ev.title)}
                          </div>
                        ))}
                        {overflow > 0 ? (
                          <span
                            className="cp-month-more"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCalendarAnchor(day);
                              setCalendarView("day");
                            }}
                          >
                            + {overflow} weitere
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {filtered.length === 0 ? (
            <div className="cp-empty">
              <p className="cp-empty-title">{t(lang, "calendar.noEventsInRange")}</p>
              <button type="button" className="cp-empty-link" onClick={() => openCreateBooking()}>
                {t(lang, "calendar.newBooking")} →
              </button>
            </div>
          ) : null}
        </div>

        {/* Map (OrdersMap renders its own card; we just scope the macOS look) */}
        <div className="dv2 cp-map-wrap">
          <OrdersMap orders={orders} lang={lang} />
        </div>
      <CreateOrderWizard
        token={token}
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) setPrefilledDate(undefined);
        }}
        initialDate={prefilledDate}
        onSuccess={async () => {
          await load();
          setShowCreate(false);
          setPrefilledDate(undefined);
        }}
      />

      {selected ? (
        <>
          <button
            type="button"
            className="sp-overlay open"
            aria-label="Schliessen"
            onClick={() => setSelected(null)}
          />
          <div className="sp-panel open" style={{ maxWidth: 520, width: "100%" }}>
            <div className="sp-head">
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-base font-semibold text-[var(--text-main)]">{t(lang, "calendar.modal.title")}</h3>
                <button type="button" className="btn-ghost" onClick={() => setSelected(null)}>{t(lang, "common.close")}</button>
              </div>
            </div>
            <div className="sp-body space-y-3 text-sm text-[var(--text-main)]">
              {selected.type === "outlook" ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
                  <span className="rounded bg-violet-600 px-1.5 py-0.5 text-white">365</span>
                  <span>Persönlicher Outlook-Termin (read-only)</span>
                  {selected.category ? (
                    <span className="rounded border border-violet-300 bg-white px-1.5 py-0.5 text-violet-700">
                      {selected.category}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {selected.type === "bkbn" ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">
                  <span className="rounded px-1.5 py-0.5 text-white" style={{ background: selected.color || "#ea580c" }}>BKBN</span>
                  <span>Backbone-Photo-Auftrag aus 365-Kalender (read-only)</span>
                </div>
              ) : null}
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.title")}</span><span>{normalizeMojibakeText(selected.title) || "-"}</span></div>
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.start")}</span><span>{formatDateTime(selected.start)}</span></div>
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.end")}</span><span>{formatDateTime(selected.end)}</span></div>
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.type")}</span><span>{selected.type === "bkbn" ? "BKBN-Auftrag" : selected.type || "-"}</span></div>
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.address")}</span><span>{normalizeMojibakeText(selected.address) || "-"}</span></div>
              {selected.type === "outlook" || selected.type === "bkbn" ? (
                <>
                  {selected.type === "bkbn" && (selected.organizerName || selected.organizerEmail) ? (
                    <div className="flex gap-2">
                      <span className="min-w-[100px] font-semibold text-[var(--accent)]">Organizer</span>
                      <span>{[selected.organizerName, selected.organizerEmail].filter(Boolean).join(" · ")}</span>
                    </div>
                  ) : null}
                  {selected.type === "bkbn" && (selected.mailboxes?.length || selected.mailbox) ? (
                    <div className="flex gap-2">
                      <span className="min-w-[100px] font-semibold text-[var(--accent)]">Postfach</span>
                      <span className="font-mono text-[12px]">{(selected.mailboxes?.length ? selected.mailboxes : [selected.mailbox]).filter(Boolean).join(", ")}</span>
                    </div>
                  ) : null}
                  {selected.bodyPreview ? (
                    <div className="flex gap-2">
                      <span className="min-w-[100px] font-semibold text-[var(--accent)]">Notiz</span>
                      <span className="whitespace-pre-line text-[var(--fg-2)]">{normalizeMojibakeText(selected.bodyPreview)}</span>
                    </div>
                  ) : null}
                  {selected.showAs ? (
                    <div className="flex gap-2">
                      <span className="min-w-[100px] font-semibold text-[var(--accent)]">Status</span>
                      <span>{selected.showAs}</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.employeeColon")}</span><span>{selected.photographerName || selected.photographerKey || "-"}</span></div>
                  {selected.grund ? <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.reason")}</span><span>{selected.grund}</span></div> : null}
                </>
              )}
            </div>

            {selected.orderNo ? (
              <div className="space-y-3 border-t border-[var(--border-soft)] bg-[var(--surface-raised)]/50 p-4 text-sm">
                <div className="text-base font-bold text-[var(--text-main)]">{t(lang, "calendar.label.orderOptions")}</div>
                <div>
                  <label className="mb-1 block text-xs font-semibold p-text-muted">{t(lang, "calendar.label.status")}</label>
                  <OrderStatusSelect
                    orderNo={String(selected.orderNo)}
                    value={status}
                    token={token}
                    disabled={saving}
                    autoSave={false}
                    onChanged={(next) => setStatus(next)}
                    onError={(msg) => setError(msg)}
                  />
                  <label className="mt-3 flex items-start gap-2 text-xs p-text-muted">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={sendStatusEmails}
                      onChange={(e) => setSendStatusEmails(e.target.checked)}
                      disabled={saving}
                    />
                    <span>
                      {t(lang, "orderStatus.sendEmailsLabel")}
                      <span className="block text-[11px] text-zinc-500">
                        {t(lang, "orderStatus.sendEmailsHint")}
                      </span>
                    </span>
                  </label>
                  <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${sendStatusEmails ? "p-text-muted" : "text-zinc-500 opacity-70"}`}>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={statusEmailTargets.customer}
                          onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, customer: e.target.checked }))}
                          disabled={saving || !sendStatusEmails}
                        />
                        <span>{t(lang, "orderStatus.target.customer")}</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={statusEmailTargets.office}
                          onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, office: e.target.checked }))}
                          disabled={saving || !sendStatusEmails}
                        />
                        <span>{t(lang, "orderStatus.target.office")}</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={statusEmailTargets.photographer}
                          onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, photographer: e.target.checked }))}
                          disabled={saving || !sendStatusEmails}
                        />
                        <span>{t(lang, "orderStatus.target.photographer")}</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={statusEmailTargets.cc}
                          onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, cc: e.target.checked }))}
                          disabled={saving || !sendStatusEmails}
                        />
                        <span>{t(lang, "orderStatus.target.cc")}</span>
                      </label>
                    </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold p-text-muted">{t(lang, "orderDetail.section.appointment")}</label>
                  <input type="datetime-local" className="ui-input" value={scheduleLocal} onChange={(e) => setScheduleLocal(e.target.value)} disabled={status.toLowerCase() === "cancelled" || status.toLowerCase() === "paused" || (selected.status || "").toLowerCase() === "cancelled"} />
                  {status.toLowerCase() === "paused" && status !== originalStatus ? (
                    <p className="mt-1 text-[11px] text-amber-400/80">Slot wird bei Pausierung freigegeben.</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold p-text-muted">{t(lang, "calendar.label.employee")}</label>
                  <select className="ui-input" value={photographerKey} onChange={(e) => setPhotographerKey(e.target.value)}>
                    <option value="">{t(lang, "calendar.select.pleaseChoose")}</option>
                    {photographers.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
                  </select>
                </div>
                <button className="btn-primary w-full" disabled={saving || !selectedHasChanges} onClick={saveOrderChanges}>
                  {saving ? t(lang, "common.saving") : t(lang, "common.save")}
                </button>
              </div>
            ) : null}

            <footer className="sp-foot">
              <div className="flex w-full flex-wrap gap-2">
                {selected.orderNo ? (
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    onClick={() => {
                      navigate(`/orders/${encodeURIComponent(String(selected.orderNo))}`);
                      setSelected(null);
                    }}
                  >
                    {t(lang, "calendar.button.goToOrder").replace("{{orderNo}}", String(selected.orderNo))}
                  </button>
                ) : null}
                {(selected.type === "outlook" || selected.type === "bkbn") && selected.webLink ? (
                  <a
                    href={selected.webLink}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary flex-1 inline-flex items-center justify-center gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    In Outlook öffnen
                  </a>
                ) : null}
                {selected.type === "bkbn" ? (
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={() => {
                      navigate("/admin/bkbn-orders");
                      setSelected(null);
                    }}
                  >
                    Alle BKBN-Aufträge
                  </button>
                ) : null}
                <button type="button" className="btn-secondary flex-1" onClick={() => setSelected(null)}>OK</button>
              </div>
            </footer>
          </div>
        </>
      ) : null}
      </div>
    </div>
  );
}

