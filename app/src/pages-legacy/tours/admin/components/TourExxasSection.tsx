import { useState } from "react";
import { toursAdminPost } from "../../../../api/toursAdmin";
import type { ToursAdminDeclineWorkflow, ToursAdminTourRow } from "../../../../types/toursAdmin";

type Props = {
  tourId: string;
  tour: ToursAdminTourRow;
  declineWorkflow: ToursAdminDeclineWorkflow;
  onSuccess: () => void;
};

export function TourExxasSection({ tourId, tour, declineWorkflow, onSuccess }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(key: string, path: string, body?: Record<string, unknown>) {
    if (!window.confirm("Diese Aktion wirklich ausführen?")) return;
    setBusy(key);
    setErr(null);
    try {
      await toursAdminPost(path, body);
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(null);
    }
  }

  const docId =
    declineWorkflow.preferredInvoiceDocumentId ||
    (Array.isArray(declineWorkflow.openInvoices) && declineWorkflow.openInvoices[0]
      ? String((declineWorkflow.openInvoices[0] as Record<string, unknown>).exxas_document_id ?? "")
      : "") ||
    "";

  return (
    <section className="surface-card-strong p-5 space-y-3">
      <h2 className="text-lg font-semibold text-[var(--text-main)]">Exxas &amp; Workflow</h2>
      {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-subtle)]">Abo / Vertrag</dt>
          <dd className="text-[var(--text-main)]">{String(declineWorkflow.contractStateLabel ?? "—")}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-subtle)]">Kunde</dt>
          <dd className="text-[var(--text-main)] text-right">
            {String(declineWorkflow.customerStateLabel ?? "—")}
            {declineWorkflow.customerNumber != null ? (
              <span className="block text-xs text-[var(--text-subtle)]">#{String(declineWorkflow.customerNumber)}</span>
            ) : null}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-subtle)]">Rechnung</dt>
          <dd className="text-[var(--text-main)]">{String(declineWorkflow.invoiceStateLabel ?? "—")}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-subtle)]">Kunden-Intent</dt>
          <dd className="text-[var(--text-main)]">{String(declineWorkflow.customerIntentLabel ?? "—")}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-soft)]">
        <p className="text-xs text-[var(--text-subtle)]">API-Aktionen (Ablehnung-Workflow)</p>
        <div className="flex flex-wrap gap-2">
          {declineWorkflow.hasContract ? (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void run("sub", `/tours/${tourId}/exxas-cancel-subscription`)}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 disabled:opacity-50"
            >
              {busy === "sub" ? "…" : "Abo kündigen"}
            </button>
          ) : null}
          {declineWorkflow.hasCustomer ? (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void run("cust", `/tours/${tourId}/exxas-deactivate-customer`)}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 disabled:opacity-50"
            >
              {busy === "cust" ? "…" : "Kunde deaktivieren"}
            </button>
          ) : null}
          {docId ? (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void run("inv", `/tours/${tourId}/exxas-cancel-invoice`, { exxasDocumentId: docId })}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 disabled:opacity-50"
            >
              {busy === "inv" ? "…" : "Rechnung stornieren"}
            </button>
          ) : null}
        </div>
        <p className="text-xs text-[var(--text-subtle)]">
          Tour kunde_ref: <span className="font-mono">{String(tour.kunde_ref ?? "—")}</span> · canonical_exxas:{" "}
          <span className="font-mono">{String(tour.canonical_exxas_contract_id ?? "—")}</span>
        </p>
      </div>
    </section>
  );
}
