import { useEffect, useState } from "react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { API_BASE } from "../../api/client";

function normalizeVersion(raw: string): string {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (v.includes("<!doctype") || v.includes("<html")) return "";
  const cleaned = v.replace(/^\uFEFF/, "").replace(/\s+/g, "").replace(/^v+/i, "");
  if (!cleaned || !/^[a-zA-Z0-9._-]+$/.test(cleaned)) return "";
  return `v${cleaned}`;
}

export function Footer() {
  const [version, setVersion] = useState("");
  const lang = useAuthStore((s) => s.language);

  useEffect(() => {
    // Backend buildId ist die Quelle der Wahrheit (deployed Version)
    const loadVersion = () => {
      fetch(`${API_BASE}/api/health`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.buildId) setVersion(normalizeVersion(data.buildId));
          else loadVersionFallback();
        })
        .catch(() => loadVersionFallback());
    };
    const loadVersionFallback = () => {
      fetch(`/VERSION?cb=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((v) => setVersion(normalizeVersion(v)))
        .catch(() => setVersion(""));
    };
    loadVersion();
  }, []);

  return (
    <footer className="propus-footer">
      <div className="mx-auto w-full max-w-7xl px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>
        {t(lang, "footer.copyright")} {version ? `| ${version}` : ""}
      </div>
    </footer>
  );
}

