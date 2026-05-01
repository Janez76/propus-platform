/**
 * Harvest: letzte Konversationen → replay-cases.json für Eval (--replay).
 * Benötigt DATABASE_URL und ASSISTANT_REPLAY_USER_ID (UUID des Admin-Users).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import {
  listAssistantHistory,
  listAssistantToolCallsForConversation,
  listConversationMessages,
} from "../src/lib/assistant/store";
import type { EvalTestCase } from "./eval-assistant";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(SCRIPT_DIR, "replay-cases.json");

/** E-Mails und typische CH-Telefonnummern für Trainings-Export maskieren. */
export function anonymizeReplayText(text: string): string {
  let s = text;
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]");
  s = s.replace(/(?:\+41|0041)\s*[1-9](?:[\s\-/]\d){6,}\d/g, "[phone]");
  s = s.replace(/\b0\d{1,2}\s*[1-9](?:[\s\-/]\d){5,}\d\b/g, "[phone]");
  return s;
}

function extractUserText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && "text" in content) {
    const t = (content as { text?: unknown }).text;
    return typeof t === "string" ? t : "";
  }
  return "";
}

function toPriorMessages(rows: Awaited<ReturnType<typeof listConversationMessages>>, upToExclusiveId: string): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of rows) {
    if (m.id === upToExclusiveId) break;
    if (m.role === "user") {
      const t = anonymizeReplayText(extractUserText(m.content));
      if (t.trim()) out.push({ role: "user", content: t });
    } else if (m.role === "assistant") {
      const t = anonymizeReplayText(extractUserText(m.content));
      if (t.trim()) out.push({ role: "assistant", content: t });
    }
  }
  return out;
}

async function main() {
  const userId = process.env.ASSISTANT_REPLAY_USER_ID?.trim();
  if (!userId) {
    console.error("ASSISTANT_REPLAY_USER_ID (User-UUID) ist erforderlich");
    process.exit(1);
  }

  const convs = await listAssistantHistory({
    userId,
    limit: 50,
    limitCap: 50,
    filter: "active",
  });

  const cases: EvalTestCase[] = [];

  for (const c of convs) {
    const msgs = await listConversationMessages({ conversationId: c.id, userId });
    if (msgs.length === 0) continue;

    let lastUser: (typeof msgs)[0] | null = null;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      if (msgs[i].role === "user") {
        lastUser = msgs[i];
        break;
      }
    }
    if (!lastUser) continue;

    const userMessage = anonymizeReplayText(extractUserText(lastUser.content)).trim();
    if (!userMessage) continue;

    const priorMessages = toPriorMessages(msgs, lastUser.id);
    const observedTools = await listAssistantToolCallsForConversation({
      conversationId: c.id,
      userId,
      afterCreatedAt: lastUser.createdAt,
    });

    cases.push({
      id: `replay-${c.id.slice(0, 8)}-${lastUser.id.slice(0, 8)}`,
      userMessage,
      priorMessages: priorMessages.length > 0 ? priorMessages : undefined,
      observedTools: observedTools.length > 0 ? observedTools : undefined,
    });
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    userIdHint: "[redacted]",
    cases,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${cases.length} cases to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
