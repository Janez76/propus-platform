/**
 * GET /api/assistant/whoami
 *
 * Leichter Health/Auth-Check fuer Mobile-Clients zur Token-Validierung.
 * Liefert die aufgeloeste Session oder 401 — ohne Claude-Roundtrip.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAssistantSession, resolveAdminEmail } from "@/lib/assistant/auth";

export async function GET(req: NextRequest) {
  const session = await getAssistantSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = await resolveAdminEmail(session);
  return NextResponse.json({
    ok: true,
    role: session.role,
    userKey: session.userKey,
    userName: session.userName,
    email,
  });
}
