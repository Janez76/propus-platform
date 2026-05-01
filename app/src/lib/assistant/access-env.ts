/**
 * Optional env-based overrides for Assistant (no secrets; email allowlists only).
 * ASSISTANT_UNLIMITED_EMAILS — skip daily token cap on POST /api/assistant
 * ASSISTANT_SUPERADMIN_EMAILS — may change global Assistant settings (same privileges as super_admin / admin session roles)
 */
import type { AdminSession } from "@/lib/auth.server";

/** Backoffice roles with full Assistant settings/training admin (super_admin is distinct from admin in nav; both allowed here). */
const ASSISTANT_SETTINGS_ADMIN_ROLES = new Set(["super_admin", "admin"]);

function parseCommaSeparatedEmails(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function adminSessionEmail(session: AdminSession): string {
  const key = String(session.userKey || "").trim();
  if (key.includes("@")) return key.toLowerCase();
  const name = String(session.userName || "").trim();
  if (name.includes("@")) return name.toLowerCase();
  return "";
}

/** Skip daily token usage check (browser + mobile bearer). */
export function isAssistantDailyLimitExempt(email: string): boolean {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  return parseCommaSeparatedEmails(process.env.ASSISTANT_UNLIMITED_EMAILS).has(e);
}

/** May PATCH /api/assistant/settings (global model/tools/limits); role super_admin, admin, or ASSISTANT_SUPERADMIN_EMAILS. */
export function isAssistantSettingsAdmin(sessionRole: string | undefined, email?: string): boolean {
  const r = String(sessionRole || "").toLowerCase();
  if (ASSISTANT_SETTINGS_ADMIN_ROLES.has(r)) return true;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  return parseCommaSeparatedEmails(process.env.ASSISTANT_SUPERADMIN_EMAILS).has(e);
}

/** Session helper — same as {@link isAssistantSettingsAdmin}(session.role, adminSessionEmail(session)). */
export function isAssistantSettingsSuperAdmin(session: AdminSession): boolean {
  return isAssistantSettingsAdmin(session.role, adminSessionEmail(session));
}

/** Expose isAdmin in GET /api/assistant/settings for the Assistant UI. */
export function isAssistantSettingsAdminUi(session: AdminSession): boolean {
  return isAssistantSettingsSuperAdmin(session);
}
