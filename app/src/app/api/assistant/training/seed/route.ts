import { NextRequest, NextResponse } from "next/server";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import { runAssistantMemorySeed } from "@/lib/assistant/training-seed";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access) {
    return NextResponse.json({ error: "Nicht berechtigt", code: "auth_failed" }, { status: 403 });
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
