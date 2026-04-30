import { NextRequest, NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/assistant/auth";
import { softDeleteMemory } from "@/lib/assistant/memory-store";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const { id } = await params;
  const deleted = await softDeleteMemory(user.id, id);
  if (!deleted) return NextResponse.json({ error: "Erinnerung nicht gefunden" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
