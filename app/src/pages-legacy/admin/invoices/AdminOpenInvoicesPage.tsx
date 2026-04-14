import { useCallback, useState } from "react";
import { AlertTriangle, Search, Trash2 } from "lucide-react";
import {
  archiveAdminInvoice,
  bulkDeleteRenewal63Invoices,
  deleteAdminInvoice,
  getAdminInvoicesCentral,
  getRenewal63DeletePreview,
  importExxasAdminInvoice,
  resendAdminInvoice,
  type BulkDeleteRenewal63Preview,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { adminInvoicesCentralQueryKey } from "../../../lib/queryKeys";
import {
  type EditingInvoice,
  type InvoiceRow,
  type InvoiceType,
  EditInvoiceModal,
  ExxasTable,
  RenewalTable,
  StatCard,
} from "./invoice-components";

export function AdminOpenInvoicesPage() {
  const [tab, setTab] = useState<"renewal" | "exxas">("renewal");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editingInvoice, setEditingInvoice] = useState<EditingInvoice>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [showRenewal63Modal, setShowRenewal63Modal] = useState(false);
  const [renewal63Preview, setRenewal63Preview] = useState<BulkDeleteRenewal63Preview | null>(null);
  const [renewal63Loading, setRenewal63Loading] = useState(false);
  const [renewal63Err, setRenewal63Err] = useState<string | null>(null);

  const status = tab === "renewal" ? "offen" : "offen";

  const qk = adminInvoicesCentralQueryKey(tab, status, search);
  const queryFn = useCallback(
    () => getAdminInvoicesCentral(tab, status, search || undefined),
    [tab, status, search],
  );
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 30_000 });

  const invoices = data?.invoices ?? [];
  const stats = (data?.stats as Record<string, number>) ?? {};

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const refreshInvoices = useCallback(async () => {
    await refetch({ force: true });
  }, [refetch]);

  const runMutation = useCallback(
    async (key: string, task: () => Promise<unknown>, successMessage: string) => {
      setActionErr(null);
      setActionMsg(null);
      setBusyActionKey(key);
      try {
        await task();
        setActionMsg(successMessage);
        await refreshInvoices();
      } catch (err) {
        setActionErr(err instanceof Error ? err.message : "Aktion fehlgeschlagen.");
      } finally {
        setBusyActionKey(null);
      }
    },
    [refreshInvoices],
  );

  const handleDelete = useCallback(
    async (type: InvoiceType, invoice: InvoiceRow) => {
      const id = String(invoice.id ?? "");
      const label = String(invoice.invoice_number ?? invoice.nummer ?? invoice.id ?? "die Rechnung");
      if (!window.confirm(`Rechnung ${label} wirklich löschen?`)) return;
      await runMutation(
        `${type}-${id}-delete`,
        () => deleteAdminInvoice(type, id),
        "Rechnung wurde gelöscht.",
      );
    },
    [runMutation],
  );

  const handleArchive = useCallback(
    async (type: InvoiceType, invoice: InvoiceRow) => {
      const id = String(invoice.id ?? "");
      const label = String(invoice.invoice_number ?? invoice.nummer ?? invoice.id ?? "die Rechnung");
      if (!window.confirm(`Rechnung ${label} wirklich archivieren?`)) return;
      await runMutation(
        `${type}-${id}-archive`,
        () => archiveAdminInvoice(type, id),
        "Rechnung wurde archiviert.",
      );
    },
    [runMutation],
  );

  const handleResend = useCallback(
    async (invoice: InvoiceRow) => {
      const id = String(invoice.id ?? "");
      const label = String(invoice.invoice_number ?? invoice.id ?? "die Rechnung");
      if (!window.confirm(`Rechnung ${label} wirklich erneut senden?`)) return;
      await runMutation(
        `renewal-${id}-resend`,
        () => resendAdminInvoice("renewal", id),
        "Rechnung wurde erneut gesendet.",
      );
    },
    [runMutation],
  );

  const handleImportExxas = useCallback(
    async (invoice: InvoiceRow) => {
      const id = String(invoice.id ?? "");
      const label = String(invoice.nummer ?? invoice.id ?? "die Exxas-Rechnung");
      const tourId = Number(invoice.tour_id ?? 0);
      if (!Number.isFinite(tourId) || tourId <= 0) {
        setActionErr("Exxas-Rechnung ist keiner Tour zugeordnet und kann noch nicht intern importiert werden.");
        setActionMsg(null);
        return;
      }
      await runMutation(
        `exxas-${id}-import`,
        () => importExxasAdminInvoice(id),
        `Exxas-Rechnung ${label} wurde ins interne Rechnungsmodul übernommen.`,
      );
    },
    [runMutation],
  );

  const handleOpenRenewal63Modal = useCallback(async () => {
    setRenewal63Err(null);
    setRenewal63Preview(null);
    setRenewal63Loading(true);
    setShowRenewal63Modal(true);
    try {
      const preview = await getRenewal63DeletePreview();
      setRenewal63Preview(preview);
    } catch (err) {
      setRenewal63Err(err instanceof Error ? err.message : "Vorschau fehlgeschlagen.");
    } finally {
      setRenewal63Loading(false);
    }
  }, []);

  const handleConfirmRenewal63Delete = useCallback(async () => {
    setRenewal63Loading(true);
    setRenewal63Err(null);
    try {
      const result = await bulkDeleteRenewal63Invoices();
      setShowRenewal63Modal(false);
      setRenewal63Preview(null);
      setActionMsg(
        `${result.deleted} Verlängerungsrechnung${result.deleted !== 1 ? "en" : ""} (CHF 63.80) gelöscht.`
      );
      await refreshInvoices();
    } catch (err) {
      setRenewal63Err(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    } finally {
      setRenewal63Loading(false);
    }
  }, [refreshInvoices]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Offene Rechnungen</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">Alle ausstehenden und überfälligen Rechnungen.</p>
        </div>
        {tab === "renewal" && (
          <button
            type="button"
            onClick={() => void handleOpenRenewal63Modal()}
            className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-400"
            title="Alle offenen/überfälligen Verlängerungsrechnungen CHF 63.80 (Matterport) löschen"
          >
            <Trash2 className="h-4 w-4" />
            Verlängerung CHF 63.80 bereinigen
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Offen" value={stats.offen ?? "—"} tone="warning" />
        <StatCard label="Überfällig" value={stats.ueberfaellig ?? "—"} tone="danger" />
        <StatCard label="Gesamt offen" value={stats.total ?? "—"} tone="neutral" />
        <div />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 surface-card-strong rounded-xl p-1 w-fit">
        <button
          type="button"
          onClick={() => { setTab("renewal"); setSearch(""); setSearchInput(""); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "renewal"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
          }`}
        >
          Interne Rechnungen
        </button>
        <button
          type="button"
          onClick={() => { setTab("exxas"); setSearch(""); setSearchInput(""); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "exxas"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
          }`}
        >
          Exxas (Übergang)
        </button>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tour, Kunde, Nr."
            className="pl-8 pr-3 py-1.5 text-sm border border-[var(--border-soft)] rounded-lg bg-[var(--surface)] text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-52"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
        >
          Suchen
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearchInput(""); setSearch(""); }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium border border-[var(--border-soft)] text-[var(--text-subtle)] hover:text-[var(--text-main)]"
          >
            Zurücksetzen
          </button>
        )}
      </form>

      {error ? (
        <p className="text-sm text-red-600">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void refetch({ force: true })}>
            Erneut laden
          </button>
        </p>
      ) : null}
      {actionErr ? <p className="text-sm text-red-600">{actionErr}</p> : null}
      {actionMsg ? <p className="text-sm text-green-600">{actionMsg}</p> : null}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        <div className="surface-card-strong">
          {tab === "renewal" ? (
            <RenewalTable
              invoices={invoices as InvoiceRow[]}
              busyActionKey={busyActionKey}
              onEdit={(invoice) => setEditingInvoice({ type: "renewal", invoice })}
              onArchive={(invoice) => void handleArchive("renewal", invoice)}
              onDelete={(invoice) => void handleDelete("renewal", invoice)}
              onResend={(invoice) => void handleResend(invoice)}
            />
          ) : (
            <ExxasTable
              invoices={invoices as InvoiceRow[]}
              busyActionKey={busyActionKey}
              onImport={(invoice) => void handleImportExxas(invoice)}
              onEdit={(invoice) => setEditingInvoice({ type: "exxas", invoice })}
              onArchive={(invoice) => void handleArchive("exxas", invoice)}
              onDelete={(invoice) => void handleDelete("exxas", invoice)}
            />
          )}
        </div>
      )}

      {editingInvoice ? (
        <EditInvoiceModal
          type={editingInvoice.type}
          invoice={editingInvoice.invoice}
          onClose={() => setEditingInvoice(null)}
          onSaved={(message) => void (async () => {
            setEditingInvoice(null);
            setActionErr(null);
            setActionMsg(message);
            await refreshInvoices();
          })()}
        />
      ) : null}

      {showRenewal63Modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-soft)] shadow-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-bold text-[var(--text-main)]">
                  Verlängerungsrechnungen CHF 63.80 bereinigen
                </h2>
                <p className="text-sm text-[var(--text-subtle)] mt-1">
                  Löscht alle <strong>offenen und überfälligen</strong> internen Rechnungen mit Betrag{" "}
                  <strong>CHF 63.80</strong> (Matterport-Verlängerung). Bezahlte Rechnungen werden nicht berührt.
                </p>
              </div>
            </div>

            {renewal63Loading && (
              <div className="flex items-center gap-2 text-sm text-[var(--text-subtle)]">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" />
                Wird geladen…
              </div>
            )}

            {renewal63Err && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{renewal63Err}</p>
            )}

            {renewal63Preview && !renewal63Loading && (
              <div className="space-y-3">
                {renewal63Preview.count === 0 ? (
                  <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                    Keine passenden offenen Rechnungen (CHF 63.80) gefunden. Nichts zu löschen.
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-red-700">
                      {renewal63Preview.count} Rechnung{renewal63Preview.count !== 1 ? "en" : ""} werden gelöscht:
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border-soft)] divide-y divide-[var(--border-soft)]">
                      {renewal63Preview.invoices.map((inv) => (
                        <div key={inv.id} className="px-3 py-2 text-xs flex justify-between gap-2">
                          <span className="font-mono font-medium text-[var(--text-main)]">
                            {inv.invoice_number ?? `#${inv.id}`}
                          </span>
                          <span className={`shrink-0 font-medium ${inv.invoice_status === "overdue" ? "text-red-600" : "text-amber-600"}`}>
                            {inv.invoice_status === "overdue" ? "Überfällig" : "Offen"}
                          </span>
                          <span className="text-[var(--text-subtle)] truncate">
                            {inv.tour_object_label ?? inv.customer_name ?? "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowRenewal63Modal(false); setRenewal63Preview(null); }}
                disabled={renewal63Loading}
                className="rounded-lg px-4 py-2 text-sm font-medium border border-[var(--border-soft)] text-[var(--text-subtle)] hover:text-[var(--text-main)] disabled:opacity-50"
              >
                Abbrechen
              </button>
              {renewal63Preview && renewal63Preview.count > 0 && (
                <button
                  type="button"
                  onClick={() => void handleConfirmRenewal63Delete()}
                  disabled={renewal63Loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {renewal63Loading
                    ? "Wird gelöscht…"
                    : `${renewal63Preview.count} Rechnung${renewal63Preview.count !== 1 ? "en" : ""} löschen`}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
