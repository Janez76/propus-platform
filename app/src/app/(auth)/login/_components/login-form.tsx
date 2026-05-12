"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import { loginAction } from "../actions";
import { INITIAL_STATE } from "../state";
import { normalizeStoredRole, useAuthStore } from "@/store/authStore";

type Props = {
  nextUrl?: string;
  initialError: string | null;
  successMessage?: string | null;
};

/**
 * Zulässige Redirect-Ziele: interner Pfad (kein protokoll-relativer `//`-Trick)
 * oder absolute `https://`-URL (Kunden-Portal). Sonst Fallback `/dashboard`.
 */
function safeRedirectTarget(target: string | undefined): string {
  if (!target) return "/dashboard";
  if (target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\")) {
    return target;
  }
  if (/^https:\/\/[^/]/i.test(target)) return target;
  return "/dashboard";
}

export function LoginForm({ nextUrl, initialError, successMessage }: Props) {
  const [state, formAction] = useActionState(loginAction, {
    ...INITIAL_STATE,
    error: initialError,
    field: initialError ? "form" : undefined,
  });

  // Bei Erfolg: SPA-Store (ClientShell) befüllen und clientseitig weiterleiten.
  // Kein serverseitiger redirect — siehe Kommentar in actions.ts.
  useEffect(() => {
    if (!state.ok || !state.token) return;
    useAuthStore
      .getState()
      .setAuth(
        state.token,
        normalizeStoredRole(state.role ?? "admin"),
        Boolean(state.remember),
        Array.isArray(state.permissions) ? state.permissions : [],
      );
    window.location.assign(safeRedirectTarget(state.target));
  }, [state]);

  return (
    <div className="card" id="login-card">
      <span className="form-eyebrow">Anmeldung</span>
      <h2 className="form-title" id="login-title">
        Konto-Zugang
      </h2>
      <p className="form-sub">
        Melden Sie sich mit Ihrer geschäftlichen E-Mail-Adresse an.
      </p>

      {successMessage && !state.error && (
        <div className="form-notice" role="status">
          {successMessage}
        </div>
      )}

      <form action={formAction} autoComplete="on" noValidate>
        {nextUrl && <input type="hidden" name="returnTo" value={nextUrl} />}

        <EmailField error={state.field === "email" ? state.error : null} />
        <PasswordField
          error={state.field === "password" ? state.error : null}
        />

        <div className="row-between">
          <RememberCheckbox />
          <Link href="/forgot-password" className="link">
            Passwort vergessen?
          </Link>
        </div>

        {state.field === "form" && state.error && (
          <div className="form-error" role="alert">
            {state.error}
          </div>
        )}

        <MagneticSubmit />

        <p className="foot">
          Noch kein Zugang?{" "}
          <a href="mailto:office@propus.ch">Team-Administrator kontaktieren</a>
        </p>
      </form>
    </div>
  );
}

/* ----------------------------------------------------------- */

function EmailField({ error }: { error: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filled, setFilled] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (error) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 340);
      return () => clearTimeout(t);
    }
  }, [error]);

  // Autofokus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className={[
        "field",
        filled && "filled",
        error && "error",
        shake && "shake",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={inputRef}
        type="email"
        id="email"
        name="email"
        autoComplete="username"
        placeholder=" "
        onChange={(e) => setFilled(e.target.value.length > 0)}
        aria-invalid={!!error}
        aria-describedby={error ? "email-hint" : undefined}
      />
      <label htmlFor="email">E-Mail-Adresse</label>
      <span className="hint" id="email-hint">
        {error}
      </span>
    </div>
  );
}

function PasswordField({ error }: { error: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filled, setFilled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (error) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 340);
      return () => clearTimeout(t);
    }
  }, [error]);

  return (
    <div
      className={[
        "field",
        filled && "filled",
        error && "error",
        shake && "shake",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={inputRef}
        type={visible ? "text" : "password"}
        id="password"
        name="password"
        autoComplete="current-password"
        placeholder=" "
        onChange={(e) => setFilled(e.target.value.length > 0)}
        onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)}
        aria-invalid={!!error}
        aria-describedby={error ? "password-hint" : undefined}
      />
      <label htmlFor="password">Passwort</label>

      <button
        type="button"
        className="toggle-pw"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
      >
        <EyeIcon open={!visible} />
      </button>

      <span className="hint" id="password-hint">
        {error}
      </span>
      {caps && (
        <span className="caps-warn show">⌫ Feststelltaste ist aktiv</span>
      )}
    </div>
  );
}

function RememberCheckbox() {
  return (
    <label className="checkbox">
      <input type="checkbox" id="remember" name="remember" />
      <span className="box">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0c0d10"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span>Angemeldet bleiben</span>
    </label>
  );
}

function MagneticSubmit() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();

  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const onMove = (e: MouseEvent) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.18}px, ${y * 0.3}px)`;
    };
    const onLeave = () => {
      btn.style.transform = "translate(0,0)";
    };

    btn.addEventListener("mousemove", onMove);
    btn.addEventListener("mouseleave", onLeave);
    return () => {
      btn.removeEventListener("mousemove", onMove);
      btn.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div className="btn-wrap">
      <button
        ref={btnRef}
        type="submit"
        className={`btn-primary${pending ? " loading" : ""}`}
        disabled={pending}
        aria-busy={pending}
      >
        <span className="spinner" aria-hidden="true" />
        <span className="label">{pending ? "Wird angemeldet …" : "Anmelden"}</span>
      </button>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.22-5.39" />
      <path d="M22.54 12.88A19.86 19.86 0 0 0 23 12s-4-8-11-8a10.94 10.94 0 0 0-3.94.74" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
