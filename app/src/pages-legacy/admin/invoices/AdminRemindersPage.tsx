import { useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import {
  archiveAdminInvoice,
  deleteAdminInvoice,
  getAdminInvoicesCentral,
  resendAdminInvoice,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { adminInvoicesCentralQueryKey } from "../../../lib/queryKeys";
import {
  type InvoiceRow,
  type InvoiceType,
  RenewalTable,
  StatCard,
  formatDate,
  formatMoney,
} from "./invoice-components";
import { useState } from "react";

export function AdminRemindersPage() {
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const qk = adminInvoicesCentralQueryKey("renewal", "ueberfaellig", "");
  const queryFn = useCallback(
    () => getAdminInvoicesCentral("renewal", "ueberfaellig"),
    [],
  );
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 30_000 });

  const invoices = data?.invoices ?? [];
  const stats = (data?.stats as Record<string, number>) ?? {};

  const refreshInvoices = useCallback(async () => {
    await refetch({ force: true });
  }, [refetch]);

  const runMutation = useCallback(
    async (key: string, task: () => Promise<unknown>, successMessage: string) => {
      setActionErr(null);
      setActionMsg(null);
      setBusyActionKey(key);
      try {
        await task();
        setActionMsg(successMessage);
        await refreshInvoices();
      } catch (err) {
        setActionErr(err instanceof Error ? err.message : "Aktion fehlgeschlagen.");
      } finally {
        setBusyActionKey(null);
      }
    },
    [refreshInvoices],
  );

  const handleDelete = useCallback(
    async (type: InvoiceType, invoice: InvoiceRow) => {
      const id = String(invoice.id ?? "");
      const label = String(invoice.invoice_number ?? invoice.id ?? "die Rechnung");
      if (!window.confirm(`Rechnung ${label} wirklich löschen?`)) return;
      await runMutation(
        `${type}-${id}-delete`,
        () => deleteAdminInvoice(type, id),
        "Rechnung wurde gelöscht.",
      );
    },
    [runMutation],
  );

  const handleArchive = useCallback(
    async (type: InvoiceType, invoice: InvoiceRow) => {
      const id = String(invoice.id ?? "");
      const label = String(invoice.invoice_number ?? invoice.id ?? "die Rechnung");
      if (!window.confirm(`Rechnung ${label} wirklich archivieren?`)) return;
      await runMutation(
        `${type}-${id}-archive`,
        () => archiveAdminInvoice(type, id),
        "Rechnung wurde archiviert.",
      );
    },
    [runMutation],
  );

  const handleResend = useCallback(
    async (invoice: InvoiceRow) => {
      const id = String(invoice.id ?? "");
      const label = String(invoice.invoice_number ?? invoice.id ?? "die Rechnung");
      if (!window.confirm(`Mahnung für Rechnung ${label} wirklich senden?`)) return;
      await runMutation(
        `renewal-${id}-resend`,
        () => resendAdminInvoice("renewal", id),
        "Mahnung wurde gesendet.",
      );
    },
    [runMutation],
  );

  const overdueCount = Number(stats.ueberfaellig ?? invoices.length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Mahnungen</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">Überfällige Rechnungen — Mahnwesen wird hier verwaltet.</p>
      </div>

      {overdueCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">
              {overdueCount} überfällige {overdueCount === 1 ? "Rechnung" : "Rechnungen"}
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Diese Rechnungen sind fällig und wurden noch nicht bezahlt. Bitte prüfen und ggf. Mahnung versenden.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Überfällig" value={overdueCount} tone="danger" />
        <div />
        <div />
        <div />
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void refetch({ force: true })}>
            Erneut laden
          </button>
        </p>
      ) : null}
      {actionErr ? <p className="text-sm text-red-600">{actionErr}</p> : null}
      {actionMsg ? <p className="text-sm text-green-600">{actionMsg}</p> : null}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="surface-card-strong rounded-xl px-6 py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-[var(--text-subtle)] mx-auto mb-3" />
          <p className="text-[var(--text-subtle)]">Keine überfälligen Rechnungen.</p>
        </div>
      ) : (
        <>
          <div className="surface-card-strong overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                  <th className="px-4 py-3">Tour / Kunde</th>
                  <th className="px-4 py-3">Nr.</th>
                  <th className="px-4 py-3">Betrag</th>
                  <th className="px-4 py-3">Fällig seit</th>
                  <th className="px-4 py-3">Letzter Versand</th>
                  <th className="px-4 py-3 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {(invoices as InvoiceRow[]).map((row) => {
                  const iid = row.id as string | number;
                  const tid = row.tour_id as number;
                  return (
                    <tr key={String(iid)} className="border-b border-[var(--border-soft)]/50 hover:bg-red-500/5 transition-colors">
                      <td className="px-4 py-3">
                        <a href={`/admin/tours/${tid}`} className="text-[var(--accent)] hover:underline font-medium">
                          {String(row.tour_object_label || `Tour #${tid}`)}
                        </a>
                        <div className="text-xs text-[var(--text-subtle)] mt-0.5">{String(row.tour_customer_name || "")}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{String(row.invoice_number || iid)}</td>
                      <td className="px-4 py-3 font-medium text-red-700">{formatMoney(row.amount_chf)}</td>
                      <td className="px-4 py-3 text-red-600">{formatDate(row.due_at)}</td>
                      <td className="px-4 py-3 text-xs text-[var(--text-subtle)]">{formatDate(row.last_email_sent_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={busyActionKey !== null}
                          onClick={() => void handleResend(row)}
                          className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-500/20 disabled:opacity-50"
                        >
                          Mahnung senden
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="surface-card-strong rounded-xl px-5 py-4">
            <h3 className="text-sm font-semibold text-[var(--text-main)] mb-2">Weitere Mahnfunktionen</h3>
            <p className="text-xs text-[var(--text-subtle)]">
              Automatische Mahnläufe, Eskalationsstufen und Zahlungserinnerungen werden in einer zukünftigen Version verfügbar sein.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// Re-export for convenience
export { formatDate, formatMoney };
