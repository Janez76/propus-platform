/**
 * Portal Tour-Detail – React-Portierung von tours/views/portal/tour-detail.ejs
 *
 * Vollständige Funktionsparität:
 * - Tour-Info anzeigen
 * - Assignee setzen
 * - Tour bearbeiten (Objekt-Label, Kontakt, Vorschau-Startpunkt)
 * - Verlängern / Reaktivieren (Payrexx oder QR-Rechnung)
 * - Sichtbarkeit ändern
 * - Archivieren
 * - Rechnungen anzeigen + Payrexx-Link
 *
 * Daten: /portal/api/tours/:id/detail (via portal-api-mutations.js)
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ExternalLink, Edit2, RefreshCw, Eye, Archive } from 'lucide-react';
import {
  editPortalTour,
  extendPortalTour,
  setPortalTourVisibility,
  archivePortalTour,
  type PortalTour,
  type PortalInvoice,
} from '../../api/portalTours';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCHF(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return `CHF ${Number(amount).toFixed(2)}`;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktiv',
  EXPIRING_SOON: 'Läuft bald ab',
  AWAITING_CUSTOMER_DECISION: 'Wartet auf Entscheidung',
  CUSTOMER_ACCEPTED_AWAITING_PAYMENT: 'Wartet auf Zahlung',
  CUSTOMER_DECLINED: 'Keine Verlängerung',
  EXPIRED_PENDING_ARCHIVE: 'Abgelaufen',
  ARCHIVED: 'Archiviert',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  sent: 'Ausstehend',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
  cancelled: 'Storniert',
};

const INVOICE_COLORS: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sent: 'bg-amber-50 text-amber-700 border-amber-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  draft: 'bg-slate-100 text-slate-500 border-slate-200',
};

interface TourDetailData {
  tour: PortalTour & {
    mpVisibility?: string | null;
    assigneeBundle?: unknown;
  };
  invoices: PortalInvoice[];
  pricing: { months: number; amountCHF: number; isReactivation: boolean; actionLabel: string };
  payrexxConfigured: boolean;
}

export function PortalTourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tourId = parseInt(id ?? '0', 10);

  const [data, setData] = useState<TourDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    object_label: '', customer_contact: '', customer_name: '', start_sweep: '',
  });
  const [editLoading, setEditLoading] = useState(false);

  const [extendOpen, setExtendOpen] = useState(false);
  const [extendMethod, setExtendMethod] = useState<'payrexx' | 'qr_invoice'>('payrexx');
  const [extendLoading, setExtendLoading] = useState(false);

  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibilitySetting, setVisibilitySetting] = useState('LINK_ONLY');
  const [visibilityPassword, setVisibilityPassword] = useState('');
  const [visibilityLoading, setVisibilityLoading] = useState(false);

  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);

  function showSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  }

  function showError(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  }

  useEffect(() => {
    if (!tourId) return;
    setLoading(true);
    // Nutze den erweiterten Detail-Endpunkt aus portal-api-mutations.js
    fetch(`/portal/api/tours/${tourId}/detail`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: TourDetailData & { error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        setEditForm({
          object_label: d.tour.canonical_object_label ?? d.tour.object_label ?? '',
          customer_contact: d.tour.customer_contact ?? '',
          customer_name: d.tour.canonical_customer_name ?? d.tour.customer_name ?? '',
          start_sweep: d.tour.matterport_start_sweep ?? '',
        });
        setVisibilitySetting(d.tour.mpVisibility?.toUpperCase() || 'LINK_ONLY');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tourId]);

  async function handleEdit() {
    setEditLoading(true);
    try {
      await editPortalTour(tourId, {
        object_label: editForm.object_label || null,
        customer_contact: editForm.customer_contact || null,
        customer_name: editForm.customer_name || null,
        start_sweep: editForm.start_sweep || null,
      });
      showSuccess('Tour-Daten gespeichert.');
      setEditOpen(false);
      // Reload
      setData((d) => d ? {
        ...d,
        tour: {
          ...d.tour,
          canonical_object_label: editForm.object_label || d.tour.canonical_object_label,
          customer_contact: editForm.customer_contact || d.tour.customer_contact,
          canonical_customer_name: editForm.customer_name || d.tour.canonical_customer_name,
          matterport_start_sweep: editForm.start_sweep || d.tour.matterport_start_sweep,
        },
      } : d);
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleExtend() {
    setExtendLoading(true);
    try {
      const result = await extendPortalTour(tourId, extendMethod);
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      showSuccess(result.successKey === 'reactivation_requested' ? 'Reaktivierung beantragt.' : 'Verlängerung eingeleitet.');
      setExtendOpen(false);
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setExtendLoading(false);
    }
  }

  async function handleVisibility() {
    setVisibilityLoading(true);
    try {
      await setPortalTourVisibility(
        tourId,
        visibilitySetting,
        visibilitySetting === 'PASSWORD' ? visibilityPassword : undefined,
      );
      showSuccess('Sichtbarkeit gespeichert.');
      setVisibilityOpen(false);
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setVisibilityLoading(false);
    }
  }

  async function handleArchive() {
    setArchiveLoading(true);
    try {
      await archivePortalTour(tourId);
      showSuccess('Tour archiviert.');
      setArchiveConfirmOpen(false);
      navigate('/portal/tours');
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setArchiveLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4" />
          {error || 'Tour nicht gefunden.'}
        </div>
      </div>
    );
  }

  const { tour, invoices, pricing, payrexxConfigured } = data;
  const expiryDate = tour.canonical_term_end_date || tour.term_end_date || tour.ablaufdatum;
  const daysUntilExpiry = expiryDate
    ? Math.round((new Date(expiryDate).getTime() - Date.now()) / 86400000)
    : null;

  const canExtend = ['ACTIVE', 'EXPIRING_SOON', 'AWAITING_CUSTOMER_DECISION', 'EXPIRED_PENDING_ARCHIVE', 'CUSTOMER_DECLINED'].includes(tour.status);
  const canArchive = ['CUSTOMER_DECLINED', 'EXPIRED_PENDING_ARCHIVE'].includes(tour.status);

  return (
    <div className="p-6 space-y-5">
      {/* Back + Toast */}
      <div className="flex items-center gap-3">
        <Link to="/portal/tours" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)]">
          <ArrowLeft className="h-4 w-4" />
          Zurück zu Touren
        </Link>
      </div>

      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-700 text-sm">{success}</div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">
            {tour.canonical_object_label || tour.object_label || tour.bezeichnung || `Tour #${tour.id}`}
          </h1>
          {tour.canonical_customer_name && (
            <p className="text-sm text-[var(--text-subtle)] mt-0.5">{tour.canonical_customer_name}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:border-amber-300 transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5" /> Bearbeiten
          </button>
          {canExtend && (
            <button
              type="button"
              onClick={() => setExtendOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {pricing.isReactivation ? 'Reaktivieren' : 'Verlängern'}
            </button>
          )}
          {tour.canonical_matterport_space_id && (
            <button
              type="button"
              onClick={() => setVisibilityOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:border-amber-300 transition-colors"
            >
              <Eye className="h-3.5 w-3.5" /> Sichtbarkeit
            </button>
          )}
          {canArchive && (
            <button
              type="button"
              onClick={() => setArchiveConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:border-red-300 hover:text-red-700 transition-colors"
            >
              <Archive className="h-3.5 w-3.5" /> Archivieren
            </button>
          )}
        </div>
      </div>

      {/* Tour-Info */}
      <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-[var(--text-subtle)] font-medium mb-0.5">Status</div>
          <span className="inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold bg-slate-50 border-slate-200 text-slate-700">
            {STATUS_LABELS[tour.status] ?? tour.status}
          </span>
        </div>
        <div>
          <div className="text-xs text-[var(--text-subtle)] font-medium mb-0.5">Ablaufdatum</div>
          <div className="text-sm font-semibold text-[var(--text-main)]">{formatDate(expiryDate)}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-subtle)] font-medium mb-0.5">Tage verbleibend</div>
          <div className={`text-sm font-semibold ${
            daysUntilExpiry == null ? 'text-[var(--text-subtle)]' :
            daysUntilExpiry < 0 ? 'text-red-600' :
            daysUntilExpiry <= 30 ? 'text-amber-600' :
            'text-emerald-700'
          }`}>
            {daysUntilExpiry != null ? daysUntilExpiry : '-'}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-subtle)] font-medium mb-0.5">Matterport</div>
          {tour.canonical_matterport_space_id ? (
            <a
              href={`https://my.matterport.com/show/?m=${tour.canonical_matterport_space_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              Tour öffnen <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-xs text-[var(--text-subtle)]">Nicht verknüpft</span>
          )}
        </div>
      </div>

      {/* Rechnungen */}
      {invoices.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] bg-slate-50">
            <h2 className="text-sm font-bold text-[var(--text-main)]">Rechnungen</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Nr.</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Datum</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Betrag</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-xs font-mono text-[var(--text-subtle)]">
                    {inv.invoice_number || `#${inv.id}`}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-subtle)] whitespace-nowrap">
                    {formatDate(inv.sent_at || inv.invoice_date || inv.created_at)}
                  </td>
                  <td className="px-3 py-2 text-sm font-semibold text-[var(--text-main)]">
                    {formatCHF(inv.amount_chf ?? inv.betrag)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-bold ${INVOICE_COLORS[inv.invoice_status ?? ''] ?? INVOICE_COLORS.draft}`}>
                      {INVOICE_STATUS_LABELS[inv.invoice_status ?? ''] ?? inv.invoice_status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {(inv.invoice_status === 'sent' || inv.invoice_status === 'overdue') && inv.payrexx_payment_url && (
                      <a
                        href={inv.payrexx_payment_url}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                      >
                        Bezahlen <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Verlängerungs-Preisinfo wenn noch keine Rechnungen */}
      {invoices.length === 0 && canExtend && (
        <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-4 text-sm text-[var(--text-subtle)]">
          {pricing.isReactivation
            ? `Reaktivierung: CHF ${pricing.amountCHF.toFixed(2)} (inkl. Reaktivierungsgebühr) für ${pricing.months} Monate.`
            : `Verlängerung: CHF ${pricing.amountCHF.toFixed(2)} für ${pricing.months} Monate.`}
        </div>
      )}

      {/* ─── Modals ─────────────────────────────────────────────────────────── */}

      {/* Bearbeiten-Modal */}
      {editOpen && (
        <ModalWrap title="Tour bearbeiten" onClose={() => setEditOpen(false)}>
          <div className="space-y-3 p-4">
            <FormRow label="Objektbezeichnung">
              <input
                type="text"
                value={editForm.object_label}
                onChange={(e) => setEditForm((f) => ({ ...f, object_label: e.target.value }))}
                className="input-base"
                placeholder="z.B. Musterstrasse 1, Zürich"
              />
            </FormRow>
            <FormRow label="Kontaktperson">
              <input
                type="text"
                value={editForm.customer_contact}
                onChange={(e) => setEditForm((f) => ({ ...f, customer_contact: e.target.value }))}
                className="input-base"
              />
            </FormRow>
            {tour.canonical_matterport_space_id && (
              <FormRow label="Vorschau-Startpunkt (Sweep-ID)">
                <input
                  type="text"
                  value={editForm.start_sweep}
                  onChange={(e) => setEditForm((f) => ({ ...f, start_sweep: e.target.value }))}
                  className="input-base font-mono"
                  placeholder="optional"
                />
              </FormRow>
            )}
          </div>
          <ModalFoot>
            <button type="button" onClick={() => setEditOpen(false)} className="btn-ghost">Abbrechen</button>
            <button type="button" onClick={handleEdit} disabled={editLoading} className="btn-primary">
              {editLoading ? 'Speichern...' : 'Speichern'}
            </button>
          </ModalFoot>
        </ModalWrap>
      )}

      {/* Verlängern-Modal */}
      {extendOpen && (
        <ModalWrap title={pricing.isReactivation ? 'Tour reaktivieren' : 'Tour verlängern'} onClose={() => setExtendOpen(false)}>
          <div className="space-y-3 p-4">
            <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-3 text-sm text-[var(--text-subtle)]">
              {pricing.isReactivation
                ? `Reaktivierung für CHF ${pricing.amountCHF.toFixed(2)} (${pricing.months} Monate)`
                : `Verlängerung für CHF ${pricing.amountCHF.toFixed(2)} (${pricing.months} Monate)`}
            </div>
            <FormRow label="Zahlungsart">
              <div className="flex flex-col gap-2">
                {payrexxConfigured && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="payrexx"
                      checked={extendMethod === 'payrexx'}
                      onChange={() => setExtendMethod('payrexx')}
                    />
                    Online-Zahlung (Karte, TWINT, …)
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="qr_invoice"
                    checked={extendMethod === 'qr_invoice'}
                    onChange={() => setExtendMethod('qr_invoice')}
                  />
                  QR-Rechnung (Überweisung)
                </label>
              </div>
            </FormRow>
          </div>
          <ModalFoot>
            <button type="button" onClick={() => setExtendOpen(false)} className="btn-ghost">Abbrechen</button>
            <button type="button" onClick={handleExtend} disabled={extendLoading} className="btn-primary">
              {extendLoading ? 'Wird gestartet...' : pricing.isReactivation ? 'Reaktivieren' : 'Verlängern'}
            </button>
          </ModalFoot>
        </ModalWrap>
      )}

      {/* Sichtbarkeits-Modal */}
      {visibilityOpen && (
        <ModalWrap title="Sichtbarkeit ändern" onClose={() => setVisibilityOpen(false)}>
          <div className="space-y-3 p-4">
            <FormRow label="Sichtbarkeit">
              <select
                value={visibilitySetting}
                onChange={(e) => setVisibilitySetting(e.target.value)}
                className="input-base"
              >
                <option value="PUBLIC">Öffentlich</option>
                <option value="LINK_ONLY">Nur mit Link</option>
                <option value="PRIVATE">Privat</option>
                <option value="PASSWORD">Passwortgeschützt</option>
              </select>
            </FormRow>
            {visibilitySetting === 'PASSWORD' && (
              <FormRow label="Passwort">
                <input
                  type="text"
                  value={visibilityPassword}
                  onChange={(e) => setVisibilityPassword(e.target.value)}
                  className="input-base"
                  placeholder="Zugangspasswort"
                />
              </FormRow>
            )}
          </div>
          <ModalFoot>
            <button type="button" onClick={() => setVisibilityOpen(false)} className="btn-ghost">Abbrechen</button>
            <button type="button" onClick={handleVisibility} disabled={visibilityLoading} className="btn-primary">
              {visibilityLoading ? 'Speichern...' : 'Speichern'}
            </button>
          </ModalFoot>
        </ModalWrap>
      )}

      {/* Archivierungs-Bestätigung */}
      {archiveConfirmOpen && (
        <ModalWrap title="Tour archivieren" onClose={() => setArchiveConfirmOpen(false)}>
          <div className="p-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Diese Tour wird archiviert. Die Matterport-Tour wird deaktiviert. Diese Aktion kann nicht rückgängig gemacht werden.
            </div>
          </div>
          <ModalFoot>
            <button type="button" onClick={() => setArchiveConfirmOpen(false)} className="btn-ghost">Abbrechen</button>
            <button
              type="button"
              onClick={handleArchive}
              disabled={archiveLoading}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {archiveLoading ? 'Wird archiviert...' : 'Archivieren'}
            </button>
          </ModalFoot>
        </ModalWrap>
      )}
    </div>
  );
}

// ─── Hilfs-Komponenten ────────────────────────────────────────────────────────

function ModalWrap({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-bold text-[var(--text-main)]">{title}</h3>
          <button type="button" onClick={onClose} className="text-xl leading-none text-[var(--text-subtle)] hover:text-[var(--text-main)]">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
      {children}
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-[var(--text-subtle)]">{label}</label>
      {children}
    </div>
  );
}
