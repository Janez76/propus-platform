/**
 * GET /auth/logto/login — Logto SSO wurde entfernt.
 * Weiterleitung auf die lokale Login-Seite.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.redirect(new URL("/login", process.env.ADMIN_PANEL_URL || "https://admin-booking.propus.ch"));
}
