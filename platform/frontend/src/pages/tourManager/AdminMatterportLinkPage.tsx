/**
 * Admin Matterport-Verknüpfung – React-Portierung von tours/views/admin/link-matterport.ejs
 *
 * Features: Unverknüpfte Spaces anzeigen, mit bestehender Tour verknüpfen oder neue Tour erstellen,
 * Auto-Link, Status-Sync, Eigentümers-Prüfung, Created-Refresh.
 */
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  getMatterportLinkData,
  linkMatterportSpace,
  autoLinkMatterport,
  syncMatterportStatus,
  checkMatterportOwnership,
  refreshMatterportCreated,
  type MatterportLinkData,
} from '../../api/tourAdmin';
import { MATTERPORT_STATE_LABELS } from '../../types/tourManager';
import type { AdminTourListItem, MatterportSpace } from '../../types/tourManager';

function formatDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function AdminMatterportLinkPage() {
  const [searchParams] = useSearchParams();
  const openSpaceId = searchParams.get('openSpaceId') ?? undefined;

  const [data, setData] = useState<MatterportLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectedSpace, setSelectedSpace] = useState<MatterportSpace | null>(null);
  const [linkMode, setLinkMode] = useState<'existing' | 'new'>('existing');
  const [selectedTourId, setSelectedTourId] = useState<string>('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [spaceSearch, setSpaceSearch] = useState('');
  const [tourSearch, setTourSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getMatterportLinkData(openSpaceId)
      .then((d) => {
        setData(d);
        if (openSpaceId) {
          const found = d.openSpaces.find((s) => s.id === openSpaceId);
          if (found) setSelectedSpace(found);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [openSpaceId]);

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

  async function handleLink() {
    if (!selectedSpace) return;
    await run(
      () => linkMatterportSpace(
        linkMode === 'existing'
          ? { spaceId: selectedSpace.id, tourId: Number(selectedTourId) }
          : { spaceId: selectedSpace.id, createNew: true, customerName: newCustomer, objectLabel: newLabel }
      ),
      'Matterport-Space verknüpft.'
    );
    setSelectedSpace(null);
  }

  const filteredSpaces = (data?.openSpaces ?? []).filter((s) =>
    !spaceSearch || s.id.toLowerCase().includes(spaceSearch.toLowerCase()) ||
    (s.name ?? '').toLowerCase().includes(spaceSearch.toLowerCase())
  );

  const filteredTours = (data?.linkedTours ?? []).filter((t: AdminTourListItem) =>
    !tourSearch ||
    (t.canonical_object_label ?? t.object_label ?? t.bezeichnung ?? '').toLowerCase().includes(tourSearch.toLowerCase()) ||
    (t.canonical_customer_name ?? t.customer_name ?? '').toLowerCase().includes(tourSearch.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Matterport verknüpfen</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">Unverknüpfte Spaces mit Touren verbinden oder neue Touren anlegen.</p>
      </div>

      {success && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-700 text-sm">{success}</div>}
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>}

      {/* Aktionen */}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run(autoLinkMatterport, 'Auto-Link abgeschlossen.')}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60">
          Auto-Link starten
        </button>
        <button type="button" disabled={busy} onClick={() => run(syncMatterportStatus, 'Status synchronisiert.')}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60">
          Status synchronisieren
        </button>
        <button type="button" disabled={busy} onClick={() => run(checkMatterportOwnership, 'Eigentümerschaft geprüft.')}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60">
          Eigentümer prüfen
        </button>
        <button type="button" disabled={busy} onClick={() => run(refreshMatterportCreated, 'Erstellungsdaten aktualisiert.')}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60">
          Erstellungsdaten aktualisieren
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ─── Unverknüpfte Spaces ─── */}
          <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-[var(--border)] bg-slate-50 px-4 py-2.5 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--text-subtle)]">
                Unverknüpfte Spaces ({data?.openSpaces.length ?? 0})
              </h2>
            </div>
            <div className="p-3">
              <input
                type="text"
                value={spaceSearch}
                onChange={(e) => setSpaceSearch(e.target.value)}
                placeholder="Suchen…"
                className="mb-2 w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              />
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {filteredSpaces.length === 0 && (
                  <p className="text-center text-xs text-[var(--text-subtle)] py-4">Keine unverknüpften Spaces</p>
                )}
                {filteredSpaces.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSelectedSpace(s); setSelectedTourId(''); setNewCustomer(''); setNewLabel(s.name ?? ''); }}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      selectedSpace?.id === s.id
                        ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                        : 'border-[var(--border)] hover:border-[var(--accent)]/30 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-mono font-semibold text-[var(--text-main)]">{s.id}</div>
                    {s.name && <div className="text-[var(--text-subtle)] mt-0.5">{s.name}</div>}
                    <div className="flex items-center gap-2 mt-0.5 text-[0.65rem] text-[var(--text-subtle)]">
                      {s.state && <span>{MATTERPORT_STATE_LABELS[s.state] ?? s.state}</span>}
                      {s.created && <span>{formatDate(s.created)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Verknüpfungs-Formular ─── */}
          <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-[var(--border)] bg-slate-50 px-4 py-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--text-subtle)]">Verknüpfen</h2>
            </div>
            <div className="p-4">
              {!selectedSpace ? (
                <p className="text-sm text-[var(--text-subtle)]">← Space auswählen</p>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2">
                    <div className="text-xs font-semibold text-[var(--text-subtle)]">Ausgewählter Space</div>
                    <div className="font-mono text-sm font-bold">{selectedSpace.id}</div>
                    {selectedSpace.name && <div className="text-xs text-[var(--text-subtle)]">{selectedSpace.name}</div>}
                  </div>

                  {/* Modus */}
                  <div className="flex gap-2">
                    {(['existing', 'new'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setLinkMode(m)}
                        className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          linkMode === m
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                            : 'border-[var(--border)] hover:border-amber-300'
                        }`}
                      >
                        {m === 'existing' ? 'Bestehende Tour' : 'Neue Tour erstellen'}
                      </button>
                    ))}
                  </div>

                  {linkMode === 'existing' ? (
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Tour</label>
                      <input
                        type="text"
                        value={tourSearch}
                        onChange={(e) => setTourSearch(e.target.value)}
                        placeholder="Tour suchen…"
                        className="mb-2 w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                        {filteredTours.slice(0, 50).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedTourId(String(t.id))}
                            className={`w-full rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${
                              selectedTourId === String(t.id)
                                ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                                : 'border-[var(--border)] hover:bg-slate-50'
                            }`}
                          >
                            <span className="font-semibold">#{t.id}</span>
                            {' '}
                            {t.canonical_object_label ?? t.object_label ?? t.bezeichnung ?? ''}
                            <span className="ml-1 text-[var(--text-subtle)]">
                              ({t.canonical_customer_name ?? t.customer_name ?? ''})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Kundenname</label>
                        <input type="text" value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-subtle)] mb-1">Objektbezeichnung</label>
                        <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSpace(null)}
                      className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs font-medium"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      disabled={busy || (linkMode === 'existing' && !selectedTourId) || (linkMode === 'new' && !newCustomer)}
                      onClick={handleLink}
                      className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {busy ? 'Verknüpfen…' : 'Verknüpfen'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Verknüpfte Touren-Liste ─── */}
      {(data?.linkedTours.length ?? 0) > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
          <div className="border-b border-[var(--border)] bg-slate-50 px-4 py-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--text-subtle)]">
              Verknüpfte Touren ({data!.linkedTours.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['ID', 'Bezeichnung', 'Kunde', 'Matterport-ID', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-[var(--text-subtle)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data!.linkedTours.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/50">
                    <td className="px-3 py-2">
                      <Link to={`/admin/tours/${t.id}`} className="text-[var(--accent)] hover:underline font-mono">#{t.id}</Link>
                    </td>
                    <td className="px-3 py-2 font-medium">{t.canonical_object_label ?? t.object_label ?? t.bezeichnung ?? '-'}</td>
                    <td className="px-3 py-2 text-[var(--text-subtle)]">{t.canonical_customer_name ?? t.customer_name ?? '-'}</td>
                    <td className="px-3 py-2 font-mono">{t.canonical_matterport_space_id ?? t.matterport_space_id ?? '-'}</td>
                    <td className="px-3 py-2">
                      {t.live_matterport_state
                        ? (MATTERPORT_STATE_LABELS[t.live_matterport_state] ?? t.live_matterport_state)
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
