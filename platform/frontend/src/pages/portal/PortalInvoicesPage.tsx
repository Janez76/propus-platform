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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C5A059]/25 border-t-[#C5A059]" />
      </div>
    );
  }

  const openInvoices = invoices.filter((i) => i.invoice_status === "open" || i.invoice_status === "sent");
  const paidInvoices = invoices.filter((i) => i.invoice_status === "paid");
  const otherInvoices = invoices.filter((i) => !["open", "sent", "paid"].includes(i.invoice_status ?? ""));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Rechnungen</h1>
        <span className="text-sm text-slate-500 dark:text-zinc-400">{invoices.length} Einträge</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {invoices.length === 0 && !error ? (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-10 text-center">
          <FileText className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-zinc-600" />
          <p className="text-slate-500 dark:text-zinc-400">Keine Rechnungen vorhanden.</p>
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
      <h2 className={`font-semibold mb-3 ${highlight ? "text-amber-700 dark:text-amber-400" : "text-slate-700 dark:text-zinc-300"}`}>
        {title}
      </h2>
      <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-zinc-800">
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-zinc-400">Tour</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-zinc-400 hidden sm:table-cell">Datum</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-zinc-400">Betrag</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-zinc-400 hidden sm:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr
                key={inv.id}
                className="border-b border-slate-50 dark:border-zinc-800/50 last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 dark:text-white">
                    {inv.object_label || inv.bezeichnung || `Tour #${inv.tour_id}`}
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-slate-500 dark:text-zinc-400">
                  {formatDate(inv.invoice_date)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">
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
    open: { label: "Offen", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    sent: { label: "Gesendet", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    paid: { label: "Bezahlt", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    cancelled: { label: "Storniert", cls: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400" },
    overdue: { label: "Überfällig", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  };
  const s = map[status] ?? { label: status || "–", cls: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400" };
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
