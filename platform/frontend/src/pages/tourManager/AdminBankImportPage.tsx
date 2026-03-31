/**
 * Admin Bank-Import – React-Portierung von tours/views/admin/bank-import.ejs
 *
 * Features: Datei-Upload, ausstehende Transaktionen bestätigen/ignorieren, Import-Läufe anzeigen.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getAdminBankImport,
  uploadBankFile,
  confirmBankTransaction,
  ignoreBankTransaction,
} from '../../api/tourAdmin';

interface BankTransaction {
  id: number;
  betrag?: number | null;
  valuta?: string | null;
  buchungstext?: string | null;
  status?: string | null;
  tour_id?: number | null;
  tour_label?: string | null;
  customer_name?: string | null;
  matched_invoice_id?: number | null;
}

interface BankRun {
  id: number;
  created_at?: string | null;
  filename?: string | null;
  row_count?: number | null;
  matched_count?: number | null;
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCHF(v: number | null | undefined): string {
  if (v == null) return '-';
  return `CHF ${Number(v).toFixed(2)}`;
}

export function AdminBankImportPage() {
  const [runs, setRuns] = useState<BankRun[]>([]);
  const [pending, setPending] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    getAdminBankImport()
      .then((d) => {
        setRuns((d.runs ?? []) as BankRun[]);
        setPending((d.pendingTransactions ?? []) as BankTransaction[]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function showSuccess(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 3500); }

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const result = await uploadBankFile(file);
      if ('error' in result) throw new Error(result.error);
      showSuccess(`Datei importiert (Run #${result.runId}).`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleAction(id: number, action: 'confirm' | 'ignore') {
    setBusy(true);
    setError(null);
    try {
      if (action === 'confirm') await confirmBankTransaction(id);
      else await ignoreBankTransaction(id);
      showSuccess(action === 'confirm' ? 'Transaktion bestätigt.' : 'Transaktion ignoriert.');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Bankimport</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">CSV-Kontoauszug hochladen und Zahlungen automatisch Rechnungen zuordnen.</p>
      </div>

      {success && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-700 text-sm">{success}</div>}
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>}

      {/* Upload */}
      <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--text-subtle)] mb-3">Datei hochladen</h2>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            className="text-sm text-[var(--text-main)] file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:cursor-pointer"
          />
          {busy && <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />}
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        <>
          {/* ─── Ausstehende Transaktionen ─── */}
          {pending.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 shadow-sm overflow-hidden">
              <div className="border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <h2 className="text-xs font-bold uppercase tracking-wide text-amber-700">
                  Ausstehend ({pending.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-amber-200">
                      {['Datum', 'Betrag', 'Text', 'Tour / Kunde', 'Aktionen'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-amber-800">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((tx) => (
                      <tr key={tx.id} className="border-b border-amber-100 last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(tx.valuta)}</td>
                        <td className="px-3 py-2 font-semibold">{formatCHF(tx.betrag)}</td>
                        <td className="px-3 py-2 max-w-xs truncate">{tx.buchungstext ?? '-'}</td>
                        <td className="px-3 py-2">
                          {tx.tour_label && <div className="font-medium">{tx.tour_label}</div>}
                          {tx.customer_name && <div className="text-amber-700">{tx.customer_name}</div>}
                          {!tx.tour_label && !tx.customer_name && <span className="text-amber-500">Keine Übereinstimmung</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleAction(tx.id, 'confirm')}
                              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              Bestätigen
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleAction(tx.id, 'ignore')}
                              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Ignorieren
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Import-Läufe ─── */}
          <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-[var(--border)] bg-slate-50 px-4 py-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--text-subtle)]">
                Import-Läufe ({runs.length})
              </h2>
            </div>
            {runs.length === 0 ? (
              <p className="p-4 text-xs text-[var(--text-subtle)]">Noch keine Imports.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      {['Run', 'Datei', 'Datum', 'Zeilen', 'Gemappt'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-[var(--text-subtle)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-2 font-mono">#{run.id}</td>
                        <td className="px-3 py-2">{run.filename ?? '-'}</td>
                        <td className="px-3 py-2">{formatDate(run.created_at)}</td>
                        <td className="px-3 py-2">{run.row_count ?? '-'}</td>
                        <td className="px-3 py-2">{run.matched_count ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
