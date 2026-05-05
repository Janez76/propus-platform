/**
 * 👍/👎 unter einer Bot-Antwort.
 * - thumb=up → speichert die Konversation als positives Few-Shot (slug aus Frage).
 * - thumb=down → speichert sie als Negativ-Beispiel (mit Begründung optional).
 * Beide Wege sind Idempotent: gleicher Slug überschreibt den Datensatz.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/assistant/auth";
import { isAssistantSettingsAdminUi } from "@/lib/assistant/access-env";
import { getAdminSession } from "@/lib/auth.server";
import {
  insertFewShot,
  insertNegativeExample,
} from "@/lib/assistant/training-store";

export const runtime = "nodejs";

function slugifyShort(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || `fb-${Date.now()}`;
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !isAssistantSettingsAdminUi(session)) {
    return NextResponse.json({ error: "Nur Super-Admin" }, { status: 403 });
  }
  const user = await resolveAssistantUser(req);
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  let body: {
    thumb?: unknown;
    userMessage?: unknown;
    assistantResponse?: unknown;
    whyBad?: unknown;
    conversationId?: unknown;
    messageId?: unknown;
    tags?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const thumb = body.thumb === "up" ? "up" : body.thumb === "down" ? "down" : null;
  const userMessage = String(body.userMessage || "").trim();
  const assistantResponse = String(body.assistantResponse || "").trim();
  if (!thumb || !userMessage || !assistantResponse) {
    return NextResponse.json({ error: "thumb, userMessage und assistantResponse sind Pflicht" }, { status: 400 });
  }
  const tags = Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean).slice(0, 12) : [];
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  const messageId = typeof body.messageId === "string" ? body.messageId : null;

  if (thumb === "up") {
    const slug = `fb-${slugifyShort(userMessage)}`;
    const id = await insertFewShot({
      slug,
      userMessage,
      assistantToolPlan: "(aus Feedback — Tool-Plan ggf. nachpflegen)",
      assistantFinal: assistantResponse,
      tags,
      source: "feedback_thumb",
      createdBy: user.email,
      sourceConversation: conversationId,
      sourceMessage: messageId,
    });
    return NextResponse.json({ ok: true, kind: "few_shot", id, slug });
  }

  // thumb === "down"
  const whyBad = String(body.whyBad || "Vom Admin als falsch markiert").trim();
  const id = await insertNegativeExample({
    userMessage,
    badResponse: assistantResponse,
    whyBad,
    tags,
    source: "feedback_thumb",
    createdBy: user.email,
    sourceConversation: conversationId,
    sourceMessage: messageId,
  });
  return NextResponse.json({ ok: true, kind: "negative_example", id });
}
