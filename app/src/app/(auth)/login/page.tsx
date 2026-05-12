import type { Metadata } from "next";
import { headers } from "next/headers";

import { LoginForm } from "./_components/login-form";
import { InteractiveBackground } from "./_components/interactive-background";
import { Headline } from "./_components/headline";
import { LiveClock } from "./_components/live-clock";
import { StatCounter } from "./_components/stat-counter";
import { LogoMark } from "./_components/logo-mark";

import ClientShellLoader from "@/components/ClientShellLoader";
import { getPortalHostname } from "@/lib/postLoginRedirect";

import "./login.css";

export const metadata: Metadata = {
  title: "Anmelden — Propus Platform",
  description:
    "Anmeldung zur Propus Platform für Aufträge, Touren, Kunden und Finanzen.",
  robots: { index: false, follow: false },
};

/**
 * Hintergrundbilder.
 *
 * Empfehlung: durch eigene Propus-Aufnahmen ersetzen
 * (Querformat, neutral bearbeitet, min. 2000 × 1200 px).
 * Ablage: app/public/login/
 *
 * Für optimale Performance als WebP/AVIF speichern.
 */
const BG_IMAGES = [
  {
    src: "/login/bg-1.jpg",
    alt: "Modernes Wohnzimmer, lichtdurchflutet",
    credit: "Modern Living · Lichtdurchflutet",
    photographer: "Propus Portfolio",
  },
  {
    src: "/login/bg-2.jpg",
    alt: "Architektur, Bauhaus-Inspiration",
    credit: "Architektur · Bauhaus-Inspiration",
    photographer: "Propus Portfolio",
  },
  {
    src: "/login/bg-3.jpg",
    alt: "Loft mit hohen Decken",
    credit: "Loft · Hohe Decken, klare Linien",
    photographer: "Propus Portfolio",
  },
  {
    src: "/login/bg-4.jpg",
    alt: "Interieur Zürich",
    credit: "Interieur · Wohnen in Zürich",
    photographer: "Propus Portfolio",
  },
] as const;

type LoginSearchParams = Promise<{
  next?: string;
  returnTo?: string;
  error?: string;
  reason?: string;
  forbidden?: string;
  success?: string;
}>;

const SUCCESS_MESSAGES: Record<string, string> = {
  password_reset: "Passwort gespeichert. Sie können sich jetzt anmelden.",
};

function isSafeInternalPath(path: string | undefined): path is string {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  return true;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}) {
  const params = await searchParams;
  const returnTo = params.returnTo ?? params.next;

  // Auf dem Kunden-Portal-Host gehört /login weiterhin dem SPA-Login (Magic-Link
  // + customer_session-Bootstrap). Diese App-Router-Route hätte sonst Vorrang vor
  // dem Catch-all und würde Portal-Nutzern das falsche (Admin-Passwort-)Formular
  // zeigen. Darum dort den SPA-Shell rendern statt der neuen Seite.
  const hostHeader = (await headers()).get("host") ?? "";
  const host = hostHeader.split(":")[0].toLowerCase();
  if (host && host === getPortalHostname()) {
    return <ClientShellLoader />;
  }

  // KEINE serverseitige "schon eingeloggt → /dashboard"-Weiterleitung mehr:
  // Das `admin_session`-Cookie und der SPA-Auth-State (zustand-Token aus
  // localStorage/`admin_token_v2`) sind getrennt. Wenn das Cookie noch lebt,
  // der SPA-Token aber fehlt (z. B. ohne "Angemeldet bleiben" → sessionStorage
  // weg, Cookie nicht), würde gelten:
  //   /login (Cookie ⇒ redirect /dashboard) → SPA /dashboard (kein Token ⇒
  //   harte Navigation /login) → /login → …  =  Endlos-Reload-Loop.
  // Darum hier immer das Formular zeigen; den Cookie-Login kann nur die SPA
  // selbst (mit Token) verwerten.

  const initialError = params.forbidden
    ? "Keine Berechtigung für diesen Bereich."
    : params.reason === "expired"
      ? "Ihre Sitzung ist abgelaufen. Bitte erneut anmelden."
      : (params.error ?? null);
  const successMessage = params.success
    ? (SUCCESS_MESSAGES[params.success] ?? null)
    : null;

  return (
    <div className="login-shell">
      {/* Hintergrund-Layer: Slideshow, Vignette, Raster, Spotlight, Partikel, Cursor */}
      <InteractiveBackground images={BG_IMAGES} />

      {/* Topbar */}
      <header className="login-topbar">
        <div className="brand-mark">
          <LogoMark />
          <span className="logo-wordmark">Propus</span>
          <span className="gold-divider" aria-hidden="true" />
          <span className="logo-tag">Platform</span>
        </div>

        <div className="topbar-right">
          <span className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Alle Systeme aktiv
          </span>
          <span className="topbar-meta">Zug · CH</span>
          <LiveClock />
        </div>
      </header>

      {/* Hauptbereich */}
      <main className="login-stage">
        <section className="editorial" aria-labelledby="editorial-title">
          <span className="eyebrow">Admin · Booking</span>
          <Headline id="editorial-title" />
          <p className="lede">
            Verwalten Sie Aufträge, Touren und Kunden in einer einzigen
            Oberfläche. Schweizer Präzision, ohne Umwege.
          </p>

          <div className="stats" role="list">
            <StatCounter target={1247} label="Aufträge" delay={2200} />
            <StatCounter target={382} label="Touren · 3D" delay={2300} />
            <StatCounter
              target={96}
              suffix="%"
              accent
              label="Termintreue"
              delay={2400}
            />
          </div>
        </section>

        <section className="card-wrap" aria-labelledby="login-title">
          <LoginForm
            nextUrl={isSafeInternalPath(returnTo) ? returnTo : undefined}
            initialError={initialError}
            successMessage={successMessage}
          />
        </section>
      </main>

      {/* Legal */}
      <footer className="login-legal">
        <span>© 2026 Propus GmbH · Zug</span>
        <div className="legal-links">
          <a href="/datenschutz">Datenschutz</a>
          <a href="/impressum">Impressum</a>
          <a href="/hilfe">Hilfe</a>
        </div>
      </footer>
    </div>
  );
}
