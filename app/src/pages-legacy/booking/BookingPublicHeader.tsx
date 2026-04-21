import { useEffect, useRef, useState } from "react";
import { LogIn, ChevronDown, LayoutDashboard, Receipt, LogOut, User } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useCustomerProfile } from "../../hooks/useCustomerProfile";
import { bookingBrandLogoUrl } from "../../lib/bookingAssets";
import { BookingThemeToggle } from "./BookingThemeToggle";
import { BookingLangSelect } from "./BookingLangSelect";
import { t, type Lang } from "../../i18n";
import { API_BASE } from "../../api/client";
import { cn } from "../../lib/utils";

type BookingPublicHeaderProps = {
  lang: Lang;
  onLangChange?: (l: Lang) => void;
  /** "landing" = sticky, grosser rounded CTA; "app" = kompakt mit Title/Progress */
  variant?: "landing" | "app";
  title?: string;
  cta?: { label: string; onClick: () => void; testId?: string } | null;
  /** Step-Indikatoren oder sonstiger Slot für den Wizard */
  progress?: React.ReactNode;
};

function getInitials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return nameOrEmail.slice(0, 2).toUpperCase();
}

const ADMIN_BOOKING_BASE = "https://admin-booking.propus.ch";

export function BookingPublicHeader({
  lang,
  onLangChange,
  variant = "landing",
  title,
  cta,
  progress,
}: BookingPublicHeaderProps) {
  const token = useAuthStore((s) => s.token);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const isLoggedIn = Boolean(token);
  const { profile } = useCustomerProfile();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Outside-click schliesst Dropdown.
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const handleLogout = () => {
    clearAuth();
    const redirect = encodeURIComponent(new URL("/", window.location.origin).toString());
    window.location.href = `${API_BASE}/auth/logout?redirect=${redirect}`;
  };

  const returnTo = typeof window !== "undefined"
    ? encodeURIComponent(window.location.pathname + window.location.search)
    : encodeURIComponent("/book");

  const isLanding = variant === "landing";

  return (
    <header
      className={cn(
        "z-50 border-b border-[var(--border-soft)]/80 bg-[var(--surface)]/90 backdrop-blur-xl",
        isLanding ? "sticky top-0 shadow-sm" : "border-b",
      )}
    >
      <div className={cn(
        "flex items-center justify-between gap-3 px-4 py-3 sm:px-6",
        !isLanding && "mx-auto max-w-5xl",
      )}>
        {/* Logo + Title */}
        <div className="flex shrink-0 items-center gap-3">
          <img
            src={bookingBrandLogoUrl()}
            alt="Propus"
            className={cn("w-auto object-contain", isLanding ? "h-9" : "h-7")}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {title ? (
            <h1 className="font-display text-lg font-semibold text-[var(--text-main)] sm:text-xl">{title}</h1>
          ) : null}
        </div>

        {/* Progress (nur app-Variante, Desktop versteckt, Mobile unter dem Header) */}
        {progress ? (
          <div className="hidden items-center sm:flex">{progress}</div>
        ) : null}

        {/* Rechts: Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <BookingThemeToggle lang={lang} />
          {onLangChange ? <BookingLangSelect lang={lang} onChange={onLangChange} /> : null}

          {/* Auth-Bereich */}
          {!isLoggedIn ? (
            <a
              href={`/login?returnTo=${returnTo}`}
              aria-label={t(lang, "booking.header.loginAria")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <LogIn className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{t(lang, "booking.step4.loginButton")}</span>
            </a>
          ) : (
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[10px] font-bold text-[var(--accent)]">
                  {profile?.name || profile?.email ? getInitials(profile.name || profile.email) : <User className="h-3 w-3" />}
                </span>
                <span className="hidden max-w-[120px] truncate sm:inline">
                  {profile?.name ?? profile?.email ?? "…"}
                </span>
                <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", dropdownOpen && "rotate-180")} />
              </button>

              {dropdownOpen ? (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-xl">
                  {/* Profil-Kopf */}
                  <div className="px-3 py-2.5 border-b border-[var(--border-soft)]">
                    {profile?.name ? (
                      <p className="truncate text-sm font-semibold text-[var(--text-main)]">{profile.name}</p>
                    ) : null}
                    <p className="truncate text-xs text-[var(--text-subtle)]">{profile?.email ?? "…"}</p>
                    {profile?.company ? (
                      <p className="truncate text-xs text-[var(--text-subtle)]">{profile.company}</p>
                    ) : null}
                  </div>

                  {/* Menüpunkte */}
                  <nav className="p-1">
                    <a
                      href={`${ADMIN_BOOKING_BASE}/dashboard`}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-[var(--text-main)] transition-colors hover:bg-[var(--surface-raised)]"
                    >
                      <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                      {t(lang, "booking.header.account")}
                    </a>
                    <a
                      href={`${ADMIN_BOOKING_BASE}/admin/tours/invoices`}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-[var(--text-main)] transition-colors hover:bg-[var(--surface-raised)]"
                    >
                      <Receipt className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                      {t(lang, "booking.header.orders")}
                    </a>

                    <hr className="my-1 border-[var(--border-soft)]" />

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-[var(--text-main)] transition-colors hover:bg-[var(--surface-raised)]"
                    >
                      <LogOut className="h-3.5 w-3.5 shrink-0 text-red-400" />
                      <span className="text-red-500">{t(lang, "booking.header.logout")}</span>
                    </button>
                  </nav>
                </div>
              ) : null}
            </div>
          )}

          {/* CTA-Button (Landing: Jetzt buchen) */}
          {cta ? (
            <button
              type="button"
              data-testid={cta.testId}
              onClick={cta.onClick}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/30 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[var(--accent)]/40",
                isLanding
                  ? "bg-gradient-to-br from-[var(--accent)] to-[#b08f4a] sm:px-5"
                  : "bg-[var(--accent)] hover:bg-[#b08f4a]",
              )}
            >
              {cta.label}
            </button>
          ) : null}
        </div>
      </div>

      {/* Progress auf Mobile unter dem Header */}
      {progress ? (
        <div className="flex items-center justify-center gap-1.5 border-t border-[var(--border-soft)]/50 px-4 py-2 sm:hidden">
          {progress}
        </div>
      ) : null}
    </header>
  );
}
