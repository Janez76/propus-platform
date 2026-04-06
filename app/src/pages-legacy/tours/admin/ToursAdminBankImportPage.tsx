import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmBankImportTransaction,
  getBankImportInvoiceSearch,
  getToursAdminBankImport,
  ignoreBankImportTransaction,
  uploadToursAdminBankFile,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminBankImportQueryKey } from "../../../lib/queryKeys";

type InvoiceSource = "renewal" | "exxas";
type BankRun = Record<string, unknown>;
type BankImportTx = Record<string, unknown>;
type InvoiceSearchResult = {
  invoice_source: InvoiceSource;
  id: string | number;
  invoice_number?: string | null;
  amount_chf?: number | string | null;
  invoice_status?: string | null;
  tour_id?: number | null;
  tour_object_label?: string | null;
  tour_customer_name?: string | null;
  canConfirmDirectly?: boolean;
  requiresImport?: boolean;
};

function asInvoiceSource(value: unknown): InvoiceSource | null {
  return value === "renewal" || value === "exxas" ? value : null;
}

function formatMoney(value: unknown) {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return "CHF —";
  return `CHF ${n.toFixed(2)}`;
}

function invoiceSourceBadge(source: InvoiceSource) {
  if (source === "renewal") {
    return "bg-green-500/10 text-green-700 border-green-500/20";
  }
  return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
}

function invoiceSourceLabel(source: InvoiceSource) {
  return source === "renewal" ? "Intern" : "Exxas";
}

function matchStatusLabel(status: unknown) {
  return String(status || "") === "review" ? "Review" : "Unklar";
}

function buildInitialSelection(tx: BankImportTx): InvoiceSearchResult | null {
  const source = asInvoiceSource(tx.matched_invoice_source) || (tx.matched_invoice_id ? "renewal" : null);
  const id = tx.matched_invoice_id;
  if (!source || id == null || id === "") return null;
  return {
    invoice_source: source,
    id: String(id),
    invoice_number: String(tx.matched_invoice_number || ""),
    amount_chf: tx.matched_invoice_amount_chf as string | number | null | undefined,
    invoice_status: String(tx.matched_invoice_status || ""),
    tour_id: Number(tx.matched_tour_id || 0) || null,
    tour_object_label: String(tx.tour_label || ""),
    tour_customer_name: String(tx.customer_email || ""),
    canConfirmDirectly: source === "renewal",
    requiresImport: source === "exxas",
  };
}

function PendingTransactionCard({
  tx,
  onRefresh,
  onMessage,
}: {
  tx: BankImportTx;
  onRefresh: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const id = Number(tx.id);
  const initialSelection = useMemo(() => buildInitialSelection(tx), [tx]);
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<InvoiceSearchResult | null>(initialSelection);
  const [results, setResults] = useState<InvoiceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"confirm" | "ignore" | "">("");

  useEffect(() => {
    const q = searchInput.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      getBankImportInvoiceSearch(q, tx.amount_chf as string | number | null | undefined)
        .then((response) => {
          if (cancelled) return;
          setResults((response.invoices as InvoiceSearchResult[]) || []);
        })
        .catch((err) => {
          if (cancelled) return;
          setSearchError(err instanceof Error ? err.message : "Suche fehlgeschlagen.");
          setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchInput, tx.amount_chf]);

  async function handleConfirm() {
    if (!selected) return;
    setBusy("confirm");
    setSearchError(null);
    try {
      await confirmBankImportTransaction(id, {
        invoiceId: String(selected.id),
        invoiceSource: selected.invoice_source,
      });
      onMessage(
        selected.invoice_source === "exxas"
          ? `Transaktion #${id} wurde via Exxas-Import einer internen Rechnung zugeordnet.`
          : `Transaktion #${id} wurde zugeordnet.`,
      );
      await onRefresh();
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Zuordnung fehlgeschlagen.");
    } finally {
      setBusy("");
    }
  }

  async function handleIgnore() {
    setBusy("ignore");
    setSearchError(null);
    try {
      await ignoreBankImportTransaction(id);
      onMessage(`Transaktion #${id} wurde ignoriert.`);
      await onRefresh();
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Ignorieren fehlgeschlagen.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="surface-card-strong p-4 text-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${String(tx.match_status || "") === "review" ? "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20" : "bg-zinc-500/10 text-zinc-600 border-zinc-500/20"}`}>
          {matchStatusLabel(tx.match_status)}
        </span>
        <span className="text-xs text-[var(--text-subtle)]">#{id}</span>
        <span className="text-xs font-medium text-[var(--text-main)]">{formatMoney(tx.amount_chf)}</span>
        {tx.booking_date ? <span className="text-xs text-[var(--text-subtle)]">Buchung: {String(tx.booking_date)}</span> : null}
      </div>

      <div className="grid gap-2 md:grid-cols-2 text-xs">
        <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2">
          <div className="font-medium text-[var(--text-main)]">Referenz</div>
          <div className="text-[var(--text-subtle)] break-all">{String(tx.reference_raw || "—")}</div>
        </div>
        <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2">
          <div className="font-medium text-[var(--text-main)]">Zahler / Zweck</div>
          <div className="text-[var(--text-subtle)]">{String(tx.debtor_name || tx.purpose || "—")}</div>
        </div>
      </div>

      {tx.match_reason ? (
        <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-subtle)]">
          <span className="font-medium text-[var(--text-main)]">Hinweis:</span> {String(tx.match_reason)}
        </div>
      ) : null}

      {selected ? (
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${invoiceSourceBadge(selected.invoice_source)}`}>
              {invoiceSourceLabel(selected.invoice_source)}
            </span>
            <span className="font-medium text-[var(--text-main)]">
              {String(selected.invoice_number || `#${selected.id}`)}
            </span>
            <span className="text-xs text-[var(--text-subtle)]">
              {formatMoney(selected.amount_chf)}
            </span>
          </div>
          <div className="text-xs text-[var(--text-subtle)]">
            {String(selected.tour_customer_name || "")}
            {selected.tour_customer_name && selected.tour_object_label ? " · " : ""}
            {String(selected.tour_object_label || "")}
          </div>
          {selected.tour_id ? (
            <Link to={`/admin/tours/${selected.tour_id}`} className="text-xs text-[var(--accent)] hover:underline">
              Tour öffnen
            </Link>
          ) : null}
          {selected.invoice_source === "exxas" ? (
            <p className="text-xs text-yellow-700">
              Diese Exxas-Rechnung wird zuerst intern importiert und danach als Zahlung verbucht.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-main)]">
          Rechnung suchen
        </label>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Nr., ID, Tour, Kunde, Objekt"
          className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
        />
        {searching ? <p className="text-xs text-[var(--text-subtle)]">Suche läuft…</p> : null}
        {results.length > 0 ? (
          <div className="space-y-2">
            {results.map((result) => {
              const source = asInvoiceSource(result.invoice_source) || "renewal";
              const isSelected = selected?.invoice_source === source && String(selected.id) === String(result.id);
              return (
                <button
                  key={`${source}-${String(result.id)}`}
                  type="button"
                  onClick={() => setSelected(result)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border-soft)] bg-[var(--surface)] hover:border-[var(--accent)]/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${invoiceSourceBadge(source)}`}>
                      {invoiceSourceLabel(source)}
                    </span>
                    <span className="font-medium text-[var(--text-main)]">{String(result.invoice_number || `#${result.id}`)}</span>
                    <span className="text-xs text-[var(--text-subtle)]">{formatMoney(result.amount_chf)}</span>
                    <span className="text-xs text-[var(--text-subtle)]">{String(result.invoice_status || "")}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-subtle)]">
                    {String(result.tour_customer_name || "")}
                    {result.tour_customer_name && result.tour_object_label ? " · " : ""}
                    {String(result.tour_object_label || "")}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
        {!searching && searchInput.trim().length >= 2 && results.length === 0 && !searchError ? (
          <p className="text-xs text-[var(--text-subtle)]">Keine offenen Rechnungen gefunden.</p>
        ) : null}
      </div>

      {searchError ? <p className="text-sm text-red-600">{searchError}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-[var(--accent)] text-white px-3 py-1.5 text-xs disabled:opacity-50"
          disabled={!selected || busy !== ""}
          onClick={() => void handleConfirm()}
        >
          {busy === "confirm"
            ? "Speichert…"
            : selected?.invoice_source === "exxas"
              ? "Importieren + zuordnen"
              : "Zuordnen"}
        </button>
        <button
          type="button"
          className="rounded border border-[var(--border-soft)] px-3 py-1.5 text-xs disabled:opacity-50"
          disabled={busy !== ""}
          onClick={() => void handleIgnore()}
        >
          {busy === "ignore" ? "Speichert…" : "Ignorieren"}
        </button>
      </div>
    </div>
  );
}

export function ToursAdminBankImportPage() {
  const qk = toursAdminBankImportQueryKey();
  const queryFn = useCallback(() => getToursAdminBankImport(), []);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 15_000 });
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const runs = (data?.runs as BankRun[]) || [];
  const pendingRows = ((data?.pendingRows as BankImportTx[]) || []).slice().sort((a, b) => {
    const aReview = String(a.match_status || "") === "review" ? 0 : 1;
    const bReview = String(b.match_status || "") === "review" ? 0 : 1;
    return aReview - bReview;
  });
  const reviewRows = (data?.reviewRows as BankImportTx[]) || [];
  const unmatchedRows = (data?.unmatchedRows as BankImportTx[]) || [];

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    setMsg(null);
    try {
      const r = await uploadToursAdminBankFile(f);
      setMsg(`Import OK: Run #${(r as { runId?: number }).runId}, Zeilen ${(r as { totalRows?: number }).totalRows}`);
      void refetch({ force: true });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Bank-Import</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">CAMT054 / CSV Upload.</p>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--text-main)]">{msg}</p> : null}

      <div className="surface-card-strong p-4">
        <label className="text-sm font-medium text-[var(--text-main)] block mb-2">Datei hochladen</label>
        <input type="file" accept=".xml,.csv,text/xml,text/csv" disabled={uploading} onChange={(e) => void onUpload(e)} />
        {uploading ? <p className="text-xs text-[var(--text-subtle)] mt-2">Wird verarbeitet…</p> : null}
      </div>

      {data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="surface-card-strong rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--text-subtle)] mb-1">Zu prüfen</p>
            <p className="text-2xl font-bold text-[var(--text-main)]">{pendingRows.length}</p>
          </div>
          <div className="surface-card-strong rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--text-subtle)] mb-1">Mit Vorschlag</p>
            <p className="text-2xl font-bold text-[var(--accent)]">{reviewRows.length}</p>
          </div>
          <div className="surface-card-strong rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--text-subtle)] mb-1">Ohne Treffer</p>
            <p className="text-2xl font-bold text-[var(--text-main)]">{unmatchedRows.length}</p>
          </div>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : null}

      {data ? (
        <>
          <section>
            <h2 className="text-lg font-semibold text-[var(--text-main)] mb-2">Letzte Läufe</h2>
            <div className="surface-card-strong overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                    <th className="p-2">ID</th>
                    <th className="p-2">Datum</th>
                    <th className="p-2">Format</th>
                    <th className="p-2">Zeilen</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={String(r.id)} className="border-b border-[var(--border-soft)]/40">
                      <td className="p-2">{String(r.id)}</td>
                      <td className="p-2">{String(r.created_at || "").slice(0, 19)}</td>
                      <td className="p-2">{String(r.source_format)}</td>
                      <td className="p-2">{String(r.total_rows)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-main)] mb-2">Prüfen &amp; zuordnen ({pendingRows.length})</h2>
            {pendingRows.length === 0 ? (
              <div className="surface-card-strong p-6 text-sm text-[var(--text-subtle)]">
                Keine offenen Import-Buchungen zur Prüfung.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRows.map((tx) => (
                  <PendingTransactionCard
                    key={String(tx.id)}
                    tx={tx}
                    onMessage={setMsg}
                    onRefresh={async () => {
                      await refetch({ force: true });
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
