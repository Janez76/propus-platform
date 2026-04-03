import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock, XCircle, ChevronRight, RefreshCw, Filter } from "lucide-react";
import { useQuery } from "../../../hooks/useQuery";
import { getTicketsList, patchTicketStatus } from "../../../api/toursAdmin";
import type { TicketRow, TicketStatus } from "../../../api/toursAdmin";

const CATEGORY_LABELS: Record<string, string> = {
  startpunkt:         "Startpunkt ändern",
  name_aendern:       "Name anpassen",
  blur_request:       "Bereich blurren",
  sweep_verschieben:  "360°-Punkt verschieben",
  sonstiges:          "Sonstiges",
};

const STATUS_META: Record<TicketStatus, { label: string; color: string; icon: React.ReactNode }> = {
  open:        { label: "Offen",        color: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-800",     icon: <Clock className="h-3.5 w-3.5" /> },
  in_progress: { label: "In Arbeit",    color: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800", icon: <RefreshCw className="h-3.5 w-3.5" /> },
  done:        { label: "Erledigt",     color: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  rejected:    { label: "Abgelehnt",    color: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800",             icon: <XCircle className="h-3.5 w-3.5" /> },
};

const STATUS_FILTERS: { value: TicketStatus | "all"; label: string }[] = [
  { value: "all",        label: "Alle" },
  { value: "open",       label: "Offen" },
  { value: "in_progress",label: "In Arbeit" },
  { value: "done",       label: "Erledigt" },
  { value: "rejected",   label: "Abgelehnt" },
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatusBadge({ status }: { status: TicketStatus }) {
  const m = STATUS_META[status];
  if (!m) return <span className="text-xs text-[var(--text-subtle)]">{status}</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${m.color}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

function TicketDetailPanel({ ticket, onClose, onUpdated }: {
  ticket: TicketRow;
  onClose: () => void;
  onUpdated: (t: TicketRow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function updateStatus(status: TicketStatus) {
    setBusy(true);
    setErr(null);
    try {
      const r = await patchTicketStatus(ticket.id, status);
      onUpdated(r.ticket);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  const tourLabel = ticket.tour_label || ticket.tour_bezeichnung || `Tour #${ticket.reference_id}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-card)] shadow-[0_24px_60px_rgba(0,0,0,0.35)] flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border-soft)]">
          <div>
            <p className="text-xs text-[var(--text-subtle)]">Ticket #{ticket.id} · {CATEGORY_LABELS[ticket.category] ?? ticket.category}</p>
            <h3 className="text-base font-semibold text-[var(--text-main)] mt-0.5">{ticket.subject}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)]">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge status={ticket.status} />
            {ticket.reference_id ? (
              <Link to={`/admin/tours/${ticket.reference_id}`} className="text-xs text-[var(--accent)] hover:underline">
                {tourLabel}
              </Link>
            ) : null}
            <span className="text-xs text-[var(--text-subtle)] ml-auto">{fmtDate(ticket.created_at)}</span>
          </div>

          {ticket.description ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">Beschreibung</p>
              <p className="text-sm text-[var(--text-main)] whitespace-pre-wrap">{ticket.description}</p>
            </div>
          ) : null}

          {ticket.link_url ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">Matterport-Link</p>
              <a href={ticket.link_url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--accent)] underline hover:no-underline break-all">
                {ticket.link_url}
              </a>
            </div>
          ) : null}

          {ticket.attachment_path ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">Screenshot</p>
              <img
                src={`/api/tours/admin/tickets/attachment/${ticket.attachment_path.replace("tickets/", "")}`}
                alt="Screenshot"
                className="w-full rounded-lg border border-[var(--border-soft)] max-h-60 object-contain"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">Status ändern</p>
            <div className="flex flex-wrap gap-2">
              {(["open","in_progress","done","rejected"] as TicketStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || ticket.status === s}
                  onClick={() => void updateStatus(s)}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40",
                    ticket.status === s
                      ? STATUS_META[s].color
                      : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--accent)]/40 hover:text-[var(--text-main)]",
                  ].join(" ")}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>

          {err ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{err}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AdminTicketsPage() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("open");
  const [selected, setSelected] = useState<TicketRow | null>(null);

  const queryFn = useCallback(
    () => getTicketsList(statusFilter !== "all" ? { status: statusFilter, module: "tours" } : { module: "tours" }),
    [statusFilter]
  );
  const { data, loading, error, refetch } = useQuery(`admin-tickets-${statusFilter}`, queryFn, { staleTime: 10_000 });

  const tickets = data?.tickets ?? [];

  function handleUpdated(updated: TicketRow) {
    setSelected(updated);
    void refetch({ force: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Tickets / Postfach</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">Änderungsanfragen zu Touren</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch({ force: true })}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)] disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-[var(--text-subtle)]" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={[
              "rounded-lg border px-3 py-1 text-sm font-medium transition-colors",
              statusFilter === f.value
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--accent)]/40 hover:text-[var(--text-main)]",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : null}

      {!loading && tickets.length === 0 ? (
        <div className="surface-card-strong flex flex-col items-center justify-center gap-2 py-16 text-center">
          <CheckCircle2 className="h-8 w-8 text-[var(--text-subtle)]" />
          <p className="text-sm text-[var(--text-subtle)]">Keine Tickets gefunden.</p>
        </div>
      ) : null}

      {tickets.length > 0 ? (
        <div className="surface-card-strong overflow-hidden rounded-xl border border-[var(--border-soft)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-soft)] bg-[var(--surface)]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">Kategorie</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">Betreff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide hidden md:table-cell">Tour</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide hidden sm:table-cell">Datum</th>
                <th className="px-4 py-3 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-soft)]">
              {tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="cursor-pointer hover:bg-[var(--surface)] transition-colors"
                >
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3 text-[var(--text-subtle)]">{CATEGORY_LABELS[t.category] ?? t.category}</td>
                  <td className="px-4 py-3 font-medium text-[var(--text-main)]">{t.subject}</td>
                  <td className="px-4 py-3 text-[var(--text-subtle)] hidden md:table-cell">
                    {t.reference_id ? (
                      <span onClick={(e) => e.stopPropagation()}>
                        <Link to={`/admin/tours/${t.reference_id}`} className="text-[var(--accent)] hover:underline">
                          {t.tour_label || t.tour_bezeichnung || `#${t.reference_id}`}
                        </Link>
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-subtle)] hidden sm:table-cell">{fmtDate(t.created_at)}</td>
                  <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-[var(--text-subtle)]" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <TicketDetailPanel
          ticket={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      ) : null}
    </div>
  );
}
