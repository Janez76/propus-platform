/**
 * Optional env-based overrides for Assistant (no secrets; email allowlists only).
 * ASSISTANT_UNLIMITED_EMAILS — skip daily token cap on POST /api/assistant
 * ASSISTANT_SUPERADMIN_EMAILS — may change global Assistant settings (same as role super_admin)
 */
import type { AdminSession } from "@/lib/auth.server";

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

/** May PATCH /api/assistant/settings (global model/tools/limits). */
export function isAssistantSettingsSuperAdmin(session: AdminSession): boolean {
  const r = String(session.role || "").toLowerCase();
  if (r === "super_admin") return true;
  const email = adminSessionEmail(session);
  if (!email) return false;
  return parseCommaSeparatedEmails(process.env.ASSISTANT_SUPERADMIN_EMAILS).has(email);
}

/** Expose isAdmin in GET /api/assistant/settings for the Assistant UI. */
export function isAssistantSettingsAdminUi(session: AdminSession): boolean {
  return isAssistantSettingsSuperAdmin(session);
}
