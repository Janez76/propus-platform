import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { API_BASE } from "../../api/client";
import { normalizeAppVersionLabel } from "../../lib/normalizeAppVersion";

export function Footer() {
  const [version, setVersion] = useState("");
  // lang aktuell nicht fuer Labels genutzt — Footer-Texte sind sprachneutral
  // bzw. Eigennamen. Bleibt abonniert, falls spaeter lokalisiert wird.
  useAuthStore((s) => s.language);

  useEffect(() => {
    // Backend buildId ist die Quelle der Wahrheit (deployed Version)
    const loadVersion = () => {
      fetch(`${API_BASE}/api/health`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.buildId) setVersion(normalizeAppVersionLabel(String(data.buildId)));
          else loadVersionFallback();
        })
        .catch(() => loadVersionFallback());
    };
    const loadVersionFallback = () => {
      fetch(`/VERSION?cb=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((v) => setVersion(normalizeAppVersionLabel(v)))
        .catch(() => setVersion(""));
    };
    loadVersion();
  }, []);

  const year = new Date().getFullYear();

  return (
    <footer className="propus-footer">
      <div className="propus-footer__left">
        <span>© {year} <strong>Propus GmbH</strong></span>
        <span className="propus-footer__sep">·</span>
        <span>Erstellt von <strong>Propuscode.ch</strong></span>
        {version ? (
          <>
            <span className="propus-footer__sep">·</span>
            <span className="propus-footer__version">{version}</span>
          </>
        ) : null}
      </div>
      <div className="propus-footer__right">
        <span className="propus-footer__status">
          <span className="propus-footer__pulse" aria-hidden="true" />
          Alle Systeme online
        </span>
      </div>
    </footer>
  );
}
