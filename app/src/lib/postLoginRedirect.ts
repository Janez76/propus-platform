import type { Role } from "../types";

function isSafeInternalPath(path: string): boolean {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  return true;
}

export function resolvePostLoginTarget(_role: Role, returnTo?: string | null): string {
  if (returnTo && isSafeInternalPath(returnTo)) return returnTo;
  return "/dashboard";
}
