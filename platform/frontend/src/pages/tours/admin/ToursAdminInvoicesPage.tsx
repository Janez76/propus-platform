import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { getToursAdminRenewalInvoices, renewalInvoicePdfUrl } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminRenewalInvoicesQueryKey } from "../../../lib/queryKeys";


function formatMoney(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  return `CHF ${n.toFixed(2)}`;
}

function formatDate(v: unknown) {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH");
}

export function ToursAdminInvoicesPage() {
  const [status, setStatus] = useState<string>("");
  const qk = toursAdminRenewalInvoicesQueryKey(status);
  const queryFn = useCallback(() => getToursAdminRenewalInvoices(status || undefined), [status]);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 30_000 });

  const invoices = (data?.invoices as Record<string, unknown>[]) || [];
  const stats = (data?.stats as Record<string, number>) || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Verlängerungsrechnungen</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">Interne Verlängerungsrechnungen.</p>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void refetch({ force: true })}>
            Erneut
          </button>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {[
          ["", "Alle"],
          ["offen", "Offen"],
          ["ueberfaellig", "Überfällig"],
          ["bezahlt", "Bezahlt"],
          ["entwurf", "Entwurf"],
        ].map(([val, label]) => (
          <button
            key={val || "all"}
            type="button"
            onClick={() => setStatus(val)}
            className={`rounded-full px-3 py-1 text-xs font-medium border ${
              status === val ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border-soft)] text-[var(--text-subtle)]"
            }`}
          >
            {label}
            {val === "offen" && stats.offen != null ? ` (${stats.offen})` : null}
            {val === "bezahlt" && stats.bezahlt != null ? ` (${stats.bezahlt})` : null}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        <div className="surface-card-strong overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                <th className="px-4 py-3">Tour</th>
                <th className="px-4 py-3">Nr.</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Betrag</th>
                <th className="px-4 py-3">Fällig</th>
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-subtle)]">
                    Keine Rechnungen.
                  </td>
                </tr>
              ) : (
                invoices.map((row) => {
                  const tid = row.tour_id as number;
                  const iid = row.id as string | number;
                  return (
                    <tr key={String(iid)} className="border-b border-[var(--border-soft)]/50">
                      <td className="px-4 py-3">
                        <Link to={`/admin/tours/${tid}`} className="text-[var(--accent)] hover:underline">
                          {String(row.tour_object_label || `#${tid}`)}
                        </Link>
                        <div className="text-xs text-[var(--text-subtle)]">{String(row.tour_customer_name || "")}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{String(row.invoice_number || iid)}</td>
                      <td className="px-4 py-3">{String(row.invoice_status || "")}</td>
                      <td className="px-4 py-3">{formatMoney(row.amount_chf)}</td>
                      <td className="px-4 py-3">{formatDate(row.due_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={renewalInvoicePdfUrl(tid, iid)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--accent)] hover:underline"
                        >
                          PDF
                        </a>
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
