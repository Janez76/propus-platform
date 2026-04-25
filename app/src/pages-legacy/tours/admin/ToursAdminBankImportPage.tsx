import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, HelpCircle, Upload, X } from "lucide-react";
import {
  type BankImportPreviewResult,
  type BankImportPreviewTx,
  type OrderSearchResult,
  confirmBankImportTransaction,
  getBankImportInvoiceSearch,
  getBankImportOrderSearch,
  getToursAdminBankImport,
  ignoreBankImportTransaction,
  previewToursAdminBankFile,
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
  const [searchMode, setSearchMode] = useState<"invoice" | "order">("invoice");
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<InvoiceSearchResult | null>(initialSelection);
  const [results, setResults] = useState<InvoiceSearchResult[]>([]);
  const [orderResults, setOrderResults] = useState<OrderSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"confirm" | "ignore" | "">("");

  // Rechnungssuche
  useEffect(() => {
    if (searchMode !== "invoice") return;
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
  }, [searchInput, tx.amount_chf, searchMode]);

  // Bestellungssuche
  useEffect(() => {
    if (searchMode !== "order") return;
    const q = searchInput.trim();
    if (q.length < 1) {
      setOrderResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      getBankImportOrderSearch(q)
        .then((response) => {
          if (cancelled) return;
          setOrderResults(response.orders || []);
        })
        .catch((err) => {
          if (cancelled) return;
          setSearchError(err instanceof Error ? err.message : "Suche fehlgeschlagen.");
          setOrderResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchInput, searchMode]);

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
        {/* Tab-Umschalter */}
        <div className="flex gap-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] p-0.5 w-fit">
          <button
            type="button"
            onClick={() => { setSearchMode("invoice"); setSearchInput(""); setResults([]); setOrderResults([]); setSearchError(null); }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              searchMode === "invoice"
                ? "bg-[var(--surface)] text-[var(--text-main)] shadow-sm"
                : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            }`}
          >
            Rechnung
          </button>
          <button
            type="button"
            onClick={() => { setSearchMode("order"); setSearchInput(""); setResults([]); setOrderResults([]); setSearchError(null); }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              searchMode === "order"
                ? "bg-[var(--surface)] text-[var(--text-main)] shadow-sm"
                : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            }`}
          >
            Bestellung
          </button>
        </div>

        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={searchMode === "invoice" ? "Nr., ID, Tour, Kunde, Objekt" : "Bestellnr., Firmenname, Kundenname"}
          className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
        />
        {searching ? <p className="text-xs text-[var(--text-subtle)]">Suche läuft…</p> : null}

        {/* Rechnungs-Ergebnisse */}
        {searchMode === "invoice" && results.length > 0 ? (
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
        {searchMode === "invoice" && !searching && searchInput.trim().length >= 2 && results.length === 0 && !searchError ? (
          <p className="text-xs text-[var(--text-subtle)]">Keine offenen Rechnungen gefunden.</p>
        ) : null}

        {/* Bestellungs-Ergebnisse */}
        {searchMode === "order" && orderResults.length > 0 ? (
          <div className="space-y-3">
            {orderResults.map((order) => (
              <div key={order.order_no} className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--surface-raised)] border-b border-[var(--border-soft)]">
                  <span className="text-xs font-semibold text-[var(--text-main)]">Bestellung #{order.order_no}</span>
                  {order.customer_name ? (
                    <span className="text-xs text-[var(--text-subtle)] ml-2">{order.customer_name}</span>
                  ) : null}
                </div>
                <div className="p-2 space-y-1.5">
                  {order.invoices.length === 0 ? (
                    <p className="text-xs text-[var(--text-subtle)] px-1">Keine Rechnungen zu dieser Bestellung.</p>
                  ) : (
                    order.invoices.map((inv) => {
                      const isSelected = selected?.invoice_source === "renewal" && String(selected.id) === String(inv.id);
                      return (
                        <button
                          key={String(inv.id)}
                          type="button"
                          onClick={() => setSelected({
                            invoice_source: "renewal",
                            id: inv.id,
                            invoice_number: inv.invoice_number ?? undefined,
                            amount_chf: inv.amount_chf,
                            invoice_status: inv.invoice_status ?? undefined,
                            tour_id: inv.tour_id ?? undefined,
                            tour_object_label: inv.tour_object_label ?? undefined,
                            canConfirmDirectly: true,
                            requiresImport: false,
                          })}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                            isSelected
                              ? "border-[var(--accent)] bg-[var(--accent)]/10"
                              : "border-[var(--border-soft)] hover:border-[var(--accent)]/40"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium bg-green-500/10 text-green-700 border-green-500/20">
                              Intern
                            </span>
                            <span className="font-medium text-[var(--text-main)] text-xs">
                              {inv.invoice_number || `#${inv.id}`}
                            </span>
                            <span className="text-xs text-[var(--text-subtle)]">{formatMoney(inv.amount_chf)}</span>
                            <span className="text-xs text-[var(--text-subtle)]">{String(inv.invoice_status || "")}</span>
                          </div>
                          {inv.tour_object_label ? (
                            <div className="mt-0.5 text-[11px] text-[var(--text-subtle)]">{inv.tour_object_label}</div>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {searchMode === "order" && !searching && searchInput.trim().length >= 1 && orderResults.length === 0 && !searchError ? (
          <p className="text-xs text-[var(--text-subtle)]">Keine Bestellungen mit Rechnungen gefunden.</p>
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

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-medium">{label}</span>
      <span className={`text-xs text-[var(--text-main)] break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function matchStatusIcon(status: string) {
  if (status === "exact") return <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />;
  if (status === "review") return <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />;
  return <HelpCircle className="h-4 w-4 p-text-muted flex-shrink-0" />;
}

function matchStatusText(status: string) {
  if (status === "exact") return "Automatisch zugeordnet";
  if (status === "review") return "Vorschlag vorhanden";
  return "Kein Treffer";
}

function PreviewTransactionList({ transactions }: { transactions: BankImportPreviewTx[] }) {
  return (
    <div className="space-y-3">
      {transactions.map((tx, i) => (
        <div
          key={i}
          className={`rounded-xl border text-sm overflow-hidden ${
            tx.match_status === "exact"
              ? "border-green-500/20"
              : tx.match_status === "review"
                ? "border-yellow-500/20"
                : "border-[var(--border-soft)]"
          }`}
        >
          <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${
            tx.match_status === "exact"
              ? "bg-green-500/8"
              : tx.match_status === "review"
                ? "bg-yellow-500/8"
                : "bg-[var(--surface-raised)]"
          }`}>
            {matchStatusIcon(tx.match_status)}
            <span className="font-semibold text-[var(--text-main)] text-base">
              {tx.currency} {typeof tx.amount_chf === "number" ? tx.amount_chf.toFixed(2) : "—"}
            </span>
            <span className={`text-xs font-medium ${
              tx.match_status === "exact" ? "text-green-700" :
              tx.match_status === "review" ? "text-yellow-700" : "text-zinc-500"
            }`}>
              {matchStatusText(tx.match_status)}
            </span>
            {tx.requires_import ? (
              <span className="text-[11px] rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-700 px-2 py-0.5 ml-auto">
                Exxas → Import nötig
              </span>
            ) : null}
          </div>
          <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 bg-[var(--surface)]">
            {tx.booking_date ? <InfoRow label="Buchungsdatum" value={tx.booking_date} /> : null}
            {tx.value_date && tx.value_date !== tx.booking_date ? <InfoRow label="Valuta" value={tx.value_date} /> : null}
            {tx.debtor_name ? <InfoRow label="Zahler" value={tx.debtor_name} /> : null}
            {tx.debtor_iban ? <InfoRow label="Zahler IBAN" value={tx.debtor_iban} mono /> : null}
            {tx.creditor_name ? <InfoRow label="Empfänger" value={tx.creditor_name} /> : null}
            {tx.creditor_iban ? <InfoRow label="Empfänger IBAN" value={tx.creditor_iban} mono /> : null}
            {tx.reference_structured ? (
              <InfoRow label="QR-/Referenz" value={tx.reference_structured} mono />
            ) : tx.reference_raw ? (
              <InfoRow label="Referenz" value={tx.reference_raw} mono />
            ) : null}
            {tx.reference_unstructured && tx.reference_unstructured !== tx.reference_structured ? (
              <InfoRow label="Mitteilung" value={tx.reference_unstructured} />
            ) : null}
            {tx.purpose && tx.purpose !== tx.reference_raw && tx.purpose !== tx.reference_unstructured ? (
              <InfoRow label="Zweck" value={tx.purpose} />
            ) : null}
            {tx.additional_info ? <InfoRow label="Zusatzinfo" value={tx.additional_info} /> : null}
          </div>
          {(tx.matched_invoice_number || tx.matched_invoice_id) ? (
            <div className={`px-4 py-2.5 border-t text-xs ${
              tx.match_status === "exact"
                ? "border-green-500/15 bg-green-500/5"
                : "border-yellow-500/15 bg-yellow-500/5"
            }`}>
              <span className="font-medium text-[var(--text-main)]">Rechnung:</span>{" "}
              <span className="font-mono">{tx.matched_invoice_number || `#${tx.matched_invoice_id}`}</span>
              {tx.matched_invoice_amount != null
                ? <span className="text-[var(--text-subtle)]"> · CHF {Number(tx.matched_invoice_amount).toFixed(2)}</span>
                : null}
              {tx.matched_customer_name
                ? <span className="text-[var(--text-subtle)]"> · {tx.matched_customer_name}</span>
                : null}
              {tx.matched_tour_label
                ? <span className="text-[var(--text-subtle)]"> · {tx.matched_tour_label}</span>
                : null}
              {tx.match_reason
                ? <div className="text-[11px] text-[var(--text-subtle)] italic mt-0.5">{tx.match_reason}</div>
                : null}
            </div>
          ) : tx.match_reason ? (
            <div className="px-4 py-2 border-t border-[var(--border-soft)] text-[11px] text-[var(--text-subtle)] italic bg-[var(--surface)]">
              {tx.match_reason}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

type MultiPreviewEntry = { file: File; preview: BankImportPreviewResult };

function BankImportPreviewModal({
  entries,
  currentIndex,
  onConfirmOne,
  onSkipOne,
  onClose,
  confirming,
}: {
  entries: MultiPreviewEntry[];
  currentIndex: number;
  onConfirmOne: () => void;
  onSkipOne: () => void;
  onClose: () => void;
  confirming: boolean;
}) {
  const entry = entries[currentIndex];
  if (!entry) return null;
  const { preview } = entry;
  const isLast = currentIndex === entries.length - 1;
  const totalFiles = entries.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-[var(--text-main)]">
                Vorschau: {preview.fileName || "Bank-Import"}
              </h2>
              {totalFiles > 1 ? (
                <span className="text-xs rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 px-2 py-0.5 font-medium">
                  {currentIndex + 1} / {totalFiles}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-[var(--text-subtle)] mt-0.5">
              {preview.totalRows} {preview.totalRows === 1 ? "Transaktion" : "Transaktionen"} · Format: {preview.sourceFormat.toUpperCase()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Datei-Tabs bei mehreren Dateien */}
        {totalFiles > 1 ? (
          <div className="px-5 pt-3 flex-shrink-0">
            <div className="flex gap-1 flex-wrap">
              {entries.map((e, idx) => (
                <span
                  key={idx}
                  className={`text-xs rounded-full px-2.5 py-1 border font-medium ${
                    idx === currentIndex
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : idx < currentIndex
                        ? "bg-green-500/10 text-green-700 border-green-500/20"
                        : "bg-[var(--surface-raised)] text-[var(--text-subtle)] border-[var(--border-soft)]"
                  }`}
                >
                  {idx < currentIndex ? "✓ " : ""}{e.preview.fileName || `Datei ${idx + 1}`}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Statistik */}
        <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-[var(--border-soft)] flex-shrink-0 mt-3">
          <div className="rounded-lg bg-green-500/8 border border-green-500/20 px-3 py-2 text-center">
            <p className="text-xl font-bold text-green-700">{preview.exactCount}</p>
            <p className="text-xs text-green-600 mt-0.5">Automatisch</p>
          </div>
          <div className="rounded-lg bg-yellow-500/8 border border-yellow-500/20 px-3 py-2 text-center">
            <p className="text-xl font-bold text-yellow-700">{preview.reviewCount}</p>
            <p className="text-xs text-yellow-600 mt-0.5">Zu prüfen</p>
          </div>
          <div className="rounded-lg bg-zinc-500/8 border border-zinc-500/20 px-3 py-2 text-center">
            <p className="text-xl font-bold text-zinc-600">{preview.noneCount}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Kein Treffer</p>
          </div>
        </div>

        {/* Transaktionsliste */}
        <div className="overflow-y-auto flex-1 px-5 py-3">
          <PreviewTransactionList transactions={preview.transactions} />
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border-soft)] px-5 py-4 flex items-center justify-between gap-3 flex-shrink-0">
          <p className="text-xs text-[var(--text-subtle)]">
            {preview.exactCount > 0
              ? `${preview.exactCount} Zahlungen werden automatisch verbucht.`
              : "Keine automatischen Verbuchungen."}
            {preview.reviewCount > 0
              ? ` ${preview.reviewCount} müssen manuell zugeordnet werden.`
              : ""}
          </p>
          <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)] disabled:opacity-50"
            >
              Abbrechen
            </button>
            {totalFiles > 1 && !isLast ? (
              <button
                type="button"
                onClick={onSkipOne}
                disabled={confirming}
                className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)] disabled:opacity-50"
              >
                Überspringen
              </button>
            ) : null}
            <button
              type="button"
              onClick={onConfirmOne}
              disabled={confirming}
              className="rounded-lg bg-[var(--accent)] text-white px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]/90 disabled:opacity-50 flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {confirming
                ? "Wird importiert…"
                : isLast || totalFiles === 1
                  ? "Import bestätigen"
                  : `Importieren & weiter (${currentIndex + 1}/${totalFiles})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToursAdminBankImportPage() {
  const qk = toursAdminBankImportQueryKey();
  const queryFn = useCallback(() => getToursAdminBankImport(), []);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 15_000 });
  /** Ausgewählter Bank-Import-Lauf (Zeile in „Letzte Läufe“): fokussiert offene Transaktionen dieses Laufs. */
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // Multi-file: Liste von {file, preview}, aktueller Index
  const [previewEntries, setPreviewEntries] = useState<MultiPreviewEntry[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const runs = (data?.runs as BankRun[]) || [];
  const rawPending = (data?.pendingRows as BankImportTx[]) || [];
  const runIdOf = (row: BankImportTx) => Number((row as { run_id?: unknown }).run_id);
  const pendingForView =
    selectedRunId == null ? rawPending : rawPending.filter((r) => runIdOf(r) === selectedRunId);
  const pendingRows = pendingForView.slice().sort((a, b) => {
    const aReview = String(a.match_status || "") === "review" ? 0 : 1;
    const bReview = String(b.match_status || "") === "review" ? 0 : 1;
    return aReview - bReview;
  });
  const reviewRows = pendingRows.filter((row) => String(row.match_status) === "review");
  const unmatchedRows = pendingRows.filter((row) => String(row.match_status) === "none");
  const selectedRun = selectedRunId != null ? runs.find((r) => Number(r.id) === selectedRunId) : null;

  async function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setPreviewing(true);
    setMsg(null);
    try {
      const entries: MultiPreviewEntry[] = [];
      for (const f of files) {
        const result = await previewToursAdminBankFile(f);
        entries.push({ file: f, preview: result });
      }
      setPreviewEntries(entries);
      setPreviewIndex(0);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Vorschau fehlgeschlagen");
    } finally {
      setPreviewing(false);
    }
  }

  async function onConfirmOne() {
    const entry = previewEntries[previewIndex];
    if (!entry) return;
    setUploading(true);
    setMsg(null);
    try {
      const r = await uploadToursAdminBankFile(entry.file);
      const nextMsg = `Import OK: Run #${(r as { runId?: number }).runId}, ${(r as { totalRows?: number }).totalRows} Zeilen (${entry.preview.fileName || entry.file.name})`;
      const isLast = previewIndex >= previewEntries.length - 1;
      if (isLast) {
        setPreviewEntries([]);
        setMsg(nextMsg);
        void refetch({ force: true });
      } else {
        setMsg(nextMsg);
        setPreviewIndex((idx) => idx + 1);
        void refetch({ force: true });
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  function onSkipOne() {
    const isLast = previewIndex >= previewEntries.length - 1;
    if (isLast) {
      setPreviewEntries([]);
    } else {
      setPreviewIndex((idx) => idx + 1);
    }
  }

  function onClosePreview() {
    setPreviewEntries([]);
    setPreviewIndex(0);
  }

  return (
    <div className="space-y-6">
      {previewEntries.length > 0 ? (
        <BankImportPreviewModal
          entries={previewEntries}
          currentIndex={previewIndex}
          confirming={uploading}
          onClose={onClosePreview}
          onConfirmOne={() => void onConfirmOne()}
          onSkipOne={onSkipOne}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Bank-Import</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">CAMT054 / CSV Upload — auch mehrere Dateien gleichzeitig.</p>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--text-main)]">{msg}</p> : null}

      <div className="surface-card-strong p-5">
        <label className="text-sm font-medium text-[var(--text-main)] block mb-3">Dateien hochladen</label>
        <label
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
            previewing || uploading
              ? "border-[var(--border-soft)] opacity-50 cursor-not-allowed"
              : "border-[var(--accent)]/30 hover:border-[var(--accent)] hover:bg-[var(--accent)]/5"
          }`}
        >
          <input
            type="file"
            accept=".xml,.csv,text/xml,text/csv"
            multiple
            disabled={previewing || uploading}
            className="sr-only"
            onChange={(e) => void onFileSelect(e)}
          />
          {previewing ? (
            <>
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
              <p className="text-sm text-[var(--text-subtle)]">Dateien werden analysiert…</p>
            </>
          ) : uploading ? (
            <>
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
              <p className="text-sm text-[var(--text-subtle)]">Wird importiert…</p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/10">
                <Upload className="h-6 w-6 text-[var(--accent)]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--text-main)]">CAMT054 oder CSV hochladen</p>
                <p className="text-xs text-[var(--text-subtle)] mt-0.5">Klicken zum Auswählen · .xml oder .csv · Mehrere Dateien möglich</p>
              </div>
            </>
          )}
        </label>
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
            <h2 className="text-lg font-semibold text-[var(--text-main)] mb-1">Letzte Läufe</h2>
            <p className="text-xs text-[var(--text-subtle)] mb-2">
              Klicken Sie einen Lauf an, um die offenen Import-Buchungen (Prüfung) wieder zu diesem
              Durchlauf anzuzeigen. Die ursprüngliche Datei muss dafür nicht erneut hochgeladen werden.
            </p>
            <div className="surface-card-strong overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                    <th className="p-2">ID</th>
                    <th className="p-2">Datei</th>
                    <th className="p-2">Datum</th>
                    <th className="p-2">Format</th>
                    <th className="p-2">Zeilen</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => {
                    const rid = Number(r.id);
                    const active = selectedRunId != null && rid === selectedRunId;
                    return (
                      <tr
                        key={String(r.id)}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedRunId((cur) => (cur === rid ? null : rid))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedRunId((cur) => (cur === rid ? null : rid));
                          }
                        }}
                        className={`border-b border-[var(--border-soft)]/40 cursor-pointer transition-colors ${
                          active
                            ? "bg-[var(--accent)]/12 ring-1 ring-inset ring-[var(--accent)]/35"
                            : "hover:bg-[var(--text-main)]/5"
                        }`}
                        title="Lauf auswählen: offene Prüfungen anzeigen"
                      >
                        <td className="p-2 font-mono">#{String(r.id)}</td>
                        <td className="p-2 max-w-[200px] truncate" title={String((r as { file_name?: unknown }).file_name ?? "")}>
                          {String((r as { file_name?: unknown }).file_name || "").trim() || "—"}
                        </td>
                        <td className="p-2 whitespace-nowrap">{String(r.created_at || "").slice(0, 19)}</td>
                        <td className="p-2">{String(r.source_format)}</td>
                        <td className="p-2 font-variant-numeric tabular-nums">{String(r.total_rows)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {selectedRunId != null ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--text-main)]/5 px-3 py-2 text-xs text-[var(--text-main)]">
                <span>
                  Fokus: Lauf <strong>#{String(selectedRunId)}</strong>
                  {String((selectedRun as { file_name?: unknown } | null)?.file_name || "").trim()
                    ? ` · ${String((selectedRun as { file_name?: string }).file_name).trim()}`
                    : null}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedRunId(null)}
                  className="shrink-0 rounded border border-[var(--border-soft)] px-2 py-1 text-[11px] font-medium text-[var(--text-subtle)] hover:text-[var(--text-main)] hover:border-[var(--text-subtle)]"
                >
                  Alle Läufe
                </button>
              </div>
            ) : null}
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
