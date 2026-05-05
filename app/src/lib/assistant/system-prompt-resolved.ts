/**
 * Auflöser für den effektiven System-Prompt.
 *
 * - Falls in `tour_manager.assistant_prompt_versions` eine aktive Version
 *   existiert → diese als Body verwenden.
 * - Sonst → Code-Default aus `system-prompt.ts` (gleiche Funktion wie heute).
 *
 * Negativ-Beispiele aus `assistant_negative_examples` werden, wenn vorhanden,
 * als kompakter „NICHT SO"-Block angehängt — so lernt der Assistant aus
 * Trainer-Feedback ohne dass jemand am Code-Prompt drehen muss.
 */
import {
  buildSystemPrompt,
  type PromptInput,
} from "@/lib/assistant/system-prompt";
import {
  getActivePromptVersion,
  listActiveNegativeExamples,
} from "@/lib/assistant/training-store";

const MAX_NEG_EXAMPLES = 5;

function renderNegativeBlock(
  rows: Array<{ userMessage: string; badResponse: string; whyBad: string; betterHint: string | null }>,
): string {
  if (rows.length === 0) return "";
  const lines: string[] = [
    "",
    "ANTI-MUSTER (so NICHT antworten — aus echtem Trainer-Feedback):",
  ];
  for (const r of rows.slice(0, MAX_NEG_EXAMPLES)) {
    lines.push("");
    lines.push(`• Frage: ${r.userMessage.slice(0, 200)}`);
    lines.push(`  Falsche Antwort: ${r.badResponse.slice(0, 240)}`);
    lines.push(`  Warum falsch: ${r.whyBad.slice(0, 200)}`);
    if (r.betterHint) lines.push(`  Besser: ${r.betterHint.slice(0, 200)}`);
  }
  return lines.join("\n");
}

export async function buildSystemPromptAsync(input: PromptInput): Promise<string> {
  let basePrompt = "";
  try {
    const active = await getActivePromptVersion();
    if (active?.body && active.body.trim().length > 0) {
      basePrompt = active.body;
    }
  } catch (err) {
    console.warn("[system-prompt-resolved] DB-Read fehlgeschlagen, fallback auf Code:", err);
  }
  if (!basePrompt) {
    basePrompt = buildSystemPrompt(input);
  } else {
    // DB-Body ist der Body — User-Kontext (Name/Zeit/Memories/Few-Shots) anhängen
    basePrompt = appendDynamicContext(basePrompt, input);
  }

  let negBlock = "";
  try {
    const neg = await listActiveNegativeExamples(MAX_NEG_EXAMPLES);
    negBlock = renderNegativeBlock(neg);
  } catch (err) {
    console.warn("[system-prompt-resolved] Negative-Examples-Read fehlgeschlagen:", err);
  }

  return negBlock ? `${basePrompt}\n${negBlock}` : basePrompt;
}

function appendDynamicContext(body: string, input: PromptInput): string {
  const lines: string[] = [
    body.trimEnd(),
    "",
    `Angemeldeter Benutzer: ${input.userName} <${input.userEmail}>`,
    `Aktuelle Zeit: ${input.currentTime} (${input.timezone})`,
  ];

  if (input.memories && input.memories.length > 0) {
    lines.push("");
    lines.push("Erinnerungen des Benutzers (berücksichtige diese bei deinen Antworten):");
    let totalChars = 0;
    for (const mem of input.memories) {
      if (totalChars + mem.length > 3000) break;
      lines.push(`- ${mem}`);
      totalChars += mem.length;
    }
  }

  const shots = input.fewShots?.slice(0, 3) ?? [];
  if (shots.length > 0) {
    lines.push("");
    lines.push("BEISPIELE (Muster, kein Wortlaut):");
    for (const ex of shots) {
      lines.push("");
      lines.push(`• Nutzer: ${ex.user}`);
      lines.push(`  Tool-Plan: ${ex.assistantToolPlan}`);
      lines.push(`  Antwort: ${ex.assistantFinal}`);
    }
  }

  return lines.join("\n");
}
