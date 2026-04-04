/**
 * GET /auth/logto/callback — Logto SSO wurde entfernt.
 * Dieser Endpunkt ist nicht mehr aktiv.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse("Logto SSO wurde entfernt. Bitte melde dich über /login an.", { status: 410 });
}
