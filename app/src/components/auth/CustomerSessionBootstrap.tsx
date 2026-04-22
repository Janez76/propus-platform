"use client";

import { useLayoutEffect, useRef } from "react";
import { isPortalHost } from "@/lib/portalHost";
import { useAuthStore } from "@/store/authStore";

/**
 * Auf dem Kunden-Portal-Hostname: gültige customer_session (httpOnly) erkennen,
 * Admin-Token in localStorage entfernen (sonst erscheint das Admin-Panel trotz Kunden-Cookie)
 * und nach /account leiten, wenn / oder /login.
 */
export function CustomerSessionBootstrap() {
  const ran = useRef(false);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useLayoutEffect(() => {
    if (ran.current) return;
    if (!isPortalHost()) return;
    ran.current = true;

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/customer/me", { credentials: "include" });
        if (cancelled || r.status !== 200) return;
        clearAuth();
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
