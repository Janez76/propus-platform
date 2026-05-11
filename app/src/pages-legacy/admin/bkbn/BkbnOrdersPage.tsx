import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { getBkbnOrders, type BkbnOrdersResponse } from "../../../api/bkbnOrders";
import { useAuthStore } from "../../../store/authStore";
import { PageHeader } from "../../../components/handoff";
import { BkbnOrdersTable } from "../../../components/bkbn/BkbnOrdersTable";
import { bkbnLegend } from "../../../lib/bkbn";

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

        <BkbnOrdersTable events={filtered} loading={loading} matchDomains={matchDomains} />
      </div>
    </div>
  );
}
