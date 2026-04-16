import { useCallback, useEffect, useRef } from "react";
import { getAdminProfile } from "../api/profile";
import { canPermission, legacyCanAccessPath, legacyCanPermission, permissionForPath } from "../lib/permissions";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../types";

export function usePermissions() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const permissions = useAuthStore((s) => s.permissions);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    if (permissions.length > 0) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    void (async () => {
      try {
        const data = await getAdminProfile(token);
        if (Array.isArray(data.permissions)) {
          setPermissions(data.permissions);
        }
      } catch {
        /* ignore */
      } finally {
        loadingRef.current = false;
      }
    })();
  }, [token, permissions.length, setPermissions]);

  const can = useCallback(
    (permissionKey: string) => {
      if (permissions.length > 0) return permissions.includes(permissionKey);
      return legacyCanPermission(role as Role, permissionKey);
    },
    [permissions, role],
  );

  const canAccessPath = useCallback(
    (path: string) => {
      const r = role as Role;
      const req = permissionForPath(path);
      if (permissions.length > 0) return canPermission(permissions, req);
      return legacyCanAccessPath(r, path);
    },
    [permissions, role],
  );

  return { can, canAccessPath, permissions };
}
