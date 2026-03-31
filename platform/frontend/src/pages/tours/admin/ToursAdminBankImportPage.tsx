import { useCallback, useState } from "react";
import {
  confirmBankImportTransaction,
  getToursAdminBankImport,
  ignoreBankImportTransaction,
  uploadToursAdminBankFile,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminBankImportQueryKey } from "../../../lib/queryKeys";


export function ToursAdminBankImportPage() {
  const qk = toursAdminBankImportQueryKey();
  const queryFn = useCallback(() => getToursAdminBankImport(), []);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 15_000 });
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmInvoiceByTx, setConfirmInvoiceByTx] = useState<Record<number, string>>({});

  const runs = (data?.runs as Record<string, unknown>[]) || [];
  const reviewRows = (data?.reviewRows as Record<string, unknown>[]) || [];

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    setMsg(null);
    try {
      const r = await uploadToursAdminBankFile(f);
      setMsg(`Import OK: Run #${(r as { runId?: number }).runId}, Zeilen ${(r as { totalRows?: number }).totalRows}`);
      void refetch({ force: true });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Bank-Import</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">CAMT054 / CSV – Bank-Transaktionen importieren und verarbeiten.</p>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--text-main)]">{msg}</p> : null}

      <div className="surface-card-strong p-4">
        <label className="text-sm font-medium text-[var(--text-main)] block mb-2">Datei hochladen</label>
        <input type="file" accept=".xml,.csv,text/xml,text/csv" disabled={uploading} onChange={(e) => void onUpload(e)} />
        {uploading ? <p className="text-xs text-[var(--text-subtle)] mt-2">Wird verarbeitet…</p> : null}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : null}

      {data ? (
        <>
          <section>
            <h2 className="text-lg font-semibold text-[var(--text-main)] mb-2">Letzte Läufe</h2>
            <div className="surface-card-strong overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                    <th className="p-2">ID</th>
                    <th className="p-2">Datum</th>
                    <th className="p-2">Format</th>
                    <th className="p-2">Zeilen</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={String(r.id)} className="border-b border-[var(--border-soft)]/40">
                      <td className="p-2">{String(r.id)}</td>
                      <td className="p-2">{String(r.created_at || "").slice(0, 19)}</td>
                      <td className="p-2">{String(r.source_format)}</td>
                      <td className="p-2">{String(r.total_rows)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text-main)] mb-2">Review ({reviewRows.length})</h2>
            <div className="space-y-3">
              {reviewRows.map((tx) => {
                const id = Number(tx.id);
                return (
                  <div key={id} className="surface-card-strong p-3 text-sm space-y-2">
                    <div className="flex flex-wrap gap-2 text-[var(--text-subtle)] text-xs">
                      <span>Betrag: {String(tx.amount_chf)}</span>
                      <span>Ref: {String(tx.reference_raw || "").slice(0, 40)}</span>
                      <span>{String(tx.debtor_name || "")}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        placeholder="Renewal-Invoice-ID (Zahl)"
                        value={confirmInvoiceByTx[id] || ""}
                        onChange={(e) => setConfirmInvoiceByTx((s) => ({ ...s, [id]: e.target.value }))}
                        className="flex-1 min-w-[200px] rounded border border-[var(--border-soft)] px-2 py-1 text-xs bg-[var(--surface)]"
                      />
                      <button
                        type="button"
                        className="rounded bg-[var(--accent)] text-white px-3 py-1 text-xs"
                        onClick={async () => {
                          try {
                            await confirmBankImportTransaction(id, confirmInvoiceByTx[id]?.trim() || "");
                            void refetch({ force: true });
                          } catch (e) {
                            alert(e instanceof Error ? e.message : "Fehler");
                          }
                        }}
                      >
                        Zuordnen
                      </button>
                      <button
                        type="button"
                        className="rounded border border-[var(--border-soft)] px-3 py-1 text-xs"
                        onClick={async () => {
                          try {
                            await ignoreBankImportTransaction(id);
                            void refetch({ force: true });
                          } catch (e) {
                            alert(e instanceof Error ? e.message : "Fehler");
                          }
                        }}
                      >
                        Ignorieren
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
