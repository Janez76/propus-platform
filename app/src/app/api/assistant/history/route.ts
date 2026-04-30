import { NextRequest, NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/assistant/auth";
import { listAssistantHistory } from "@/lib/assistant/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const rows = await listAssistantHistory({ userId: user.id, limit: 20 });
  return NextResponse.json({ ok: true, conversations: rows });
}
