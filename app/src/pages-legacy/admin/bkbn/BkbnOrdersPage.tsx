import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  FastForward,
  Inbox,
  Lock,
  RefreshCw,
  RotateCw,
  Search,
} from "lucide-react";
import { getBkbnOrders, type BkbnOrderEvent, type BkbnOrdersResponse } from "../../../api/bkbnOrders";
import { useAuthStore } from "../../../store/authStore";
import { BkbnOrdersTable } from "../../../components/bkbn/BkbnOrdersTable";
import "../../../styles/bkbn-page.css";

type ZeitraumKey = "next" | "thisWeek" | "nextWeek" | "all";

const ZEITRAUM_ITEMS: { id: ZeitraumKey; label: string }[] = [
  { id: "next", label: "Nächste Aufträge" },
  { id: "thisWeek", label: "Diese Woche" },
  { id: "nextWeek", label: "Nächste Woche" },
  { id: "all", label: "Alle (inkl. vergangene)" },
];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function startOfWeekMonday(d: Date): number {
  const day = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return m.getTime();
}

function relativeTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return "soeben";
  const min = Math.round(sec / 60);
  if (min < 60) return `vor ${min} Min.`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `vor ${hr} Std.`;
  const day = Math.round(hr / 24);
  return `vor ${day} Tg.`;
}

function fmtClock(ms: number): string {
  return new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

function mailboxInitials(email?: string | null): string {
  if (!email) return "?";
  const local = email.split("@")[0] || "";
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase() || (local[0] ?? "?").toUpperCase();
}

function mailboxColor(email: string): string {
  // Stable hash → pick a hue. Returns gradient string.
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const c1 = `hsl(${hue} 65% 60%)`;
  const c2 = `hsl(${(hue + 24) % 360} 60% 42%)`;
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

function organizerLabel(email?: string | null): string {
  if (!email) return "";
  const local = email.split("@")[0] || "";
  // "janez.smirmaul" → "Janez"
  const first = local.split(/[.\-_]+/)[0] || local;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function BkbnOrdersPage() {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<BkbnOrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [zeitraum, setZeitraum] = useState<ZeitraumKey>("next");
  const [mailboxFilter, setMailboxFilter] = useState<string>("all");
  const [reloadTick, setReloadTick] = useState(0);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const resp = await getBkbnOrders(token);
        if (!alive) return;
        setData(resp);
        setLastFetchedAt(Date.now());
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "BKBN-Aufträge konnten nicht geladen werden.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, reloadTick]);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!openDropdown) return;
    function onDocClick(e: MouseEvent) {
      const root = toolbarRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOpenDropdown(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openDropdown]);

  const events = useMemo(() => data?.events ?? [], [data]);
  const mailboxes = useMemo(() => data?.mailboxes ?? [], [data]);
  const matchDomains = data?.matchDomains ?? [];
  const meta = data?.meta;

  const now = new Date();
  const todayStart = startOfDay(now);
  const thisWeekStart = startOfWeekMonday(now);
  const nextWeekStart = thisWeekStart + 7 * 86_400_000;
  const weekAfterStart = thisWeekStart + 14 * 86_400_000;

  const upcomingCount = useMemo(
    () =>
      events.filter((ev) => {
        const t = ev.end ? new Date(ev.end).getTime() : new Date(ev.start).getTime();
        return !Number.isFinite(t) || t >= todayStart;
      }).length,
    [events, todayStart],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      // Mailbox filter
      if (mailboxFilter !== "all") {
        const evMb = (ev.mailboxes && ev.mailboxes.length ? ev.mailboxes : [ev.mailbox]).filter(Boolean);
        if (!evMb.includes(mailboxFilter)) return false;
      }
      // Zeitraum filter
      const evEnd = ev.end ? new Date(ev.end).getTime() : new Date(ev.start).getTime();
      if (zeitraum === "next") {
        if (Number.isFinite(evEnd) && evEnd < todayStart) return false;
      } else if (zeitraum === "thisWeek") {
        if (!Number.isFinite(evEnd) || evEnd < thisWeekStart || evEnd >= nextWeekStart) return false;
      } else if (zeitraum === "nextWeek") {
        if (!Number.isFinite(evEnd) || evEnd < nextWeekStart || evEnd >= weekAfterStart) return false;
      }
      if (!q) return true;
      const hay = [
        ev.title,
        ev.address,
        ev.organizerEmail,
        ev.organizerName,
        ev.mailbox,
        ev.bodyPreview,
        ...(ev.mailboxes ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [events, search, zeitraum, mailboxFilter, todayStart, thisWeekStart, nextWeekStart, weekAfterStart]);

  const zeitraumLabel = ZEITRAUM_ITEMS.find((i) => i.id === zeitraum)?.label || "Nächste Aufträge";
  const mailboxLabel = mailboxFilter === "all" ? "Alle" : mailboxFilter.split("@")[0] || mailboxFilter;

  // Unique organizers for the caption chip row
  const organizers = useMemo(() => {
    const set = new Map<string, { email: string; label: string }>();
    for (const ev of events) {
      if (!ev.organizerEmail) continue;
      const key = ev.organizerEmail.toLowerCase();
      if (!set.has(key)) {
        set.set(key, { email: ev.organizerEmail, label: organizerLabel(ev.organizerEmail) });
      }
    }
    return [...set.values()];
  }, [events]);

  const handleRefresh = useCallback(() => setReloadTick((n) => n + 1), []);

  const syncLabel = lastFetchedAt ? relativeTime(nowMs - lastFetchedAt) : (loading ? "—" : "—");
  const syncClock = lastFetchedAt ? `Heute · ${fmtClock(lastFetchedAt)}` : "noch nicht synchronisiert";

  return (
    <div className="bkbn-page-v2">
      <div className="bk-page">
        {/* Header */}
        <header className="bk-header">
          <div className="bk-header-text">
            <div className="bk-header-meta">
              <span className="bk-source-tag"><span className="bk-dot" /> BKBN</span>
              <span className="bk-read-only"><Lock /> Read-only</span>
            </div>
            <h1 className="bk-page-title">Backbone-Aufträge</h1>
            <p className="bk-page-sub">
              Shooting-Aufträge von{" "}
              <a href="https://backbonephoto.co" target="_blank" rel="noopener noreferrer">backbonephoto.co</a>
              {" "}aus den 365-Kalendern von Ivan &amp; Janez.
            </p>
          </div>
          <div className="bk-header-right">
            <button
              type="button"
              className={`bk-refresh-btn${loading ? " is-syncing" : ""}`}
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw />
              <span>Aktualisieren</span>
            </button>
          </div>
        </header>

        {/* KPIs */}
        <section className="bk-kpi-row">
          <div className="bk-kpi is-blue">
            <div className="bk-kpi-label">
              <span className="bk-kpi-icon"><Calendar /></span>
              Erkannte Termine
            </div>
            <div className="bk-kpi-value">{events.length}</div>
            <div className="bk-kpi-hint">{data?.range?.from ? `ab ${data.range.from}` : ""}</div>
          </div>
          <div className="bk-kpi is-green">
            <div className="bk-kpi-label">
              <span className="bk-kpi-icon"><FastForward /></span>
              Kommende
            </div>
            <div className="bk-kpi-value">{upcomingCount}</div>
            <div className="bk-kpi-hint">ab heute</div>
          </div>
          <div className="bk-kpi is-teal">
            <div className="bk-kpi-label">
              <span className="bk-kpi-icon"><RotateCw /></span>
              Letzter Sync
            </div>
            <div className="bk-kpi-value is-small">{syncLabel}</div>
            <div className="bk-kpi-hint">{syncClock}</div>
          </div>
        </section>

        {/* Toolbar */}
        <div className="bk-toolbar" ref={toolbarRef}>
          <div className="bk-search-wrap">
            <Search />
            <input
              type="search"
              className="bk-search-input"
              placeholder="Adresse, Titel, Organizer …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="BKBN-Aufträge durchsuchen"
            />
          </div>

          {/* Zeitraum dropdown */}
          <div className={`bk-dropdown${openDropdown === "zeitraum" ? " is-open" : ""}`}>
            <button
              type="button"
              className="bk-dd-trigger"
              onClick={() => setOpenDropdown((p) => (p === "zeitraum" ? null : "zeitraum"))}
            >
              <Calendar className="bk-dd-lead" />
              <span className="bk-dd-label">Zeitraum:</span>
              <span className="bk-dd-value">{zeitraumLabel}</span>
              <ChevronDown className="bk-dd-chev" />
            </button>
            <div className="bk-dd-menu">
              {ZEITRAUM_ITEMS.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`bk-dd-item${zeitraum === it.id ? " is-selected" : ""}`}
                  onClick={() => {
                    setZeitraum(it.id);
                    setOpenDropdown(null);
                  }}
                >
                  <Check className="bk-dd-check" />
                  <span>{it.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Postfach dropdown */}
          <div className={`bk-dropdown${openDropdown === "postfach" ? " is-open" : ""}`}>
            <button
              type="button"
              className="bk-dd-trigger"
              onClick={() => setOpenDropdown((p) => (p === "postfach" ? null : "postfach"))}
            >
              <Inbox className="bk-dd-lead" />
              <span className="bk-dd-label">Postfach:</span>
              <span className="bk-dd-value">{mailboxLabel}</span>
              <ChevronDown className="bk-dd-chev" />
            </button>
            <div className="bk-dd-menu">
              <button
                type="button"
                className={`bk-dd-item${mailboxFilter === "all" ? " is-selected" : ""}`}
                onClick={() => {
                  setMailboxFilter("all");
                  setOpenDropdown(null);
                }}
              >
                <Check className="bk-dd-check" />
                <span>Alle Postfächer</span>
              </button>
              {mailboxes.map((mb) => (
                <button
                  key={mb}
                  type="button"
                  className={`bk-dd-item${mailboxFilter === mb ? " is-selected" : ""}`}
                  onClick={() => {
                    setMailboxFilter(mb);
                    setOpenDropdown(null);
                  }}
                >
                  <Check className="bk-dd-check" />
                  <span
                    className="bk-dd-mini-avatar"
                    style={{ background: mailboxColor(mb) }}
                    aria-hidden
                  >
                    {mailboxInitials(mb)}
                  </span>
                  <span>{mb}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Source caption */}
        <div className="bk-source-caption">
          {organizers.length > 0 ? (
            <div className="bk-caption-group">
              <span className="bk-cap-label">Organizer:</span>
              {organizers.slice(0, 5).map((o) => (
                <span key={o.email} className="bk-organizer-chip" title={o.email}>
                  <span
                    className="bk-odot"
                    style={{ background: mailboxColor(o.email) }}
                  />
                  {o.label}
                </span>
              ))}
            </div>
          ) : null}
          {matchDomains.length > 0 ? (
            <div className="bk-caption-group">
              <span className="bk-cap-label">Erkennung:</span>
              {matchDomains.map((d) => (
                <code key={d}>{d}</code>
              ))}
            </div>
          ) : null}
          {mailboxes.length === 0 ? (
            <span className="bk-hint is-warn">Keine Postfächer konfiguriert</span>
          ) : null}
          {meta && meta.enabled === false ? (
            <span className="bk-hint is-warn">Microsoft Graph nicht verfügbar{meta.error ? ` (${meta.error})` : ""}</span>
          ) : null}
          {meta && meta.enabled && meta.error ? (
            <span className="bk-hint is-error">Fehler: {meta.error}</span>
          ) : null}
        </div>

        {error ? <p className="bk-hint is-error" style={{ marginBottom: 12 }}>{error}</p> : null}

        <BkbnOrdersTable
          events={visible}
          loading={loading}
          matchDomains={matchDomains}
          mailboxColorFor={mailboxColor}
          mailboxInitialsFor={mailboxInitials}
          todayStart={todayStart}
        />
      </div>
    </div>
  );
}

// Re-export for compatibility (was previously imported from this module elsewhere)
export type { BkbnOrderEvent };
