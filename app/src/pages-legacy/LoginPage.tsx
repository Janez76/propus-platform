import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { isCompanyWorkspaceRole } from "../lib/companyRoles";
import { t } from "../i18n";
import type { Role } from "../types";
import { Footer } from "../components/layout/Footer";
import { AuthLogoHeader, AuthCard } from "../components/auth/AuthPageLayout";
import { getAdminProfile } from "../api/profile";
import { API_BASE } from "../api/client";

export function LoginPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const lang = useAuthStore((s) => s.language) || "de";
  const setAuth = useAuthStore((s) => s.setAuth);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  // Logto-Token aus URL-Parameter verarbeiten (Fallback für laufende SSO-Sessions)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const logtoToken = params.get("logto_token");
    if (logtoToken) {
      const returnTo = params.get("returnTo") || "/dashboard";
      params.delete("logto_token");
      params.delete("returnTo");
      const newSearch = params.toString();
      window.history.replaceState({}, "", newSearch ? `?${newSearch}` : window.location.pathname);
      void (async () => {
        try {
          const me = await getAdminProfile(logtoToken);
          setAuth(logtoToken, me.role || "admin", true, Array.isArray(me.permissions) ? me.permissions : []);
        } catch {
          setAuth(logtoToken, "admin", true);
        }
        navigate(returnTo.startsWith("/") ? returnTo : "/dashboard", { replace: true });
      })();
      return;
    }
    const errParam = params.get("auth_error");
    if (errParam) {
      setError(decodeURIComponent(errParam));
      params.delete("auth_error");
      const newSearch = params.toString();
      window.history.replaceState({}, "", newSearch ? `?${newSearch}` : window.location.pathname);
    }
  }, [navigate, setAuth]);

  useEffect(() => {
    if (token) {
      const companyHome = role === "company_employee" ? "/portal/bestellungen" : "/portal/firma";
      navigate(isCompanyWorkspaceRole(role) ? companyHome : "/dashboard", { replace: true });
    }
  }, [navigate, role, token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Login fehlgeschlagen");
        return;
      }
      const { token: tok, role: r, permissions } = data as { token: string; role: Role; permissions?: string[] };
      setAuth(tok, r || "admin", true, Array.isArray(permissions) ? permissions : []);
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo") || "/dashboard";
      navigate(returnTo.startsWith("/") ? returnTo : "/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page" style={{ display: "flex", flexDirection: "column" }}>
      <div className="auth-dots" aria-hidden="true" />

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          <AuthLogoHeader
            title={t(lang, "login.title")}
            subtitle="Melde dich mit deinen Zugangsdaten an."
          />

          <AuthCard>
            {error && <div className="auth-error mb-4">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
                  E-Mail oder Benutzername
                </label>
                <input
                  ref={usernameRef}
                  type="text"
                  autoComplete="username"
                  className="ui-input w-full"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="name@propus.ch"
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
                  Passwort
                </label>
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
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text-muted)]"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="auth-btn w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogIn className="h-4 w-4" />
                {loading ? "Anmelden…" : "Anmelden"}
              </button>
            </form>
          </AuthCard>
        </div>
      </div>

      <Footer />
    </div>
  );
}
