import { NextRequest, NextResponse } from "next/server";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import { harvestReplayCases } from "@/lib/assistant/training-replay-harvest";

export const runtime = "nodejs";

/** Max. Roh-JSON-Grösse für Base64-Download im Response (~450 KB). */
const MAX_JSON_BYTES = 450_000;

export async function POST(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    const msg = access.status === 403 ? "Nur Super-Admin" : "Nicht authentifiziert";
    return NextResponse.json({ error: msg, code: "auth_failed" }, { status: access.status });
  }

  let body: { limit?: number };
  try {
    body = (await req.json()) as { limit?: number };
  } catch {
    body = {};
  }

  const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : 50;

  try {
    const payload = await harvestReplayCases({ userId: access.user.id, limit });
    const jsonStr = JSON.stringify(payload);
    const byteLength = Buffer.byteLength(jsonStr, "utf8");
    const includeDownload = byteLength <= MAX_JSON_BYTES;

    return NextResponse.json({
      ok: true,
      caseCount: payload.cases.length,
      generatedAt: payload.generatedAt,
      download: includeDownload
        ? {
            filename: "replay-cases.json",
            base64: Buffer.from(jsonStr, "utf8").toString("base64"),
            byteLength,
          }
        : null,
      downloadOmittedReason: includeDownload
        ? null
        : `JSON zu gross (${byteLength} Bytes > ${MAX_JSON_BYTES}). Limit verkleinern oder lokal scripts/replay-conversations.ts nutzen.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, code: "replay_failed" }, { status: 500 });
  }
}
