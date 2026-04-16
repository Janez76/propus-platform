import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { Footer } from "../components/layout/Footer";
import { AuthLogoHeader, AuthCard } from "../components/auth/AuthPageLayout";
import { API_BASE } from "../api/client";

export function LoginPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language) || "de";
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get("auth_error");
    if (errParam) {
      setError(decodeURIComponent(errParam));
      params.delete("auth_error");
      const newSearch = params.toString();
      window.history.replaceState({}, "", newSearch ? `?${newSearch}` : window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (token) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, token]);

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
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Login fehlgeschlagen");
        return;
      }
      setAuth(data.token, data.role || "admin", true);
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo") || "/dashboard";
      navigate(returnTo.startsWith("/") ? returnTo : "/dashboard", { replace: true });
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
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
            subtitle="Melde dich mit deinem Propus-Konto an."
          />

          <AuthCard>
            {error && <div className="auth-error mb-4">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-[var(--text-subtle)]">
                  Benutzername oder E-Mail
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="auth-input w-full"
                  placeholder="janez oder js@propus.ch"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-[var(--text-subtle)]">
                  Passwort
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input w-full"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="auth-btn w-full flex items-center justify-center gap-2"
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
