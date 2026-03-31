import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { Customer } from "../../api/customers";
import { mergeCustomers } from "../../api/customers";
import { CustomerAutocompleteInput } from "../ui/CustomerAutocompleteInput";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  open: boolean;
  keepCustomer: Customer | null;
  customers: Customer[];
  token: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function CustomerMergeModal({ open, keepCustomer, customers, token, onClose, onSuccess }: Props) {
  const lang = useAuthStore((s) => s.language);
  const [query, setQuery] = useState("");
  const [mergeTarget, setMergeTarget] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setQuery("");
    setMergeTarget(null);
    setError("");
    setBusy(false);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  if (!open || !keepCustomer) return null;

  const canSubmit =
    mergeTarget &&
    mergeTarget.id !== keepCustomer.id &&
    !busy;

  async function submit() {
    const kc = keepCustomer;
    const mt = mergeTarget;
    if (!canSubmit || !mt || !kc) return;
    setBusy(true);
    setError("");
    try {
      await mergeCustomers(token, kc.id, mt.id);
      reset();
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t(lang, "customerMerge.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  const keepLine = `${keepCustomer.company || keepCustomer.name || "—"} (ID ${keepCustomer.id})`;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-merge-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) handleClose();
      }}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3">
          <h2 id="customer-merge-title" className="text-lg font-semibold text-[var(--text-main)]">
            {t(lang, "customerMerge.title")}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={handleClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text-main)] disabled:opacity-50"
            aria-label={t(lang, "common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 text-sm text-[var(--text-main)]">
          <p className="text-[var(--text-muted)]">{t(lang, "customerMerge.intro")}</p>

          <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t(lang, "customerMerge.keepLabel")}
            </span>
            <p className="mt-1 font-medium">{keepLine}</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              {t(lang, "customerMerge.mergeLabel")}
            </label>
            <CustomerAutocompleteInput
              value={query}
              onChange={(v) => {
                setQuery(v);
                setMergeTarget(null);
              }}
              onSelectCustomer={(c) => {
                setMergeTarget(c);
                setQuery(c.company || c.name || String(c.id));
              }}
              token={token}
              customers={customers.filter((c) => c.id !== keepCustomer.id)}
              placeholder={t(lang, "customerMerge.searchPlaceholder")}
              className="ui-input w-full"
            />
            {mergeTarget ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {t(lang, "customerMerge.selected")}: ID {mergeTarget.id} — {mergeTarget.company || mergeTarget.name || "—"}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2 rounded-lg border border-amber-200/50 bg-amber-50/80 px-3 py-2 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="text-xs leading-relaxed">{t(lang, "customerMerge.warning")}</p>
          </div>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-soft)] px-4 py-3">
          <button type="button" disabled={busy} onClick={handleClose} className="btn-secondary">
            {t(lang, "common.cancel")}
          </button>
          <button type="button" disabled={!canSubmit} onClick={() => void submit()} className="btn-primary">
            {busy ? t(lang, "customerMerge.working") : t(lang, "customerMerge.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

