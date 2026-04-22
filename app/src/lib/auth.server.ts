/**
 * Server-only: Admin-Session via booking.admin_sessions (Token-Hash).
 */
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { queryOne } from "@/lib/db";

export type AdminSession = {
  role: string;
  userKey: string | null;
  userName: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Liest gültige Admin-Session aus Cookie `admin_session` (SHA256-Hash in DB). */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get("admin_session")?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const row = await queryOne<{
    role: string;
    user_key: string | null;
    user_name: string | null;
  }>(
    `SELECT role, user_key, user_name
     FROM booking.admin_sessions
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash],
  );
  if (!row) return null;
  return {
    role: String(row.role || "admin"),
    userKey: row.user_key,
    userName: row.user_name,
  };
}

/** Volle Rechte auf Bestellungen bearbeiten (Admin-UI). */
export function isOrderEditorRole(role: string): boolean {
  const r = String(role || "").toLowerCase();
  return r === "admin" || r === "super_admin";
}

/**
 * Jede authentifizierte Backoffice-Session darf /orders sehen; Schreib-Actions prüfen `requireOrderEditor`.
 */
export async function requireAdminLayoutSession(): Promise<AdminSession> {
  const { redirect } = await import("next/navigation");
  const s = await getAdminSession();
  if (!s) {
    redirect("/login?returnTo=" + encodeURIComponent("/orders"));
  }
  // redirect() typisiert in TS nicht als `never` → s bleibt nullable
  return s!;
}

/** Nur für Server Actions, die Bestellungen mutieren. */
export async function requireOrderEditor(): Promise<AdminSession> {
  const { redirect } = await import("next/navigation");
  const s = await getAdminSession();
  if (!s) {
    redirect("/login?returnTo=" + encodeURIComponent("/orders"));
  }
  if (!isOrderEditorRole(s!.role)) {
    redirect("/login?forbidden=1");
  }
  return s!;
}

export function sessionActorId(s: AdminSession): string {
  return s.userKey || s.userName || "admin";
}
