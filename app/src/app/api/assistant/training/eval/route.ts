import { NextRequest, NextResponse } from "next/server";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import { runAssistantEvalSuite, serializeEvalSummary } from "@/lib/assistant/training-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access) {
    return NextResponse.json({ error: "Nicht berechtigt", code: "auth_failed" }, { status: 403 });
  }

  try {
    const summary = await runAssistantEvalSuite();
    return NextResponse.json({ ok: true, summary: serializeEvalSummary(summary) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, code: "eval_failed" }, { status: 500 });
  }
}
