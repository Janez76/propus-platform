import { useState } from "react";
import { UserPen, Info, Sparkles } from "lucide-react";
import { type Photographer } from "../../api/photographers";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  orderNo: string;
  currentPhotographerName: string;
  photographers: Photographer[];
  onClose: () => void;
  onSave: (photographerKey: string) => Promise<void>;
};

export function ChangePhotographerModal({
  orderNo,
  currentPhotographerName,
  photographers,
  onClose,
  onSave,
}: Props) {
  const lang = useAuthStore((s) => s.language);
  const [selectedKey, setSelectedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!selectedKey) {
      setError(t(lang, "changePhotographer.error.selectRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(selectedKey);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t(lang, "changePhotographer.error.assignFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[24px] bg-[#EBE9E1] p-6 shadow-2xl my-auto">
        <div className="mb-6 flex items-center gap-3">
          <UserPen className="h-6 w-6 text-[#7a6738]" />
          <div>
            <h2 className="text-xl font-bold text-zinc-900">{t(lang, "changePhotographer.title")}</h2>
            <p className="text-sm text-zinc-500">{t(lang, "changePhotographer.subtitle").replace("{{orderNo}}", orderNo)}</p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              {t(lang, "changePhotographer.label.current")}
            </label>
            <input
              type="text"
              disabled
              value={currentPhotographerName || "–"}
              className="w-full rounded-xl border-none bg-black/5 px-4 py-3 font-medium text-zinc-600 outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              {t(lang, "changePhotographer.label.new")}
            </label>
            <div className="relative">
              <select
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="w-full appearance-none rounded-xl border border-zinc-300 bg-transparent px-4 py-3 font-medium text-zinc-900 outline-none focus:border-[#7a6738] focus:ring-1 focus:ring-[#7a6738]"
              >
                <option value="" disabled>
                  {t(lang, "changePhotographer.placeholder.select")}
                </option>
                {photographers.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-600">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 rounded-xl bg-black/5 p-3 text-sm text-zinc-600">
            <Info className="h-5 w-5 shrink-0 text-[#7a6738]" />
            <p className="leading-snug">
              {t(lang, "changePhotographer.info.calendarEmail")}
            </p>
          </div>

          <div className="mt-8 flex items-center justify-end gap-3">
            <button
              disabled={busy}
              onClick={onClose}
              className="rounded-xl px-5 py-2.5 font-bold text-zinc-700 transition-colors hover:bg-black/5 disabled:opacity-50"
            >
              {t(lang, "common.cancel")}
            </button>
            <button
              disabled={busy || !selectedKey}
              onClick={handleSave}
              className="flex items-center gap-2 rounded-xl bg-[#5C4A21] px-5 py-2.5 font-bold text-white transition-colors hover:bg-[#4a3b1a] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {busy ? t(lang, "changePhotographer.button.changing") : t(lang, "changePhotographer.button.changing")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
