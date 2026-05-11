import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { getBkbnOrders, type BkbnOrderEvent, type BkbnOrdersResponse } from "../../../api/bkbnOrders";
import { useAuthStore } from "../../../store/authStore";
import { PageHeader } from "../../../components/handoff";
import { normalizeMojibakeText } from "../../../components/calendar/CalendarView";
import { bkbnLegend } from "../../../lib/bkbn";

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtTimeRange(ev: BkbnOrderEvent): string {
  if (!ev.start) return "—";
  const s = new Date(ev.start);
  if (Number.isNaN(s.getTime())) return ev.start;
  const startLabel = new Intl.DateTimeFormat("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(s);
  if (ev.allDay) return `${startLabel.split(",")[0] ?? startLabel} · ganztägig`;
  if (!ev.end) return startLabel;
  const e = new Date(ev.end);
  if (Number.isNaN(e.getTime())) return startLabel;
  const endLabel = new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit" }).format(e);
  return `${startLabel}–${endLabel}`;
}

export function BkbnOrdersPage() {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<BkbnOrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [includePast, setIncludePast] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const resp = await getBkbnOrders(token);
        if (alive) setData(resp);
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

  const events = data?.events ?? [];
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      if (!includePast) {
        const t = ev.end ? new Date(ev.end).getTime() : new Date(ev.start).getTime();
        if (Number.isFinite(t) && t < todayStart) return false;
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
  }, [events, search, includePast, todayStart]);

  const upcomingCount = useMemo(
    () =>
      events.filter((ev) => {
        const t = ev.end ? new Date(ev.end).getTime() : new Date(ev.start).getTime();
        return !Number.isFinite(t) || t >= todayStart;
      }).length,
    [events, todayStart],
  );

  const legend = useMemo(() => bkbnLegend(events), [events]);

  const meta = data?.meta;
  const mailboxes = data?.mailboxes ?? [];
  const matchDomains = data?.matchDomains ?? [];

  return (
    <div className="padmin-shell space-y-4">
      <PageHeader
        eyebrow="Backbone Photo"
        title="BKBN-Aufträge"
        sub="Shooting-Aufträge von backbonephoto.co aus den 365-Kalendern von Ivan & Janez (read-only)."
        kpis={[
          { id: "total", label: "Erkannte Termine", value: String(events.length), trend: data?.range?.from ? `ab ${data.range.from}` : "" },
          { id: "upcoming", label: "Kommende", value: String(upcomingCount), trend: "ab heute" },
        ]}
        actions={
          <button
            type="button"
            className="pad-btn-primary"
            onClick={() => setReloadTick((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5${loading ? " animate-spin" : ""}`} />
            Aktualisieren
          </button>
        }
      />

      <div className="pad-content space-y-3">
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-3)]" />
              <input
                type="search"
                className="ui-input w-full pl-8"
                placeholder="Adresse, Titel, Organizer …"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="BKBN-Aufträge durchsuchen"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--fg-3)]">
              <input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} />
              <span>Vergangene anzeigen</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--fg-3)]">
            <span>Quelle: {mailboxes.length ? mailboxes.join(", ") : "keine Postfächer konfiguriert"}</span>
            {matchDomains.length ? <span>· Erkennung über: {matchDomains.join(", ")}</span> : null}
            {legend.length > 0 ? (
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                ·
                {legend.map((it) => (
                  <span key={it.mailbox} className="inline-flex items-center gap-1.5" title={it.mailbox}>
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} aria-hidden />
                    {it.name}
                  </span>
                ))}
              </span>
            ) : null}
            {meta && meta.enabled === false ? (
              <span className="text-amber-500">· Microsoft Graph nicht verfügbar{meta.error ? ` (${meta.error})` : ""}</span>
            ) : null}
            {meta && meta.enabled && meta.error ? (
              <span className="text-red-500">· Fehler: {meta.error}</span>
            ) : null}
          </div>
        </div>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]/80 p-10 text-center">
            <p className="text-sm font-medium text-[var(--text-main)]">Keine BKBN-Aufträge im Zeitraum.</p>
            <p className="mt-1 text-xs text-[var(--fg-3)]">
              Es werden Termine erkannt, deren Organizer/Teilnehmer, Betreff, Beschreibung oder Ort{" "}
              {matchDomains.length ? matchDomains.join(" bzw. ") : "backbonephoto.co"} enthält.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-soft)] text-left text-xs uppercase tracking-wide text-[var(--fg-3)]">
                  <th className="px-3 py-2 font-semibold">Termin</th>
                  <th className="px-3 py-2 font-semibold">Auftrag / Adresse</th>
                  <th className="px-3 py-2 font-semibold">Organizer</th>
                  <th className="px-3 py-2 font-semibold">Postfach</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => (
                  <tr key={ev.id} className="border-b border-[var(--border-soft)]/60 last:border-0 hover:bg-[var(--surface-raised)]/40">
                    <td className="whitespace-nowrap px-3 py-2 align-top">
                      <div className="font-mono text-[13px] text-[var(--text-main)]">{fmtTimeRange(ev)}</div>
                      {ev.allDay ? null : (
                        <div className="text-[11px] text-[var(--fg-3)]">{fmtDateTime(ev.start)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: ev.color || "#ea580c" }}>BKBN</span>
                        <span className="font-medium text-[var(--text-main)]">{normalizeMojibakeText(ev.title) || "BKBN-Auftrag"}</span>
                      </div>
                      {ev.address ? <div className="mt-0.5 text-[12px] text-[var(--fg-2)]">{normalizeMojibakeText(ev.address)}</div> : null}
                      {ev.bodyPreview ? (
                        <div className="mt-1 line-clamp-2 max-w-[420px] text-[11px] text-[var(--fg-3)]">{normalizeMojibakeText(ev.bodyPreview)}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top text-[12px] text-[var(--fg-2)]">
                      {ev.organizerName ? <div>{ev.organizerName}</div> : null}
                      {ev.organizerEmail ? <div className="font-mono text-[11px] text-[var(--fg-3)]">{ev.organizerEmail}</div> : null}
                      {!ev.organizerName && !ev.organizerEmail ? "—" : null}
                    </td>
                    <td className="px-3 py-2 align-top text-[11px] text-[var(--fg-3)]">
                      {(ev.mailboxes && ev.mailboxes.length ? ev.mailboxes : [ev.mailbox]).filter(Boolean).map((m) => (
                        <div key={m} className="font-mono">{m}</div>
                      ))}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {ev.webLink ? (
                        <a
                          href={ev.webLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--accent)] hover:bg-[var(--surface-raised)]/60"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Outlook
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
