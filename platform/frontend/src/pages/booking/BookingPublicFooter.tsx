import { useEffect, useState } from "react";
import { t, type Lang } from "../../i18n";
import { API_BASE } from "../../api/client";
import { normalizeAppVersionLabel } from "../../lib/normalizeAppVersion";
import { cn } from "../../lib/utils";

/**
 * Gleiche Logik wie AppShell-Footer: `footer.copyright` + optional `| v2.3.x`
 * (Quelle: /api/health buildId, Fallback /VERSION).
 */
export function BookingPublicFooter({ lang, className }: { lang: Lang; className?: string }) {
  const [version, setVersion] = useState("");

  useEffect(() => {
    const loadVersionFallback = () => {
      fetch(`/VERSION?cb=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((v) => setVersion(normalizeAppVersionLabel(v)))
        .catch(() => setVersion(""));
    };
    const loadVersion = () => {
      fetch(`${API_BASE}/api/health`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.buildId) setVersion(normalizeAppVersionLabel(String(data.buildId)));
          else loadVersionFallback();
        })
        .catch(() => loadVersionFallback());
    };
    loadVersion();
  }, []);

  return (
    <footer
      className={cn(
        "border-t border-zinc-200/60 py-3 text-center text-[11px] text-zinc-500 border-[var(--border-soft)] text-[var(--text-subtle)]",
        className,
      )}
    >
      {t(lang, "footer.copyright")}
      {version ? ` | ${version}` : ""}
    </footer>
  );
}

