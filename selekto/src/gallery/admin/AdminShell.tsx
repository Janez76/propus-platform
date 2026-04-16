import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LOGO_LIGHT } from "../../brandAssets.ts";
import { PATH_LISTING_ADMIN, pathListingAdmin } from "../../paths.ts";
import { useAdminBackpanelForceLight } from "./useAdminBackpanelForceLight.ts";
import "./propus-admin.css";
import "./gallery-admin-supplement.css";

/** Ohne das: `to=/bilder-auswahl` matcht auch `/bilder-auswahl/templates` → «Auswahlen» blieb fälschlich aktiv. */
function isAuswahlenNavActive(pathname: string): boolean {
  return pathname === PATH_LISTING_ADMIN || pathname.startsWith(`${PATH_LISTING_ADMIN}/galleries`);
}

const navClsTemplates = ({ isActive }: { isActive: boolean }) =>
  "admin-app-nav__link" + (isActive ? " is-active" : "");

export function AdminShell() {
  const { pathname } = useLocation();
  useAdminBackpanelForceLight();

  useEffect(() => {
    document.body.classList.add("admin-body");
    return () => document.body.classList.remove("admin-body");
  }, []);

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-side__brand">
          <a
            href="https://www.propus.ch/"
            className="admin-brandmark"
            target="_blank"
            rel="noreferrer"
            aria-label="Propus"
          >
            <img
              className="admin-brandmark__logo"
              src={LOGO_LIGHT}
              alt="Propus"
              width={200}
              height={48}
              loading="eager"
              decoding="async"
            />
          </a>
          <p className="admin-side-title">Bildauswahl Backpanel</p>
        </div>
        <nav className="admin-app-nav" aria-label="Hauptnavigation">
          <ul className="admin-app-nav__list">
            <li>
              <Link
                to={pathListingAdmin("galleries")}
                className={"admin-app-nav__link" + (isAuswahlenNavActive(pathname) ? " is-active" : "")}
                aria-current={isAuswahlenNavActive(pathname) ? "page" : undefined}
              >
                Auswahlen
              </Link>
            </li>
            <li>
              <NavLink to={pathListingAdmin("templates")} className={navClsTemplates}>
                E-Mail-Vorlagen
              </NavLink>
            </li>
          </ul>
        </nav>
      </aside>
      <main className="admin-main">
        <div className="admin-main__inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
