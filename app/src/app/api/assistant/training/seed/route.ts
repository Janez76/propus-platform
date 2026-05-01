import { NextRequest, NextResponse } from "next/server";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import { runAssistantMemorySeed } from "@/lib/assistant/training-seed";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    const msg = access.status === 403 ? "Nur Super-Admin" : "Nicht authentifiziert";
    return NextResponse.json({ error: msg, code: "auth_failed" }, { status: access.status });
  }

  let body: { dryRun?: boolean };
  try {
    body = (await req.json()) as { dryRun?: boolean };
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON", code: "validation_error" }, { status: 400 });
  }

  const dryRun = Boolean(body.dryRun);
  const targetUserId = access.user.id;

  try {
    const stats = await runAssistantMemorySeed({ targetUserId, dryRun });
    return NextResponse.json({
      ok: true,
      dryRun,
      targetUserId,
      ...stats,
      hint: dryRun
        ? "Dry-Run: keine DB-Änderungen."
        : "Erinnerungen wurden idempotent angelegt (bestehende bodys pro User werden übersprungen).",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, code: "seed_failed" }, { status: 500 });
  }
}
