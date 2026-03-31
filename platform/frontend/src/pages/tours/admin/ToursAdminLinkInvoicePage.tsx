import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getToursAdminLinkInvoice, postLinkInvoiceToTour } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminLinkInvoiceQueryKey } from "../../../lib/queryKeys";
import type { ToursAdminTourRow } from "../../../types/toursAdmin";

const LEGACY_BASE = "/tour-manager/admin";

function tourTitle(t: ToursAdminTourRow) {
  return (
    (t.canonical_object_label as string) ||
    (t.object_label as string) ||
    (t.bezeichnung as string) ||
    `Tour #${t.id}`
  );
}

function formatDate(v: unknown) {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH");
}

function formatMoney(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  return `CHF ${n.toFixed(2)}`;
}

export function ToursAdminLinkInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const okId = id != null && id !== "" && /^\d+$/.test(id) ? id : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = (searchParams.get("search") || "").trim();
  const [draftSearch, setDraftSearch] = useState(urlSearch);

  useEffect(() => {
    setDraftSearch(urlSearch);
  }, [urlSearch]);

  const qk = okId ? toursAdminLinkInvoiceQueryKey(okId, urlSearch) : "toursAdmin:linkInvoice:invalid";
  const queryFn = useCallback(() => {
    if (!okId) throw new Error("Ungültige Tour-ID");
    return getToursAdminLinkInvoice(okId, urlSearch || undefined);
  }, [okId, urlSearch]);

  const { data, loading, error, refetch } = useQuery(qk, queryFn, { enabled: !!okId, staleTime: 15_000 });
  const [linkingId, setLinkingId] = useState<string | number | null>(null);

  if (!okId) {
    return <Navigate to="/admin/tours/list" replace />;
  }

  const tourId = okId;

  const tour = data?.tour as ToursAdminTourRow | undefined;
  const invoices = (data?.invoices as Record<string, unknown>[]) || [];
  const suggestions = (data?.suggestions as Record<string, unknown>[]) || [];

  async function linkInvoice(invoiceId: string | number) {
    setLinkingId(invoiceId);
    try {
      await postLinkInvoiceToTour(tourId, invoiceId);
      void refetch({ force: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fehler";
      alert(msg);
    } finally {
      setLinkingId(null);
    }
  }

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    const t = draftSearch.trim();
    if (t) next.set("search", t);
    else next.delete("search");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to={`/admin/tours/${okId}`}
            className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Tour
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Exxas-Rechnung verknüpfen</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">
            {tour ? (
              <>
                {tourTitle(tour)} <span className="text-[var(--text-subtle)]">· #{tour.id}</span>
              </>
            ) : loading ? (
              <span className="skeleton-line inline-block h-4 w-48" />
            ) : (
              `Tour #${okId}`
            )}
          </p>
        </div>
        <a
          href={`${LEGACY_BASE}/tours/${okId}/link-invoice`}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
        >
          <ExternalLink className="h-4 w-4" />
          EJS
        </a>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <form onSubmit={applySearch} className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-[var(--text-subtle)] mb-1">Suche (Kunde, Bezeichnung, Nummer)</label>
          <input
            type="search"
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm bg-[var(--surface)]"
            placeholder="Filter…"
          />
        </div>
        <button type="submit" className="rounded bg-[var(--accent)] text-white px-3 py-1.5 text-sm">
          Suchen
        </button>
        {urlSearch ? (
          <button
            type="button"
            className="text-sm underline text-[var(--text-subtle)]"
            onClick={() => {
              setDraftSearch("");
              setSearchParams({}, { replace: true });
            }}
          >
            Alle anzeigen
          </button>
        ) : null}
      </form>

      {suggestions.length > 0 ? (
        <section className="surface-card-strong p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-main)]">Vorschläge</h2>
          <ul className="space-y-2 text-sm">
            {suggestions.map((row) => {
              const invId = row.id;
              const busy = linkingId === invId;
              return (
                <li
                  key={String(invId)}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-soft)]/50 pb-2"
                >
                  <div>
                    <span className="text-[var(--text-main)]">{String(row.nummer ?? row.id ?? "")}</span>
                    <span className="text-[var(--text-subtle)] mx-2">·</span>
                    <span className="text-[var(--text-subtle)]">{String(row.kunde_name ?? row.bezeichnung ?? "—")}</span>
                    {row.suggestion_score != null ? (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                        Score {String(row.suggestion_score)}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void linkInvoice(String(invId))}
                    className="text-xs rounded border border-[var(--border-soft)] px-2 py-1 hover:bg-[var(--surface-raised)] disabled:opacity-50"
                  >
                    {busy ? "…" : "Verknüpfen"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        <div className="surface-card-strong overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                <th className="px-4 py-2">Nummer</th>
                <th className="px-4 py-2">Kunde / Bez.</th>
                <th className="px-4 py-2">Betrag</th>
                <th className="px-4 py-2">Zahlungstermin</th>
                <th className="px-4 py-2 w-28">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-[var(--text-subtle)]">
                    Keine passenden, noch nicht verknüpften Rechnungen.
                  </td>
                </tr>
              ) : (
                invoices.map((row) => {
                  const invId = row.id;
                  const busy = linkingId === invId;
                  return (
                    <tr key={String(invId)} className="border-b border-[var(--border-soft)]/40">
                      <td className="px-4 py-2 font-mono text-xs">{String(row.nummer ?? invId ?? "")}</td>
                      <td className="px-4 py-2">
                        <div className="text-[var(--text-main)]">{String(row.kunde_name ?? "—")}</div>
                        <div className="text-xs text-[var(--text-subtle)]">{String(row.bezeichnung ?? "")}</div>
                      </td>
                      <td className="px-4 py-2">{formatMoney(row.betrag)}</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-subtle)]">{formatDate(row.zahlungstermin)}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void linkInvoice(String(invId))}
                          className="text-xs rounded bg-[var(--accent)] text-white px-2 py-1 disabled:opacity-50"
                        >
                          {busy ? "…" : "Verknüpfen"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
