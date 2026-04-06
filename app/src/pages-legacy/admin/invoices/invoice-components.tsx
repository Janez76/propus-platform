import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  archiveAdminInvoice,
  deleteAdminInvoice,
  importExxasAdminInvoice,
  renewalInvoicePdfUrl,
  resendAdminInvoice,
  updateAdminInvoice,
} from "../../../api/toursAdmin";

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
}: {
  invoices: InvoiceRow[];
  busyActionKey: string | null;
  onEdit: (invoice: InvoiceRow) => void;
  onArchive: (invoice: InvoiceRow) => void;
  onDelete: (invoice: InvoiceRow) => void;
  onResend: (invoice: InvoiceRow) => void;
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
                        {
                          label: "Erneut senden",
                          icon: Send,
                          onClick: () => onResend(row),
                          disabled: busyActionKey !== null,
                        },
                        {
                          label: "Löschen",
                          icon: Trash2,
                          onClick: () => onDelete(row),
                          tone: "danger",
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

  const title = useMemo(() => {
    if (type === "renewal") return `Rechnung ${String(invoice.invoice_number || invoice.id || "")} bearbeiten`;
    return `Exxas-Rechnung ${String(invoice.nummer || invoice.id || "")} bearbeiten`;
  }, [invoice.id, invoice.invoice_number, invoice.nummer, type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload =
        type === "renewal"
          ? {
              invoice_status: invoiceStatus,
              amount_chf: amountCHF,
              due_at: dueAt || null,
              payment_note: paymentNote,
            }
          : {
              exxas_status: exxasStatus,
            };
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
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
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

              <label className="block space-y-1">
                <span className="text-sm font-medium text-[var(--text-main)]">Notiz</span>
                <textarea
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                />
              </label>
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
