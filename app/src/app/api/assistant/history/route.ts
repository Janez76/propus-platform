import { NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/auth.server";
import { listAssistantHistory } from "@/lib/assistant/store";

export const runtime = "nodejs";

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);

function sessionUser(session: AdminSession) {
  const userId = String(session.userKey || session.userName || session.role || "admin").trim();
  return { id: userId || "admin" };
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  if (!INTERNAL_ROLES.has(String(session.role || "").toLowerCase())) {
    return NextResponse.json({ error: "Keine Berechtigung für den Assistant" }, { status: 403 });
  }

  const rows = await listAssistantHistory({ userId: sessionUser(session).id, limit: 20 });
  return NextResponse.json({ ok: true, conversations: rows });
}
