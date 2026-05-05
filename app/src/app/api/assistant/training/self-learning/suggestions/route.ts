/**
 * GET ?status=pending — Vorschlags-Inbox
 * POST {id, action: 'accept'|'reject'} — Vorschlag bestätigen oder verwerfen.
 *   - accept add_negative → übernimmt in `assistant_negative_examples`
 *   - accept add_few_shot → übernimmt in `assistant_few_shots`
 *   - accept tune_prompt  → öffnet später Trainer-Chat (vorerst nur Status setzen)
 *   - reject → status = 'rejected'
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import {
  getSuggestion,
  listSuggestions,
  setSuggestionStatus,
  type SuggestionStatus,
} from "@/lib/assistant/self-learning-store";
import { insertFewShot, insertNegativeExample } from "@/lib/assistant/training-store";

export const runtime = "nodejs";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 56) || `auto-${Date.now()}`;
}

export async function GET(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    return NextResponse.json({ error: "Nur Super-Admin" }, { status: access.status });
  }
  const url = req.nextUrl;
  const status = (url.searchParams.get("status") || "pending") as SuggestionStatus | "all";
  const limit = Number(url.searchParams.get("limit") || "30");
  const rows = await listSuggestions(status, limit);
  return NextResponse.json({ suggestions: rows });
}

export async function POST(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    return NextResponse.json({ error: "Nur Super-Admin" }, { status: access.status });
  }
  let body: { id?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }
  const id = String(body.id || "").trim();
  const action = String(body.action || "").trim();
  if (!id || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "id und action (accept|reject) sind Pflicht" }, { status: 400 });
  }

  const suggestion = await getSuggestion(id);
  if (!suggestion) return NextResponse.json({ error: "Suggestion nicht gefunden" }, { status: 404 });
  if (suggestion.status !== "pending") {
    return NextResponse.json({ error: `Status ist bereits ${suggestion.status}` }, { status: 409 });
  }

  if (action === "reject") {
    await setSuggestionStatus({ id, status: "rejected", reviewedBy: access.user.email });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // accept: je nach kind
  const p = suggestion.preview as Record<string, unknown>;
  let result: unknown = null;
  if (suggestion.kind === "add_negative") {
    const userMessage = String(p.userMessage ?? "").trim();
    const badResponse = String(p.badResponse ?? "").trim();
    const whyBad = String(p.whyBad ?? "Vom Admin akzeptiert").trim();
    if (!userMessage || !badResponse) return NextResponse.json({ error: "preview.userMessage/badResponse fehlt" }, { status: 400 });
    const negId = await insertNegativeExample({
      userMessage,
      badResponse,
      whyBad,
      tags: ["self-learning", "accepted"],
      source: "trainer_chat",
      createdBy: access.user.email,
    });
    result = { kind: "negative_example", id: negId };
  } else if (suggestion.kind === "add_few_shot") {
    const userMessage = String(p.userMessage ?? "").trim();
    const assistantFinal = String(p.assistantFinal ?? "").trim();
    const assistantToolPlan = String(p.assistantToolPlan ?? "(automatisch erkannt)").trim();
    const tags = Array.isArray(p.tags) ? p.tags.map(String) : ["self-learning"];
    if (!userMessage || !assistantFinal) return NextResponse.json({ error: "preview.userMessage/assistantFinal fehlt" }, { status: 400 });
    const slug = `sl-${slugify(userMessage)}`;
    const fsId = await insertFewShot({
      slug,
      userMessage,
      assistantToolPlan,
      assistantFinal,
      tags,
      source: "trainer_chat",
      createdBy: access.user.email,
    });
    result = { kind: "few_shot", id: fsId, slug };
  } else if (suggestion.kind === "tune_prompt") {
    // Phase 1: nur Status setzen, der Admin nutzt den Trainer-Chat zum Tunen
    result = { kind: "tune_prompt", note: "Im Trainer-Chat verfeinern und update_system_prompt aufrufen." };
  } else if (suggestion.kind === "replay_harvest") {
    result = { kind: "replay_harvest", note: "Replay-Harvest im Profi-Modus starten." };
  }

  await setSuggestionStatus({ id, status: "accepted", reviewedBy: access.user.email });
  return NextResponse.json({ ok: true, status: "accepted", result });
}
