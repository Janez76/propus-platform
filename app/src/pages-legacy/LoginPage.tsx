import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LogIn, Mail } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { normalizeStoredRole, useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { Footer } from "../components/layout/Footer";
import { AuthLogoHeader, AuthCard } from "../components/auth/AuthPageLayout";
import { AuthThemeToggle } from "../components/auth/AuthThemeToggle";
import { resolvePostLoginTarget } from "../lib/postLoginRedirect";
import { isPortalHost } from "../lib/portalHost";

type LoginMode = "magic" | "password";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const lang = useAuthStore((s) => s.language) || "de";
  const setAuth = useAuthStore((s) => s.setAuth);

  // Auf Portal-Hosts ist Magic-Link der Default-Flow; auf Admin-Hosts bleibt
  // klassisches Passwort-Login Default. Wer eingeladen wird oder direkt einen
  // Reset-Link bekommt, soll trotzdem nicht im Magic-Link-Loop landen — daher
  // erlaubt ?mode=password den Direktwechsel.
  const initialMode: LoginMode =
    params.get("mode") === "password"
      ? "password"
      : isPortalHost()
      ? "magic"
      : "password";
  const [mode, setMode] = useState<LoginMode>(initialMode);

  const [username, setUsername] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);

  const successParam = params.get("success");
  const successMessages: Record<string, string> = {
    password_reset: "Passwort gespeichert. Sie können sich jetzt anmelden.",
  };
  const reasonParam = params.get("reason");
  const sessionExpired = reasonParam === "expired";

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  useEffect(() => {
    const errParam = params.get("auth_error");
    if (errParam) {
      setError(decodeURIComponent(errParam));
    }
  }, [params]);

  useEffect(() => {
    if (token) {
      const returnTo = params.get("returnTo");
      const target = resolvePostLoginTarget(role, returnTo);
      if (/^https?:\/\//.test(target)) {
        window.location.replace(target);
      } else {
        navigate(target, { replace: true });
      }
    }
  }, [navigate, role, token, params]);

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    const email = username.trim();
    if (!email) return;
    setError("");
    setLoading(true);
    try {
      // Backend antwortet aus Sicherheitsgruenden IMMER 200 (kein Account-Enum).
      // Wir zeigen darum auch immer den Erfolgs-Bildschirm, unabhaengig davon,
      // ob ein Account existiert.
      await fetch("/api/customer/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });
      setMagicLinkSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      if (isPortalHost()) {
        // Auf dem Kunden-Portal: customer_session Cookie via dediziertem Endpunkt,
        // kein Admin-JWT. Verhindert den Redirect-Loop durch CustomerSessionBootstrap.
        const res = await fetch("/api/customer/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: username.trim(), password, rememberMe }),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError((data as { error?: string })?.error || "Login fehlgeschlagen");
          return;
        }
        const returnTo = params.get("returnTo");
        const target = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.startsWith("/\\")
          ? returnTo
          : "/account";
        navigate(target, { replace: true });
        return;
      }

      const res = await fetch(`/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username.trim(), username: username.trim(), password, rememberMe }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string })?.error || "Login fehlgeschlagen");
        return;
      }
      const { token: tok, role: r, permissions } = data as { token: string; role: string; permissions?: string[] };
      const normalizedRole = normalizeStoredRole(r);
      setAuth(tok, normalizedRole, rememberMe, Array.isArray(permissions) ? permissions : []);
      const returnTo = params.get("returnTo");
      const target = resolvePostLoginTarget(normalizedRole, returnTo);
      if (/^https?:\/\//.test(target)) {
        window.location.replace(target);
      } else {
        navigate(target, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page" style={{ display: "flex", flexDirection: "column" }}>
      <div className="auth-dots" aria-hidden="true" />
      <AuthThemeToggle />

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          <AuthLogoHeader
            title={t(lang, "login.title")}
            subtitle="Melde dich mit deinen Zugangsdaten an."
          />

          <AuthCard>
            {successParam && successMessages[successParam] && (
              <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                {successMessages[successParam]}
              </div>
            )}
            {sessionExpired && !error && (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
                Ihre Sitzung ist abgelaufen. Bitte erneut anmelden.
              </div>
            )}
            {error && <div className="auth-error mb-4">{error}</div>}

            {magicLinkSent ? (
              <div className="space-y-4 text-center py-4">
                <div className="mx-auto h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-green-700 dark:text-green-300" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-(--text-strong)">Mail unterwegs</h2>
                  <p className="mt-2 text-sm text-(--text-muted)">
                    Falls ein Konto zu <strong>{username.trim()}</strong> existiert, haben wir dir
                    soeben einen Login-Link geschickt. Der Link ist 15 Minuten gueltig.
                  </p>
                </div>
                <div className="text-xs text-(--text-subtle)">
                  Keine Mail erhalten? Pruefe den Spam-Ordner oder
                  {" "}
                  <button
                    type="button"
                    onClick={() => { setMagicLinkSent(false); setError(""); }}
                    className="text-(--accent,#B68E20) hover:underline"
                  >
                    nochmal versuchen
                  </button>.
                </div>
              </div>
            ) : mode === "magic" ? (
              <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-(--text-muted) mb-1">
                    E-Mail-Adresse
                  </label>
                  <input
                    ref={usernameRef}
                    type="email"
                    autoComplete="email"
                    className="ui-input w-full"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="name@firma.ch"
                    disabled={loading}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !username.trim()}
                  className="auth-btn w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail className="h-4 w-4" />
                  {loading ? "Wird gesendet…" : "Login-Link senden"}
                </button>

                <div className="text-center text-xs text-(--text-subtle) pt-2">
                  <button
                    type="button"
                    onClick={() => { setMode("password"); setError(""); }}
                    className="text-(--accent,#B68E20) hover:underline"
                  >
                    Mit Passwort anmelden
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-(--text-muted) mb-1">
                    E-Mail oder Benutzername
                  </label>
                  <input
                    ref={usernameRef}
                    type="text"
                    autoComplete="username"
                    className="ui-input w-full"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="name@firma.ch"
                    disabled={loading}
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-(--text-muted)">
                      Passwort
                    </label>
                    <a
                      href="/forgot-password"
                      onClick={(e) => { e.preventDefault(); navigate("/forgot-password"); }}
                      className="text-xs text-(--accent,#B68E20) hover:underline"
                    >
                      Passwort vergessen?
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      className="ui-input w-full pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={loading}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--text-subtle) hover:text-(--text-muted)"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="remember-me"
                    type="checkbox"
                    className="h-4 w-4 rounded accent-(--accent,#B68E20)"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <label htmlFor="remember-me" className="text-sm text-(--text-muted) cursor-pointer select-none">
                    Angemeldet bleiben
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || !username.trim() || !password}
                  className="auth-btn w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LogIn className="h-4 w-4" />
                  {loading ? "Anmelden…" : "Anmelden"}
                </button>

                {isPortalHost() && (
                  <div className="text-center text-xs text-(--text-subtle) pt-2">
                    <button
                      type="button"
                      onClick={() => { setMode("magic"); setError(""); }}
                      className="text-(--accent,#B68E20) hover:underline"
                    >
                      Per E-Mail-Link anmelden
                    </button>
                  </div>
                )}
              </form>
            )}
          </AuthCard>
        </div>
      </div>

      <Footer />
    </div>
  );
}
