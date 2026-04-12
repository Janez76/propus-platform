import { useCallback, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import {
  archiveAdminInvoice,
  deleteAdminInvoice,
  getAdminInvoicesCentral,
  importExxasAdminInvoice,
  resendAdminInvoice,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { adminInvoicesCentralQueryKey } from "../../../lib/queryKeys";
import {
  type EditingInvoice,
  type InvoiceRow,
  type InvoiceType,
  CreateInvoiceModal,
  EXXAS_FILTERS,
  RENEWAL_FILTERS,
  EditInvoiceModal,
  ExxasTable,
  RechnungslaufModal,
  RenewalTable,
  StatCard,
} from "./invoice-components";

export function AdminInvoicesPage() {
  const [tab, setTab] = useState<InvoiceType>("renewal");
  const [renewalStatus, setRenewalStatus] = useState("");
  const [exxasStatus, setExxasStatus] = useState("");
  const [renewalSearch, setRenewalSearch] = useState("");
  const [exxasSearch, setExxasSearch] = useState("");
  const [renewalSearchInput, setRenewalSearchInput] = useState("");
  const [exxasSearchInput, setExxasSearchInput] = useState("");
  const [editingInvoice, setEditingInvoice] = useState<EditingInvoice>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRechnungslauf, setShowRechnungslauf] = useState(false);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const status = tab === "renewal" ? renewalStatus : exxasStatus;
  const search = tab === "renewal" ? renewalSearch : exxasSearch;

  const qk = adminInvoicesCentralQueryKey(tab, status, search);
  const queryFn = useCallback(
    () => getAdminInvoicesCentral(tab, status || undefined, search || undefined),
    [tab, status, search],
  );
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 30_000 });

  const invoices = data?.invoices ?? [];
  const stats = (data?.stats as Record<string, number>) ?? {};

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tab === "renewal") {
      setRenewalSearch(renewalSearchInput);
    } else {
      setExxasSearch(exxasSearchInput);
    }
  }

  function handleSearchClear() {
    if (tab === "renewal") {
      setRenewalSearchInput("");
      setRenewalSearch("");
    } else {
      setExxasSearchInput("");
      setExxasSearch("");
    }
  }

  const filters = tab === "renewal" ? RENEWAL_FILTERS : EXXAS_FILTERS;
  const currentStatus = tab === "renewal" ? renewalStatus : exxasStatus;
  const currentSearchInput = tab === "renewal" ? renewalSearchInput : exxasSearchInput;
  const setCurrentStatus = tab === "renewal" ? setRenewalStatus : setExxasStatus;
  const setCurrentSearchInput = tab === "renewal" ? setRenewalSearchInput : setExxasSearchInput;

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

  const handleEditSaved = useCallback(
    async (message: string) => {
      setEditingInvoice(null);
      setActionErr(null);
      setActionMsg(message);
      await refreshInvoices();
    },
    [refreshInvoices],
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Rechnungen</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">Zentrale Rechnungsübersicht — interne Rechnungen als Zielsystem, Exxas als Übergangsquelle.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowRechnungslauf(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-subtle)] hover:text-[var(--text-main)] hover:border-[var(--accent)]/50"
          >
            <RefreshCw className="h-4 w-4" />
            Rechnungslauf
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent)]/90"
          >
            <Plus className="h-4 w-4" />
            Neue Rechnung
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tab === "renewal" ? (
          <>
            <StatCard label="Offen" value={stats.offen ?? "—"} tone="warning" />
            <StatCard label="Überfällig" value={stats.ueberfaellig ?? "—"} tone="danger" />
            <StatCard label="Bezahlt" value={stats.bezahlt ?? "—"} tone="success" />
            <StatCard label="Entwurf" value={stats.entwurf ?? "—"} tone="neutral" />
          </>
        ) : (
          <>
            <StatCard label="Offen" value={stats.offen ?? "—"} tone="warning" />
            <StatCard label="Bezahlt" value={stats.bezahlt ?? "—"} tone="success" />
            <StatCard label="Gesamt" value={stats.total ?? "—"} tone="neutral" />
            <div />
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 surface-card-strong rounded-xl p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("renewal")}
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
          onClick={() => setTab("exxas")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "exxas"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
          }`}
        >
          Exxas (Übergang)
        </button>
      </div>

      {/* Search + Filter row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {filters.map(({ val, label }) => (
            <button
              key={val || "all"}
              type="button"
              onClick={() => setCurrentStatus(val)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                currentStatus === val
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--accent)]/50"
              }`}
            >
              {label}
              {val === "offen" && stats.offen != null ? ` (${stats.offen})` : null}
              {val === "bezahlt" && stats.bezahlt != null ? ` (${stats.bezahlt})` : null}
              {val === "ueberfaellig" && stats.ueberfaellig != null ? ` (${stats.ueberfaellig})` : null}
              {val === "entwurf" && stats.entwurf != null ? ` (${stats.entwurf})` : null}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
            <input
              type="text"
              value={currentSearchInput}
              onChange={(e) => setCurrentSearchInput(e.target.value)}
              placeholder={tab === "renewal" ? "Tour, Kunde, Nr." : "Kunde, Nr., Bezeichnung"}
              className="pl-8 pr-3 py-1.5 text-sm border border-[var(--border-soft)] rounded-lg bg-[var(--surface)] text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-52"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
          >
            Suchen
          </button>
          {(tab === "renewal" ? renewalSearch : exxasSearch) && (
            <button
              type="button"
              onClick={handleSearchClear}
              className="rounded-lg px-3 py-1.5 text-xs font-medium border border-[var(--border-soft)] text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            >
              Zurücksetzen
            </button>
          )}
        </form>
      </div>

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

      {/* Table */}
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
          onSaved={(message) => void handleEditSaved(message)}
        />
      ) : null}

      {showRechnungslauf ? (
        <RechnungslaufModal
          onClose={() => setShowRechnungslauf(false)}
          onDone={() => {
            setShowRechnungslauf(false);
            void refreshInvoices();
          }}
        />
      ) : null}

      {showCreateModal ? (
        <CreateInvoiceModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(message) => {
            setShowCreateModal(false);
            setActionMsg(message);
            void refreshInvoices();
          }}
        />
      ) : null}
    </div>
  );
}
