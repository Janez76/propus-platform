import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/auth.server";
import { listConversationMessages } from "@/lib/assistant/store";
import { queryOne } from "@/lib/db";

export const runtime = "nodejs";

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);

function sessionUser(session: AdminSession) {
  const userId = String(session.userKey || session.userName || session.role || "admin").trim();
  return { id: userId || "admin" };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  if (!INTERNAL_ROLES.has(String(session.role || "").toLowerCase())) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const { id } = await params;
  const user = sessionUser(session);

  const conversation = await queryOne<{ id: string; title: string | null }>(
    `SELECT id, title FROM tour_manager.assistant_conversations
     WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );
  if (!conversation) {
    return NextResponse.json({ error: "Konversation nicht gefunden" }, { status: 404 });
  }

  const messages = await listConversationMessages({
    conversationId: id,
    userId: user.id,
  });

  return NextResponse.json({ ok: true, conversation, messages });
}
