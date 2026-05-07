import { LogOut, Monitor } from "lucide-react";
import { memo, useCallback } from "react";
import { useAuthStore } from "../../store/authStore";
import { API_BASE } from "../../api/client";

/**
 * Polierter Mobile-Header (Polish-Pass 2 · Mobile-Redesign):
 * - Sticky-Top mit `backdrop-blur` für "floating glass"-Look
 * - Gold-Brand-Accent als 1px Gradient-Linie unten
 * - Logo + Titel weichen einer kompakteren Zeile mit Eyebrow + H1-Stil
 * - Action-Buttons als Outline-Pills (Desktop / Logout)
 * - Touch-Target ≥ 44px, Hover-Background statt nur Border
 */
export const MobileHeader = memo(function MobileHeader({ title }: { title: string }) {
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const handleLogout = useCallback(() => {
    clearAuth();
    const redirect = encodeURIComponent(
      new URL(process.env.NEXT_PUBLIC_BASE_URL || "/", window.location.origin).toString(),
    );
    window.location.href = `${API_BASE}/auth/logout?redirect=${redirect}`;
  }, [clearAuth]);

  const handleDesktop = useCallback(() => {
    try {
      window.sessionStorage.setItem("prefer_desktop", "1");
    } catch {}
    window.location.href = "/dashboard";
  }, []);

  const actionBtn: React.CSSProperties = {
    color: "var(--text-muted)",
    border: "1px solid var(--border-soft)",
    background: "var(--surface-raised)",
    transition: "background 220ms cubic-bezier(0.22,1,0.36,1), color 220ms cubic-bezier(0.22,1,0.36,1), border-color 220ms cubic-bezier(0.22,1,0.36,1), transform 200ms cubic-bezier(0.22,1,0.36,1)",
  };

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: "color-mix(in srgb, var(--surface) 88%, transparent)",
        backdropFilter: "blur(12px) saturate(140%)",
        WebkitBackdropFilter: "blur(12px) saturate(140%)",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/assets/brand/logopropus.png"
            alt="Propus"
            className="h-7 w-auto shrink-0"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.08))" }}
          />
          <div className="flex flex-col min-w-0">
            <span
              className="text-[9px] font-semibold uppercase leading-none tracking-[0.16em]"
              style={{ color: "var(--accent)" }}
            >
              Propus Cockpit
            </span>
            <h1
              className="truncate text-base font-semibold leading-tight"
              style={{ color: "var(--text-main)", fontFamily: "Montserrat, inherit", letterSpacing: "-0.01em" }}
            >
              {title}
            </h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleDesktop}
            aria-label="Desktop-Ansicht"
            title="Desktop-Ansicht"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg active:scale-95"
            style={actionBtn}
          >
            <Monitor className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Abmelden"
            title="Abmelden"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg active:scale-95"
            style={actionBtn}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
      {/* Gold-Brand-Linie als zweiter Border-Akzent */}
      <div
        aria-hidden
        style={{
          height: "1px",
          background: "linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)",
          opacity: 0.4,
        }}
      />
    </header>
  );
});
