import { useLayoutEffect, useRef } from "react";

/**
 * Legacy-Buchungslinks nutzten `?magic=` auf der SPA-URL ohne Session-Cookie.
 * Leitet auf `GET /auth/customer/magic` (serverseitig Cookie + Redirect) weiter.
 * `?impersonate=` (Admin) wird ebenfalls unterstützt.
 */
export function CustomerMagicSessionRedirect() {
  const ran = useRef(false);

  useLayoutEffect(() => {
    if (ran.current) return;
    try {
      const url = new URL(window.location.href);
      const magic = url.searchParams.get("magic");
      const impersonate = url.searchParams.get("impersonate");
      const token = magic || impersonate;
      if (!token) return;

      ran.current = true;
      url.searchParams.delete("magic");
      url.searchParams.delete("impersonate");
      const restQs = url.searchParams.toString();
      let returnPath = `${url.pathname}${restQs ? `?${restQs}` : ""}${url.hash}`;
      if (returnPath === "/" || returnPath === "") {
        returnPath = "/account";
      }
      const returnTo = encodeURIComponent(returnPath);
      const paramName = impersonate && !magic ? "impersonate" : "magic";
      const target = `${window.location.origin}/auth/customer/magic?${paramName}=${encodeURIComponent(token)}&returnTo=${returnTo}`;
      window.location.replace(target);
    } catch {
      /* ignore */
    }
  }, []);

  return null;
}

