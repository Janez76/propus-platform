/**
 * GET — letzte N Eval-Läufe (für Trend-Sparkline + Status-Karte).
 * GET ?runId=… — Detail (alle Cases mit pass/fail/Tools/Auszug).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import {
  listRecentEvalRuns,
  listEvalCaseResultsForRun,
} from "@/lib/assistant/training-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 403 ? "Nur Super-Admin" : "Nicht authentifiziert", code: "auth_failed" },
      { status: access.status },
    );
  }

  const url = req.nextUrl;
  const runId = url.searchParams.get("runId");
  if (runId) {
    const cases = await listEvalCaseResultsForRun(runId);
    return NextResponse.json({ runId, cases });
  }

  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 10, 1), 50) : 10;
  const runs = await listRecentEvalRuns(limit);

  // Aggregate für Sparkline (passRate je Lauf, neueste zuletzt)
  const sparkline = [...runs].reverse().map((r) => {
    const passRate = r.totalCases > 0 ? r.passedCases / r.totalCases : 0;
    return {
      runId: r.id,
      startedAt: r.startedAt,
      passed: r.passedCases,
      total: r.totalCases,
      passRate,
    };
  });

  return NextResponse.json({ runs, sparkline });
}
