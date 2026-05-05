/**
 * POST — manueller Self-Learning-Run aus dem Panel.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import { runSelfLearningOnce } from "@/lib/assistant/self-learning-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    return NextResponse.json({ error: "Nur Super-Admin" }, { status: access.status });
  }
  try {
    const result = await runSelfLearningOnce({ trigger: "manual" });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
