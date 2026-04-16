import type { Role } from "../types";

/** Mindest-Permission pro Route (system scope). */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  "/admin/roles": "roles.manage",
  "/dashboard": "dashboard.view",
  "/orders": "orders.read",
  "/upload": "orders.update",
  "/calendar": "calendar.view",
  "/customers": "customers.read",
  "/employees": "photographers.read",
  "/products": "products.manage",
  "/discount-codes": "discount_codes.manage",
  "/reviews": "reviews.manage",
  "/settings": "settings.manage",
  "/settings/workflow": "settings.manage",
  "/settings/email-templates": "emails.manage",
  "/settings/calendar-templates": "settings.manage",
  "/settings/exxas": "settings.manage",
  "/exxas-reconcile": "settings.manage",
  "/bugs": "bugs.read",
  "/backups": "backups.manage",
  "/changelog": "dashboard.view",
  "/admin/tours": "dashboard.view",
};

const ADMIN_ONLY_ROLES: Role[] = ["admin", "super_admin"];
const PHOTOGRAPHER_PATHS = new Set(["/orders", "/upload", "/calendar"]);

const ALL_ROUTE_PERMS = [...new Set(Object.values(ROUTE_PERMISSIONS))];

/** Fallback-Rechte pro Rolle wenn Backend noch keine permissions[] liefert. */
export const LEGACY_ROLE_PERMISSIONS: Partial<Record<Role, string[]>> = {
  admin: ALL_ROUTE_PERMS,
  super_admin: ALL_ROUTE_PERMS,
  photographer: ["dashboard.view", "orders.read", "orders.update", "orders.assign", "calendar.view", "photographers.read"],
};

export function legacyCanAccessPath(role: Role, path: string): boolean {
  if (ADMIN_ONLY_ROLES.includes(role)) return true;
  if (role === "photographer") return PHOTOGRAPHER_PATHS.has(path);
  return false;
}

export function legacyCanPermission(role: Role, permissionKey: string): boolean {
  const set = LEGACY_ROLE_PERMISSIONS[role];
  if (set && set.includes(permissionKey)) return true;
  if (role === "admin" || role === "super_admin") return true;
  return false;
}

export function permissionForPath(path: string): string | null {
  if (path === "/settings" || path.startsWith("/settings/")) {
    const exact = ROUTE_PERMISSIONS[path];
    if (exact) return exact;
    return ROUTE_PERMISSIONS["/settings"];
  }
  return ROUTE_PERMISSIONS[path] ?? null;
}

export function canPermission(permissions: Set<string> | string[], required: string | null): boolean {
  if (required == null) return true;
  const set = Array.isArray(permissions) ? new Set(permissions) : permissions;
  return set.has(required);
}
