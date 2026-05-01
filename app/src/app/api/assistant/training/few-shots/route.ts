import { NextRequest, NextResponse } from "next/server";
import { FEW_SHOTS } from "@/lib/assistant/few-shot-examples";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await requireAssistantTrainingAccess(request);
  if (!access.ok) {
    const msg = access.status === 403 ? "Nur Super-Admin" : "Nicht authentifiziert";
    return NextResponse.json({ error: msg, code: "auth_failed" }, { status: access.status });
  }

  return NextResponse.json({
    count: FEW_SHOTS.length,
    shots: FEW_SHOTS.map((s) => ({ id: s.id, tags: s.tags })),
  });
}
