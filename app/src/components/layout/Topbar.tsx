import { ExternalLink, LogOut, Menu, Monitor, Moon, Smartphone, Sun, User } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore } from "../../store/themeStore";
import { t } from "../../i18n";
import { ProfileModal } from "../profile/ProfileModal";
import { QuickImpersonateButton } from "./QuickImpersonateButton";
import { TopbarSearch } from "../search/TopbarSearch";
import { API_BASE } from "../../api/client";
import { isKiAssistantHostname } from "../../lib/kiHost";

interface TopbarProps {
  onMenuToggle?: () => void;
}

function resolveAdminBookingUrl() {
  if (typeof window !== "undefined") {
    return new URL("/book", window.location.origin).toString();
  }
  return "https://admin-booking.propus.ch/book";
}

export function Topbar({ onMenuToggle }: TopbarProps) {
  const [showProfile, setShowProfile] = useState(false);
  const isKiAssistantHost =
    typeof window !== "undefined" && isKiAssistantHostname(window.location.hostname);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const language = useAuthStore((s) => s.language);
  const setLanguage = useAuthStore((s) => s.setLanguage);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const handleLogout = async () => {
    clearAuth();
    const redirect = encodeURIComponent(new URL(process.env.NEXT_PUBLIC_BASE_URL || "/", window.location.origin).toString());
    window.location.href = `${API_BASE}/auth/logout?redirect=${redirect}`;
  };

  const cycleTheme = () => {
    if (theme === "system") {
      setTheme("light");
      return;
    }
    if (theme === "light") {
      setTheme("dark");
      return;
    }
    setTheme("system");
  };

  const themeLabel = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  const openAdminBooking = () => {
    window.open(resolveAdminBookingUrl(), "_blank", "noopener,noreferrer");
  };

  const openMobileView = () => {
    window.location.href = "/mobile";
  };

  return (
    <header className="propus-topbar sticky top-0 z-40 h-16 transition-colors duration-300">
      <div className="h-full flex items-center justify-between px-4 lg:px-6">
        {/* Left Section - Mobile Menu + Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuToggle}
            className="lg:hidden inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden flex items-center gap-2">
            <img src="/assets/brand/logopropus.png" alt="Propus" className="h-7 w-auto" />
          </div>
        </div>

        {/* Center Section - Global Search */}
        <div className="flex-1 flex items-center justify-center px-3 min-w-0">
          <TopbarSearch />
        </div>

        {/* Right Section - Actions */}
        <div className="flex items-center gap-1.5">
          {/* Profile */}
          <button
            onClick={() => setShowProfile(true)}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 hover:text-(--accent) focus:outline-none"
            style={{ background: "var(--surface)", borderColor: "var(--border-soft)", color: "var(--text-main)" }}
          >
            <User className="h-4 w-4" />
            <span>{t(language, "profile.title")}</span>
          </button>

          {/* Language Selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as typeof language)}
            className="px-3 py-2 rounded-lg border text-sm font-medium transition-colors focus:outline-none"
            style={{ background: "var(--surface)", borderColor: "var(--border-soft)", color: "var(--text-main)" }}
            aria-label="Language"
          >
            <option value="de">DE</option>
            <option value="en">EN</option>
            <option value="fr">FR</option>
            <option value="it">IT</option>
          </select>

          <button
            onClick={cycleTheme}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors focus:outline-none"
            style={{ background: "var(--surface)", borderColor: "var(--border-soft)", color: "var(--text-main)" }}
            aria-label={`Theme: ${themeLabel}`}
            title={`Theme: ${themeLabel}`}
          >
            <ThemeIcon className="h-4 w-4" />
            <span className="hidden md:inline">{themeLabel}</span>
          </button>

          <QuickImpersonateButton />

          {!isKiAssistantHost && (
          <button
            onClick={openMobileView}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 hover:text-(--accent) focus:outline-none"
            style={{ background: "var(--surface)", borderColor: "var(--border-soft)", color: "var(--text-main)" }}
            aria-label="Mobile-Ansicht"
            title="Mobile-Ansicht"
          >
            <Smartphone className="h-4 w-4" />
            <span className="hidden md:inline">Mobile</span>
          </button>
          )}

          <button
            onClick={openAdminBooking}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 hover:text-(--accent) focus:outline-none"
            style={{ background: "var(--surface)", borderColor: "var(--border-soft)", color: "var(--text-main)" }}
            aria-label={t(language, "landing.nav.cta")}
          >
            <ExternalLink className="h-4 w-4" />
            <span>{t(language, "landing.nav.cta")}</span>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-transparent text-sm font-medium transition-all duration-200 focus:outline-none"
            style={{ background: "var(--surface-raised)", color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "color-mix(in srgb, #e74c3c 8%, transparent)";
              el.style.color = "#c0392b";
              el.style.borderColor = "color-mix(in srgb, #e74c3c 25%, transparent)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "var(--surface-raised)";
              el.style.color = "var(--text-muted)";
              el.style.borderColor = "transparent";
            }}
          >
            <LogOut className="h-4 w-4" />
            <span>{t(language, "auth.logout")}</span>
          </button>

          {!isKiAssistantHost && (
          <button
            onClick={openMobileView}
            className="sm:hidden p-2.5 rounded-lg transition-all duration-200 hover:text-(--accent)"
            style={{ background: "var(--surface-raised)", color: "var(--text-muted)" }}
            aria-label="Mobile-Ansicht"
            title="Mobile-Ansicht"
          >
            <Smartphone className="h-4 w-4" />
          </button>
          )}

          {/* Mobile: booking link */}
          <button
            onClick={openAdminBooking}
            className="sm:hidden p-2.5 rounded-lg transition-all duration-200 hover:text-(--accent)"
            style={{ background: "var(--surface-raised)", color: "var(--text-muted)" }}
            aria-label={t(language, "landing.nav.cta")}
          >
            <ExternalLink className="h-4 w-4" />
          </button>

          {/* Mobile: Logout */}
          <button
            onClick={handleLogout}
            className="sm:hidden p-2.5 rounded-lg transition-all duration-200"
            style={{ background: "var(--surface-raised)", color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "color-mix(in srgb, #e74c3c 8%, transparent)";
              el.style.color = "#c0392b";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "var(--surface-raised)";
              el.style.color = "var(--text-muted)";
            }}
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </header>
  );
}
