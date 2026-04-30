import { NextRequest, NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/assistant/auth";
import { allHandlers } from "@/lib/assistant/tools";
import { getPendingConfirmation, resolveConfirmation, writeAudit } from "@/lib/assistant/store";

export const runtime = "nodejs";
export const maxDuration = 30;

function clientIp(req: NextRequest): string | undefined {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
}

export async function POST(req: NextRequest) {
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  let body: { confirmationId?: unknown; approved?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const confirmationId = typeof body.confirmationId === "string" ? body.confirmationId.trim() : "";
  if (!confirmationId) return NextResponse.json({ error: "confirmationId fehlt" }, { status: 400 });

  const approved = body.approved === true;
  const ipAddress = clientIp(req);
  const userAgent = req.headers.get("user-agent") || undefined;

  const pending = await getPendingConfirmation({ confirmationId, userId: user.id });
  if (!pending) {
    return NextResponse.json({ error: "Bestätigung nicht gefunden oder bereits verarbeitet" }, { status: 404 });
  }

  if (!approved) {
    await resolveConfirmation({
      confirmationId,
      status: "rejected",
      output: { rejected: true },
    });
    await writeAudit({
      userId: user.id,
      conversationId: pending.conversationId,
      action: `${pending.toolName}_rejected`,
      payload: { input: pending.toolInput, confirmationId },
      ipAddress,
      userAgent,
    });
    return NextResponse.json({ ok: true, rejected: true, message: "Aktion abgebrochen." });
  }

  const handler = allHandlers[pending.toolName];
  if (!handler) {
    await resolveConfirmation({
      confirmationId,
      status: "error",
      error: "Tool-Handler nicht gefunden",
    });
    return NextResponse.json({ error: "Tool-Handler nicht gefunden" }, { status: 500 });
  }

  const start = Date.now();
  try {
    const toolInput = (typeof pending.toolInput === "object" && pending.toolInput !== null)
      ? pending.toolInput as Record<string, unknown>
      : {};
    const output = await handler(toolInput, {
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      ipAddress,
      userAgent,
    });
    const durationMs = Date.now() - start;

    await resolveConfirmation({
      confirmationId,
      status: "success",
      output,
      durationMs,
    });

    await writeAudit({
      userId: user.id,
      conversationId: pending.conversationId,
      action: pending.toolName,
      payload: { input: pending.toolInput, output, confirmationId },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ ok: true, result: output });
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    await resolveConfirmation({
      confirmationId,
      status: "error",
      error: message,
      durationMs,
    });

    await writeAudit({
      userId: user.id,
      conversationId: pending.conversationId,
      action: `${pending.toolName}_error`,
      payload: { input: pending.toolInput, error: message, confirmationId },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
