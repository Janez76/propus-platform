import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Globe, Search, AlertCircle, ExternalLink } from "lucide-react";
import { getPortalTours, type PortalTour } from "../../api/portalTours";

export function PortalToursPage() {
  const [tours, setTours] = useState<PortalTour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    getPortalTours()
      .then((r) => setTours(r.tours))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = tours.filter((t) => {
    const q = query.toLowerCase();
    const matchQuery =
      !q ||
      (t.object_label ?? "").toLowerCase().includes(q) ||
      (t.bezeichnung ?? "").toLowerCase().includes(q) ||
      (t.matterport_model_id ?? "").toLowerCase().includes(q) ||
      (t.customer_email ?? "").toLowerCase().includes(q);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && !t.archiv && t.status !== "ARCHIVED") ||
      (statusFilter === "archived" && (t.archiv || t.status === "ARCHIVED"));
    return matchQuery && matchStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Meine Touren</h1>
        <span className="text-sm text-[var(--text-subtle)]">{tours.length} Touren</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Filter-Leiste */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-subtle)]" />
          <input
            type="text"
            placeholder="Suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-sm text-[var(--text-main)] placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
        >
          <option value="all">Alle</option>
          <option value="active">Aktiv</option>
          <option value="archived">Archiviert</option>
        </select>
      </div>

      {/* Touren-Liste */}
      {filtered.length === 0 ? (
        <div className="cust-form-section p-10 text-center">
          <Globe className="h-10 w-10 mx-auto mb-3 text-[var(--text-subtle)]" />
          <p className="text-[var(--text-subtle)]">
            {query || statusFilter !== "all" ? "Keine Ergebnisse für diesen Filter." : "Noch keine Touren vorhanden."}
          </p>
        </div>
      ) : (
        <div className="cust-form-section overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-soft)]">
                <th className="text-left px-4 py-3 font-medium text-[var(--text-subtle)]">Objekt</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-subtle)] hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-subtle)] hidden md:table-cell">Läuft bis</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--text-subtle)]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-[var(--border-soft)]/50 last:border-0 hover:bg-[var(--surface-raised)]/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--text-main)]">
                      {t.object_label || t.bezeichnung || `Tour #${t.id}`}
                    </div>
                    {t.matterport_model_id && (
                      <div className="text-xs text-[var(--text-subtle)] mt-0.5">
                        ID: {t.matterport_model_id}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <TourStatusBadge status={t.status} archiv={t.archiv} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-[var(--text-subtle)]">
                    {formatDate(t.term_end_date ?? t.ablaufdatum)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {t.matterport_model_id && (
                        <a
                          href={`https://my.matterport.com/show/?m=${t.matterport_model_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span className="hidden sm:inline">Ansehen</span>
                        </a>
                      )}
                      <Link
                        to={`/portal/tours/${t.id}`}
                        className="inline-flex items-center text-xs text-[var(--accent)] hover:underline"
                      >
                        Details →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TourStatusBadge({ status, archiv }: { status: string; archiv?: boolean }) {
  if (archiv || status === "ARCHIVED") {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium cust-status-badge cust-status-draft">
        Archiviert
      </span>
    );
  }
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Aktiv", cls: "cust-status-badge cust-status-confirmed" },
    PENDING: { label: "Ausstehend", cls: "cust-status-badge cust-status-pending" },
    CUSTOMER_ACCEPTED_AWAITING_PAYMENT: { label: "Zahlung ausstehend", cls: "cust-status-badge cust-status-open" },
    AWAITING_DECISION: { label: "Entscheidung ausstehend", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  };
  const s = map[status] ?? { label: status.replace(/_/g, " "), cls: "cust-status-badge cust-status-draft" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "–";
  return new Date(dateStr).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}



