import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth.server";
import { isAssistantCookieSessionRole, revokeMobileToken } from "@/lib/assistant/auth";

export const runtime = "nodejs";

function sessionUser(session: { userKey: string | null; userName: string | null; role: string }) {
  const userId = String(session.userKey || session.userName || session.role || "admin").trim();
  return { id: userId || "admin" };
}

/** DELETE: Revoke a mobile token by ID. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session || !isAssistantCookieSessionRole(session.role)) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { id } = await params;
  const user = sessionUser(session);
  const ok = await revokeMobileToken(id, user.id);

  if (!ok) return NextResponse.json({ error: "Token nicht gefunden" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
