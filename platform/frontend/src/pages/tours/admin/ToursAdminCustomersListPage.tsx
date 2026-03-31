import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, Plus, Search } from "lucide-react";
import { getToursAdminCustomersList } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminCustomersListQueryKey } from "../../../lib/queryKeys";


function buildQs(sp: URLSearchParams): string {
  const keys = ["q", "page", "sort", "dir", "source", "status"];
  const n = new URLSearchParams();
  for (const k of keys) {
    const v = sp.get(k);
    if (v != null && v !== "") n.set(k, v);
  }
  return n.toString();
}

export function ToursAdminCustomersListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qs = useMemo(() => buildQs(searchParams), [searchParams]);
  const qk = toursAdminCustomersListQueryKey(qs);
  const queryFn = useCallback(() => getToursAdminCustomersList(qs), [qs]);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 30_000 });

  const customers = (data?.customers as Record<string, unknown>[]) ?? [];
  const pagination = data?.pagination as Record<string, unknown> | undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  function setParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (value == null || value === "") n.delete(key);
        else n.set(key, value);
        if (key !== "page") n.delete("page");
        return n;
      },
      { replace: true }
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-main)]">Kunden</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">
            Verwaltung der Tour-Kunden (core.customers).
          </p>
        </div>
        <Link
          to="/admin/tours/customers/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Neuer Kunde
        </Link>
      </div>

      <div className="surface-card-strong p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-sm min-w-[200px] flex-1">
          <span className="text-[var(--text-subtle)]">Suche</span>
          <span className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] pl-9 pr-3 py-2 text-sm"
              defaultValue={searchParams.get("q") || ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setParam("q", (e.target as HTMLInputElement).value.trim() || null);
                }
              }}
              placeholder="Name, E-Mail, Firma …"
            />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-subtle)]">Quelle</span>
          <select
            className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
            value={searchParams.get("source") || ""}
            onChange={(e) => setParam("source", e.target.value || null)}
          >
            <option value="">Alle</option>
            <option value="tours">Mit Touren</option>
            <option value="contacts">Mit Kontakten</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-subtle)]">Status</span>
          <select
            className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
            value={searchParams.get("status") || ""}
            onChange={(e) => setParam("status", e.target.value || null)}
          >
            <option value="">Alle</option>
            <option value="aktiv">Aktiv</option>
            <option value="gesperrt">Gesperrt</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-subtle)]">Sortierung</span>
          <select
            className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
            value={searchParams.get("sort") || "name"}
            onChange={(e) => setParam("sort", e.target.value)}
          >
            <option value="name">Name</option>
            <option value="email">E-Mail</option>
            <option value="created_at">Angelegt</option>
            <option value="tour_count">Touren</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button type="button" className="ml-auto underline" onClick={() => void refetch()}>
            Erneut
          </button>
        </div>
      ) : null}

      <div className="surface-card-strong overflow-x-auto">
        {loading && !data ? (
          <p className="p-6 text-sm text-[var(--text-subtle)]">Laden …</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-soft)] text-left text-[var(--text-subtle)]">
                <th className="p-3 font-medium">Name / Firma</th>
                <th className="p-3 font-medium">E-Mail</th>
                <th className="p-3 font-medium">Ort</th>
                <th className="p-3 font-medium">Touren</th>
                <th className="p-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-[var(--text-subtle)]">
                    Keine Treffer.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={String(c.id)} className="border-b border-[var(--border-soft)]/60 hover:bg-[var(--surface)]/80">
                    <td className="p-3 text-[var(--text-main)]">
                      <div className="font-medium">{String(c.name || c.company || "—")}</div>
                      {c.company && c.name ? <div className="text-xs text-[var(--text-subtle)]">{String(c.company)}</div> : null}
                    </td>
                    <td className="p-3">{String(c.email || "—")}</td>
                    <td className="p-3">{String(c.city || c.zip || "—")}</td>
                    <td className="p-3">{String(c.tour_count ?? "0")}</td>
                    <td className="p-3 text-right">
                      <Link to={`/admin/tours/customers/${c.id}`} className="text-[var(--accent)] hover:underline font-medium">
                        Öffnen
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {pagination && Number(pagination.totalPages) > 1 ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            className="rounded-lg border border-[var(--border-soft)] px-3 py-1 disabled:opacity-40"
            onClick={() => setParam("page", String(page - 1))}
          >
            Zurück
          </button>
          <span className="text-[var(--text-subtle)]">
            Seite {page} / {String(pagination.totalPages)}
          </span>
          <button
            type="button"
            disabled={page >= Number(pagination.totalPages)}
            className="rounded-lg border border-[var(--border-soft)] px-3 py-1 disabled:opacity-40"
            onClick={() => setParam("page", String(page + 1))}
          >
            Weiter
          </button>
        </div>
      ) : null}
    </div>
  );
}
