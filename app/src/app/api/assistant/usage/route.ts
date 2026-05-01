import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth.server";
import { computeAssistantCostChf } from "@/lib/assistant/assistant-usage-cost";
import { getAssistantUsageReport } from "@/lib/assistant/store";

export const runtime = "nodejs";

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);

function withCost(slice: { inputTokens: number; outputTokens: number; totalTokens: number }) {
  return {
    ...slice,
    costChf: computeAssistantCostChf(slice.inputTokens, slice.outputTokens),
  };
}

export async function GET() {
  const session = await getAdminSession();
  if (!session || !INTERNAL_ROLES.has(String(session.role || "").toLowerCase())) {
    return NextResponse.json({ error: "Nicht authentifiziert", code: "auth_failed" }, { status: 401 });
  }

  const userId = String(session.userKey || session.userName || "admin").trim() || "admin";
  const report = await getAssistantUsageReport(userId);

  return NextResponse.json({
    today: withCost(report.today),
    week: withCost(report.week),
    month: withCost(report.month),
    /** Boundaries for today/week/month aggregates */
    timezone: "Europe/Zurich",
    /** Sum over conversations with created_at in period; tokens updated on the conversation row */
    metric: "sum(input_tokens)+sum(output_tokens) on assistant_conversations",
  });
}
