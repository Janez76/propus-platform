"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AuthLogoHeader, AuthCard } from "@/components/auth/AuthPageLayout";
import { AuthThemeToggle } from "@/components/auth/AuthThemeToggle";
import { Footer } from "@/components/layout/Footer";
import { Eye, EyeOff, KeyRound, ArrowLeft } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token")?.trim() || "";

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setTokenValid(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/portal/api/check-reset-token?token=${encodeURIComponent(token)}`,
          { credentials: "include" },
        );
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; valid?: boolean; email?: string | null };
        if (cancelled) return;
        setTokenValid(!!data?.valid);
        if (data?.valid && data.email) setEmailHint(String(data.email));
        setError("");
      } catch {
        if (!cancelled) {
          setTokenValid(false);
          setError("Token konnte nicht geprüft werden.");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== password2) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/portal/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Passwort konnte nicht gesetzt werden.");
        return;
      }
      const emailQ = emailHint ? `&email=${encodeURIComponent(emailHint)}` : "";
      router.replace(`/login?success=password_reset${emailQ}`);
    } catch {
      setError("Verbindungsfehler. Bitte später erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthCard>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Es fehlt der Token-Parameter. Bitte den vollständigen Link aus der E‑Mail verwenden.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/forgot-password" className="text-[var(--accent,#B68E20)] hover:underline">
            Neuen Link anfordern
          </Link>
        </p>
      </AuthCard>
    );
  }

  if (checking) {
    return (
      <AuthCard>
        <div className="flex justify-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
          Link wird geprüft…
        </div>
      </AuthCard>
    );
  }

  if (!tokenValid) {
    return (
      <AuthCard>
        <p className="text-sm text-red-700 dark:text-red-300">
          Dieser Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/forgot-password" className="text-[var(--accent,#B68E20)] hover:underline">
            Passwort vergessen
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      {error && <div className="auth-error mb-4">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {emailHint && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Konto: <strong className="text-[var(--text-main)]">{emailHint}</strong>
          </p>
        )}
        <div>
          <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Neues Passwort</label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              className="ui-input w-full pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              disabled={loading}
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
        <div>
          <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Passwort wiederholen</label>
          <input
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            className="ui-input w-full"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            minLength={8}
            required
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="auth-btn w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4" />
          {loading ? "Speichern…" : "Passwort speichern"}
        </button>
      </form>
    </AuthCard>
  );
}

function ResetPasswordShell() {
  return (
    <div className="auth-page" style={{ display: "flex", flexDirection: "column" }}>
      <div className="auth-dots" aria-hidden="true" />
      <AuthThemeToggle />
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          <AuthLogoHeader title="Neues Passwort" subtitle="Wähle ein neues Passwort für dein Konto." />
          <Suspense
            fallback={
              <AuthCard>
                <div className="flex justify-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
                  Laden…
                </div>
              </AuthCard>
            }
          >
            <ResetPasswordForm />
          </Suspense>
          <p className="mt-4 text-sm text-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1 text-[var(--accent,#B68E20)] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Zum Login
            </Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default function ResetPasswordPage() {
  return <ResetPasswordShell />;
}
