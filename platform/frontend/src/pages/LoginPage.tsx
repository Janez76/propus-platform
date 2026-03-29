import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { isCompanyWorkspaceRole } from "../lib/companyRoles";
import { t } from "../i18n";
import { Footer } from "../components/layout/Footer";
import { AuthLogoHeader, AuthCard } from "../components/auth/AuthPageLayout";
import { API_BASE } from "../api/client";

export function LoginPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const lang = useAuthStore((s) => s.language) || "de";
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const logtoToken = params.get("logto_token");
    if (logtoToken) {
      params.delete("logto_token");
      const returnTo = params.get("returnTo") || "/dashboard";
      params.delete("returnTo");
      const newSearch = params.toString();
      window.history.replaceState({}, "", newSearch ? `?${newSearch}` : window.location.pathname);
      setAuth(logtoToken, "admin", true);
      navigate(returnTo.startsWith("/") ? returnTo : "/dashboard", { replace: true });
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

  const ssoUrl = `${API_BASE}/auth/logto/login`;

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

            <a
              href={ssoUrl}
              className="auth-btn w-full flex items-center justify-center gap-2"
              style={{ textDecoration: "none" }}
            >
              <LogIn className="h-4 w-4" />
              Mit Propus-Konto anmelden
            </a>

            <p className="text-center text-xs p-text-muted mt-4">
              Du wirst zum zentralen Login weitergeleitet.
            </p>
          </AuthCard>
        </div>
      </div>

      <Footer />
    </div>
  );
}
