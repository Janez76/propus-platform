import { useEffect, useState } from "react";
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C5A059]/25 border-t-[#C5A059]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Meine Touren</h1>
        <span className="text-sm text-slate-500 dark:text-zinc-400">{tours.length} Touren</span>
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#C5A059]/50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C5A059]/50"
        >
          <option value="all">Alle</option>
          <option value="active">Aktiv</option>
          <option value="archived">Archiviert</option>
        </select>
      </div>

      {/* Touren-Liste */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-10 text-center">
          <Globe className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-zinc-600" />
          <p className="text-slate-500 dark:text-zinc-400">
            {query || statusFilter !== "all" ? "Keine Ergebnisse für diesen Filter." : "Noch keine Touren vorhanden."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-zinc-800">
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-zinc-400">Objekt</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-zinc-400 hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-zinc-400 hidden md:table-cell">Läuft bis</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-zinc-400"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-slate-50 dark:border-zinc-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {t.object_label || t.bezeichnung || `Tour #${t.id}`}
                    </div>
                    {t.matterport_model_id && (
                      <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                        ID: {t.matterport_model_id}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <TourStatusBadge status={t.status} archiv={t.archiv} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-500 dark:text-zinc-400">
                    {formatDate(t.term_end_date ?? t.ablaufdatum)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {t.matterport_model_id && (
                      <a
                        href={`https://my.matterport.com/show/?m=${t.matterport_model_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#C5A059] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span className="hidden sm:inline">Ansehen</span>
                      </a>
                    )}
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
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">
        Archiviert
      </span>
    );
  }
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Aktiv", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    PENDING: { label: "Ausstehend", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    CUSTOMER_ACCEPTED_AWAITING_PAYMENT: { label: "Zahlung ausstehend", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    AWAITING_DECISION: { label: "Entscheidung ausstehend", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  };
  const s = map[status] ?? { label: status.replace(/_/g, " "), cls: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400" };
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
