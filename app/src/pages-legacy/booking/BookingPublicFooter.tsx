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
        "border-t border-[var(--border-soft)] py-4 text-center text-[11px] text-[var(--text-subtle)] space-y-2",
        className,
      )}
    >
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <a href="https://www.propus.ch/impressum/" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] underline underline-offset-2 transition-colors">
          {t(lang, "footer.impressum")}
        </a>
        <span aria-hidden>|</span>
        <a href="https://www.propus.ch/datenschutz/" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] underline underline-offset-2 transition-colors">
          {t(lang, "footer.datenschutz")}
        </a>
        <span aria-hidden>|</span>
        <a href="https://www.propus.ch/agb/" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] underline underline-offset-2 transition-colors">
          {t(lang, "footer.agb")}
        </a>
      </div>
      <div>
        {t(lang, "footer.copyright")}
        {version ? ` | ${version}` : ""}
      </div>
    </footer>
  );
}

