import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search, Download, Archive, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  getAdminInvoicesCentral,
  importExxasAdminInvoice,
  syncAllExxasInvoices,
  archiveAdminInvoice,
  deleteAdminInvoice,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { adminInvoicesCentralQueryKey } from "../../../lib/queryKeys";
import {
  type InvoiceRow,
  type EditingInvoice,
  ActionMenu,
  StatusBadge,
  StatCard,
  EditInvoiceModal,
  formatMoney,
  formatDate,
} from "./invoice-components";

const SYNC_FILTERS = [
  { val: "", label: "Alle" },
  { val: "offen", label: "Verbucht" },
  { val: "bezahlt", label: "Bezahlt" },
];

type SortKey = "kunde_name" | "nummer" | "bezeichnung" | "exxas_status" | "sv_status" | "preis_brutto" | "zahlungstermin";
type SortDir = "asc" | "desc";

function getSortValue(row: InvoiceRow, key: SortKey): string | number {
  if (key === "preis_brutto") {
    const v = parseFloat(String(row.preis_brutto ?? ""));
    return Number.isFinite(v) ? v : 0;
  }
  if (key === "zahlungstermin") {
    const d = row.zahlungstermin ? new Date(String(row.zahlungstermin)).getTime() : 0;
    return Number.isFinite(d) ? d : 0;
  }
  return String(row[key] ?? "").toLowerCase();
}

function SortIcon({ colKey, sortKey, sortDir }: { colKey: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== colKey) return <ChevronsUpDown className="h-3 w-3 opacity-30" />;
  return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
}

export function AdminExxasSyncPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<EditingInvoice>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const qk = adminInvoicesCentralQueryKey("exxas", status, search);
  const queryFn = useCallback(
    () => getAdminInvoicesCentral("exxas", status || undefined, search || undefined),
    [status, search],
  );
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 30_000 });

  const rawInvoices = (data?.invoices ?? []) as InvoiceRow[];
  const stats = (data?.stats as Record<string, number>) ?? {};

  const invoices = useMemo(() => {
    if (!sortKey) return rawInvoices;
    return [...rawInvoices].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rawInvoices, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const totalBrutto = invoices.reduce((sum, row) => {
    const v = typeof row.preis_brutto === "number" ? row.preis_brutto : parseFloat(String(row.preis_brutto ?? ""));
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  function handleSearchClear() {
    setSearchInput("");
    setSearch("");
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

  async function handleSyncAll() {
    setSyncing(true);
    setSyncErr(null);
    setSyncMsg(null);
    try {
      const result = await syncAllExxasInvoices();
      setSyncMsg(
        `Synchronisierung abgeschlossen: ${result.imported} neu importiert, ${result.updated} aktualisiert (${result.total} total).`,
      );
      await refreshInvoices();
    } catch (err) {
      setSyncErr(err instanceof Error ? err.message : "Synchronisierung fehlgeschlagen.");
    } finally {
      setSyncing(false);
    }
  }

  const handleImport = useCallback(
    async (invoice: InvoiceRow) => {
      const id = String(invoice.id ?? "");
      const label = String(invoice.nummer ?? invoice.id ?? "die Exxas-Rechnung");
      const tourId = Number(invoice.tour_id ?? 0);
      if (!Number.isFinite(tourId) || tourId <= 0) {
        setActionErr("Exxas-Rechnung ist keiner Tour zugeordnet und kann nicht intern importiert werden.");
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

  const handleArchive = useCallback(
    async (invoice: InvoiceRow) => {
      const id = String(invoice.id ?? "");
      const label = String(invoice.nummer ?? invoice.id ?? "die Rechnung");
      if (!window.confirm(`Rechnung ${label} wirklich archivieren?`)) return;
      await runMutation(
        `exxas-${id}-archive`,
        () => archiveAdminInvoice("exxas", id),
        "Rechnung wurde archiviert.",
      );
    },
    [runMutation],
  );

  const handleDelete = useCallback(
    async (invoice: InvoiceRow) => {
      const id = String(invoice.id ?? "");
      const label = String(invoice.nummer ?? invoice.id ?? "die Rechnung");
      if (!window.confirm(`Rechnung ${label} wirklich löschen?`)) return;
      await runMutation(
        `exxas-${id}-delete`,
        () => deleteAdminInvoice("exxas", id),
        "Rechnung wurde gelöscht.",
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Exxas Rechnungen</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">
            Alle Rechnungen aus Exxas importieren und in der lokalen Datenbank speichern.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSyncAll()}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent)]/90 disabled:opacity-60 shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Synchronisiert…" : "Alle von Exxas importieren"}
        </button>
      </div>

      {/* Sync-Feedback */}
      {syncMsg && (
        <div className="rounded-lg border border-green-500/25 bg-green-500/8 px-4 py-3 text-sm text-green-700">
          {syncMsg}
        </div>
      )}
      {syncErr && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-700">
          {syncErr}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Verbucht (offen)" value={stats.offen ?? "—"} tone="warning" />
        <StatCard label="Bezahlt" value={stats.bezahlt ?? "—"} tone="success" />
        <StatCard label="Intern verbucht" value={stats.verbucht ?? "—"} tone="neutral" />
        <StatCard label="Gesamt" value={stats.total ?? "—"} tone="neutral" />
      </div>

      {/* Filter-Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {SYNC_FILTERS.map(({ val, label }) => (
            <button
              key={val || "all"}
              type="button"
              onClick={() => setStatus(val)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                status === val
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--accent)]/50"
              }`}
            >
              {label}
              {val === "offen" && stats.offen != null ? ` (${stats.offen})` : null}
              {val === "bezahlt" && stats.bezahlt != null ? ` (${stats.bezahlt})` : null}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Kunde, Nr., Bezeichnung"
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

      {/* Tabelle */}
      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        <div className="surface-card-strong overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                {(["kunde_name", "nummer", "bezeichnung", "exxas_status", "sv_status", "preis_brutto", "zahlungstermin"] as SortKey[]).map((col, i) => {
                  const labels: Record<SortKey, string> = {
                    kunde_name: "Kunde",
                    nummer: "Nr.",
                    bezeichnung: "Bezeichnung",
                    exxas_status: "Status",
                    sv_status: "Zahlungsstatus",
                    preis_brutto: "Brutto",
                    zahlungstermin: "Zahlungstermin",
                  };
                  return (
                    <th key={col} className={`px-4 py-3 ${i === 0 ? "" : ""}`}>
                      <button
                        type="button"
                        onClick={() => handleSort(col)}
                        className="inline-flex items-center gap-1 hover:text-[var(--text-main)] transition-colors select-none"
                      >
                        {labels[col]}
                        <SortIcon colKey={col} sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                  );
                })}
                <th className="px-4 py-3">Tour</th>
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[var(--text-subtle)]">
                    Keine Exxas-Rechnungen gefunden.
                  </td>
                </tr>
              ) : (
                invoices.map((row) => {
                  const tid = row.tour_id as number | null;
                  const iid = row.id as string | number;
                  const importedRenewalId = row.imported_renewal_invoice_id as number | null;
                  return (
                    <tr
                      key={String(iid)}
                      className="border-b border-[var(--border-soft)]/50 hover:bg-[var(--accent)]/5 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{String(row.kunde_name || "—")}</td>
                      <td className="px-4 py-3 font-mono text-xs">{String(row.nummer || iid)}</td>
                      <td
                        className="px-4 py-3 text-xs text-[var(--text-subtle)] max-w-[200px] truncate"
                        title={String(row.bezeichnung || "")}
                      >
                        {String(row.bezeichnung || "—")}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={String(row.exxas_status || "")} source="exxas" />
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-subtle)]">
                        {String(row.sv_status || "—")}
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums">{formatMoney(row.preis_brutto)}</td>
                      <td className="px-4 py-3">{formatDate(row.zahlungstermin)}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {tid ? (
                            <Link
                              to={`/admin/tours/${tid}`}
                              className="text-[var(--accent)] hover:underline text-xs"
                            >
                              {String(row.tour_object_label || `#${tid}`)}
                            </Link>
                          ) : (
                            <span className="text-xs text-[var(--text-subtle)]">—</span>
                          )}
                          {importedRenewalId ? (
                            <div className="text-[10px] text-green-600">
                              Verbucht #{String(row.imported_renewal_invoice_number || importedRenewalId)}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <ActionMenu
                            actions={[
                              {
                                label: importedRenewalId ? "Bereits verbucht" : "Intern verbuchen",
                                icon: Download,
                                onClick: () => void handleImport(row),
                                disabled: busyActionKey !== null || !tid || Boolean(importedRenewalId),
                              },
                              {
                                label: "Bearbeiten",
                                icon: Pencil,
                                onClick: () => setEditingInvoice({ type: "exxas", invoice: row }),
                                disabled: busyActionKey !== null,
                              },
                              {
                                label: "Archivieren",
                                icon: Archive,
                                onClick: () => void handleArchive(row),
                                disabled: busyActionKey !== null,
                              },
                              {
                                label: "Löschen",
                                icon: Trash2,
                                onClick: () => void handleDelete(row),
                                tone: "danger",
                                disabled: busyActionKey !== null,
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {invoices.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--border-soft)] bg-[var(--surface-raised)]/50">
                  <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">
                    Total ({invoices.length} Rechnungen)
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums text-[var(--text-main)]">
                    {formatMoney(totalBrutto)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
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
    </div>
  );
}
