import { NextRequest, NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/assistant/auth";
import { listAssistantHistory } from "@/lib/assistant/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const url = new URL(req.url);
  const filterParam = url.searchParams.get("filter");
  const filter = filterParam === "archived" || filterParam === "trash" ? filterParam : "active";
  const rows = await listAssistantHistory({
    userId: user.id,
    limit: 20,
    q: url.searchParams.get("q") || "",
    filter,
  });
  return NextResponse.json({ ok: true, conversations: rows });
}
