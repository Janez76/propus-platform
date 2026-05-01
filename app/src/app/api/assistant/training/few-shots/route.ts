import { NextRequest, NextResponse } from "next/server";
import { FEW_SHOTS } from "@/lib/assistant/few-shot-examples";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access) {
    return NextResponse.json({ error: "Nicht berechtigt", code: "auth_failed" }, { status: 403 });
  }

  return NextResponse.json({
    count: FEW_SHOTS.length,
    shots: FEW_SHOTS.map((s) => ({ id: s.id, tags: s.tags })),
  });
}
