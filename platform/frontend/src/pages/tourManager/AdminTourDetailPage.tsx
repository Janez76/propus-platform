/**
 * Admin Tour-Detailseite – React-Portierung von tours/views/admin/tour-detail.ejs
 *
 * Feature-Parität:
 * - Kerndaten: Status, Ablaufdatum, Matterport-ID, Exxas-Abo, URL, Start-Sweep, Verified
 * - Verlängerungsrechnungen + manuelle Rechnungen
 * - Exxas-Rechnungen mit Stornierung
 * - Aktionslog
 * - Kunden-Infos
 * - Schnellaktionen: Name, URL, Sweep setzen; Sichtbarkeit, Matterport archivieren;
 *   Exxas-Abo kündigen; Manuelle Rechnung erstellen
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getAdminTourDetail,
  setAdminTourUrl,
  setAdminTourName,
  setAdminTourStartSweep,
  setAdminTourVerified,
  setAdminTourVisibility,
  archiveMatterportTour,
  exxasCancelSubscription,
  exxasCancelInvoice,
  createManualInvoice,
  markInvoicePaidManual,
  type AdminTourDetailData,
} from '../../api/tourAdmin';
import { TourStatusBadge } from './TourStatusBadge';
import {
  MATTERPORT_STATE_LABELS,
  TOUR_STATUS_LABELS,
} from '../../types/tourManager';

function formatDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCHF(v: number | null | undefined): string {
  if (v == null) return '-';
  return `CHF ${Number(v).toFixed(2)}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
      <div className="border-b border-[var(--border)] bg-slate-50 px-4 py-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--text-subtle)]">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 py-1.5">
      <div className="text-xs text-[var(--text-subtle)] sm:w-40 shrink-0">{label}</div>
      <div className="text-sm text-[var(--text-main)]">{children}</div>
    </div>
  );
}

const PAYMENT_METHODS = [
  ['bank_transfer', 'Überweisung'],
  ['cash', 'Bar'],
  ['twint', 'TWINT'],
  ['card', 'Karte'],
  ['payrexx', 'Payrexx'],
  ['other', 'Sonstige'],
] as const;

const VISIBILITY_OPTIONS = [
  ['PRIVATE', 'Privat (nur Admin-Link)'],
  ['LINK_ONLY', 'Link-Only'],
  ['PUBLIC', 'Öffentlich'],
  ['PASSWORD', 'Passwort'],
] as const;

export function AdminTourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tourId = Number(id);
  const [data, setData] = useState<AdminTourDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // inline-edit states
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [editName, setEditName] = useState<string | null>(null);
  const [editSweep, setEditSweep] = useState<string | null>(null);

  // modal states
  const [visModal, setVisModal] = useState<{ open: boolean; vis: string; pw: string }>({ open: false, vis: 'PRIVATE', pw: '' });
  const [manualInvModal, setManualInvModal] = useState<{
    open: boolean; amount: string; kind: string; note: string; due: string; markPaid: boolean; payMethod: string;
  }>({ open: false, amount: '', kind: 'manual', note: '', due: '', markPaid: false, payMethod: 'bank_transfer' });
  const [markPaidModal, setMarkPaidModal] = useState<{
    open: boolean; invoiceId: number | null; method: string; note: string;
  }>({ open: false, invoiceId: null, method: 'bank_transfer', note: '' });

  const load = useCallback(() => {
    setLoading(true);
    getAdminTourDetail(tourId)
      .then((d) => {
        setData(d);
        setEditUrl(d.tour.tour_url ?? '');
        setEditName(d.tour.canonical_object_label ?? d.tour.object_label ?? d.tour.bezeichnung ?? '');
        setEditSweep(d.tour.matterport_start_sweep ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => { load(); }, [load]);

  function showSuccess(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 3500); }

  async function run(fn: () => Promise<unknown>, successMsg: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      showSuccess(successMsg);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div className="flex h-60 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
    </div>
  );

  if (!data) return (
    <div className="p-6 text-red-600">{error ?? 'Tour nicht gefunden.'}</div>
  );

  const t = data.tour;

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb + Titel */}
      <div>
        <nav className="text-xs text-[var(--text-subtle)] mb-1">
          <Link to="/admin/tours/list" className="hover:underline">Alle Touren</Link>
          <span className="mx-1">›</span>
          <span>Tour #{t.id}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-[var(--text-main)]">
            {t.canonical_object_label || t.object_label || t.bezeichnung || `Tour #${t.id}`}
          </h1>
          <TourStatusBadge status={t.status} archiv={t.archiv ?? false} />
        </div>
        <p className="text-sm text-[var(--text-subtle)] mt-0.5">
          Kunde: {t.canonical_customer_name || t.customer_name || t.kunde_ref || '-'}
          {t.customer_email && <span className="ml-1.5">&lt;{t.customer_email}&gt;</span>}
        </p>
      </div>

      {success && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-700 text-sm">{success}</div>}
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ─── Stammdaten ─── */}
        <Section title="Stammdaten">
          <FieldRow label="Tour-ID"><span className="font-mono">{t.id}</span></FieldRow>
          <FieldRow label="Status">
            <TourStatusBadge status={t.status} archiv={t.archiv ?? false} />
          </FieldRow>
          <FieldRow label="Ablaufdatum">{formatDate(t.canonical_term_end_date ?? t.term_end_date ?? t.ablaufdatum)}</FieldRow>
          <FieldRow label="Matterport-ID">
            <span className="font-mono text-xs">{t.canonical_matterport_space_id ?? t.matterport_space_id ?? '-'}</span>
          </FieldRow>
          <FieldRow label="Matterport-Status">
            {t.live_matterport_state
              ? MATTERPORT_STATE_LABELS[t.live_matterport_state as keyof typeof MATTERPORT_STATE_LABELS] ?? t.live_matterport_state
              : '-'}
          </FieldRow>
          <FieldRow label="Exxas-Abo-ID">
            <span className="font-mono text-xs">{t.canonical_exxas_contract_id ?? t.exxas_abo_id ?? t.exxas_subscription_id ?? '-'}</span>
          </FieldRow>
          <FieldRow label="Verifiziert">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={t.customer_verified ?? false}
                disabled={busy}
                onChange={(e) => run(
                  () => setAdminTourVerified(tourId, e.target.checked),
                  e.target.checked ? 'Verifiziert.' : 'Verifizierung aufgehoben.'
                )}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>{t.customer_verified ? 'Ja' : 'Nein'}</span>
            </label>
          </FieldRow>
          <FieldRow label="Erstellt">{formatDate(t.created_at)}</FieldRow>
        </Section>

        {/* ─── Tour-URL ─── */}
        <Section title="Tour-URL &amp; Sweep">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Tour-URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editUrl ?? ''}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
                  placeholder="https://..."
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => setAdminTourUrl(tourId, editUrl || null), 'URL gespeichert.')}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  Speichern
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Bezeichnung</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editName ?? ''}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => setAdminTourName(tourId, editName ?? ''), 'Bezeichnung gespeichert.')}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  Speichern
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Start-Sweep-ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editSweep ?? ''}
                  onChange={(e) => setEditSweep(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-mono"
                  placeholder="sweepXXX..."
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => setAdminTourStartSweep(tourId, editSweep || null), 'Sweep gespeichert.')}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </Section>

        {/* ─── Sichtbarkeit ─── */}
        <Section title="Sichtbarkeit">
          <FieldRow label="Aktuell">
            <span className="font-semibold text-[var(--text-main)]">{t.mpVisibility ?? '-'}</span>
          </FieldRow>
          <div className="mt-3 flex flex-wrap gap-2">
            {VISIBILITY_OPTIONS.map(([vis, label]) => (
              <button
                key={vis}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (vis === 'PASSWORD') {
                    setVisModal({ open: true, vis, pw: '' });
                  } else {
                    run(() => setAdminTourVisibility(tourId, vis), `Sichtbarkeit auf ${label} gesetzt.`);
                  }
                }}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  t.mpVisibility === vis
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border)] hover:border-amber-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* ─── Schnellaktionen ─── */}
        <Section title="Aktionen">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => archiveMatterportTour(tourId), 'Matterport-Space archiviert.')}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
            >
              Matterport archivieren
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm('Exxas-Abo wirklich kündigen?')) {
                  run(() => exxasCancelSubscription(tourId), 'Exxas-Abo gekündigt.');
                }
              }}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
            >
              Exxas-Abo kündigen
            </button>
            <button
              type="button"
              onClick={() => setManualInvModal((m) => ({ ...m, open: true }))}
              className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10"
            >
              Manuelle Rechnung erstellen
            </button>
          </div>
        </Section>
      </div>

      {/* ─── Verlängerungsrechnungen ─── */}
      <Section title="Verlängerungsrechnungen">
        {data.renewalInvoices.length === 0 ? (
          <p className="text-xs text-[var(--text-subtle)]">Keine Rechnungen vorhanden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Nr.', 'Art', 'Betrag', 'Datum', 'Fälligkeit', 'Status', 'Aktionen'].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-semibold text-[var(--text-subtle)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.renewalInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-2 py-1.5 font-mono">{inv.invoice_number ?? `#${inv.id}`}</td>
                    <td className="px-2 py-1.5 text-[var(--text-subtle)]">{inv.invoice_kind ?? '-'}</td>
                    <td className="px-2 py-1.5 font-semibold">{formatCHF(inv.amount_chf ?? inv.betrag)}</td>
                    <td className="px-2 py-1.5">{formatDate(inv.sent_at ?? inv.invoice_date ?? inv.created_at)}</td>
                    <td className="px-2 py-1.5">{formatDate(inv.due_at)}</td>
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 font-bold ${
                        inv.invoice_status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                        inv.invoice_status === 'overdue' ? 'bg-red-50 text-red-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {inv.invoice_status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      {inv.invoice_status !== 'paid' && (
                        <button
                          type="button"
                          onClick={() => setMarkPaidModal({ open: true, invoiceId: inv.id, method: 'bank_transfer', note: '' })}
                          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Bezahlt
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ─── Exxas-Rechnungen ─── */}
      {data.exxasInvoices.length > 0 && (
        <Section title="Exxas-Rechnungen">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Nr.', 'Bezeichnung', 'Betrag', 'Status', 'Aktionen'].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-semibold text-[var(--text-subtle)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.exxasInvoices.map((ei) => (
                  <tr key={ei.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-2 py-1.5 font-mono">{ei.nummer ?? `#${ei.id}`}</td>
                    <td className="px-2 py-1.5">{ei.bezeichnung ?? '-'}</td>
                    <td className="px-2 py-1.5 font-semibold">{formatCHF(ei.betrag)}</td>
                    <td className="px-2 py-1.5">{ei.exxas_status ?? ei.status ?? '-'}</td>
                    <td className="px-2 py-1.5">
                      {ei.status !== 'cancelled' && String(ei.id) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (confirm('Exxas-Rechnung wirklich stornieren?')) {
                              run(() => exxasCancelInvoice(tourId, String(ei.id)), 'Exxas-Rechnung storniert.');
                            }
                          }}
                          className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                        >
                          Stornieren
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ─── Aktionslog ─── */}
      {data.actions_log.length > 0 && (
        <Section title="Aktionslog">
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {data.actions_log.slice(0, 30).map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-[var(--text-subtle)] whitespace-nowrap">{formatDate(entry.created_at)}</span>
                <span className="text-[var(--text-main)]">
                  <span className="font-mono text-[0.65rem] text-[var(--text-subtle)] mr-1">[{entry.action_type}]</span>
                  {entry.actor_id && <span className="text-[var(--text-subtle)] mr-1">{entry.actor_type}:{entry.actor_id}</span>}
                  {entry.payload ? JSON.stringify(entry.payload) : ''}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ─── Sichtbarkeit-Modal ─── */}
      {visModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setVisModal((m) => ({ ...m, open: false }))}>
          <div className="w-full max-w-xs rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold">Passwort für Sichtbarkeit</h3>
              <button type="button" onClick={() => setVisModal((m) => ({ ...m, open: false }))} className="text-xl leading-none text-[var(--text-subtle)]">×</button>
            </div>
            <div className="p-4">
              <input
                type="text"
                placeholder="Passwort eingeben"
                value={visModal.pw}
                onChange={(e) => setVisModal((m) => ({ ...m, pw: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
              <button type="button" onClick={() => setVisModal((m) => ({ ...m, open: false }))} className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs">Abbrechen</button>
              <button
                type="button"
                disabled={busy || !visModal.pw}
                onClick={() => {
                  run(() => setAdminTourVisibility(tourId, 'PASSWORD', visModal.pw), 'Sichtbarkeit gesetzt.');
                  setVisModal((m) => ({ ...m, open: false }));
                }}
                className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Manuelle-Rechnung-Modal ─── */}
      {manualInvModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setManualInvModal((m) => ({ ...m, open: false }))}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold">Manuelle Rechnung erstellen</h3>
              <button type="button" onClick={() => setManualInvModal((m) => ({ ...m, open: false }))} className="text-xl leading-none">×</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Betrag (CHF)</label>
                <input type="number" step="0.01" value={manualInvModal.amount} onChange={(e) => setManualInvModal((m) => ({ ...m, amount: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Art</label>
                <select value={manualInvModal.kind} onChange={(e) => setManualInvModal((m) => ({ ...m, kind: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">
                  <option value="manual">Manuell</option>
                  <option value="portal_extension">Verlängerung</option>
                  <option value="portal_reactivation">Reaktivierung</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Notiz</label>
                <input type="text" value={manualInvModal.note} onChange={(e) => setManualInvModal((m) => ({ ...m, note: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Fälligkeit</label>
                <input type="date" value={manualInvModal.due} onChange={(e) => setManualInvModal((m) => ({ ...m, due: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={manualInvModal.markPaid}
                  onChange={(e) => setManualInvModal((m) => ({ ...m, markPaid: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300" id="markPaidCheck" />
                <label htmlFor="markPaidCheck" className="text-xs cursor-pointer">Direkt als bezahlt markieren</label>
              </div>
              {manualInvModal.markPaid && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Zahlungsart</label>
                  <select value={manualInvModal.payMethod} onChange={(e) => setManualInvModal((m) => ({ ...m, payMethod: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">
                    {PAYMENT_METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
              <button type="button" onClick={() => setManualInvModal((m) => ({ ...m, open: false }))} className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs">Abbrechen</button>
              <button
                type="button"
                disabled={busy || !manualInvModal.amount}
                onClick={async () => {
                  await run(() => createManualInvoice(tourId, {
                    amount_chf: parseFloat(manualInvModal.amount),
                    invoice_kind: manualInvModal.kind,
                    note: manualInvModal.note || undefined,
                    due_at: manualInvModal.due || undefined,
                    mark_paid: manualInvModal.markPaid,
                    payment_method: manualInvModal.markPaid ? manualInvModal.payMethod : undefined,
                  }), 'Rechnung erstellt.');
                  setManualInvModal((m) => ({ ...m, open: false }));
                }}
                className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mark-Paid-Modal ─── */}
      {markPaidModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setMarkPaidModal((m) => ({ ...m, open: false }))}>
          <div className="w-full max-w-xs rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold">Als bezahlt markieren</h3>
              <button type="button" onClick={() => setMarkPaidModal((m) => ({ ...m, open: false }))} className="text-xl leading-none">×</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Zahlungsart</label>
                <select value={markPaidModal.method} onChange={(e) => setMarkPaidModal((m) => ({ ...m, method: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">
                  {PAYMENT_METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Notiz</label>
                <input type="text" value={markPaidModal.note} onChange={(e) => setMarkPaidModal((m) => ({ ...m, note: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
              <button type="button" onClick={() => setMarkPaidModal((m) => ({ ...m, open: false }))} className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs">Abbrechen</button>
              <button
                type="button"
                disabled={busy || !markPaidModal.invoiceId}
                onClick={async () => {
                  await run(() => markInvoicePaidManual(tourId, markPaidModal.invoiceId!, { payment_method: markPaidModal.method, payment_note: markPaidModal.note || undefined }), 'Bezahlt markiert.');
                  setMarkPaidModal((m) => ({ ...m, open: false }));
                }}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
