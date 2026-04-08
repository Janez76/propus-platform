import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, UserCheck } from "lucide-react";
import { getToursAdminLinkInvoice, postLinkInvoiceToTour, postLinkExxasCustomerToTour } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminLinkInvoiceQueryKey } from "../../../lib/queryKeys";
import type { ToursAdminTourRow } from "../../../types/toursAdmin";

interface ContactSuggestion {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface CustomerSuggestion {
  id: number;
  display_name: string;
  email: string;
  ref: string;
  contacts: ContactSuggestion[];
}

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
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMoney(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  return `CHF ${n.toFixed(2)}`;
}

function exxasStatusMeta(row: Record<string, unknown>) {
  const status = String(row.exxas_status ?? "").trim().toLowerCase();
  const svStatus = String(row.sv_status ?? "").trim();
  const labelMap: Record<string, string> = {
    bz: "Bezahlt",
    op: "Offen",
    ex: "Verschickt",
    vs: "Verschickt",
    ar: "Archiviert",
    ab: "Abgeschlossen",
  };
  const label = svStatus || labelMap[status] || String(row.exxas_status ?? "—");
  const dueRaw = String(row.zahlungstermin ?? "").trim();
  const dueDate = dueRaw ? new Date(dueRaw) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPaid = status === "bz";
  const isArchived = status === "ar" || status === "ab";
  const isOverdue = !isPaid && !!dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < today;
  const cls = isPaid
    ? "bg-green-500/10 text-green-700 border-green-500/20"
    : isArchived
      ? "bg-slate-500/10 text-slate-700 border-slate-500/20"
      : isOverdue
        ? "bg-red-500/10 text-red-700 border-red-500/20"
        : "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
  return { label: label || "—", cls };
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
  const [customerSuggestion, setCustomerSuggestion] = useState<CustomerSuggestion | null>(null);
  // "customer" = Schritt 1 Kundenbestätigung, "contact" = Schritt 2 Kontaktauswahl
  const [suggestionStep, setSuggestionStep] = useState<"customer" | "contact">("customer");
  const [assigningCustomer, setAssigningCustomer] = useState(false);

  if (!okId) {
    return <Navigate to="/admin/tours/list" replace />;
  }

  const tourId = okId;

  const tour = data?.tour as ToursAdminTourRow | undefined;
  const invoices = (data?.invoices as Record<string, unknown>[]) || [];
  const suggestions = (data?.suggestions as Record<string, unknown>[]) || [];
  const liveError = typeof data?.liveError === "string" ? data.liveError : null;

  async function linkInvoice(invoiceId: string | number) {
    setLinkingId(invoiceId);
    setCustomerSuggestion(null);
    setSuggestionStep("customer");
    try {
      const result = await postLinkInvoiceToTour(tourId, invoiceId) as Record<string, unknown>;
      if (result?.customerSuggestion) {
        setCustomerSuggestion(result.customerSuggestion as CustomerSuggestion);
        setSuggestionStep("customer");
      }
      void refetch({ force: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fehler";
      alert(msg);
    } finally {
      setLinkingId(null);
    }
  }

  function confirmCustomer() {
    if (!customerSuggestion) return;
    if (customerSuggestion.contacts.length > 0) {
      setSuggestionStep("contact");
    } else {
      void assignSuggestedCustomer(null);
    }
  }

  async function assignSuggestedCustomer(contact: ContactSuggestion | null) {
    if (!customerSuggestion) return;
    setAssigningCustomer(true);
    try {
      await postLinkExxasCustomerToTour(tourId, {
        customer_id: customerSuggestion.id,
        customer_name: customerSuggestion.display_name,
        customer_email: contact?.email || customerSuggestion.email || undefined,
        customer_contact: contact?.name || undefined,
      });
      setCustomerSuggestion(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fehler beim Zuordnen";
      alert(msg);
    } finally {
      setAssigningCustomer(false);
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
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {liveError ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Exxas-Livedaten konnten nicht geladen werden: {liveError}
        </p>
      ) : null}

      {customerSuggestion && suggestionStep === "customer" ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-950/20 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <UserCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="flex-1">
              <span className="font-medium text-emerald-800 dark:text-emerald-300">Kunde gefunden: </span>
              <span className="text-emerald-800 dark:text-emerald-200">{customerSuggestion.display_name}</span>
              {customerSuggestion.email ? (
                <span className="text-emerald-700/70 dark:text-emerald-400/70 ml-1">· {customerSuggestion.email}</span>
              ) : null}
              {customerSuggestion.ref ? (
                <span className="text-emerald-700/70 dark:text-emerald-400/70 ml-1">· Nr. {customerSuggestion.ref}</span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={assigningCustomer}
                onClick={confirmCustomer}
                className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {assigningCustomer ? "…" : customerSuggestion.contacts.length > 0 ? "Weiter →" : "Zuordnen"}
              </button>
              <button
                type="button"
                onClick={() => setCustomerSuggestion(null)}
                className="rounded border border-emerald-400/40 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
              >
                Überspringen
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {customerSuggestion && suggestionStep === "contact" ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-4 text-sm dark:bg-emerald-950/20 space-y-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium text-emerald-800 dark:text-emerald-300">
              Kontakt / Mitarbeiter auswählen
            </span>
            <span className="text-emerald-700/60 dark:text-emerald-400/60 text-xs">
              · {customerSuggestion.display_name}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {customerSuggestion.contacts.map((ct) => (
              <button
                key={ct.id}
                type="button"
                disabled={assigningCustomer}
                onClick={() => void assignSuggestedCustomer(ct)}
                className="flex flex-col items-start rounded border border-emerald-400/30 bg-white px-3 py-2 text-left hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40"
              >
                <span className="font-medium text-emerald-800 dark:text-emerald-200">{ct.name || "—"}</span>
                {ct.role ? <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">{ct.role}</span> : null}
                {ct.email ? <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">{ct.email}</span> : null}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={assigningCustomer}
              onClick={() => void assignSuggestedCustomer(null)}
              className="text-xs text-emerald-700 underline hover:text-emerald-900 dark:text-emerald-400 disabled:opacity-50"
            >
              {assigningCustomer ? "…" : "Ohne Kontakt zuordnen"}
            </button>
            <span className="text-emerald-400/40">·</span>
            <button
              type="button"
              onClick={() => setSuggestionStep("customer")}
              className="text-xs text-emerald-700 underline hover:text-emerald-900 dark:text-emerald-400"
            >
              ← Zurück
            </button>
            <span className="text-emerald-400/40">·</span>
            <button
              type="button"
              onClick={() => setCustomerSuggestion(null)}
              className="text-xs text-emerald-700/60 underline hover:text-emerald-900 dark:text-emerald-400/60"
            >
              Überspringen
            </button>
          </div>
        </div>
      ) : null}

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
              const invId = String(row.link_id ?? row.id ?? "");
              const busy = linkingId === invId;
              return (
                <li
                  key={invId}
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
                    onClick={() => void linkInvoice(invId)}
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
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Kunde / Bez.</th>
                <th className="px-4 py-2">Betrag</th>
                <th className="px-4 py-2">Zahlungstermin</th>
                <th className="px-4 py-2 w-28">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-[var(--text-subtle)]">
                    Keine passenden, noch nicht verknüpften Rechnungen.
                  </td>
                </tr>
              ) : (
                invoices.map((row) => {
                  const invId = String(row.link_id ?? row.id ?? "");
                  const busy = linkingId === invId;
                  const isLive = row.source === "live";
                  const statusMeta = exxasStatusMeta(row);
                  return (
                    <tr key={invId} className="border-b border-[var(--border-soft)]/40">
                      <td className="px-4 py-2 font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <span>{String(row.nummer ?? row.exxas_document_id ?? invId ?? "")}</span>
                          {isLive ? (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                              Live
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusMeta.cls}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-[var(--text-main)]">{String(row.kunde_name ?? "—")}</div>
                        <div className="text-xs text-[var(--text-subtle)]">{String(row.bezeichnung ?? "")}</div>
                        <div className="text-[10px] text-[var(--text-subtle)] mt-0.5">
                          Dok.-Datum: {formatDate(row.dok_datum)}
                        </div>
                      </td>
                      <td className="px-4 py-2">{formatMoney(row.betrag ?? row.preis_brutto)}</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-subtle)]">{formatDate(row.zahlungstermin)}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void linkInvoice(invId)}
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
