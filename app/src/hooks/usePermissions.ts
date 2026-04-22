import { useCallback, useEffect, useRef } from "react";
import { getAdminProfile } from "../api/profile";
import { effectiveCan, effectiveCanAccessPath } from "../lib/permissions";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../types";

export function usePermissions() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const permissions = useAuthStore((s) => s.permissions);
  const setRole = useAuthStore((s) => s.setRole);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const loadingRef = useRef(false);
  const profileFetchedForToken = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      profileFetchedForToken.current = null;
      return;
    }
    if (profileFetchedForToken.current === token) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    void (async () => {
      try {
        const data = await getAdminProfile(token);
        if (data.role) {
          setRole(data.role);
        }
        if (Array.isArray(data.permissions)) {
          setPermissions(data.permissions);
        }
        profileFetchedForToken.current = token;
      } catch {
        /* ignore */
      } finally {
        loadingRef.current = false;
      }
    })();
  }, [token, setPermissions, setRole]);

  const can = useCallback(
    (permissionKey: string) => {
      return effectiveCan(permissions, role as Role, permissionKey);
    },
    [permissions, role],
  );

  const canAccessPath = useCallback(
    (path: string) => {
      return effectiveCanAccessPath(role as Role, permissions, path);
    },
    [permissions, role],
  );

  return { can, canAccessPath, permissions };
}
