/**
 * Admin-Rechnungsübersicht – React-Portierung von tours/views/admin/invoices.ejs
 *
 * Daten: /tour-manager/admin/api/invoices
 * Feature-Parität: Filter (alle / offen / bezahlt), Tabelle mit Rechnungsdetails,
 * Manuelles Bezahlen, Rechnung löschen.
 */
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminInvoices, markInvoicePaidManual, deleteInvoice } from '../../api/tourAdmin';
import type { RenewalInvoice } from '../../types/tourManager';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCHF(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return `CHF ${Number(amount).toFixed(2)}`;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  sent: 'Ausstehend',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
  cancelled: 'Storniert',
};

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sent: 'bg-amber-50 text-amber-700 border-amber-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  draft: 'bg-slate-100 text-slate-500 border-slate-200',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Überweisung',
  cash: 'Bar',
  twint: 'TWINT',
  card: 'Karte',
  payrexx: 'Payrexx',
  other: 'Sonstige',
};

const FILTER_TABS = [
  { key: '', label: 'Alle' },
  { key: 'offen', label: 'Offen' },
  { key: 'bezahlt', label: 'Bezahlt' },
];

export function AdminTourInvoicesPage() {
  const [invoices, setInvoices] = useState<RenewalInvoice[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [markPaidModal, setMarkPaidModal] = useState<{
    open: boolean; invoiceId: number | null; tourId: number | null;
    method: string; note: string; loading: boolean;
  }>({ open: false, invoiceId: null, tourId: null, method: 'bank_transfer', note: '', loading: false });

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean; invoiceId: number | null; loading: boolean;
  }>({ open: false, invoiceId: null, loading: false });

  const load = useCallback((status: string) => {
    setLoading(true);
    setError(null);
    getAdminInvoices(status || undefined)
      .then((d) => setInvoices(d.invoices))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(statusFilter); }, [statusFilter, load]);

  function showSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  }

  async function handleMarkPaid() {
    if (!markPaidModal.invoiceId || !markPaidModal.tourId) return;
    setMarkPaidModal((m) => ({ ...m, loading: true }));
    try {
      await markInvoicePaidManual(markPaidModal.tourId, markPaidModal.invoiceId, {
        payment_method: markPaidModal.method,
        payment_note: markPaidModal.note || undefined,
      });
      showSuccess('Rechnung als bezahlt markiert.');
      setMarkPaidModal((m) => ({ ...m, open: false }));
      load(statusFilter);
    } catch (e) {
      setError((e as Error).message);
      setMarkPaidModal((m) => ({ ...m, loading: false }));
    }
  }

  async function handleDelete() {
    if (!deleteModal.invoiceId) return;
    setDeleteModal((m) => ({ ...m, loading: true }));
    try {
      await deleteInvoice(deleteModal.invoiceId);
      showSuccess('Rechnung gelöscht.');
      setDeleteModal((m) => ({ ...m, open: false }));
      load(statusFilter);
    } catch (e) {
      setError((e as Error).message);
      setDeleteModal((m) => ({ ...m, loading: false }));
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Rechnungen</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">Interne Verlängerungsrechnungen</p>
      </div>

      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-700 text-sm">{success}</div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>
      )}

      {/* Filter */}
      <div className="flex gap-1.5">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors border ${
              statusFilter === tab.key
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-white text-[var(--text-main)] border-[var(--border)] hover:border-amber-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabelle */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-slate-50">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-subtle)]">Rechnung</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-subtle)]">Tour / Kunde</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-subtle)]">Datum</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-subtle)]">Betrag</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-subtle)]">Status</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-subtle)]">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  <div className="flex justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
                  </div>
                </td>
              </tr>
            )}
            {!loading && invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--text-subtle)]">
                  Keine Rechnungen gefunden
                </td>
              </tr>
            )}
            {!loading && invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/50">
                <td className="px-3 py-2.5">
                  <div className="text-xs font-mono text-[var(--text-subtle)]">
                    {inv.invoice_number || `#${inv.id}`}
                  </div>
                  {inv.invoice_kind && (
                    <div className="text-[0.68rem] text-[var(--text-subtle)]">
                      {inv.invoice_kind === 'portal_extension' ? 'Verlängerung' : inv.invoice_kind === 'portal_reactivation' ? 'Reaktivierung' : inv.invoice_kind}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {inv.tour_id && (
                    <Link
                      to={`/admin/tours/${inv.tour_id}`}
                      className="font-medium text-[var(--text-main)] hover:text-[var(--accent)]"
                    >
                      {inv.tour_customer_name || `Tour #${inv.tour_id}`}
                    </Link>
                  )}
                  {inv.tour_object_label && (
                    <div className="text-xs text-[var(--text-subtle)]">{inv.tour_object_label}</div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-subtle)] whitespace-nowrap">
                  {formatDate(inv.sent_at || inv.invoice_date || inv.created_at)}
                </td>
                <td className="px-3 py-2.5 font-semibold text-[var(--text-main)]">
                  {formatCHF(inv.amount_chf ?? inv.betrag)}
                </td>
                <td className="px-3 py-2.5">
                  <div>
                    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-bold ${STATUS_COLORS[inv.invoice_status ?? ''] ?? STATUS_COLORS.draft}`}>
                      {STATUS_LABELS[inv.invoice_status ?? ''] ?? inv.invoice_status}
                    </span>
                    {inv.payment_method && (
                      <div className="text-[0.68rem] text-[var(--text-subtle)] mt-0.5">
                        {PAYMENT_METHOD_LABELS[inv.payment_method] ?? inv.payment_method}
                        {inv.paid_at ? ` · ${formatDate(inv.paid_at)}` : ''}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {inv.invoice_status !== 'paid' && inv.tour_id && (
                      <button
                        type="button"
                        onClick={() => setMarkPaidModal({ open: true, invoiceId: inv.id, tourId: inv.tour_id!, method: 'bank_transfer', note: '', loading: false })}
                        className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        Bezahlt
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteModal({ open: true, invoiceId: inv.id, loading: false })}
                      className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mark-Paid-Modal */}
      {markPaidModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setMarkPaidModal((m) => ({ ...m, open: false }))}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold">Als bezahlt markieren</h3>
              <button type="button" onClick={() => setMarkPaidModal((m) => ({ ...m, open: false }))} className="text-xl leading-none text-[var(--text-subtle)]">×</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-subtle)]">Zahlungsart</label>
                <select
                  value={markPaidModal.method}
                  onChange={(e) => setMarkPaidModal((m) => ({ ...m, method: e.target.value }))}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-subtle)]">Notiz (optional)</label>
                <input
                  type="text"
                  value={markPaidModal.note}
                  onChange={(e) => setMarkPaidModal((m) => ({ ...m, note: e.target.value }))}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
              <button type="button" onClick={() => setMarkPaidModal((m) => ({ ...m, open: false }))} className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs font-medium">Abbrechen</button>
              <button type="button" onClick={handleMarkPaid} disabled={markPaidModal.loading} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {markPaidModal.loading ? 'Speichern...' : 'Als bezahlt markieren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-Modal */}
      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDeleteModal((m) => ({ ...m, open: false }))}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold">Rechnung löschen</h3>
              <button type="button" onClick={() => setDeleteModal((m) => ({ ...m, open: false }))} className="text-xl leading-none text-[var(--text-subtle)]">×</button>
            </div>
            <div className="p-4">
              <p className="text-sm text-[var(--text-subtle)]">Diese Rechnung wird endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
              <button type="button" onClick={() => setDeleteModal((m) => ({ ...m, open: false }))} className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs font-medium">Abbrechen</button>
              <button type="button" onClick={handleDelete} disabled={deleteModal.loading} className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {deleteModal.loading ? 'Löschen...' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
