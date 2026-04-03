import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Globe, LayoutDashboard, UserX } from "lucide-react";
import { getToursAdminDashboard } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminDashboardQueryKey } from "../../../lib/queryKeys";
import type { ToursAdminTourRow } from "../../../types/toursAdmin";

function formatDate(value: unknown) {
  if (value == null || value === "") return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function tourTitle(t: ToursAdminTourRow) {
  return (
    (t.canonical_object_label as string) ||
    (t.object_label as string) ||
    (t.bezeichnung as string) ||
    `Tour #${t.id}`
  );
}

export function ToursAdminDashboardPage() {
  const qk = toursAdminDashboardQueryKey();
  const queryFn = useCallback(() => getToursAdminDashboard(), []);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 60_000 });

  const matterportErr = data?.matterportError;

  const content = useMemo(() => {
    if (!data) return null;
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="surface-card-strong p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Link to="/admin/tours/link-matterport" className="text-lg font-semibold text-[var(--text-main)] hover:text-[var(--accent)] transition-colors">
              Noch nicht zugewiesen
            </Link>
            <span className="text-xs text-[var(--text-subtle)]">{data.openMatterportSpaces.length}</span>
          </div>
          {matterportErr ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">Matterport: {String(matterportErr)}</p>
          ) : null}
          {data.openMatterportSpaces.length === 0 ? (
            <p className="text-sm text-[var(--text-subtle)]">Keine unverknüpften aktiven Spaces.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.openMatterportSpaces.map((m) => (
                <li key={String(m.id)}>
                  <Link
                    to={`/admin/tours/link-matterport?openSpaceId=${encodeURIComponent(String(m.id || ""))}`}
                    className="flex justify-between gap-2 border-b border-[var(--border-soft)]/60 pb-2 last:border-0 rounded-md -mx-1 px-1 py-0.5 hover:bg-[var(--surface-raised)]/50 transition-colors"
                  >
                    <span className="text-[var(--text-main)] truncate">{String(m.name || m.id || "—")}</span>
                    <span className="text-[var(--text-subtle)] shrink-0">{String(m.id || "")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface-card-strong p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              to="/admin/tours/list?noCustomerOnly=1&status=ACTIVE"
              className="flex items-center gap-2 text-lg font-semibold text-[var(--text-main)] hover:text-[var(--accent)] transition-colors"
            >
              <UserX className="h-4 w-4 shrink-0 text-amber-500" />
              Ohne Kundenzuordnung
            </Link>
            <span className="text-xs text-[var(--text-subtle)]">{data.toursWithoutCustomer.length}</span>
          </div>
          {data.toursWithoutCustomer.length === 0 ? (
            <p className="text-sm text-[var(--text-subtle)]">Alle aktiven Touren sind einem Kunden zugeordnet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.toursWithoutCustomer.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/admin/tours/${t.id}/link-exxas-customer`}
                    className="flex justify-between gap-2 border-b border-[var(--border-soft)]/60 pb-2 last:border-0 rounded-md -mx-1 px-1 py-0.5 hover:bg-[var(--surface-raised)]/50 transition-colors"
                  >
                    <span className="text-[var(--text-main)] truncate">{tourTitle(t)}</span>
                    <span className="text-xs text-amber-500 shrink-0">Kunde fehlt</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface-card-strong p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Zuletzt erstellt</h2>
            <Link to="/admin/tours/list" className="text-sm font-medium text-[var(--accent)] hover:underline">
              Alle Touren
            </Link>
          </div>
          {data.recentTours.length === 0 ? (
            <p className="text-sm text-[var(--text-subtle)]">Keine Einträge.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.recentTours.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/admin/tours/${t.id}`}
                    className="block border-b border-[var(--border-soft)]/60 pb-2 last:border-0 rounded-md -mx-1 px-1 py-0.5 hover:bg-[var(--surface-raised)]/50 transition-colors"
                  >
                    <div className="font-medium text-[var(--text-main)]">{tourTitle(t)}</div>
                    <div className="text-[var(--text-subtle)] text-xs mt-0.5">
                      {formatDate(t.canonical_term_end_date ?? t.term_end_date ?? t.ablaufdatum)} ·{" "}
                      {String(t.displayed_status_label || t.status || "—")}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface-card-strong p-5 space-y-3 lg:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Läuft bald ab</h2>
          </div>
          {data.expiringSoonTours.length === 0 ? (
            <p className="text-sm text-[var(--text-subtle)]">Keine Touren in diesem Zeitraum.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.expiringSoonTours.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/admin/tours/${t.id}`}
                    className="block rounded-lg border border-[var(--border-soft)] p-3 hover:bg-[var(--surface-raised)]/50 hover:border-[var(--accent)]/40 transition-colors"
                  >
                    <div className="font-medium text-[var(--text-main)]">{tourTitle(t)}</div>
                    <div className="text-xs text-[var(--text-subtle)] mt-1">
                      {formatDate(t.canonical_term_end_date ?? t.term_end_date ?? t.ablaufdatum)}
                      {typeof t.days_until_expiry === "number" ? ` · noch ${t.days_until_expiry} Tage` : ""}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }, [data, matterportErr]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[var(--text-subtle)] text-sm mb-1">
            <LayoutDashboard className="h-4 w-4" />
            Tour Manager
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Dashboard</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">
            Übersicht aus dem Tour-Manager.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/tours/list"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Globe className="h-4 w-4" />
            Tourenliste
          </Link>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div className="text-sm flex-1">
            <p>{error}</p>
            <p className="mt-1 text-xs opacity-90">
              Hinweis: Der Tour-Manager nutzt eine eigene Anmeldung. Bitte unter{" "}
              <a className="underline font-medium" href="/tour-manager/admin">
                /tour-manager/admin
              </a>{" "}
              anmelden, dann diese Seite neu laden.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch({ force: true })}
            className="text-sm font-medium underline shrink-0"
          >
            Erneut versuchen
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        content
      )}
    </div>
  );
}
