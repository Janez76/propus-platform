import { NextResponse } from "next/server";
import { isAssistantCookieSessionRole } from "@/lib/assistant/auth";
import { getAdminSession } from "@/lib/auth.server";
import { computeAssistantCostChf } from "@/lib/assistant/assistant-usage-cost";
import { getAssistantUsageReport } from "@/lib/assistant/store";

export const runtime = "nodejs";

function withCost(slice: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
}) {
  return {
    ...slice,
    costChf: computeAssistantCostChf(
      slice.inputTokens,
      slice.outputTokens,
      slice.cacheCreationInputTokens,
      slice.cacheReadInputTokens,
    ),
  };
}

export async function GET() {
  const session = await getAdminSession();
  if (!session || !isAssistantCookieSessionRole(session.role)) {
    return NextResponse.json({ error: "Nicht authentifiziert", code: "auth_failed" }, { status: 401 });
  }

  // Bug-Hunt LOW L03: kein "admin"-Fallback mehr — Sessions ohne userKey/
  // userName bekommen leere Slices zurueck statt einen Sammel-Bucket, der
  // ueber mehrere fehlkonfigurierte Sessions hinweg leakt.
  const sessionId = String(session.userKey || session.userName || "").trim();
  const report = sessionId
    ? await getAssistantUsageReport(sessionId)
    : {
        today: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 0 },
        week: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 0 },
        month: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 0 },
      };

  return NextResponse.json({
    today: withCost(report.today),
    week: withCost(report.week),
    month: withCost(report.month),
    /** Boundaries for today/week/month aggregates */
    timezone: "Europe/Zurich",
    /** Sum over conversations with created_at in period; tokens updated on the conversation row */
    metric: "sum(input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens) on assistant_conversations",
  });
}
