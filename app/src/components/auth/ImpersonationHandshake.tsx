"use client";

import { useEffect, useRef } from "react";
import { API_BASE } from "@/api/client";
import { normalizeStoredRole, useAuthStore } from "@/store/authStore";

/**
 * Nach GET /auth/impersonate-consume liefert das Backend `?__imp=1` — synchronisiert
 * localStorage-Token (Bearer) mit dem gesetzten httpOnly-Cookie.
 */
export function ImpersonationHandshake() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("__imp") !== "1") return;
    ran.current = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/impersonation-claim`, {
          method: "GET",
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          token?: string;
          role?: string;
          permissions?: string[];
          error?: string;
        };
        u.searchParams.delete("__imp");
        const rest = u.searchParams.toString();
        const newUrl = `${u.pathname}${rest ? `?${rest}` : ""}${u.hash}`;
        if (!res.ok || !data?.ok || !data.token) {
          window.history.replaceState({}, "", newUrl);
          return;
        }
        setAuth(
          data.token,
          normalizeStoredRole(String(data.role || "customer_user")),
          false,
          Array.isArray(data.permissions) ? data.permissions : undefined,
        );
        window.history.replaceState({}, "", newUrl);
        window.location.reload();
      } catch {
        u.searchParams.delete("__imp");
        const rest = u.searchParams.toString();
        window.history.replaceState({}, "", `${u.pathname}${rest ? `?${rest}` : ""}${u.hash}`);
      }
    })();
  }, [setAuth]);

  return null;
}
