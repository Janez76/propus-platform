/**
 * GET — Settings + Trends (recent runs, signal counts).
 * PATCH — Settings ändern (toggles, thresholds).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import {
  countSignalsSince,
  getSelfLearningSettings,
  listRecentSelfLearningRuns,
  updateSelfLearningSettings,
} from "@/lib/assistant/self-learning-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 403 ? "Nur Super-Admin" : "Nicht authentifiziert" },
      { status: access.status },
    );
  }
  const [settings, runs, lastDay] = await Promise.all([
    getSelfLearningSettings(),
    listRecentSelfLearningRuns(15),
    countSignalsSince(new Date(Date.now() - 24 * 3600_000)),
  ]);
  return NextResponse.json({ settings, runs, signalsLast24h: lastDay });
}

export async function PATCH(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 403 ? "Nur Super-Admin" : "Nicht authentifiziert" },
      { status: access.status },
    );
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }
  const patch: Parameters<typeof updateSelfLearningSettings>[0] = {};
  if (typeof body.implicitFeedbackEnabled === "boolean") patch.implicitFeedbackEnabled = body.implicitFeedbackEnabled;
  if (typeof body.autoTuneEnabled === "boolean") patch.autoTuneEnabled = body.autoTuneEnabled;
  if (typeof body.autoTuneCron === "string") patch.autoTuneCron = body.autoTuneCron;
  if (typeof body.minSignalConfidence === "number") patch.minSignalConfidence = Math.max(0, Math.min(1, body.minSignalConfidence));
  if (typeof body.maxAutoActivations24h === "number") patch.maxAutoActivations24h = Math.max(0, Math.floor(body.maxAutoActivations24h));
  if (typeof body.maxAutoActivations7d === "number") patch.maxAutoActivations7d = Math.max(0, Math.floor(body.maxAutoActivations7d));
  if (typeof body.notifyEmail === "string") patch.notifyEmail = body.notifyEmail || null;
  if ((body as { notifyEmail?: unknown }).notifyEmail === null) patch.notifyEmail = null;
  await updateSelfLearningSettings(patch, access.user.email);
  return NextResponse.json({ ok: true, settings: await getSelfLearningSettings() });
}
