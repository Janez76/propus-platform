import { useState } from "react";
import { AlertCircle, Mail, Phone } from "lucide-react";
import type { DuplicateMatch } from "../../lib/duplicateDetection";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  open: boolean;
  duplicates: DuplicateMatch[];
  onMerge: (duplicateId: number) => Promise<void>;
  onAddAsContact?: (duplicateId: number) => Promise<void>;
  onCreateAnyway: () => Promise<void>;
  onCancel: () => void;
  companyName?: string;
};

export function DuplicateWarningDialog({
  open,
  duplicates,
  onMerge,
  onAddAsContact,
  onCreateAnyway,
  onCancel,
  companyName,
}: Props) {
  const lang = useAuthStore((s) => s.language);
  const [busy, setBusy] = useState(false);
  const [selectedDuplicateId, setSelectedDuplicateId] = useState<number | null>(
    duplicates.length > 0 ? duplicates[0].customer.id : null
  );

  const selectedDuplicate = duplicates.find(
    (d) => d.customer.id === selectedDuplicateId
  );

  async function handleMerge() {
    if (!selectedDuplicate) return;
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

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl my-auto">
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 px-6 py-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-bold text-amber-900 dark:text-amber-100">
              {t(lang, "duplicateWarning.title")}
            </h2>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              {t(lang, "duplicateWarning.description")}
            </p>
            {companyName ? (
              <p className="text-sm text-amber-800 dark:text-amber-200 mt-1 font-medium">
                {t(lang, "duplicateWarning.companyHint").replace("{{company}}", companyName)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
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
                      ? "border-[#C5A059] bg-[#C5A059]/10 dark:bg-[#C5A059]/5"
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {String(dup.customer.company || "").trim() || dup.customer.name || "-"}
                      </p>
                      {dup.customer.company && dup.customer.name ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{dup.customer.name}</p>
                      ) : null}
                      <p className="text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-500 mt-1">
                        {t(lang, "customerList.table.id")}: {dup.customer.id}
                      </p>
                      <div className="mt-2 space-y-1">
                        {dup.customer.email && (
                          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{dup.customer.email}</span>
                          </div>
                        )}
                        {dup.customer.phone && (
                          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <span>{dup.customer.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <div className="text-sm font-semibold text-[#C5A059]">
                        {Math.round(dup.similarity * 100)}%
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-1">
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
            <div className="mt-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                {t(lang, "duplicateWarning.label.duplicateInfo")}
              </p>
              <div className="space-y-2 text-sm">
                <p className="text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">{t(lang, "customerList.table.id")}</span>{" "}
                  <span className="tabular-nums">{selectedDuplicate.customer.id}</span>
                </p>
                {selectedDuplicate.customer.company && (
                  <p className="text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium">{t(lang, "duplicateWarning.label.company")}</span>{" "}
                    {selectedDuplicate.customer.company}
                  </p>
                )}
                {selectedDuplicate.customer.street && (
                  <p className="text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium">{t(lang, "duplicateWarning.label.address")}</span>{" "}
                    {selectedDuplicate.customer.street}{" "}
                    {selectedDuplicate.customer.zipcity &&
                      `• ${selectedDuplicate.customer.zipcity}`}
                  </p>
                )}
                {selectedDuplicate.customer.order_count ? (
                  <p className="text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium">{t(lang, "duplicateWarning.label.orders")}</span>{" "}
                    {selectedDuplicate.customer.order_count}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-800/50">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {t(lang, "common.cancel")}
          </button>

          <div className="flex gap-3">
            {onAddAsContact && selectedDuplicate?.matchedFields.includes("company") && (
              <button
                type="button"
                onClick={handleAddAsContact}
                disabled={busy || !selectedDuplicate}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-[#C5A059]/40 text-[#C5A059] hover:bg-[#C5A059]/10 transition-colors disabled:opacity-50"
              >
                {busy ? t(lang, "duplicateWarning.button.processing") : t(lang, "duplicateWarning.button.addAsContact")}
              </button>
            )}
            <button
              type="button"
              onClick={handleCreateAnyway}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {busy ? t(lang, "duplicateWarning.button.processing") : t(lang, "duplicateWarning.button.createAnyway")}
            </button>
            <button
              type="button"
              onClick={handleMerge}
              disabled={busy || !selectedDuplicate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C5A059] text-white font-semibold text-sm hover:bg-[#B39049] transition-colors disabled:opacity-50"
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
          </div>
        </div>
      </div>
    </div>
  );
}
