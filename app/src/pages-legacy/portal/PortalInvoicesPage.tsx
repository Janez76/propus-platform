import { useEffect, useState } from "react";
import { FileText, AlertCircle } from "lucide-react";
import { getPortalInvoices, type PortalInvoice } from "../../api/portalTours";

export function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPortalInvoices()
      .then((r) => setInvoices(r.invoices))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
      </div>
    );
  }

  const openInvoices = invoices.filter((i) => i.invoice_status === "open" || i.invoice_status === "sent");
  const paidInvoices = invoices.filter((i) => i.invoice_status === "paid");
  const otherInvoices = invoices.filter((i) => !["open", "sent", "paid"].includes(i.invoice_status ?? ""));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Rechnungen</h1>
        <span className="text-sm text-[var(--text-subtle)]">{invoices.length} Einträge</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {invoices.length === 0 && !error ? (
        <div className="cust-form-section p-10 text-center">
          <FileText className="h-10 w-10 mx-auto mb-3 text-[var(--text-subtle)]" />
          <p className="text-[var(--text-subtle)]">Keine Rechnungen vorhanden.</p>
        </div>
      ) : (
        <>
          {openInvoices.length > 0 && (
            <InvoiceSection title="Offen / Ausstehend" invoices={openInvoices} highlight />
          )}
          {paidInvoices.length > 0 && (
            <InvoiceSection title="Bezahlt" invoices={paidInvoices} />
          )}
          {otherInvoices.length > 0 && (
            <InvoiceSection title="Weitere" invoices={otherInvoices} />
          )}
        </>
      )}
    </div>
  );
}

function InvoiceSection({
  title,
  invoices,
  highlight = false,
}: {
  title: string;
  invoices: PortalInvoice[];
  highlight?: boolean;
}) {
  return (
    <div>
      <h2 className={`font-semibold mb-3 ${highlight ? "text-amber-700 dark:text-amber-400" : "text-[var(--text-muted)]"}`}>
        {title}
      </h2>
      <div className="cust-form-section overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-soft)]">
              <th className="text-left px-4 py-3 font-medium text-[var(--text-subtle)]">Tour</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--text-subtle)] hidden sm:table-cell">Datum</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--text-subtle)]">Betrag</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--text-subtle)] hidden sm:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr
                key={inv.id}
                className="border-b border-[var(--border-soft)]/50 last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-[var(--text-main)]">
                    {inv.object_label || inv.bezeichnung || `Tour #${inv.tour_id}`}
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-[var(--text-subtle)]">
                  {formatDate(inv.invoice_date)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-[var(--text-main)]">
                  {inv.betrag != null
                    ? `CHF ${Number(inv.betrag).toFixed(2)}`
                    : inv.amount_chf != null
                    ? `CHF ${Number(inv.amount_chf).toFixed(2)}`
                    : "–"}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-center">
                  <InvoiceStatusBadge status={inv.invoice_status ?? ""} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "Offen", cls: "cust-status-badge cust-status-pending" },
    sent: { label: "Gesendet", cls: "cust-status-badge cust-status-open" },
    paid: { label: "Bezahlt", cls: "cust-status-badge cust-status-confirmed" },
    cancelled: { label: "Storniert", cls: "cust-status-badge cust-status-draft" },
    overdue: { label: "Überfällig", cls: "cust-status-badge cust-status-cancelled" },
  };
  const s = map[status] ?? { label: status || "–", cls: "cust-status-badge cust-status-draft" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "–";
  return new Date(dateStr).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}



