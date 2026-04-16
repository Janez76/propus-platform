import { Link } from "react-router-dom";
import { LOGO_DARK, LOGO_LIGHT } from "../brandAssets.ts";
import { PATH_LISTING_ADMIN } from "../paths.ts";
import { ThemeToggleSquare } from "./ThemeToggleSquare.tsx";

type HeaderProps = {
  isDark: boolean;
  onToggleTheme: () => void;
  /** Standard: true — auf Magic-Link-Galerien false */
  showBackpanel?: boolean;
};

export function Header({ isDark, onToggleTheme, showBackpanel = true }: HeaderProps) {
  return (
    <header className="site-header" role="banner">
      <div className="site-header__inner">
        <a className="site-header__brand" href="https://www.propus.ch/" aria-label="Propus Startseite">
          <img
            className="site-header__logo"
            src={isDark ? LOGO_DARK : LOGO_LIGHT}
            alt="Propus"
            width={200}
            height={48}
            loading="eager"
            decoding="async"
            key={isDark ? "dark" : "light"}
          />
        </a>
        <div className="site-header__actions">
          {showBackpanel ? (
            <Link to={PATH_LISTING_ADMIN} className="btn btn--outline btn--sm site-header__demo">
              Backpanel
            </Link>
          ) : null}
          <ThemeToggleSquare isDark={isDark} onToggle={onToggleTheme} className="theme-toggle-square--header" />
        </div>
      </div>
    </header>
  );
}
