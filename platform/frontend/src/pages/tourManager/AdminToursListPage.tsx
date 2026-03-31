/**
 * Admin-Touren-Liste – React-Portierung von tours/views/admin/tours-list.ejs
 *
 * Erhält alle Daten via /tour-manager/admin/api/tours.
 * Feature-Parität: Filter, Suche, Sortierung, Pagination, Stats, Hint-Badges,
 * Payment-Modal, Mail-Modal.
 *
 * Routing: /admin/tours/list (parallel zu /tour-manager/admin als Fallback)
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Mail, CreditCard, RefreshCw } from 'lucide-react';
import { getAdminTours, type AdminToursListData } from '../../api/tourAdmin';
import { TourStatusBadge, InvoiceStatusTag } from './TourStatusBadge';
import type { AdminTourListItem, TourListFilters, TourStatus } from '../../types/tourManager';
import { TOUR_STATUS_LABELS } from '../../types/tourManager';

const FILTER_TABS: { label: string; params: Partial<TourListFilters> }[] = [
  { label: 'Alle', params: {} },
  { label: 'Aktiv', params: { status: 'ACTIVE' } },
  { label: 'Archiviert', params: { status: 'ARCHIVED' } },
  { label: 'Läuft bald ab', params: { expiringSoon: '1' } },
  { label: 'Rechnung offen', params: { invoiceOpenOnly: '1' } },
  { label: 'Rechnung nicht bezahlt', params: { invoiceOverdueOnly: '1' } },
  { label: 'Kein Kunde verknüpft', params: { noCustomerOnly: '1' } },
];

const SORT_COLS = [
  { key: 'customer', label: 'Kunde / Kontakt / Objekt' },
  { key: 'matterport_created', label: 'Tour erstellt' },
  { key: 'ablaufdatum', label: 'Ablaufdatum' },
  { key: 'days', label: 'Tage' },
  { key: 'status', label: 'Abostatus' },
];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('de-CH', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function DaysCell({ days }: { days: number | null | undefined }) {
  if (days == null) return <span className="text-[var(--text-subtle)]">-</span>;
  const cls =
    days < 0 ? 'text-red-600 font-semibold' :
    days <= 30 ? 'text-amber-600 font-semibold' :
    'text-emerald-700 font-semibold';
  return <span className={cls}>{days}</span>;
}

interface HintBadge {
  text: string;
  className?: string;
  style?: string;
}

function buildHintBadges(t: AdminTourListItem): HintBadge[] {
  const badges: HintBadge[] = [];
  if (!t.has_customer_connection) badges.push({ text: 'Kein Kunde verknüpft', className: 'bg-amber-200/30 text-amber-400' });
  if (t.needs_renewal_mail) badges.push({ text: 'Keine Verlängerungsmail', className: 'bg-red-200/30 text-red-300' });
  if (t.waiting_customer_reply) badges.push({ text: 'Kundenantwort ausstehend', className: 'bg-sky-200/30 text-cyan-300' });
  if (t.awaiting_payment_without_invoice) badges.push({ text: 'Wartet auf Zahlung ohne Exxas-Rechnung', className: 'bg-amber-200/30 text-amber-400' });
  if (t.customer_intent) {
    const intentLabels: Record<string, string> = {
      renew_yes: 'Kunde will verlängern',
      renew_no: 'Kunde will nicht verlängern',
      transfer_requested: 'Transfer gewünscht',
      billing_question: 'Rechnungsfrage',
      unclear: 'Kundenwunsch unklar',
    };
    badges.push({ text: intentLabels[t.customer_intent] || t.customer_intent, className: 'bg-blue-200/30 text-blue-300' });
  }
  return badges;
}

// ─── Modals ───────────────────────────────────────────────────────────────────

interface PaymentModalState {
  open: boolean;
  tourId: number | null;
  loading: boolean;
  result: { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } | null;
}

interface MailModalState {
  open: boolean;
  tourId: number | null;
  templateKey: string;
  copyToMe: boolean;
  loading: boolean;
  result: string | null;
}

export function AdminToursListPage() {
  const [data, setData] = useState<AdminToursListData | null>(null);
  const [filters, setFilters] = useState<TourListFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentModal, setPaymentModal] = useState<PaymentModalState>({
    open: false, tourId: null, loading: false, result: null,
  });
  const [mailModal, setMailModal] = useState<MailModalState>({
    open: false, tourId: null, templateKey: 'renewal_request', copyToMe: false, loading: false, result: null,
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((f: TourListFilters) => {
    setLoading(true);
    setError(null);
    getAdminTours(f)
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(filters);
  }, [filters, load]);

  function applyFilter(extra: Partial<TourListFilters>) {
    setFilters((f) => ({ ...extra, q: f.q, sort: f.sort, order: f.order }));
  }

  function handleSearchChange(v: string) {
    setSearchInput(v);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setFilters((f) => ({ ...f, q: v || undefined, page: 1 }));
    }, 320);
  }

  function handleSort(col: string) {
    setFilters((f) => ({
      ...f,
      sort: col as TourListFilters['sort'],
      order: f.sort === col && f.order === 'asc' ? 'desc' : 'asc',
    }));
  }

  function handlePage(page: number) {
    setFilters((f) => ({ ...f, page }));
  }

  function isActiveFilter(params: Partial<TourListFilters>): boolean {
    if (!data) return false;
    const { status, expiringSoon, invoiceOpenOnly, invoiceOverdueOnly, noCustomerOnly } = filters;
    if (Object.keys(params).length === 0) {
      return !status && !expiringSoon && !invoiceOpenOnly && !invoiceOverdueOnly && !noCustomerOnly;
    }
    return Object.entries(params).every(([k, v]) => (filters as Record<string, unknown>)[k] === v);
  }

  // Payment Modal
  async function openPaymentCheck(tourId: number) {
    setPaymentModal({ open: true, tourId, loading: true, result: null });
    try {
      const r = await fetch(`/api/tours/${tourId}/check-payment`, { method: 'POST', credentials: 'include' });
      const d = await r.json() as { error?: string; summary?: string; paymentState?: string };
      if (!r.ok || d.error) {
        setPaymentModal((m) => ({ ...m, loading: false, result: { text: d.error || 'Fehler bei der Prüfung.', tone: 'danger' } }));
        return;
      }
      const tone = d.paymentState === 'paid' ? 'success' : d.paymentState === 'overdue' ? 'danger' : 'warning';
      setPaymentModal((m) => ({ ...m, loading: false, result: { text: d.summary || 'Zahlung geprüft.', tone } }));
    } catch (e) {
      setPaymentModal((m) => ({ ...m, loading: false, result: { text: `Fehler: ${(e as Error).message}`, tone: 'danger' } }));
    }
  }

  // Mail Modal
  function openMailModal(tourId: number) {
    setMailModal({ open: true, tourId, templateKey: 'renewal_request', copyToMe: false, loading: false, result: null });
  }

  async function sendMail() {
    if (!mailModal.tourId) return;
    setMailModal((m) => ({ ...m, loading: true }));
    try {
      const r = await fetch(`/api/tours/${mailModal.tourId}/send-renewal-email`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateKey: mailModal.templateKey, copyToMe: mailModal.copyToMe }),
      });
      const d = await r.json() as { error?: string; copySent?: boolean; copyError?: string };
      if (!r.ok || d.error) {
        setMailModal((m) => ({ ...m, loading: false, result: d.error || 'Fehler beim Senden.' }));
        return;
      }
      const copyText = mailModal.copyToMe
        ? d.copySent ? ' · Kopie an dich gesendet.' : d.copyError ? ` · Kopie fehlgeschlagen: ${d.copyError}` : ''
        : '';
      setMailModal((m) => ({ ...m, loading: false, result: `E-Mail wurde gesendet${copyText}` }));
      setTimeout(() => setMailModal((m) => ({ ...m, open: false })), 900);
    } catch (e) {
      setMailModal((m) => ({ ...m, loading: false, result: `Fehler: ${(e as Error).message}` }));
    }
  }

  const pagination = data?.pagination;
  const stats = data?.stats;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Touren</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">
          Pro Kunde an gleicher Adresse und Tag können mehrere Touren existieren.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Touren total', value: stats.total || 0, href: '?', key: 'total' },
            { label: 'Touren aktiv', value: stats.ACTIVE || 0, href: '?status=ACTIVE', key: 'active' },
            { label: 'Touren archiviert', value: stats.ARCHIVED || 0, href: '?status=ARCHIVED', key: 'archived' },
            { label: 'Rechnung offen', value: stats.invoicesOpenTotal || 0, href: '?invoiceOpenOnly=1', key: 'inv' },
          ].map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => applyFilter(s.key === 'active' ? { status: 'ACTIVE' } : s.key === 'archived' ? { status: 'ARCHIVED' } : s.key === 'inv' ? { invoiceOpenOnly: '1' } : {})}
              className="text-left rounded-xl border border-[var(--border)] bg-white px-3 py-2 shadow-sm hover:border-amber-300 transition-colors"
            >
              <div className="text-[0.66rem] uppercase tracking-wider text-[var(--text-subtle)] font-medium mb-0.5">{s.label}</div>
              <div className="text-xl font-bold text-[var(--text-main)]">{s.value}</div>
            </button>
          ))}
        </div>
      )}

      {/* Filter-Leiste + Suche */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => applyFilter(tab.params)}
              className={`rounded-full px-3 py-1 text-[0.79rem] font-medium transition-colors border ${
                isActiveFilter(tab.params)
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-white text-[var(--text-main)] border-[var(--border)] hover:border-amber-300'
              }`}
            >
              {tab.label}
              {tab.params.noCustomerOnly && stats?.noCustomer && stats.noCustomer > 0 && (
                <span className="ml-1 rounded-md bg-black/10 px-1 text-[0.72em]">{stats.noCustomer}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-subtle)]" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Suche..."
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 pl-8 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Tabelle */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-slate-50">
              {SORT_COLS.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-subtle)] cursor-pointer hover:text-[var(--text-main)] select-none whitespace-nowrap"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {filters.sort === col.key ? (
                    <span className="ml-1">{filters.order === 'desc' ? '▼' : '▲'}</span>
                  ) : (
                    <span className="ml-1 opacity-30">◆</span>
                  )}
                </th>
              ))}
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-subtle)]">Rechnungsstatus</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-subtle)]">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-subtle)]">
                  <div className="flex justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
                  </div>
                </td>
              </tr>
            )}
            {!loading && (!data?.tours || data.tours.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-subtle)]">
                  Keine Touren gefunden
                </td>
              </tr>
            )}
            {!loading && data?.tours.map((t: AdminTourListItem) => {
              const expiryDate = t.canonical_term_end_date || t.term_end_date || t.ablaufdatum;
              const hints = buildHintBadges(t);
              return (
                <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/50 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[var(--text-main)]">
                      {t.canonical_customer_name || '-'}
                    </div>
                    {t.customer_email && (
                      <div className="text-xs text-[var(--text-subtle)]">{t.customer_email}</div>
                    )}
                    {t.canonical_object_label && (
                      <div className="text-xs text-[var(--text-subtle)]">{t.canonical_object_label}</div>
                    )}
                    {hints.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {hints.slice(0, 2).map((b, i) => (
                          <span
                            key={i}
                            className={`inline-flex rounded-full border border-transparent px-1.5 py-0.5 text-[0.67rem] font-semibold ${b.className ?? ''}`}
                          >
                            {b.text}
                          </span>
                        ))}
                        {hints.length > 2 && (
                          <span className="text-[0.67rem] text-[var(--text-subtle)]">+{hints.length - 2} weitere</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--text-subtle)] whitespace-nowrap">
                    {formatDate(t.matterport_created_at ?? t.exxas_created_at)}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-[var(--text-subtle)] whitespace-nowrap">
                    {formatDate(expiryDate)}
                  </td>
                  <td className="px-3 py-2.5">
                    <DaysCell days={t.days_until_expiry} />
                  </td>
                  <td className="px-3 py-2.5">
                    <TourStatusBadge
                      status={t.displayed_status || t.status}
                      note={t.displayed_status_note}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <InvoiceStatusTag
                      tone={t.invoice_status_tone}
                      label={t.invoice_status_label}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link
                        to={`/admin/tours/${t.id}`}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                      >
                        Details
                      </Link>
                      <button
                        type="button"
                        title="Mail senden"
                        onClick={() => openMailModal(t.id)}
                        className="rounded-lg border border-[var(--border)] bg-white p-1.5 text-[var(--text-subtle)] hover:text-[var(--text-main)] hover:border-amber-300 transition-colors"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Zahlung prüfen"
                        onClick={() => openPaymentCheck(t.id)}
                        className="rounded-lg border border-[var(--border)] bg-white p-1.5 text-[var(--text-subtle)] hover:text-[var(--text-main)] hover:border-amber-300 transition-colors"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-[var(--text-subtle)]">
            Seite <strong>{pagination.page}</strong> von <strong>{pagination.totalPages}</strong>
            {' · '}Zeige <strong>{(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.totalItems)}</strong>{' '}
            von <strong>{pagination.totalItems}</strong> Touren
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              disabled={!pagination.hasPrev}
              onClick={() => handlePage(pagination.page - 1)}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] disabled:opacity-40 hover:border-amber-300 transition-colors"
            >
              Zurück
            </button>
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              const start = Math.max(1, pagination.page - 2);
              const p = start + i;
              if (p > pagination.totalPages) return null;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePage(p)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    p === pagination.page
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-white border-[var(--border)] text-[var(--text-main)] hover:border-amber-300'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              type="button"
              disabled={!pagination.hasNext}
              onClick={() => handlePage(pagination.page + 1)}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] disabled:opacity-40 hover:border-amber-300 transition-colors"
            >
              Weiter
            </button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPaymentModal((m) => ({ ...m, open: false }))}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold text-[var(--text-main)]">Zahlung prüfen</h3>
              <button type="button" onClick={() => setPaymentModal((m) => ({ ...m, open: false }))} className="text-xl leading-none text-[var(--text-subtle)] hover:text-[var(--text-main)]">×</button>
            </div>
            <div className="p-4">
              {paymentModal.loading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-subtle)]">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Zahlung wird geprüft...
                </div>
              ) : paymentModal.result ? (
                <div className={`rounded-xl border p-3 text-sm font-medium ${
                  paymentModal.result.tone === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                  paymentModal.result.tone === 'danger' ? 'bg-red-50 border-red-200 text-red-700' :
                  'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                  {paymentModal.result.text}
                </div>
              ) : null}
            </div>
            <div className="flex justify-end border-t border-[var(--border)] px-4 py-3">
              <button type="button" onClick={() => setPaymentModal((m) => ({ ...m, open: false }))} className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90">
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mail Modal */}
      {mailModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setMailModal((m) => ({ ...m, open: false }))}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold text-[var(--text-main)]">Mail senden</h3>
              <button type="button" onClick={() => setMailModal((m) => ({ ...m, open: false }))} className="text-xl leading-none text-[var(--text-subtle)] hover:text-[var(--text-main)]">×</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">E-Mail Vorlage auswählen</label>
                <select
                  value={mailModal.templateKey}
                  onChange={(e) => setMailModal((m) => ({ ...m, templateKey: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                >
                  <option value="renewal_request">Verlängerungsanfrage</option>
                  <option value="archive_notice">Archiv-Hinweis</option>
                </select>
                <p className="mt-1 text-xs text-[var(--text-subtle)]">Die gewählte Vorlage wird direkt an den Kunden gesendet.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mailModal.copyToMe}
                  onChange={(e) => setMailModal((m) => ({ ...m, copyToMe: e.target.checked }))}
                  className="rounded"
                />
                Kopie an mich senden
              </label>
              {mailModal.result && (
                <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-3 text-sm text-[var(--text-subtle)]">
                  {mailModal.result}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
              <button type="button" onClick={() => setMailModal((m) => ({ ...m, open: false }))} className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm font-medium hover:bg-slate-50">Abbrechen</button>
              <button
                type="button"
                onClick={sendMail}
                disabled={mailModal.loading}
                className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {mailModal.loading ? 'Senden...' : 'Senden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
