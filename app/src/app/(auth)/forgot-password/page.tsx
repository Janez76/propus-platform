"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthLogoHeader, AuthCard } from "@/components/auth/AuthPageLayout";
import { Footer } from "@/components/layout/Footer";
import { ArrowLeft, Send } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/portal/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        credentials: "include",
      });
      const _data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError("Anfrage konnte nicht gesendet werden. Bitte später erneut versuchen.");
        return;
      }
      setDone(true);
    } catch {
      setError("Verbindungsfehler. Bitte später erneut versuchen.");
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
            title="Passwort zurücksetzen"
            subtitle="Wir senden dir einen Link per E‑Mail, falls ein Konto existiert."
          />
          <AuthCard>
            {done ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Falls ein Konto mit dieser E‑Mail existiert, haben wir dir eine Nachricht mit einem Link zum Setzen
                des Passworts gesendet. Prüfe auch den Spam-Ordner.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="auth-error mb-2">{error}</div>}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">E‑Mail</label>
                  <input
                    type="email"
                    autoComplete="email"
                    className="ui-input w-full"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@firma.ch"
                    disabled={loading}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="auth-btn w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                  {loading ? "Senden…" : "Link anfordern"}
                </button>
              </form>
            )}
            <p className="mt-6 text-sm">
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-[var(--accent,#B68E20)] hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Zum Login
              </Link>
            </p>
          </AuthCard>
        </div>
      </div>
      <Footer />
    </div>
  );
}
