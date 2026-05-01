import { NextRequest, NextResponse } from "next/server";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import { runAssistantTuneReport } from "@/lib/assistant/training-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

const PREVIEW_CHARS = 8000;
const MAX_MD_RESPONSE_CHARS = 100 * 1024;

export async function POST(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access) {
    return NextResponse.json({ error: "Nicht berechtigt", code: "auth_failed" }, { status: 403 });
  }

  try {
    const result = await runAssistantTuneReport();
    const md = result.mdContent;
    const markdownPreview = md.slice(0, PREVIEW_CHARS);
    const largeTruncation = md.length > MAX_MD_RESPONSE_CHARS;
    const markdownForClient = largeTruncation ? md.slice(0, MAX_MD_RESPONSE_CHARS) : md;

    return NextResponse.json({
      ok: true,
      jsonFilename: result.jsonBasename,
      mdFilename: result.mdBasename,
      /** Relativ zum App-Root (VPS: im Container unter `app/scripts/`). */
      serverScriptsDir: "scripts",
      evalSummary: result.report.evalSummary,
      failedCaseCount: result.report.failedCases.length,
      patchCount: result.report.patches.length,
      markdownPreview,
      previewTruncated: md.length > PREVIEW_CHARS,
      markdownFull: markdownForClient,
      responseTruncatedAt100kb: largeTruncation,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, code: "tune_failed" }, { status: 500 });
  }
}
