import type { Role } from "../types";

/**
 * Mindest-Permission pro Route (exakte Pfade) — system scope.
 * Ergaenzt durch PREFIX_PATH_PERMISSIONS fuer Unterpfade.
 */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  "/settings/roles": "roles.manage",
  "/dashboard": "dashboard.view",
  "/orders": "orders.read",
  "/upload": "orders.update",
  "/calendar": "calendar.view",
  "/customers": "customers.read",
  "/employees": "photographers.read",
  "/products": "products.manage",
  "/discount-codes": "discount_codes.manage",
  "/reviews": "reviews.read",
  "/settings": "settings.manage",
  "/settings/workflow": "settings.manage",
  "/settings/team": "users.manage",
  "/settings/email-templates": "emails.manage",
  "/settings/calendar-templates": "settings.manage",
  "/settings/payment": "settings.manage",
  "/settings/invoice-template": "settings.manage",
  "/settings/exxas": "settings.manage",
  "/exxas-reconcile": "settings.manage",
  "/bugs": "bugs.read",
  "/backups": "backups.manage",
  "/changelog": "dashboard.view",
  "/admin/tours": "tours.read",
  "/admin/tours/list": "tours.read",
  "/admin/tours/invoices": "tours.read",
  "/admin/tours/bank-import": "tours.read",
  "/admin/tours/link-matterport": "tours.manage",
  "/admin/tours/settings": "tours.read",
  "/admin/tours/workflow-settings": "tours.read",
  "/admin/tours/bereinigung": "tours.read",
  "/admin/tours/team": "tours.read",
  "/admin/tours/ai-chat": "tours.read",
  "/admin/tours/portal-vorschau": "tours.read",
  "/admin/listing": "listing.manage",
  "/admin/selekto": "picdrop.manage",
  "/picdrop": "picdrop.manage",
  "/selekto/bilder-auswahl": "picdrop.manage",
  "/admin/finance": "finance.read",
  "/admin/finance/invoices": "finance.read",
  "/admin/finance/invoices/open": "finance.read",
  "/admin/finance/invoices/paid": "finance.read",
  "/admin/finance/bank-import": "finance.manage",
  "/admin/finance/reminders": "finance.manage",
  "/admin/finance/exxas-sync": "finance.manage",
  "/admin/invoices": "finance.read",
  "/admin/tickets": "tickets.read",
  "/mobile": "dashboard.view",
};

const PREFIX_PATH_PERMISSIONS: { prefix: string; permission: string }[] = [
  { prefix: "/admin/finance/bank-import", permission: "finance.manage" },
  { prefix: "/admin/finance/reminders", permission: "finance.manage" },
  { prefix: "/admin/finance/exxas-sync", permission: "finance.manage" },
  { prefix: "/admin/finance", permission: "finance.read" },
  { prefix: "/admin/tours", permission: "tours.read" },
  { prefix: "/admin/tickets", permission: "tickets.read" },
  { prefix: "/admin/listing", permission: "listing.manage" },
  { prefix: "/admin/selekto", permission: "picdrop.manage" },
  { prefix: "/embed/tours", permission: "tours.manage" },
  { prefix: "/settings", permission: "settings.manage" },
].sort((a, b) => b.prefix.length - a.prefix.length);

const PHOTOGRAPHER_PATHS = new Set(["/orders", "/upload", "/calendar", "/mobile"]);
const INTERNAL_STAFF_ROLES: Role[] = ["admin", "super_admin", "employee"];

const ALL_ROUTE_PERMS = [...new Set(Object.values(ROUTE_PERMISSIONS))];

export const LEGACY_ROLE_PERMISSIONS: Partial<Record<Role, string[]>> = {
  admin: ALL_ROUTE_PERMS,
  super_admin: ALL_ROUTE_PERMS,
  employee: ALL_ROUTE_PERMS,
  tour_manager: [
    "tours.read",
    "tours.manage",
    "tours.assign",
    "tours.cross_company",
    "tours.archive",
    "tours.link_matterport",
    "dashboard.view",
    "orders.read",
    "orders.update",
    "calendar.view",
    "customers.read",
    "reviews.read",
  ],
  photographer: [
    "dashboard.view",
    "orders.read",
    "orders.update",
    "orders.assign",
    "calendar.view",
    "photographers.read",
    "picdrop.manage",
  ],
  customer_admin: ["dashboard.view"],
  customer_user: ["dashboard.view"],
};

export function legacyCanAccessPath(role: Role, path: string): boolean {
  if (INTERNAL_STAFF_ROLES.includes(role)) return true;
  if (role === "tour_manager") {
    if (path.startsWith("/admin/finance")) return false;
    if (path.startsWith("/settings") || path === "/exxas-reconcile") return false;
    if (["/backups", "/bugs", "/discount-codes", "/products", "/changelog", "/admin/listing", "/admin/selekto", "/admin/tickets"].some((b) => path === b || path.startsWith(`${b}/`)))
      return false;
    if (path.startsWith("/admin/listing") || path.startsWith("/admin/selekto") || path.startsWith("/admin/tickets")) {
      return false;
    }
    return true;
  }
  if (role === "photographer") return PHOTOGRAPHER_PATHS.has(path);
  return false;
}

export function legacyCanPermission(role: Role, permissionKey: string): boolean {
  const set = LEGACY_ROLE_PERMISSIONS[role];
  if (set && set.includes(permissionKey)) return true;
  if (role === "admin" || role === "super_admin" || role === "employee") return true;
  return false;
}

export function permissionForPath(path: string): string | null {
  const p = (path || "").split("?")[0] || path;
  if (ROUTE_PERMISSIONS[p]) return ROUTE_PERMISSIONS[p];
  if (p === "/settings" || p.startsWith("/settings/")) {
    return ROUTE_PERMISSIONS[p] ?? ROUTE_PERMISSIONS["/settings"] ?? "settings.manage";
  }
  for (const { prefix, permission } of PREFIX_PATH_PERMISSIONS) {
    if (p === prefix || p.startsWith(`${prefix}/`)) {
      if (p.startsWith("/admin/tours/") && (p.includes("link-invoice") || p.includes("link-exxas") || p.includes("link-matterport"))) {
        return "tours.manage";
      }
      return permission;
    }
  }
  let bestKey = "";
  let bestLen = -1;
  for (const k of Object.keys(ROUTE_PERMISSIONS)) {
    if (k.length > bestLen && (p === k || p.startsWith(`${k}/`))) {
      bestKey = k;
      bestLen = k.length;
    }
  }
  if (bestKey) return ROUTE_PERMISSIONS[bestKey];
  return null;
}

export function canPermission(permissions: Set<string> | string[], required: string | null): boolean {
  if (required == null) return true;
  const set = Array.isArray(permissions) ? new Set(permissions) : permissions;
  return set.has(required);
}

export function effectiveCanAccessPath(
  role: Role,
  permissions: string[] | null | undefined,
  path: string,
): boolean {
  const norm = (path || "").split("?")[0] || path;
  const req = permissionForPath(norm);
  const perms = Array.isArray(permissions) ? permissions : [];

  if (perms.length > 0) {
    if (canPermission(perms, req)) return true;
    if (INTERNAL_STAFF_ROLES.includes(role)) {
      return legacyCanAccessPath(role, norm);
    }
    if (req == null) return legacyCanAccessPath(role, norm);
    return legacyCanPermission(role, req);
  }

  if (!legacyCanAccessPath(role, norm)) return false;
  if (req == null) return true;
  return legacyCanPermission(role, req);
}

export function effectiveCan(permissions: string[] | null | undefined, role: Role, permissionKey: string): boolean {
  const perms = Array.isArray(permissions) ? permissions : [];
  if (perms.length > 0) {
    if (perms.includes(permissionKey)) return true;
  }
  return legacyCanPermission(role, permissionKey);
}
