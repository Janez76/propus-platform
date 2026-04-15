import type { Role } from "../types";

export function isCompanyWorkspaceRole(role: Role): boolean {
  return role === "company_owner" || role === "company_employee";
}

export function isCompanyAdminLike(role: Role): boolean {
  return role === "company_owner";
}

export function getCompanyHomePath(role: Role): "/portal/firma" | "/portal/bestellungen" {
  return role === "company_employee" ? "/portal/bestellungen" : "/portal/firma";
}
