import { NextRequest, NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/assistant/auth";
import { listMemoriesForUser } from "@/lib/assistant/memory-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const memories = await listMemoriesForUser(user.id);
  return NextResponse.json({ ok: true, memories });
}
