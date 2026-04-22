import { useEffect, useState } from "react";
import { AlertCircle, Mail, Phone } from "lucide-react";
import type { DuplicateMatch } from "../../lib/duplicateDetection";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  open: boolean;
  duplicates: DuplicateMatch[];
  /** Optional: oeffentliche Buchung (kein Merge, nur Bestaetigen) */
  onMerge?: (duplicateId: number) => Promise<void>;
  onAddAsContact?: (duplicateId: number) => Promise<void>;
  onCreateAnyway: () => Promise<void>;
  onCancel: () => void;
  companyName?: string;
  /** Kein Vollbild-Overlay, nur Karte (z. B. im Buchungs-Step) */
  embedded?: boolean;
  /** Oeffentliche Buchung: eine Schaltflaeche, kein Zusammenfuehren */
  simplifiedForPublicBooking?: boolean;
};

export function DuplicateWarningDialog({
  open,
  duplicates,
  onMerge,
  onAddAsContact,
  onCreateAnyway,
  onCancel,
  companyName,
  embedded = false,
  simplifiedForPublicBooking = false,
}: Props) {
  const lang = useAuthStore((s) => s.language);
  const [busy, setBusy] = useState(false);
  const [selectedDuplicateId, setSelectedDuplicateId] = useState<number | null>(null);

  useEffect(() => {
    if (duplicates.length > 0) {
      setSelectedDuplicateId(duplicates[0]!.customer.id);
    } else {
      setSelectedDuplicateId(null);
    }
  }, [duplicates]);

  const selectedDuplicate = duplicates.find((d) => d.customer.id === selectedDuplicateId);

  async function handleMerge() {
    if (!selectedDuplicate || !onMerge) return;
    setBusy(true);
    try {
      await onMerge(selectedDuplicate.customer.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateAnyway() {
    setBusy(true);
    try {
      await onCreateAnyway();
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAsContact() {
    if (!selectedDuplicate || !onAddAsContact) return;
    setBusy(true);
    try {
      await onAddAsContact(selectedDuplicate.customer.id);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const showAdminActions = !simplifiedForPublicBooking;

  const descriptionKey = simplifiedForPublicBooking
    ? "duplicateWarning.descriptionPublicBooking"
    : "duplicateWarning.description";

  const inner = (
    <div
      className={cn(
        "w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-200/50 bg-[var(--surface)] shadow-2xl dark:border-amber-900/30",
        embedded && "max-h-none border-[var(--border-soft)]",
      )}
    >
      <div className="border-b border-amber-200 bg-amber-50 px-6 py-4 dark:border-amber-900/50 dark:bg-amber-950/40 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-lg font-bold text-amber-900 dark:text-amber-100">
            {t(lang, "duplicateWarning.title")}
          </h2>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">{t(lang, descriptionKey)}</p>
          {companyName ? (
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1 font-medium">
              {t(lang, "duplicateWarning.companyHint").replace("{{company}}", companyName)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
        <div>
          <label className="block text-sm font-semibold text-[var(--text-muted)] mb-3">
            {t(lang, "duplicateWarning.label.similarCustomers").replace("{{n}}", String(duplicates.length))}
          </label>
          <div className="space-y-2">
            {duplicates.map((dup) => (
              <button
                key={dup.customer.id}
                type="button"
                onClick={() => setSelectedDuplicateId(dup.customer.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border-2 transition-all",
                  selectedDuplicateId === dup.customer.id
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 dark:bg-[var(--accent)]/5"
                    : "border-[var(--border-soft)] hover:border-zinc-300 hover:border-[var(--border-soft)]"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--text-main)] truncate">
                      {String(dup.customer.company || "").trim() || dup.customer.name || "-"}
                    </p>
                    {dup.customer.company && dup.customer.name ? (
                      <p className="text-xs text-[var(--text-subtle)] truncate mt-0.5">{dup.customer.name}</p>
                    ) : null}
                    <p className="text-[11px] font-medium tabular-nums text-zinc-500 text-[var(--text-subtle)] mt-1">
                      {t(lang, "customerList.table.id")}: {dup.customer.id}
                    </p>
                    <div className="mt-2 space-y-1">
                      {dup.customer.email && (
                        <div className="flex items-center gap-2 text-sm text-[var(--text-subtle)]">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{dup.customer.email}</span>
                        </div>
                      )}
                      {dup.customer.phone && (
                        <div className="flex items-center gap-2 text-sm text-[var(--text-subtle)]">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <span>{dup.customer.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ml-3 shrink-0 text-right">
                    <div className="text-sm font-semibold text-[var(--accent)]">
                      {Math.round(dup.similarity * 100)}%
                    </div>
                    <p className="text-[11px] text-zinc-500 text-[var(--text-subtle)] mt-1">
                      {t(lang, "duplicateWarning.label.similarIn")}
                      {dup.matchedFields
                        .map((f) =>
                          f === "name"
                            ? t(lang, "common.name")
                            : f === "email"
                              ? t(lang, "common.email")
                              : f === "company"
                                ? t(lang, "common.company")
                                : t(lang, "common.phone")
                        )
                        .join(", ")}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {selectedDuplicate && (
          <div className="mt-4 p-4 rounded-lg bg-[var(--surface-raised)]/50 border border-[var(--border-soft)]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-2">
              {t(lang, "duplicateWarning.label.duplicateInfo")}
            </p>
            <div className="space-y-2 text-sm">
              <p className="text-[var(--text-muted)]">
                <span className="font-medium">{t(lang, "customerList.table.id")}</span>{" "}
                <span className="tabular-nums">{selectedDuplicate.customer.id}</span>
              </p>
              {selectedDuplicate.customer.company && (
                <p className="text-[var(--text-muted)]">
                  <span className="font-medium">{t(lang, "duplicateWarning.label.company")}</span>{" "}
                  {selectedDuplicate.customer.company}
                </p>
              )}
              {selectedDuplicate.customer.street && (
                <p className="text-[var(--text-muted)]">
                  <span className="font-medium">{t(lang, "duplicateWarning.label.address")}</span>{" "}
                  {selectedDuplicate.customer.street}{" "}
                  {selectedDuplicate.customer.zipcity && `• ${selectedDuplicate.customer.zipcity}`}
                </p>
              )}
              {selectedDuplicate.customer.order_count ? (
                <p className="text-[var(--text-muted)]">
                  <span className="font-medium">{t(lang, "duplicateWarning.label.orders")}</span>{" "}
                  {selectedDuplicate.customer.order_count}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {simplifiedForPublicBooking ? (
        <div className="border-t border-[var(--border-soft)] px-6 py-4 flex items-center justify-end gap-3 bg-zinc-50/50 bg-[var(--surface-raised)]/50">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-muted)] hover:bg-zinc-200 hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-50"
          >
            {t(lang, "duplicateWarning.button.notNow")}
          </button>
          <button
            type="button"
            onClick={() => void handleCreateAnyway()}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            {busy ? t(lang, "duplicateWarning.button.processing") : t(lang, "duplicateWarning.button.acknowledgeContinue")}
          </button>
        </div>
      ) : (
        <div className="border-t border-zinc-200 border-[var(--border-soft)] px-6 py-4 flex items-center justify-between gap-3 bg-zinc-50/50 bg-[var(--surface-raised)]/50">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-muted)] hover:bg-zinc-200 hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-50"
          >
            {t(lang, "common.cancel")}
          </button>

          <div className="flex flex-wrap justify-end gap-3">
            {onAddAsContact && selectedDuplicate?.matchedFields.includes("company") && (
              <button
                type="button"
                onClick={handleAddAsContact}
                disabled={busy || !selectedDuplicate}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
              >
                {busy ? t(lang, "duplicateWarning.button.processing") : t(lang, "duplicateWarning.button.addAsContact")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleCreateAnyway()}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-[var(--border-soft)] text-[var(--text-muted)] hover:bg-zinc-100 hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-50"
            >
              {busy ? t(lang, "duplicateWarning.button.processing") : t(lang, "duplicateWarning.button.createAnyway")}
            </button>
            {showAdminActions && onMerge ? (
              <button
                type="button"
                onClick={() => void handleMerge()}
                disabled={busy || !selectedDuplicate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold text-sm hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    <span>{t(lang, "duplicateWarning.button.merging")}</span>
                  </>
                ) : (
                  t(lang, "duplicateWarning.button.merge")
                )}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="w-full" role="region" aria-label={t(lang, "duplicateWarning.title")}>
        {inner}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      {inner}
    </div>
  );
}
