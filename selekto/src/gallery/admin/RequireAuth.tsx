import { useCallback, useEffect, useState } from "react";
import { LOGO_LIGHT } from "../../brandAssets.ts";
import { THEME_KEY } from "../../data.ts";
import { useGalleryAuth } from "../auth/GalleryAuthContext.tsx";
import "./gallery-admin-supplement.css";

function shouldUseDarkFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Gesetzt = Zugang nur mit Magic-Link; kein Passwort-Login erlaubt. */
function hasMagicLinkConfig(): boolean {
  const v = import.meta.env.VITE_BILDER_AUSWAHL_MAGIC_KEY;
  return typeof v === "string" && v.trim().length > 0;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, signIn } = useGalleryAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Backpanel ist immer hell — theme-dark hier entfernen, beim Verlassen wiederherstellen. */
  useEffect(() => {
    document.body.classList.add("admin-body", "admin-backpanel-force-light");
    document.body.classList.remove("theme-dark");
    return () => {
      document.body.classList.remove("admin-body", "admin-backpanel-force-light");
      document.body.classList.toggle("theme-dark", shouldUseDarkFromStorage());
    };
  }, []);

  /** Login-Hintergrund nur während der Anmeldung; AdminShell übernimmt danach.
   *  Cleanup entfernt die Klasse beim Unmount (z. B. Navigation zu anderem Route). */
  useEffect(() => {
    if (user) {
      document.body.classList.remove("admin-body--login");
      return;
    }
    document.body.classList.add("admin-body--login");
    return () => {
      document.body.classList.remove("admin-body--login");
    };
  }, [user]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginErr(null);
      setSubmitting(true);
      try {
        const result = await signIn(username, password);
        if (result.error) setLoginErr(result.error);
      } finally {
        setSubmitting(false);
      }
    },
    [signIn, username, password],
  );

  if (loading) {
    return (
      <div className="gal-admin-auth-wait">
        <p className="gal-admin-auth-wait__text">Laden…</p>
      </div>
    );
  }

  if (!user) {
    /** Magic-Link konfiguriert: Passwort-Login nicht erlaubt — nur Link-Hinweis zeigen. */
    if (hasMagicLinkConfig()) {
      return (
        <div className="admin-login">
          <div className="admin-login__panel">
            <div className="admin-login__masthead">
              <a
                href="https://www.propus.ch/"
                className="admin-login__brand"
                target="_blank"
                rel="noreferrer"
                aria-label="Propus"
              >
                <img
                  className="admin-login__logo"
                  src={LOGO_LIGHT}
                  alt="Propus"
                  width={200}
                  height={48}
                  loading="eager"
                  decoding="async"
                />
                <span className="admin-login__brand-label">Bildauswahl Backpanel</span>
              </a>
            </div>
            <p className="gal-admin-auth-wait__text">Kein Zugang</p>
            <p className="gal-admin-auth-wait__hint">
              Bitte den vollständigen <strong>Magic-Link</strong> aus der Einladung öffnen — er
              enthält den Zugangscode in der Adresszeile (
              <code className="gal-admin-auth-wait__code">?key=…</code>).
            </p>
          </div>
        </div>
      );
    }

    /** Kein Magic-Link konfiguriert (lokale / Dev-Umgebung): Passwort-Login zeigen. */
    return (
      <div className="admin-login">
        <div className="admin-login__panel">
          <div className="admin-login__masthead">
            <a
              href="https://www.propus.ch/"
              className="admin-login__brand"
              target="_blank"
              rel="noreferrer"
              aria-label="Propus"
            >
              <img
                className="admin-login__logo"
                src={LOGO_LIGHT}
                alt="Propus"
                width={200}
                height={48}
                loading="eager"
                decoding="async"
              />
              <span className="admin-login__brand-label">Bildauswahl Backpanel</span>
            </a>
            <h1 className="admin-login__title">Anmelden</h1>
          </div>
          <form className="admin-login__form" onSubmit={(e) => void handleSubmit(e)}>
            {loginErr ? <p className="admin-msg admin-msg--err">{loginErr}</p> : null}
            <div className="admin-field">
              <label htmlFor="gal-login-user">Nutzername</label>
              <input
                id="gal-login-user"
                type="text"
                autoComplete="username"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="gal-login-pw">Passwort</label>
              <input
                id="gal-login-pw"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary admin-login__submit"
              disabled={submitting}
            >
              {submitting ? "Anmelden…" : "Anmelden"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
