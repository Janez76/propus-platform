import { NextRequest, NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/assistant/auth";
import {
  listConversationMessages,
  setAssistantConversationArchived,
  setAssistantConversationDeleted,
} from "@/lib/assistant/store";
import { queryOne } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const { id } = await params;

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { archived?: unknown; deleted?: unknown };
  let changed = false;

  if (typeof body.archived === "boolean") {
    changed = await setAssistantConversationArchived({
      conversationId: id,
      userId: user.id,
      archived: body.archived,
    });
  } else if (typeof body.deleted === "boolean") {
    changed = await setAssistantConversationDeleted({
      conversationId: id,
      userId: user.id,
      deleted: body.deleted,
    });
  } else {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  if (!changed) return NextResponse.json({ error: "Konversation nicht gefunden" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const { id } = await params;
  const changed = await setAssistantConversationDeleted({
    conversationId: id,
    userId: user.id,
    deleted: true,
  });

  if (!changed) return NextResponse.json({ error: "Konversation nicht gefunden" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
