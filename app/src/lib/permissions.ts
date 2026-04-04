import type { Role } from "../types";

/** Mindest-Permission pro Route (system scope). */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  "/company": "customers.read",
  "/portal/firma": "customers.read",
  "/portal/bestellungen": "orders.read",
  // Kunden-Portal-Routen
  "/portal/dashboard": "tours.read",
  "/portal/tours": "tours.read",
  "/portal/invoices": "tours.read",
  "/portal/team": "portal_team.manage",
  "/admin/users": "users.manage",
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
  "/settings/team": "team.manage",
  "/settings/email-templates": "emails.manage",
  "/settings/calendar-templates": "settings.manage",
  "/settings/exxas": "settings.manage",
  "/exxas-reconcile": "settings.manage",
  "/settings/access": "roles.manage",
  "/settings/users": "users.manage",
  "/settings/companies": "users.manage",
  "/bugs": "bugs.read",
  "/backups": "backups.manage",
  "/changelog": "dashboard.view",
  "/admin/tours": "dashboard.view",
  /** Zentrales Rechnungsmodul (gleiche Zielgruppe wie Tour-Manager) */
  "/admin/invoices": "dashboard.view",
};

/** Rollen die als interne Admins behandelt werden (nicht Kunden-Panel). */
export const INTERN_ADMIN_ROLES: Role[] = ["admin", "super_admin", "tour_manager", "photographer"];

/** Rollen die als Kunden-Panel-Nutzer gelten. */
export const KUNDEN_ROLES: Role[] = [
  "customer",
  "customer_admin",
  "customer_user",
  "company_owner",
  "company_admin",
  "company_employee",
];

export function isKundenRole(role: Role): boolean {
  return (KUNDEN_ROLES as string[]).includes(role);
}

const ADMIN_ONLY_ROLES: Role[] = ["admin", "super_admin", "tour_manager"];
const PHOTOGRAPHER_PATHS = new Set(["/orders", "/upload", "/calendar"]);

const ALL_ROUTE_PERMS = [...new Set(Object.values(ROUTE_PERMISSIONS))];

/** Fallback-Rechte pro Rolle wenn Backend noch keine permissions[] liefert. */
export const LEGACY_ROLE_PERMISSIONS: Partial<Record<Role, string[]>> = {
  admin: ALL_ROUTE_PERMS,
  super_admin: ALL_ROUTE_PERMS,
  tour_manager: ["tours.read", "tours.manage", "tours.assign", "tours.cross_company", "tours.archive", "tours.link_matterport", "portal_team.manage", "dashboard.view"],
  photographer: ["dashboard.view", "orders.read", "orders.update", "orders.assign", "calendar.view", "photographers.read"],
  company_owner: ["customers.read", "orders.read", "orders.update", "orders.create", "company.manage", "team.manage", "calendar.view", "tours.read"],
  company_admin: ["customers.read", "orders.read", "orders.update", "orders.create", "company.manage", "team.manage", "calendar.view", "tours.read"],
  company_employee: ["customers.read", "orders.read", "calendar.view", "tours.read"],
  customer: ["tours.read"],
  customer_admin: ["tours.read", "tours.manage", "portal_team.manage"],
  customer_user: ["tours.read"],
};

export function legacyCanAccessPath(role: Role, path: string): boolean {
  const isCompanyRole = role === "company_owner" || role === "company_admin" || role === "company_employee";
  const isPortalKunde = role === "customer" || role === "customer_admin" || role === "customer_user";
  if (isPortalKunde) {
    return path === "/account" || path.startsWith("/account/") ||
      path === "/portal/dashboard" || path.startsWith("/portal/dashboard") ||
      path === "/portal/tours" || path.startsWith("/portal/tours") ||
      path === "/portal/invoices" || path.startsWith("/portal/invoices") ||
      (role === "customer_admin" && (path === "/portal/team" || path.startsWith("/portal/team")));
  }
  if (isCompanyRole) {
    if (role === "company_employee") return path === "/portal/bestellungen" || path.startsWith("/portal/bestellungen/") ||
      path === "/portal/dashboard" || path === "/portal/tours" || path === "/portal/invoices";
    return (
      path === "/portal/firma" ||
      path.startsWith("/portal/firma/") ||
      path === "/company" ||
      path.startsWith("/company/") ||
      path === "/portal/dashboard" ||
      path === "/portal/tours" ||
      path === "/portal/invoices" ||
      path === "/portal/team"
    );
  }
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
  if (path === "/portal/firma" || path.startsWith("/portal/firma/")) {
    return ROUTE_PERMISSIONS["/portal/firma"];
  }
  if (path === "/portal/bestellungen" || path.startsWith("/portal/bestellungen/")) {
    return ROUTE_PERMISSIONS["/portal/bestellungen"];
  }
  return ROUTE_PERMISSIONS[path] ?? null;
}

export function canPermission(permissions: Set<string> | string[], required: string | null): boolean {
  if (required == null) return true;
  const set = Array.isArray(permissions) ? new Set(permissions) : permissions;
  return set.has(required);
}
