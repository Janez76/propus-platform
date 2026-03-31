import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  orderNo: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export function ConfirmDeleteDialog({ orderNo, onConfirm, onCancel, busy }: Props) {
  const lang = useAuthStore((s) => s.language);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="max-w-sm border-red-500/30">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <DialogTitle className="text-base">{t(lang, "confirmDelete.title")}</DialogTitle>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{t(lang, "confirmDelete.subtitle")}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="mb-5 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm" style={{ color: "var(--text-main)" }}>
            {t(lang, "confirmDelete.message").replace("{{orderNo}}", `#${orderNo}`)}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            className="btn-secondary flex-1 justify-center"
            onClick={onCancel}
            disabled={busy}
          >
            {t(lang, "common.cancel")}
          </button>
          <button
            className="flex-1 justify-center rounded-[10px] border-none bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? t(lang, "confirmDelete.button.deleting") : t(lang, "confirmDelete.button.deleteForever")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

