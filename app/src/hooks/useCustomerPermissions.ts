"use client";

import { useCallback, useEffect, useState } from "react";
import { isPortalHost } from "../lib/portalHost";

type MeState = {
  loading: boolean;
  role: string;
  portalRole: string;
  permissions: string[];
  err: string;
};

const initial: MeState = { loading: true, role: "customer_user", portalRole: "customer_user", permissions: [], err: "" };

/**
 * Strikte Portal-Rechte (nur API permissions[], kein Admin-Legacy).
 */
export function useCustomerPermissions() {
  const [s, setS] = useState<MeState>(initial);

  useEffect(() => {
    if (!isPortalHost()) {
      setS((p) => ({ ...p, loading: false, err: "" }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/customer/me", { credentials: "include" });
        if (cancelled) return;
        if (r.status === 401) {
          setS({ ...initial, loading: false, err: "unauthorized" });
          return;
        }
        if (!r.ok) {
          setS({ ...initial, loading: false, err: "load_failed" });
          return;
        }
        const j = (await r.json()) as { permissions?: string[]; role?: string; portalRole?: string };
        setS({
          loading: false,
          role: String(j.role || "customer_user"),
          portalRole: String(j.portalRole || j.role || "customer_user"),
          permissions: Array.isArray(j.permissions) ? j.permissions : [],
          err: "",
        });
      } catch (e) {
        if (!cancelled) {
          setS((p) => ({ ...p, loading: false, err: e instanceof Error ? e.message : "error" }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canPortal = useCallback(
    (key: string) => s.permissions.length > 0 && s.permissions.includes(key),
    [s.permissions],
  );

  return { ...s, canPortal };
}
