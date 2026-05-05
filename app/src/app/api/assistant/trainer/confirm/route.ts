/**
 * Trainer-Confirm: führt ein bestätigungspflichtiges Trainer-Tool aus.
 * Im Gegensatz zum Hauptchat-Confirm (DB-basierend) ist der Pending-State hier
 * im Browser, weil Trainer-Sessions flüchtig sind. Die UI schickt toolName + input
 * direkt mit, der Server validiert gegen die Trainer-Toolliste.
 */
import { NextRequest, NextResponse } from "next/server";
import { trainerHandlers, trainerTools } from "@/lib/assistant/trainer-tools";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    const msg = access.status === 403 ? "Nur Super-Admin" : "Nicht authentifiziert";
    return NextResponse.json({ error: msg }, { status: access.status });
  }
  const user = access.user;

  let body: { toolName?: unknown; input?: unknown; approved?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const toolName = typeof body.toolName === "string" ? body.toolName.trim() : "";
  const approved = body.approved === true;
  const input = body.input && typeof body.input === "object" ? (body.input as Record<string, unknown>) : {};

  if (!toolName) return NextResponse.json({ error: "toolName fehlt" }, { status: 400 });

  // Whitelist gegen die Trainer-Toolliste
  const def = trainerTools.find((t) => t.name === toolName);
  if (!def || !def.requiresConfirmation) {
    return NextResponse.json({ error: "Tool nicht bestätigungspflichtig oder nicht erlaubt" }, { status: 400 });
  }
  if (!approved) {
    return NextResponse.json({ ok: true, rejected: true, message: "Aktion abgebrochen." });
  }

  const handler = trainerHandlers[toolName];
  if (!handler) return NextResponse.json({ error: "Handler fehlt" }, { status: 500 });

  try {
    const output = await handler(input, {
      userId: user.id,
      userEmail: user.email,
      role: user.role,
    });
    return NextResponse.json({ ok: true, result: output });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
