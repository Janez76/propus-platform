import { WifiOff } from "lucide-react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const lang = useAuthStore((s) => s.language);
  if (isOnline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[70] border-b border-amber-500/30 bg-amber-500/90 px-3 py-2 text-center text-sm font-medium text-zinc-950 backdrop-blur">
      <span className="inline-flex items-center gap-2">
        <WifiOff className="h-4 w-4" />
        {t(lang, "offline.message")}
      </span>
    </div>
  );
}
