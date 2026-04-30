import { NextRequest, NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/assistant/auth";
import { createMemory, listMemoriesForUser } from "@/lib/assistant/memory-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const memories = await listMemoriesForUser(user.id);
  return NextResponse.json({ ok: true, memories });
}

export async function POST(req: NextRequest) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  let body: { body?: unknown; expires_in_days?: unknown; conversation_id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body fehlt" }, { status: 400 });

  let expiresAt: Date | undefined;
  const days = Number(body.expires_in_days);
  if (Number.isFinite(days) && days > 0 && days <= 3650) {
    expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + Math.trunc(days));
  }

  const convRaw = typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";
  const conversationId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(convRaw)
      ? convRaw
      : undefined;

  try {
    const row = await createMemory(user.id, text, "admin_created", conversationId, expiresAt);
    return NextResponse.json({ ok: true, memory: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Speichern fehlgeschlagen";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
