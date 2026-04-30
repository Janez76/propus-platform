import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/auth.server";
import { softDeleteMemory } from "@/lib/assistant/memory-store";

export const runtime = "nodejs";

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);

function sessionUser(session: AdminSession) {
  const userId = String(session.userKey || session.userName || session.role || "admin").trim();
  return { id: userId || "admin" };
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  if (!INTERNAL_ROLES.has(String(session.role || "").toLowerCase())) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const { id } = await params;
  await softDeleteMemory(sessionUser(session).id, id);
  return NextResponse.json({ ok: true });
}
