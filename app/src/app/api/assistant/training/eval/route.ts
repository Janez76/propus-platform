import { NextRequest, NextResponse } from "next/server";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import { runAssistantEvalSuite, serializeEvalSummary } from "@/lib/assistant/training-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    const msg = access.status === 403 ? "Nur Super-Admin" : "Nicht authentifiziert";
    return NextResponse.json({ error: msg, code: "auth_failed" }, { status: access.status });
  }

  try {
    const summary = await runAssistantEvalSuite();
    return NextResponse.json({ ok: true, summary: serializeEvalSummary(summary) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, code: "eval_failed" }, { status: 500 });
  }
}
