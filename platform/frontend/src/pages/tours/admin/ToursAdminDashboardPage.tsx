import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Globe, LayoutDashboard } from "lucide-react";
import { getToursAdminDashboard } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminDashboardQueryKey } from "../../../lib/queryKeys";
import type { ToursAdminTourRow } from "../../../types/toursAdmin";

function formatDate(value: unknown) {
  if (value == null || value === "") return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH");
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
  const stats = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: "Offene Spaces",
        value: data.openMatterportSpaces.length,
        hint: matterportErr ? "mit API-Hinweis" : "bereit zur Zuordnung",
      },
      {
        label: "Neu erstellt",
        value: data.recentTours.length,
        hint: "letzte Touren",
      },
      {
        label: "Läuft bald ab",
        value: data.expiringSoonTours.length,
        hint: "zeitnah prüfen",
      },
    ];
  }, [data, matterportErr]);

  const content = useMemo(() => {
    if (!data) return null;
    return (
      <div className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-3">
          {stats.map((item) => (
            <div key={item.label} className="surface-card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                {item.label}
              </div>
              <div className="mt-2 text-3xl font-bold text-[var(--text-main)]">{item.value}</div>
              <div className="mt-1 text-sm text-[var(--text-subtle)]">{item.hint}</div>
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="surface-card-strong p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-[var(--text-main)]">Offene Matterport-Spaces</h2>
              <span className="rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
                {data.openMatterportSpaces.length}
              </span>
            </div>
            <p className="text-sm text-[var(--text-subtle)]">
              Noch nicht zugeordnete Spaces, die als Nächstes verarbeitet werden sollten.
            </p>
            {matterportErr ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">Matterport: {String(matterportErr)}</p>
            ) : null}
            {data.openMatterportSpaces.length === 0 ? (
              <p className="text-sm text-[var(--text-subtle)]">Keine unverknüpften aktiven Spaces.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {data.openMatterportSpaces.map((m) => (
                  <li
                    key={String(m.id)}
                    className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-medium text-[var(--text-main)]">
                        <span className="block truncate">{String(m.name || m.id || "—")}</span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--text-subtle)]">{String(m.id || "")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card-strong p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-main)]">Zuletzt erstellt</h2>
                <p className="mt-1 text-sm text-[var(--text-subtle)]">Neue Touren im zuletzt erfassten Bestand.</p>
              </div>
              <Link to="/admin/tours/list" className="text-sm font-medium text-[var(--accent)] hover:underline">
                Alle Touren
              </Link>
            </div>
            {data.recentTours.length === 0 ? (
              <p className="text-sm text-[var(--text-subtle)]">Keine Einträge.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {data.recentTours.map((t) => (
                  <li key={t.id} className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/admin/tours/${t.id}`} className="block truncate font-medium text-[var(--text-main)] hover:underline">
                          {tourTitle(t)}
                        </Link>
                        <div className="mt-1 text-xs text-[var(--text-subtle)]">
                          {formatDate(t.canonical_term_end_date ?? t.term_end_date ?? t.ablaufdatum)} ·{" "}
                          {String(t.displayed_status_label || t.status || "—")}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-[var(--border-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                        #{t.id}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="surface-card-strong p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-main)]">Läuft bald ab</h2>
              <p className="mt-1 text-sm text-[var(--text-subtle)]">
                Touren mit naher Laufzeit, damit Verlängerungen und Follow-ups nicht untergehen.
              </p>
            </div>
            <Link to="/admin/tours/list" className="text-sm font-medium text-[var(--accent)] hover:underline">
              Zur Liste
            </Link>
          </div>
          {data.expiringSoonTours.length === 0 ? (
            <p className="text-sm text-[var(--text-subtle)]">Keine Touren in diesem Zeitraum.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.expiringSoonTours.map((t) => (
                <li key={t.id} className="surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/admin/tours/${t.id}`} className="block truncate font-medium text-[var(--text-main)] hover:underline">
                        {tourTitle(t)}
                      </Link>
                      <div className="mt-1 text-xs text-[var(--text-subtle)]">
                        {formatDate(t.canonical_term_end_date ?? t.term_end_date ?? t.ablaufdatum)}
                      </div>
                    </div>
                    {typeof t.days_until_expiry === "number" ? (
                      <span className="shrink-0 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                        {t.days_until_expiry} Tage
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }, [data, matterportErr, stats]);

  return (
    <div className="space-y-6">
      <section className="surface-card-strong p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Tour Manager
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-main)] sm:text-3xl">Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-subtle)]">
              Übersicht aus dem Tour-Manager mit Fokus auf neue Touren, offene Matterport-Zuordnungen und bald ablaufende Einträge.
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
            <Link
              to="/admin/tours/link-matterport"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
            >
              Offene Spaces
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div className="text-sm flex-1">
            <p>{error}</p>
            <p className="mt-1 text-xs opacity-90">
              Hinweis: Der Tour-Manager nutzt eine eigene Anmeldung. Bitte unter{" "}
              <a className="underline font-medium" href="/tour-manager/auth/login">
                /tour-manager/auth/login
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
