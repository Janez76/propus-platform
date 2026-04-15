import { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";
import { API_BASE } from "../../api/client";
import { isKundenRole } from "../../lib/permissions";
import { portalLogout } from "../../api/portalTours";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const language = useAuthStore((s) => s.language);
  const setLanguage = useAuthStore((s) => s.setLanguage);
  const role = useAuthStore((s) => s.role);
  const isKunden = isKundenRole(role);

  async function handleLogout() {
    clearAuth();
    if (isKunden) {
      await portalLogout().catch(() => null);
      window.location.href = "/login";
      return;
    }
    const redirect = encodeURIComponent(new URL(process.env.NEXT_PUBLIC_BASE_URL || "/", window.location.origin).toString());
    window.location.href = `${API_BASE}/auth/logout?redirect=${redirect}`;
  }

  return (
    <header className="backdrop-soft sticky top-0 z-40 transition-colors duration-300" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-soft)" }}>
      <div className="mx-auto flex w-full max-w-[92rem] items-center justify-between px-3 py-3 sm:px-4">
        <div className="flex items-center gap-3">
          <img src="/assets/brand/logopropus.png" alt="Propus" className="h-7 w-auto sm:h-8" />
          <h1 className="text-base font-bold tracking-tight sm:text-lg p-text-main" style={{ fontFamily: "var(--propus-font-heading)" }}>Bestellübersicht</h1>
        </div>

        <button
          type="button"
          className="btn-secondary md:hidden"
          aria-expanded={menuOpen}
          aria-controls="header-mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          Menu
        </button>

        <div className="hidden items-center gap-2 md:flex">
          <label htmlFor="lang" className="sr-only">Sprache</label>
          <select id="lang" name="lang" aria-label="Sprache" className="ui-input w-auto" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
            <option value="de">DE</option>
            <option value="en">EN</option>
            <option value="fr">FR</option>
            <option value="it">IT</option>
          </select>
          <button
            className="btn-secondary"
            onClick={handleLogout}
          >
            {t(language, "auth.logout")}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div id="header-mobile-menu" className="mx-auto w-full max-w-[92rem] space-y-2 px-3 py-3 sm:px-4 md:hidden" style={{ borderTop: "1px solid var(--border-soft)" }}>
          <select id="langMobile" name="langMobile" aria-label="Sprache" className="ui-input" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
            <option value="de">DE</option>
            <option value="en">EN</option>
            <option value="fr">FR</option>
            <option value="it">IT</option>
          </select>
          <button
            className="btn-secondary w-full"
            onClick={handleLogout}
          >
            {t(language, "auth.logout")}
          </button>
        </div>
      ) : null}
    </header>
  );
}

