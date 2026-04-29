"use client";

import { useLayoutEffect, useRef } from "react";
import { isPortalHost } from "@/lib/portalHost";
import { useAuthStore } from "@/store/authStore";

/**
 * Auf dem Kunden-Portal-Hostname:
 *  - Admin-Token in `localStorage` immer entfernen (ein versehentlich vorhandenes
 *    Admin-Token darf auf der Portal-Domain niemals zum Rendern des Admin-Panels führen –
 *    sonst werden u. a. Admin-only Komponenten wie die Karten-Sektion geladen, deren
 *    Google-Maps-Key auf der Portal-Domain nicht freigegeben ist).
 *  - Wenn eine gültige customer_session existiert und der Benutzer auf `/` oder `/login`
 *    landet, sofort auf `/account` weiterleiten.
 */
export function CustomerSessionBootstrap() {
  const ran = useRef(false);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useLayoutEffect(() => {
    if (ran.current) return;
    if (!isPortalHost()) return;
    ran.current = true;

    clearAuth();

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/customer/me", { credentials: "include" });
        if (cancelled || r.status !== 200) return;
        const p = window.location.pathname || "/";
        if (p === "/" || p === "/login") {
          const qs = window.location.search || "";
          const h = window.location.hash || "";
          window.location.replace(`/account${qs}${h}`);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearAuth]);

  return null;
}
