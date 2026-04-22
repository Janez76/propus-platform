/**
 * Server-only: Admin-Session via booking.admin_sessions (Token-Hash).
 */
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { queryOne } from "@/lib/db";
import { isPortalOnlyRole } from "@/lib/postLoginRedirect";

export type AdminSession = {
  role: string;
  userKey: string | null;
  userName: string | null;
  /** true wenn ein Intern-Admin im Kunden-Impersonation-Modus aktiv ist. */
  isImpersonating: boolean;
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
    impersonator_user_key: string | null;
  }>(
    `SELECT role, user_key, user_name, impersonator_user_key
     FROM booking.admin_sessions
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash],
  );
  if (!row) return null;
  return {
    role: String(row.role || "admin"),
    userKey: row.user_key,
    userName: row.user_name,
    isImpersonating: row.impersonator_user_key != null && String(row.impersonator_user_key).trim() !== "",
  };
}

/** Volle Rechte auf Bestellungen bearbeiten (Admin-UI). */
export function isOrderEditorRole(role: string): boolean {
  const r = String(role || "").toLowerCase();
  return r === "admin" || r === "super_admin";
}

/**
 * Jede authentifizierte Backoffice-Session darf /orders sehen;
 * Kunden-Rollen dürfen aber nur die eigene Bestellung sehen (→ requireOrderViewAccess).
 * Schreib-Actions prüfen `requireOrderEditor`.
 */
export async function requireAdminLayoutSession(): Promise<AdminSession> {
  const { redirect } = await import("next/navigation");
  const s = await getAdminSession();
  if (!s) {
    redirect("/login?returnTo=" + encodeURIComponent("/orders"));
  }
  // Kunden-Rollen ohne Impersonation gehören nicht auf das Admin-Panel.
  if (isPortalOnlyRole(s!.role) && !s!.isImpersonating) {
    const { getPortalUrl } = await import("@/lib/postLoginRedirect");
    redirect(getPortalUrl());
  }
  return s!;
}

/**
 * Prüft ob eine Kunden-Session die Bestellung (per order_no) sehen darf.
 * Interne Admins und impersonierte Sessions sind immer berechtigt.
 */
export async function requireOrderViewAccess(orderNo: string, session: AdminSession): Promise<void> {
  if (!isPortalOnlyRole(session.role)) return;
  const { notFound } = await import("next/navigation");
  const sessionEmail = String(session.userKey || session.userName || "")
    .trim()
    .toLowerCase();
  if (!sessionEmail) {
    notFound();
    return;
  }
  const row = await queryOne<{ customer_email: string | null; customer_id: number | null }>(
    `SELECT
       LOWER(TRIM(COALESCE(billing->>'email', ''))) AS customer_email,
       customer_id
     FROM booking.orders
     WHERE order_no = $1`,
    [Number(orderNo)],
  );
  if (!row) {
    notFound();
    return;
  }
  const orderEmail = String(row.customer_email || "").toLowerCase().trim();
  if (orderEmail === sessionEmail) return;
  // Fallback: customer_id über customers.email
  if (row.customer_id) {
    const cust = await queryOne<{ email: string | null }>(
      `SELECT LOWER(TRIM(email)) AS email FROM core.customers WHERE id = $1`,
      [row.customer_id],
    );
    if (cust?.email && String(cust.email).toLowerCase() === sessionEmail) return;
  }
  notFound();
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
