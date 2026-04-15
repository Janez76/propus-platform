import type { Role } from "../types";
import { isKundenRole } from "./permissions";
import { isCompanyWorkspaceRole } from "./companyRoles";

/**
 * Gibt das Redirect-Ziel nach erfolgreichem Login zurück – basierend auf der Rolle.
 *
 * Prüfreihenfolge:
 *  1. returnTo-Query-Parameter (wenn gesetzt und beginnt mit "/")
 *  2. Rollenbasiertes Standard-Ziel
 */
export function resolvePostLoginTarget(role: Role, returnTo?: string | null): string {
  if (returnTo && returnTo.startsWith("/")) return returnTo;
  if (isKundenRole(role)) return "/portal/dashboard";
  if (role === "company_employee") return "/portal/bestellungen";
  if (isCompanyWorkspaceRole(role)) return "/portal/firma";
  return "/dashboard";
}
