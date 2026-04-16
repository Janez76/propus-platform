import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  createFreeformInvoice,
  createTourManualInvoice,
  executeRenewalInvoiceRun,
  getInvoiceFormSuggestions,
  getLinkMatterportBookingSearch,
  getLinkMatterportCustomerDetail,
  getLinkMatterportCustomerSearch,
  getToursAdminToursList,
  previewRenewalInvoiceRun,
  renewalInvoicePdfUrl,
  updateAdminInvoice,
  type RenewalRunResult,
  type RenewalRunTour,
} from "../../../api/toursAdmin";
import type { ToursAdminTourRow } from "../../../types/toursAdmin";

export type InvoiceType = "renewal" | "exxas";
export type InvoiceRow = Record<string, unknown>;
export type EditingInvoice = { type: InvoiceType; invoice: InvoiceRow } | null;
export type InvoiceAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
};

export function formatMoney(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  return `CHF ${n.toFixed(2)}`;
}

export function formatDate(v: unknown) {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function StatusBadge({ status, source }: { status: string; source: InvoiceType }) {
  if (source === "renewal") {
    const map: Record<string, { label: string; cls: string }> = {
      paid:      { label: "Bezahlt",    cls: "bg-green-500/10 text-green-700 border-green-500/20" },
      sent:      { label: "Offen",      cls: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20" },
      overdue:   { label: "Überfällig", cls: "bg-red-500/10 text-red-700 border-red-500/20" },
      draft:     { label: "Entwurf",    cls: "bg-[var(--border-soft)]/50 text-[var(--text-subtle)] border-[var(--border-soft)]" },
      cancelled: { label: "Storniert",  cls: "bg-gray-500/10 text-gray-600 border-gray-400/20" },
      archived:  { label: "Archiviert", cls: "bg-slate-500/10 text-slate-600 border-slate-400/20" },
    };
    const entry = map[status] ?? { label: status, cls: "bg-[var(--border-soft)]/50 text-[var(--text-subtle)] border-[var(--border-soft)]" };
    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
        {entry.label}
      </span>
    );
  }
  const isPaid = status === "bz";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${isPaid ? "bg-green-500/10 text-green-700 border-green-500/20" : "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"}`}>
      {isPaid ? "Bezahlt" : (status || "Offen")}
    </span>
  );
}

export const RENEWAL_FILTERS = [
  { val: "", label: "Alle" },
  { val: "offen", label: "Offen" },
  { val: "ueberfaellig", label: "Überfällig" },
  { val: "bezahlt", label: "Bezahlt" },
  { val: "entwurf", label: "Entwurf" },
];

export const EXXAS_FILTERS = [
  { val: "", label: "Alle" },
  { val: "offen", label: "Offen" },
  { val: "bezahlt", label: "Bezahlt" },
];

export const RENEWAL_STATUS_OPTIONS = [
  { value: "draft", label: "Entwurf" },
  { value: "sent", label: "Offen" },
  { value: "overdue", label: "Überfällig" },
  { value: "paid", label: "Bezahlt" },
  { value: "cancelled", label: "Storniert" },
] as const;

export function dateInputValue(value: unknown) {
  if (value == null || value === "") return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function invoiceKindLabel(kind: string): string {
  const map: Record<string, string> = {
    portal_extension: "Verlängerung",
    portal_reactivation: "Reaktivierung",
    floorplan_order: "Grundriss",
  };
  return map[kind] ?? kind ?? "—";
}

export function StatCard({ label, value, tone }: { label: string; value: number | string; tone: "warning" | "danger" | "success" | "neutral" }) {
  const toneClass = {
    warning: "text-yellow-600",
    danger: "text-red-600",
    success: "text-green-600",
    neutral: "text-[var(--text-subtle)]",
  }[tone];
  return (
    <div className="surface-card-strong rounded-xl px-4 py-3">
      <p className="text-xs text-[var(--text-subtle)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

export function ActionMenu({ actions }: { actions: InvoiceAction[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 text-[var(--text-subtle)] hover:border-[var(--accent)]/30 hover:text-[var(--text-main)]"
        aria-label="Aktionen"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 min-w-48 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-lg">
          {actions.map(({ label, icon: Icon, onClick, tone = "default", disabled }) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onClick();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                tone === "danger"
                  ? "text-red-600 hover:bg-red-500/10"
                  : "text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RenewalTable({
  invoices,
  busyActionKey,
  onEdit,
  onArchive,
  onDelete,
  onResend,
  onSendDraft,
}: {
  invoices: InvoiceRow[];
  busyActionKey: string | null;
  onEdit: (invoice: InvoiceRow) => void;
  onArchive: (invoice: InvoiceRow) => void;
  onDelete: (invoice: InvoiceRow) => void;
  onResend: (invoice: InvoiceRow) => void;
  onSendDraft?: (invoice: InvoiceRow) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
          <th className="px-4 py-3">Tour / Kunde</th>
          <th className="px-4 py-3">Nr.</th>
          <th className="px-4 py-3">Typ</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Betrag</th>
          <th className="px-4 py-3">Fällig</th>
          <th className="px-4 py-3 text-right">Aktionen</th>
        </tr>
      </thead>
      <tbody>
        {invoices.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-subtle)]">
              Keine Rechnungen gefunden.
            </td>
          </tr>
        ) : (
          invoices.map((row) => {
            const tid = row.tour_id as number;
            const iid = row.id as string | number;
            return (
              <tr key={String(iid)} className="border-b border-[var(--border-soft)]/50 hover:bg-[var(--accent)]/5 transition-colors">
                <td className="px-4 py-3">
                  <Link to={`/admin/tours/${tid}`} className="text-[var(--accent)] hover:underline font-medium">
                    {String(row.tour_object_label || `Tour #${tid}`)}
                  </Link>
                  <div className="text-xs text-[var(--text-subtle)] mt-0.5">{String(row.tour_customer_name || "")}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{String(row.invoice_number || iid)}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-subtle)]">{invoiceKindLabel(String(row.invoice_kind || ""))}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={String(row.invoice_status || "")} source="renewal" />
                </td>
                <td className="px-4 py-3 font-medium">{formatMoney(row.amount_chf)}</td>
                <td className="px-4 py-3">{formatDate(row.due_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <a
                      href={renewalInvoicePdfUrl(tid, iid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2 py-1 text-xs text-[var(--accent)] hover:border-[var(--accent)]/30"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      PDF
                    </a>
                    {String(row.invoice_status || "") === "draft" && onSendDraft ? (
                      <button
                        type="button"
                        disabled={busyActionKey !== null}
                        onClick={() => onSendDraft(row)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Senden
                      </button>
                    ) : null}
                    <ActionMenu
                      actions={[
                        {
                          label: "Bearbeiten",
                          icon: Pencil,
                          onClick: () => onEdit(row),
                          disabled: busyActionKey !== null,
                        },
                        {
                          label: "Archivieren",
                          icon: Archive,
                          onClick: () => onArchive(row),
                          disabled: busyActionKey !== null,
                        },
                        ...(String(row.invoice_status || "") !== "draft"
                          ? [
                              {
                                label: "Erneut senden",
                                icon: Send,
                                onClick: () => onResend(row),
                                disabled: busyActionKey !== null,
                              },
                            ]
                          : []),
                        {
                          label: "Löschen",
                          icon: Trash2,
                          onClick: () => onDelete(row),
                          tone: "danger" as const,
                          disabled: busyActionKey !== null || String(row.invoice_status || "") === "paid",
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
    </table>
  );
}

export function ExxasTable({
  invoices,
  busyActionKey,
  onImport,
  onEdit,
  onArchive,
  onDelete,
}: {
  invoices: InvoiceRow[];
  busyActionKey: string | null;
  onImport: (invoice: InvoiceRow) => void;
  onEdit: (invoice: InvoiceRow) => void;
  onArchive: (invoice: InvoiceRow) => void;
  onDelete: (invoice: InvoiceRow) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
          <th className="px-4 py-3">Kunde</th>
          <th className="px-4 py-3">Nr.</th>
          <th className="px-4 py-3">Bezeichnung</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Betrag</th>
          <th className="px-4 py-3">Fällig</th>
          <th className="px-4 py-3">Tour</th>
          <th className="px-4 py-3 text-right">Aktionen</th>
        </tr>
      </thead>
      <tbody>
        {invoices.length === 0 ? (
          <tr>
            <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-subtle)]">
              Keine Exxas-Rechnungen gefunden.
            </td>
          </tr>
        ) : (
          invoices.map((row) => {
            const tid = row.tour_id as number | null;
            const iid = row.id as string | number;
            const importedRenewalId = row.imported_renewal_invoice_id as number | null;
            return (
              <tr key={String(iid)} className="border-b border-[var(--border-soft)]/50 hover:bg-[var(--accent)]/5 transition-colors">
                <td className="px-4 py-3 font-medium">{String(row.kunde_name || "—")}</td>
                <td className="px-4 py-3 font-mono text-xs">{String(row.nummer || iid)}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-subtle)] max-w-[200px] truncate" title={String(row.bezeichnung || "")}>
                  {String(row.bezeichnung || "—")}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={String(row.exxas_status || "")} source="exxas" />
                </td>
                <td className="px-4 py-3 font-medium">{formatMoney(row.preis_brutto)}</td>
                <td className="px-4 py-3">{formatDate(row.zahlungstermin)}</td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    {tid ? (
                      <Link to={`/admin/tours/${tid}`} className="text-[var(--accent)] hover:underline text-xs">
                        {String(row.tour_object_label || `#${tid}`)}
                      </Link>
                    ) : (
                      <span className="text-xs text-[var(--text-subtle)]">—</span>
                    )}
                    {importedRenewalId ? (
                      <div className="text-[10px] text-green-600">
                        Intern importiert: #{String(row.imported_renewal_invoice_number || importedRenewalId)}
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <ActionMenu
                      actions={[
                        {
                          label: importedRenewalId ? "Bereits importiert" : "Ins interne Modul importieren",
                          icon: Download,
                          onClick: () => onImport(row),
                          disabled: busyActionKey !== null || !tid || Boolean(importedRenewalId),
                        },
                        {
                          label: "Bearbeiten",
                          icon: Pencil,
                          onClick: () => onEdit(row),
                          disabled: busyActionKey !== null,
                        },
                        {
                          label: "Archivieren",
                          icon: Archive,
                          onClick: () => onArchive(row),
                          disabled: busyActionKey !== null,
                        },
                        {
                          label: "Löschen",
                          icon: Trash2,
                          onClick: () => onDelete(row),
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
    </table>
  );
}

function parseDDMMYYYY(val: string): string | null {
  const m = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function dateToDisplayDDMMYYYY(v: unknown): string {
  if (v == null || v === "") return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function EditInvoiceModal({
  type,
  invoice,
  onClose,
  onSaved,
}: {
  type: InvoiceType;
  invoice: InvoiceRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState(String(invoice.invoice_status || ""));
  const [amountCHF, setAmountCHF] = useState(String(invoice.amount_chf ?? ""));
  const [dueAt, setDueAt] = useState(dateInputValue(invoice.due_at));
  const [paymentNote, setPaymentNote] = useState(String(invoice.payment_note || ""));
  const [exxasStatus, setExxasStatus] = useState(String(invoice.exxas_status || ""));
  // Neue Felder
  const [paidAtDate, setPaidAtDate] = useState(dateToDisplayDDMMYYYY(invoice.paid_at_date ?? invoice.paid_at));
  const [paymentChannel, setPaymentChannel] = useState(String(invoice.payment_channel || ""));
  const [skontoChf, setSkontoChf] = useState(invoice.skonto_chf != null ? String(invoice.skonto_chf) : "");
  const [paidReceivedChf, setPaidReceivedChf] = useState("");
  const [writeoff, setWriteoff] = useState(invoice.writeoff === true || invoice.writeoff === "true");
  const [writeoffReason, setWriteoffReason] = useState(String(invoice.writeoff_reason || ""));

  const skontoFromDifference = useMemo(() => {
    const inv = parseFloat(String(amountCHF).replace(",", ".")) || 0;
    const raw = paidReceivedChf.trim().replace(",", ".");
    if (raw === "") return null;
    const rec = parseFloat(raw);
    if (!Number.isFinite(rec) || inv <= 0) return null;
    const diff = Math.max(0, Math.round((inv - rec) * 100) / 100);
    const pct = Math.round((diff / inv) * 10000) / 100;
    return { chf: diff, pct };
  }, [amountCHF, paidReceivedChf]);

  useEffect(() => {
    if (skontoFromDifference === null) return;
    setSkontoChf(skontoFromDifference.chf.toFixed(2));
  }, [skontoFromDifference]);

  const title = useMemo(() => {
    if (type === "renewal") return `Rechnung ${String(invoice.invoice_number || invoice.id || "")} bearbeiten`;
    return `Exxas-Rechnung ${String(invoice.nummer || invoice.id || "")} bearbeiten`;
  }, [invoice.id, invoice.invoice_number, invoice.nummer, type]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let payload: Record<string, unknown>;
      if (type === "renewal") {
        const paidAtIso = paidAtDate.trim() ? parseDDMMYYYY(paidAtDate.trim()) : null;
        if (paidAtDate.trim() && !paidAtIso) {
          setError("Bezahlt am: Bitte TT.MM.JJJJ eingeben.");
          setSaving(false);
          return;
        }
        payload = {
          invoice_status: invoiceStatus,
          amount_chf: amountCHF,
          due_at: dueAt || null,
          payment_note: paymentNote,
          paid_at_date: paidAtIso,
          payment_channel: paymentChannel || null,
          skonto_chf: skontoChf !== "" ? skontoChf : null,
          writeoff,
          writeoff_reason: writeoff ? writeoffReason : null,
        };
      } else {
        payload = { exxas_status: exxasStatus };
      }
      await updateAdminInvoice(type, String(invoice.id || ""), payload);
      onSaved("Rechnung wurde aktualisiert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4 sticky top-0 bg-[var(--surface)] z-10">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
            aria-label="Schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {type === "renewal" ? (
            <>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-[var(--text-main)]">Status</span>
                <select
                  value={invoiceStatus}
                  onChange={(e) => setInvoiceStatus(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                >
                  {RENEWAL_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-[var(--text-main)]">Betrag (CHF)</span>
                <input
                  type="number"
                  step="0.01"
                  value={amountCHF}
                  onChange={(e) => setAmountCHF(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-[var(--text-main)]">Fällig am</span>
                <input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-[var(--text-main)]">Bezahlt am</span>
                  <input
                    type="text"
                    placeholder="TT.MM.JJJJ"
                    value={paidAtDate}
                    onChange={(e) => setPaidAtDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm font-medium text-[var(--text-main)]">Zahlungskanal</span>
                  <select
                    value={paymentChannel}
                    onChange={(e) => setPaymentChannel(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                  >
                    <option value="">—</option>
                    <option value="ubs">UBS</option>
                    <option value="online">Online</option>
                    <option value="bar">Bar</option>
                    <option value="sonstige">Sonstige</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-[var(--text-main)]">Eingegangene Zahlung (CHF, optional)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="z. B. bei Teilzahlung"
                  value={paidReceivedChf}
                  onChange={(e) => setPaidReceivedChf(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)]"
                />
                <p className="text-[11px] text-[var(--text-subtle)]">
                  Wenn ausgefüllt: Skonto = Differenz zum Rechnungsbetrag (automatisch in CHF und %).
                </p>
              </label>

              {skontoFromDifference !== null ? (
                <div className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-3 py-2 text-sm space-y-0.5">
                  <span className="font-medium text-[var(--text-main)]">Skonto aus Differenz</span>
                  <p className="text-[var(--text-main)] tabular-nums">
                    CHF {skontoFromDifference.chf.toFixed(2)}
                    <span className="text-[var(--text-subtle)] font-normal ml-2">
                      ({skontoFromDifference.pct.toFixed(2)} % vom Rechnungsbetrag)
                    </span>
                  </p>
                </div>
              ) : (
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-[var(--text-main)]">Skonto (CHF, optional)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={skontoChf}
                    onChange={(e) => setSkontoChf(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)]"
                  />
                </label>
              )}

              <label className="block space-y-1">
                <span className="text-sm font-medium text-[var(--text-main)]">Notiz</span>
                <textarea
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                />
              </label>

              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={writeoff}
                    onChange={(e) => setWriteoff(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-soft)] accent-amber-600"
                  />
                  <span className="text-sm font-medium text-amber-900">Betreibung eingeleitet</span>
                </label>
                {writeoff ? (
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--text-subtle)]">Bemerkung / Aktenzeichen (optional)</span>
                    <input
                      type="text"
                      placeholder="z. B. Referenz Betreibungsamt"
                      value={writeoffReason}
                      onChange={(e) => setWriteoffReason(e.target.value)}
                      className="w-full rounded-lg border border-amber-200 bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)]"
                    />
                  </label>
                ) : null}
              </div>
            </>
          ) : (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[var(--text-main)]">Exxas-Status</span>
              <input
                type="text"
                value={exxasStatus}
                onChange={(e) => setExxasStatus(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
              />
            </label>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent)]/90 disabled:opacity-50"
            >
              {saving ? "Speichert..." : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Neue Rechnung erstellen (Freitext oder Tour-gebunden) ──────────────────

type CreateMode = "freeform" | "tour";

const INVOICE_DESCRIPTION_PRESETS = [
  "Virtueller Rundgang – Verlängerung (6 Monate)",
  "Virtueller Rundgang – Verlängerung (12 Monate)",
  "2D-Grundriss",
  "Matterport Hosting / Abo",
];

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function dedupeStrings(list: string[], limit: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

type CustomerPick =
  | { kind: "company"; key: string; id: string; primary: string; secondary: string; email?: string | null; address?: string | null }
  | { kind: "contact"; key: string; customerId: string; primary: string; secondary: string; email?: string | null }
  | { kind: "order"; key: string; orderNo: number; primary: string; secondary: string; email?: string | null; address?: string | null };

function buildCustomerSuggestions(cust: Record<string, unknown>, orders: Record<string, unknown>[]): CustomerPick[] {
  const companies = (cust.companies as Record<string, unknown>[]) ?? [];
  const contacts = (cust.contacts as Record<string, unknown>[]) ?? [];
  const rows: CustomerPick[] = [];
  for (const c of companies) {
    const id = c.id != null ? String(c.id) : "";
    if (!id) continue;
    const firm = String(c.firmenname || c.label || "");
    const num = c.nummer != null ? String(c.nummer) : "";
    const em = c.email != null ? String(c.email) : "";
    rows.push({
      kind: "company",
      key: `c-${id}`,
      id,
      primary: firm,
      secondary: [num && `Nr. ${num}`, em].filter(Boolean).join(" · "),
      email: em || null,
      address: c.addressLine != null ? String(c.addressLine) : null,
    });
  }
  for (const ct of contacts) {
    const cid = ct.customerId != null ? String(ct.customerId) : "";
    const contactId = ct.contactId != null ? String(ct.contactId) : "";
    if (!cid) continue;
    const firm = String(ct.firmenname || "");
    const cn = String(ct.contactName || "");
    rows.push({
      kind: "contact",
      key: `ct-${contactId || cn}-${cid}`,
      customerId: cid,
      primary: cn ? `${firm} – ${cn}` : firm,
      secondary: String(ct.contactEmail || ct.customerEmail || ""),
      email: (ct.contactEmail || ct.customerEmail) as string | null | undefined,
    });
  }
  for (const o of orders.slice(0, 8)) {
    const oid = o.id != null ? Number(o.id) : NaN;
    const orderNo = o.order_no != null ? Number(o.order_no) : NaN;
    if (!Number.isFinite(oid) || !Number.isFinite(orderNo)) continue;
    const company = String(o.company ?? "").trim();
    const address = String(o.address ?? "").trim();
    rows.push({
      kind: "order",
      key: `o-${oid}`,
      orderNo,
      primary: company ? company : `Bestellung #${orderNo}`,
      secondary: [`#${orderNo}`, address].filter(Boolean).join(" · "),
      email: String(o.coreEmail ?? o.email ?? o.contactEmail ?? "") || null,
      address: address || null,
    });
  }
  return rows;
}

export function CreateInvoiceModal({
  onClose,
  onCreated,
  presetTourId,
  presetTourLabel,
}: {
  onClose: () => void;
  onCreated: (message: string) => void;
  presetTourId?: number | string;
  presetTourLabel?: string;
}) {
  const [mode, setMode] = useState<CreateMode>(presetTourId ? "tour" : "freeform");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [description, setDescription] = useState("");
  const [amountChf, setAmountChf] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [skontoChf, setSkontoChfCreate] = useState("");
  const [tourId, setTourId] = useState(presetTourId ? String(presetTourId) : "");
  /** Optionale Tour-Verknüpfung nur im Freitext-Modus */
  const [freeformTourLink, setFreeformTourLink] = useState("");
  const [markPaidNow, setMarkPaidNow] = useState(false);
  const [paidAt, setPaidAt] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const customerWrapRef = useRef<HTMLDivElement>(null);
  const tourWrapRef = useRef<HTMLDivElement>(null);
  const freeformTourWrapRef = useRef<HTMLDivElement>(null);

  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerRows, setCustomerRows] = useState<CustomerPick[]>([]);

  const [tourMenuOpen, setTourMenuOpen] = useState(false);
  const [tourLoading, setTourLoading] = useState(false);
  const [tourRows, setTourRows] = useState<ToursAdminTourRow[]>([]);

  const [ffTourMenuOpen, setFfTourMenuOpen] = useState(false);
  const [ffTourLoading, setFfTourLoading] = useState(false);
  const [ffTourRows, setFfTourRows] = useState<ToursAdminTourRow[]>([]);

  const [customerHighlightIdx, setCustomerHighlightIdx] = useState(-1);
  const [tourHighlightIdx, setTourHighlightIdx] = useState(-1);
  const [ffTourHighlightIdx, setFfTourHighlightIdx] = useState(-1);
  const customerHiRef = useRef(-1);
  const tourHiRef = useRef(-1);
  const ffTourHiRef = useRef(-1);

  const [formSuggestions, setFormSuggestions] = useState<{ descriptions: string[]; invoiceNumbers: string[]; notes: string[] }>({
    descriptions: [],
    invoiceNumbers: [],
    notes: [],
  });

  const debouncedCustomerQ = useDebouncedValue(customerName.trim(), 280);
  const debouncedTourQ = useDebouncedValue(tourId.trim(), 280);
  const debouncedFfTourQ = useDebouncedValue(freeformTourLink.trim(), 280);
  const debouncedFormSuggestQ = useDebouncedValue(description.trim().slice(0, 80), 400);

  const descDatalistOptions = useMemo(
    () => dedupeStrings([...INVOICE_DESCRIPTION_PRESETS, ...formSuggestions.descriptions], 40),
    [formSuggestions.descriptions],
  );
  const invNoDatalistOptions = useMemo(() => dedupeStrings([...formSuggestions.invoiceNumbers], 20), [formSuggestions.invoiceNumbers]);
  const noteDatalistOptions = useMemo(() => dedupeStrings([...formSuggestions.notes], 24), [formSuggestions.notes]);

  useEffect(() => {
    let cancelled = false;
    void getInvoiceFormSuggestions()
      .then((r) => {
        if (cancelled || !r.ok) return;
        setFormSuggestions((prev) => ({
          descriptions: r.descriptions.length ? r.descriptions : prev.descriptions,
          invoiceNumbers: r.invoiceNumbers.length ? r.invoiceNumbers : prev.invoiceNumbers,
          notes: r.notes.length ? r.notes : prev.notes,
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (debouncedFormSuggestQ.length < 2) return;
    let cancelled = false;
    void getInvoiceFormSuggestions(debouncedFormSuggestQ)
      .then((r) => {
        if (cancelled || !r.ok) return;
        setFormSuggestions((prev) => ({
          descriptions: r.descriptions.length ? r.descriptions : prev.descriptions,
          invoiceNumbers: prev.invoiceNumbers,
          notes: r.notes.length ? r.notes : prev.notes,
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debouncedFormSuggestQ]);

  useEffect(() => {
    customerHiRef.current = customerHighlightIdx;
  }, [customerHighlightIdx]);
  useEffect(() => {
    tourHiRef.current = tourHighlightIdx;
  }, [tourHighlightIdx]);
  useEffect(() => {
    ffTourHiRef.current = ffTourHighlightIdx;
  }, [ffTourHighlightIdx]);

  useEffect(() => {
    setCustomerHighlightIdx(-1);
  }, [customerRows, customerLoading]);
  useEffect(() => {
    setTourHighlightIdx(-1);
  }, [tourRows, tourLoading]);
  useEffect(() => {
    setFfTourHighlightIdx(-1);
  }, [ffTourRows, ffTourLoading]);

  useEffect(() => {
    if (customerHighlightIdx < 0) return;
    document.getElementById(`create-inv-cust-opt-${customerHighlightIdx}`)?.scrollIntoView({ block: "nearest" });
  }, [customerHighlightIdx]);
  useEffect(() => {
    if (tourHighlightIdx < 0) return;
    document.getElementById(`create-inv-tour-opt-${tourHighlightIdx}`)?.scrollIntoView({ block: "nearest" });
  }, [tourHighlightIdx]);
  useEffect(() => {
    if (ffTourHighlightIdx < 0) return;
    document.getElementById(`create-inv-fftour-opt-${ffTourHighlightIdx}`)?.scrollIntoView({ block: "nearest" });
  }, [ffTourHighlightIdx]);

  useEffect(() => {
    if (!customerMenuOpen || debouncedCustomerQ.length < 2) {
      setCustomerRows([]);
      setCustomerLoading(false);
      return;
    }
    let cancelled = false;
    setCustomerLoading(true);
    void Promise.all([getLinkMatterportCustomerSearch(debouncedCustomerQ), getLinkMatterportBookingSearch(debouncedCustomerQ)])
      .then(([cust, book]) => {
        if (cancelled) return;
        setCustomerRows(buildCustomerSuggestions(cust as Record<string, unknown>, (book.orders as Record<string, unknown>[]) ?? []));
      })
      .catch(() => {
        if (!cancelled) setCustomerRows([]);
      })
      .finally(() => {
        if (!cancelled) setCustomerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedCustomerQ, customerMenuOpen]);

  useEffect(() => {
    if (!tourMenuOpen || presetTourId || mode !== "tour") {
      setTourRows([]);
      setTourLoading(false);
      return;
    }
    if (/^\d+$/.test(debouncedTourQ) && debouncedTourQ.length <= 9) {
      setTourRows([]);
      setTourLoading(false);
      return;
    }
    let cancelled = false;
    setTourLoading(true);
    void getToursAdminToursList(`?q=${encodeURIComponent(debouncedTourQ)}&page=1`)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && Array.isArray(res.tours)) setTourRows(res.tours);
        else setTourRows([]);
      })
      .catch(() => {
        if (!cancelled) setTourRows([]);
      })
      .finally(() => {
        if (!cancelled) setTourLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedTourQ, tourMenuOpen, mode, presetTourId]);

  useEffect(() => {
    if (!ffTourMenuOpen || mode !== "freeform") {
      setFfTourRows([]);
      setFfTourLoading(false);
      return;
    }
    if (/^\d+$/.test(debouncedFfTourQ) && debouncedFfTourQ.length <= 9) {
      setFfTourRows([]);
      setFfTourLoading(false);
      return;
    }
    let cancelled = false;
    setFfTourLoading(true);
    void getToursAdminToursList(`?q=${encodeURIComponent(debouncedFfTourQ)}&page=1`)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && Array.isArray(res.tours)) setFfTourRows(res.tours);
        else setFfTourRows([]);
      })
      .catch(() => {
        if (!cancelled) setFfTourRows([]);
      })
      .finally(() => {
        if (!cancelled) setFfTourLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedFfTourQ, ffTourMenuOpen, mode]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (customerWrapRef.current?.contains(t)) return;
      if (tourWrapRef.current?.contains(t)) return;
      if (freeformTourWrapRef.current?.contains(t)) return;
      setCustomerMenuOpen(false);
      setTourMenuOpen(false);
      setFfTourMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pickTourRow(t: ToursAdminTourRow, slot: "tour" | "ff") {
    if (slot === "tour") {
      setTourId(String(t.id));
      setTourMenuOpen(false);
      setTourHighlightIdx(-1);
    } else {
      setFreeformTourLink(String(t.id));
      setFfTourMenuOpen(false);
      setFfTourHighlightIdx(-1);
    }
  }

  function onCustomerKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const navigable = customerMenuOpen && debouncedCustomerQ.length >= 2 && !customerLoading && customerRows.length > 0;
    if (e.key === "Escape") {
      if (customerMenuOpen) {
        e.preventDefault();
        setCustomerMenuOpen(false);
        setCustomerHighlightIdx(-1);
      }
      return;
    }
    if (!navigable) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCustomerHighlightIdx((i) => {
        if (i < customerRows.length - 1) return i + 1;
        return i === -1 ? 0 : i;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCustomerHighlightIdx((i) => (i > 0 ? i - 1 : -1));
    } else if (e.key === "Enter") {
      const hi = customerHiRef.current;
      const row = customerRows[hi];
      if (hi >= 0 && row) {
        e.preventDefault();
        void applyCustomerPick(row);
      }
    } else if (e.key === "Tab") {
      setCustomerMenuOpen(false);
      setCustomerHighlightIdx(-1);
    }
  }

  function onTourKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (presetTourId) return;
    const navigable =
      tourMenuOpen && debouncedTourQ.length >= 2 && !/^\d+$/.test(debouncedTourQ) && !tourLoading && tourRows.length > 0;
    if (e.key === "Escape") {
      if (tourMenuOpen) {
        e.preventDefault();
        setTourMenuOpen(false);
        setTourHighlightIdx(-1);
      }
      return;
    }
    if (!navigable) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setTourHighlightIdx((i) => {
        if (i < tourRows.length - 1) return i + 1;
        return i === -1 ? 0 : i;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setTourHighlightIdx((i) => (i > 0 ? i - 1 : -1));
    } else if (e.key === "Enter") {
      const hi = tourHiRef.current;
      const row = tourRows[hi];
      if (hi >= 0 && row) {
        e.preventDefault();
        pickTourRow(row, "tour");
      }
    } else if (e.key === "Tab") {
      setTourMenuOpen(false);
      setTourHighlightIdx(-1);
    }
  }

  function onFfTourKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const navigable =
      ffTourMenuOpen && debouncedFfTourQ.length >= 2 && !/^\d+$/.test(debouncedFfTourQ) && !ffTourLoading && ffTourRows.length > 0;
    if (e.key === "Escape") {
      if (ffTourMenuOpen) {
        e.preventDefault();
        setFfTourMenuOpen(false);
        setFfTourHighlightIdx(-1);
      }
      return;
    }
    if (!navigable) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFfTourHighlightIdx((i) => {
        if (i < ffTourRows.length - 1) return i + 1;
        return i === -1 ? 0 : i;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFfTourHighlightIdx((i) => (i > 0 ? i - 1 : -1));
    } else if (e.key === "Enter") {
      const hi = ffTourHiRef.current;
      const row = ffTourRows[hi];
      if (hi >= 0 && row) {
        e.preventDefault();
        pickTourRow(row, "ff");
      }
    } else if (e.key === "Tab") {
      setFfTourMenuOpen(false);
      setFfTourHighlightIdx(-1);
    }
  }

  async function applyCustomerPick(row: CustomerPick) {
    setCustomerHighlightIdx(-1);
    setCustomerMenuOpen(false);
    if (row.kind === "company") {
      setCustomerName(row.primary);
      setCustomerEmail(row.email?.trim() || "");
      setCustomerAddress(row.address?.trim() || "");
      try {
        const detail = await getLinkMatterportCustomerDetail(parseInt(row.id, 10));
        const cust = detail.customer as Record<string, unknown> | null | undefined;
        if (cust && detail.ok) {
          const line = cust.addressLine != null ? String(cust.addressLine).trim() : "";
          const em = cust.email != null ? String(cust.email).trim() : "";
          if (line) setCustomerAddress(line);
          if (em && !row.email) setCustomerEmail(em);
        }
      } catch {
        /* Adresse bleibt aus Suche */
      }
      return;
    }
    if (row.kind === "contact") {
      setCustomerName(row.primary);
      setCustomerEmail(row.email?.trim() || "");
      try {
        const detail = await getLinkMatterportCustomerDetail(parseInt(row.customerId, 10));
        const cust = detail.customer as Record<string, unknown> | null | undefined;
        if (cust && detail.ok) {
          const line = cust.addressLine != null ? String(cust.addressLine).trim() : "";
          if (line) setCustomerAddress(line);
          const em = cust.email != null ? String(cust.email).trim() : "";
          if (em) setCustomerEmail((prev) => prev || em);
        }
      } catch {
        setCustomerAddress("");
      }
      return;
    }
    setCustomerName(row.primary);
    setCustomerEmail(row.email?.trim() || "");
    setCustomerAddress(row.address?.trim() || "");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (mode === "freeform") {
        const result = await createFreeformInvoice({
          customerName,
          customerEmail: customerEmail || undefined,
          customerAddress: customerAddress || undefined,
          description,
          amountChf,
          invoiceNumber: invoiceNumber || undefined,
          dueAt: dueAt || null,
          invoiceDate: invoiceDate || null,
          paymentNote: paymentNote || null,
          skontoChf: skontoChf || null,
          tourId: freeformTourLink.trim() || null,
          markPaidNow,
          paidAt: paidAt || null,
          paymentMethod: paymentMethod || null,
        });
        if (!(result as Record<string, unknown>).ok) {
          setError(String((result as Record<string, unknown>).error || "Erstellen fehlgeschlagen."));
          return;
        }
      } else {
        const tid = tourId.trim();
        if (!tid || !/^\d+$/.test(tid)) {
          setError("Bitte gültige Tour-ID eingeben oder aus der Liste wählen.");
          return;
        }
        const result = await createTourManualInvoice(tid, {
          invoiceNumber: invoiceNumber || undefined,
          amountChf,
          dueAt: dueAt || null,
          paymentNote: paymentNote || null,
          skontoChf: skontoChf || null,
        });
        if (!(result as Record<string, unknown>).ok) {
          setError(String((result as Record<string, unknown>).error || "Erstellen fehlgeschlagen."));
          return;
        }
      }
      onCreated("Rechnung wurde erstellt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erstellen fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";
  const suggestPanelCls =
    "absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] py-1 text-sm shadow-lg";

  function chipCls(active: boolean) {
    return `rounded-md border px-2 py-0.5 text-xs transition-colors ${
      active
        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-main)]"
        : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--accent)]/40 hover:text-[var(--text-main)]"
    }`;
  }

  function suggestOptionCls(active: boolean) {
    return `flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left ${
      active ? "bg-[var(--accent)]/15 ring-1 ring-inset ring-[var(--accent)]/30" : "hover:bg-[var(--surface-raised)]"
    }`;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <datalist id="create-inv-invno-suggestions">
        {invNoDatalistOptions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4 sticky top-0 bg-[var(--surface)] z-10">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Neue Rechnung erstellen</h2>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]" aria-label="Schliessen">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {!presetTourId && (
            <div className="flex gap-1 rounded-lg border border-[var(--border-soft)] p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("freeform");
                  setError(null);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === "freeform" ? "bg-[var(--accent)] text-white" : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"}`}
              >
                Freitext
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("tour");
                  setError(null);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === "tour" ? "bg-[var(--accent)] text-white" : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"}`}
              >
                Tour-gebunden
              </button>
            </div>
          )}

          {mode === "freeform" && (
            <>
              <div className="relative" ref={customerWrapRef}>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-[var(--text-main)]">Kundenname *</span>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={customerMenuOpen && debouncedCustomerQ.length >= 2}
                    aria-controls="create-inv-cust-listbox"
                    aria-activedescendant={
                      customerHighlightIdx >= 0 ? `create-inv-cust-opt-${customerHighlightIdx}` : undefined
                    }
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    onFocus={() => setCustomerMenuOpen(true)}
                    onKeyDown={onCustomerKeyDown}
                    className={inputCls}
                    placeholder="Firma / Name (Tippen für Vorschläge)"
                  />
                </label>
                {customerMenuOpen && debouncedCustomerQ.length >= 2 ? (
                  <div id="create-inv-cust-listbox" className={suggestPanelCls} role="listbox">
                    {customerLoading ? (
                      <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">Suche…</p>
                    ) : customerRows.length > 0 ? (
                      customerRows.map((row, idx) => (
                        <button
                          key={row.key}
                          id={`create-inv-cust-opt-${idx}`}
                          type="button"
                          role="option"
                          aria-selected={customerHighlightIdx === idx}
                          className={suggestOptionCls(customerHighlightIdx === idx)}
                          onMouseEnter={() => setCustomerHighlightIdx(idx)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void applyCustomerPick(row)}
                        >
                          <span className="font-medium text-[var(--text-main)]">
                            {row.kind === "company" && "Firma · "}
                            {row.kind === "contact" && "Kontakt · "}
                            {row.kind === "order" && "Bestellung · "}
                            {row.primary}
                          </span>
                          {row.secondary ? <span className="text-xs text-[var(--text-subtle)]">{row.secondary}</span> : null}
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">Keine Treffer – Name manuell eintragen.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-[var(--text-main)]">E-Mail</span>
                  <input type="email" autoComplete="off" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className={inputCls} placeholder="kunde@beispiel.ch" />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-[var(--text-main)]">Adresse</span>
                  <input type="text" autoComplete="off" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className={inputCls} placeholder="Strasse, PLZ Ort" />
                </label>
              </div>
              <div className="relative" ref={freeformTourWrapRef}>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-[var(--text-main)]">Tour verknüpfen (optional)</span>
                  <input
                    type="text"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={ffTourMenuOpen && debouncedFfTourQ.length >= 2 && !/^\d+$/.test(debouncedFfTourQ)}
                    aria-controls="create-inv-fftour-listbox"
                    aria-activedescendant={ffTourHighlightIdx >= 0 ? `create-inv-fftour-opt-${ffTourHighlightIdx}` : undefined}
                    value={freeformTourLink}
                    onChange={(e) => setFreeformTourLink(e.target.value)}
                    onFocus={() => setFfTourMenuOpen(true)}
                    onKeyDown={onFfTourKeyDown}
                    className={inputCls}
                    placeholder="Tour-ID oder Suche nach Kunde / Objekt"
                  />
                </label>
                {ffTourMenuOpen && debouncedFfTourQ.length >= 2 && !/^\d+$/.test(debouncedFfTourQ) ? (
                  <div id="create-inv-fftour-listbox" className={suggestPanelCls} role="listbox">
                    {ffTourLoading ? (
                      <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">Suche…</p>
                    ) : ffTourRows.length > 0 ? (
                      ffTourRows.map((t, idx) => (
                        <button
                          key={t.id}
                          id={`create-inv-fftour-opt-${idx}`}
                          type="button"
                          role="option"
                          aria-selected={ffTourHighlightIdx === idx}
                          className={suggestOptionCls(ffTourHighlightIdx === idx)}
                          onMouseEnter={() => setFfTourHighlightIdx(idx)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickTourRow(t, "ff")}
                        >
                          <span className="font-medium text-[var(--text-main)]">#{t.id}</span>
                          <span className="text-xs text-[var(--text-subtle)]">
                            {[String(t.bezeichnung ?? ""), String(t.canonical_customer_name ?? t.customer_email ?? "")].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">Keine Tour gefunden.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-[var(--text-main)]">Beschreibung *</span>
                <textarea
                  required
                  autoComplete="off"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className={inputCls}
                  placeholder="Leistungsbeschreibung"
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {descDatalistOptions.slice(0, 10).map((d) => (
                    <button key={d} type="button" className={chipCls(description.trim() === d)} onClick={() => setDescription(d)}>
                      {d.length > 48 ? `${d.slice(0, 45)}…` : d}
                    </button>
                  ))}
                </div>
              </label>
            </>
          )}

          {mode === "tour" && (
            <div className="relative" ref={tourWrapRef}>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-[var(--text-main)]">Tour *</span>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  role="combobox"
                  disabled={!!presetTourId}
                  aria-expanded={
                    presetTourId ? false : tourMenuOpen && debouncedTourQ.length >= 2 && !/^\d+$/.test(debouncedTourQ)
                  }
                  aria-controls={presetTourId ? undefined : "create-inv-tour-listbox"}
                  aria-activedescendant={
                    presetTourId || tourHighlightIdx < 0 ? undefined : `create-inv-tour-opt-${tourHighlightIdx}`
                  }
                  value={tourId}
                  onChange={(e) => setTourId(e.target.value)}
                  onFocus={() => setTourMenuOpen(true)}
                  onKeyDown={onTourKeyDown}
                  className={inputCls}
                  placeholder="Numerische ID oder Suche (Kunde, Objekt)"
                />
                {presetTourLabel ? <p className="text-xs text-[var(--text-subtle)]">{presetTourLabel}</p> : null}
              </label>
              {tourMenuOpen && !presetTourId && debouncedTourQ.length >= 2 && !/^\d+$/.test(debouncedTourQ) ? (
                <div id="create-inv-tour-listbox" className={suggestPanelCls} role="listbox">
                  {tourLoading ? (
                    <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">Suche…</p>
                  ) : tourRows.length > 0 ? (
                    tourRows.map((t, idx) => (
                      <button
                        key={t.id}
                        id={`create-inv-tour-opt-${idx}`}
                        type="button"
                        role="option"
                        aria-selected={tourHighlightIdx === idx}
                        className={suggestOptionCls(tourHighlightIdx === idx)}
                        onMouseEnter={() => setTourHighlightIdx(idx)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickTourRow(t, "tour")}
                      >
                        <span className="font-medium text-[var(--text-main)]">#{t.id}</span>
                        <span className="text-xs text-[var(--text-subtle)]">
                          {[String(t.bezeichnung ?? ""), String(t.canonical_customer_name ?? t.customer_email ?? "")].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">Keine Tour gefunden.</p>
                  )}
                </div>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[var(--text-main)]">Betrag (CHF) *</span>
              <input type="number" step="0.01" required value={amountChf} onChange={(e) => setAmountChf(e.target.value)} className={inputCls} placeholder="0.00" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[var(--text-main)]">Rechnungsnummer</span>
              <input
                type="text"
                autoComplete="off"
                list="create-inv-invno-suggestions"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className={inputCls}
                placeholder="Automatisch"
              />
              {invNoDatalistOptions.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {invNoDatalistOptions.slice(0, 6).map((n) => (
                    <button key={n} type="button" className={chipCls(invoiceNumber === n)} onClick={() => setInvoiceNumber(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[var(--text-main)]">Fällig am</span>
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputCls} />
            </label>
            {mode === "freeform" && (
              <label className="block space-y-1">
                <span className="text-sm font-medium text-[var(--text-main)]">Rechnungsdatum</span>
                <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[var(--text-main)]">Skonto (CHF)</span>
              <input type="number" step="0.01" min="0" value={skontoChf} onChange={(e) => setSkontoChfCreate(e.target.value)} className={inputCls} placeholder="0.00" />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-[var(--text-main)]">Notiz</span>
            <textarea
              autoComplete="off"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              rows={2}
              className={inputCls}
            />
            {noteDatalistOptions.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {noteDatalistOptions.slice(0, 8).map((n) => (
                  <button key={n} type="button" className={chipCls(paymentNote.trim() === n)} onClick={() => setPaymentNote(n)}>
                    {n.length > 40 ? `${n.slice(0, 37)}…` : n}
                  </button>
                ))}
              </div>
            ) : null}
          </label>

          <div className="rounded-lg border border-[var(--border-soft)] px-4 py-3 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={markPaidNow} onChange={(e) => setMarkPaidNow(e.target.checked)} className="h-4 w-4 rounded border-[var(--border-soft)] accent-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text-main)]">Sofort als bezahlt markieren</span>
            </label>
            {markPaidNow && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-subtle)]">Bezahlt am</span>
                  <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-subtle)]">Zahlungsart</span>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    <option value="qr">QR / Bank</option>
                    <option value="payrexx">Payrexx</option>
                    <option value="manual">Manuell</option>
                    <option value="bar">Bar</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)]">
              Abbrechen
            </button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent)]/90 disabled:opacity-50">
              <Plus className="h-4 w-4" />
              {saving ? "Erstellt..." : "Rechnung erstellen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Rechnungslauf-Modal ───────────────────────────────────────────────────────

type RunPhase = "idle" | "previewing" | "preview" | "executing" | "done";

export function RechnungslaufModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [tours, setTours] = useState<RenewalRunTour[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<RenewalRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const handlePreview = useCallback(async () => {
    setPhase("previewing");
    setRunError(null);
    try {
      const data = await previewRenewalInvoiceRun();
      setTours(data.tours);
      setSelected(new Set(data.tours.map((t) => t.id)));
      setPhase("preview");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Vorschau fehlgeschlagen.");
      setPhase("idle");
    }
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === tours.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tours.map((t) => t.id)));
    }
  }, [selected.size, tours]);

  const toggleOne = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExecute = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length} Rechnung(en) jetzt erstellen und versenden?`)) return;
    setPhase("executing");
    setRunError(null);
    try {
      const data = await executeRenewalInvoiceRun(ids);
      setResult(data);
      setPhase("done");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Rechnungslauf fehlgeschlagen.");
      setPhase("preview");
    }
  }, [selected]);

  const handleClose = useCallback(() => {
    if (phase === "done") onDone();
    else onClose();
  }, [phase, onClose, onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border-soft)] shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Verlängerungs-Rechnungslauf</h2>
            <p className="text-xs text-[var(--text-subtle)] mt-0.5">
              Touren &gt; 6 Monate · Kundenzustimmung · keine bezahlte Verlängerungsrechnung
            </p>
          </div>
          <button type="button" onClick={handleClose} className="rounded-lg p-1.5 hover:bg-[var(--surface-hover)] text-[var(--text-subtle)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {runError ? (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {runError}
            </div>
          ) : null}

          {phase === "idle" && (
            <div className="text-center py-8 space-y-3">
              <RefreshCw className="h-10 w-10 text-[var(--text-subtle)] mx-auto" />
              <p className="text-sm text-[var(--text-subtle)]">
                Klicke auf "Vorschau laden" um zu sehen, welche Touren eine Verlängerungsrechnung erhalten würden.
              </p>
            </div>
          )}

          {(phase === "previewing" || phase === "executing") && (
            <div className="flex items-center justify-center py-12 gap-3 text-[var(--text-subtle)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">
                {phase === "previewing" ? "Lade Vorschau…" : "Erstelle Rechnungen und sende E-Mails…"}
              </span>
            </div>
          )}

          {phase === "preview" && (
            <>
              {tours.length === 0 ? (
                <div className="text-center py-8 space-y-1">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
                  <p className="text-sm font-medium text-[var(--text-main)]">Keine offenen Touren gefunden</p>
                  <p className="text-xs text-[var(--text-subtle)]">Alle berechtigten Touren haben bereits eine Rechnung.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text-main)]">
                      {tours.length} Tour{tours.length !== 1 ? "en" : ""} gefunden
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-subtle)]">
                      <input
                        type="checkbox"
                        checked={selected.size === tours.length && tours.length > 0}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
                      />
                      {selected.size === tours.length ? "Alle abwählen" : "Alle auswählen"}
                    </label>
                  </div>
                  <div className="rounded-lg border border-[var(--border-soft)] divide-y divide-[var(--border-soft)] overflow-hidden">
                    {tours.map((tour) => (
                      <label key={tour.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-hover)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(tour.id)}
                          onChange={() => toggleOne(tour.id)}
                          className="h-4 w-4 rounded accent-[var(--accent)] shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--text-main)] truncate">
                              {String(tour.object_label || `Tour #${tour.id}`)}
                            </span>
                            {tour.is_reactivation ? (
                              <span className="shrink-0 rounded-full bg-orange-100 text-orange-700 text-[10px] font-medium px-1.5 py-0.5">
                                Reaktivierung
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium px-1.5 py-0.5">
                                Verlängerung
                              </span>
                            )}
                          </div>
                          <div className="flex gap-3 mt-0.5">
                            <span className="text-xs text-[var(--text-subtle)] truncate">{String(tour.customer_name || "—")}</span>
                            <span className="text-xs text-[var(--text-subtle)] shrink-0">{String(tour.customer_email || "—")}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-sm font-semibold text-[var(--text-main)]">
                            CHF {Number(tour.amount_chf).toFixed(2)}
                          </span>
                          <div className="text-[10px] text-[var(--text-subtle)] mt-0.5">
                            Erstellt: {tour.tour_age_date ? new Date(tour.tour_age_date).toLocaleDateString("de-CH") : "—"}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selected.size > 0 && (
                    <div className="rounded-lg bg-[var(--accent)]/8 border border-[var(--accent)]/20 px-4 py-2.5 flex items-center justify-between">
                      <span className="text-sm text-[var(--text-main)]">
                        <strong>{selected.size}</strong> Tour{selected.size !== 1 ? "en" : ""} ausgewählt
                      </span>
                      <span className="text-sm font-semibold text-[var(--accent)]">
                        Total CHF{" "}
                        {tours
                          .filter((t) => selected.has(t.id))
                          .reduce((s, t) => s + Number(t.amount_chf), 0)
                          .toFixed(2)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {phase === "done" && result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.created}</p>
                  <p className="text-xs text-green-600 mt-0.5">Erstellt &amp; gesendet</p>
                </div>
                <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-[var(--text-subtle)]">{result.skipped}</p>
                  <p className="text-xs text-[var(--text-subtle)] mt-0.5">Übersprungen</p>
                </div>
                <div
                  className={`rounded-lg border px-4 py-3 text-center ${
                    result.errors > 0 ? "border-red-200 bg-red-50" : "border-[var(--border-soft)] bg-[var(--surface)]"
                  }`}
                >
                  <p className={`text-2xl font-bold ${result.errors > 0 ? "text-red-700" : "text-[var(--text-subtle)]"}`}>
                    {result.errors}
                  </p>
                  <p className={`text-xs mt-0.5 ${result.errors > 0 ? "text-red-600" : "text-[var(--text-subtle)]"}`}>Fehler</p>
                </div>
              </div>

              {result.details.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-red-700 mb-1">Fehlerdetails:</p>
                  {result.details.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">
                      Tour #{e.tourId}: {e.reason}
                    </p>
                  ))}
                </div>
              )}

              {result.details.skipped.length > 0 && (
                <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-[var(--text-subtle)] mb-1">Übersprungen:</p>
                  {result.details.skipped.map((s, i) => (
                    <p key={i} className="text-xs text-[var(--text-subtle)]">
                      Tour #{s.tourId}: {s.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--border-soft)] shrink-0">
          {phase === "done" ? (
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent)]/90"
            >
              <CheckCircle2 className="h-4 w-4" />
              Schliessen &amp; aktualisieren
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={phase === "previewing" || phase === "executing"}
                className="rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)] disabled:opacity-40"
              >
                Abbrechen
              </button>
              {phase === "idle" && (
                <button
                  type="button"
                  onClick={handlePreview}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent)]/90"
                >
                  <ChevronRight className="h-4 w-4" />
                  Vorschau laden
                </button>
              )}
              {phase === "preview" && (
                <>
                  <button
                    type="button"
                    onClick={handlePreview}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Aktualisieren
                  </button>
                  <button
                    type="button"
                    onClick={handleExecute}
                    disabled={selected.size === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent)]/90 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                    {selected.size} Rechnung{selected.size !== 1 ? "en" : ""} erstellen &amp; senden
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
