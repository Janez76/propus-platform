/**
 * Standalone eval: Anthropic Messages API + gemockte Tools (kein DB).
 * Run: npm run eval:assistant [--json] [--replay] [--case=<id>]
 * Key: `ANTHROPIC_API_KEY` aus der Umgebung oder aus `app/.env.local` / `app/.env`.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  MessageParam,
  TextBlock,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { buildSystemPrompt } from "../src/lib/assistant/system-prompt";
import { selectFewShots } from "../src/lib/assistant/few-shot-examples";
import { allTools, toAnthropicTools } from "../src/lib/assistant/tools/index";
import { MODEL_IDS } from "../src/lib/assistant/model-router";
import { loadAppEnv } from "./load-local-env";

loadAppEnv(import.meta.url);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPLAY_JSON_PATH = path.join(SCRIPT_DIR, "replay-cases.json");

function isCliEntry(): boolean {
  const script = path.normalize(fileURLToPath(import.meta.url));
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.normalize(argv1) === script;
}

export const EVAL_MODEL = MODEL_IDS.sonnet;
const MAX_TOKENS = 1024;
const TEMPERATURE = 0;
const DEFAULT_LOOP_MAX = 6;

export type EvalTestCase = {
  id: string;
  userMessage: string;
  /** Optional vorherige Turns (z. B. kein Begrüssen). */
  priorMessages?: MessageParam[];
  /** Erwartete Tool-Namen als Teilfolge der tatsächlichen Aufrufe (Reihenfolge). */
  expectTools?: string[];
  /** Mindestens eines dieser Tools muss vorkommen. */
  expectToolAnyOf?: string[];
  /** Diese Tool-Namen dürfen nicht aufgerufen werden (leer = keine Prüfung). */
  expectNoTools?: string[];
  mustContain?: RegExp[];
  mustNotContain?: RegExp[];
  maxTurns?: number;
  /** Aus Produktion (Replay): beobachtete Tools — Drift-Vergleich zur Eval-Lauf-Reihenfolge. */
  observedTools?: string[];
};

export type EvalCaseResult = {
  id: string;
  pass: boolean;
  reason: string;
  model: string;
  tools: string[];
  inputTokens: number;
  outputTokens: number;
  finalText: string;
  observedTools?: string[];
  /** observedTools als Teilfolge von tools (Eval-Lauf). */
  driftOk?: boolean;
  driftDetail?: string;
};

export type EvalSuiteSummary = {
  passed: number;
  total: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  results: EvalCaseResult[];
  failedCases: Array<{ case: EvalTestCase; result: EvalCaseResult }>;
};

const ALL_TOOL_NAMES = allTools.map((t) => t.name);

const FIXTURES: Record<string, (input: Record<string, unknown>) => unknown> = {
  search_customers: () => [{ id: "cust-1", name: "Polletti AG", email: "info@polletti.ch" }],
  get_tour_status: () => ({ tour_id: 42, customer_name: "Polletti AG", status: "active" }),
  get_tour_detail: () => ({ tour_id: 42, customer_name: "Polletti AG", status: "active" }),
  search_invoices: () => [{ id: "inv-1", customer_id: "cust-1", amount: 1234, status: "open" }],
  get_order_detail: () => ({ error: "Auftrag nicht gefunden" }),
  get_order_by_id: () => ({ error: "Auftrag nicht gefunden" }),
  save_memory: () => ({ ok: true, id: "mem-1" }),
  send_email: () => ({
    confirmation_required: true,
    draft: { to: "info@firma.ch", subject: "Tour-Verlängerung", body_html: "<p>Entwurf</p>" },
  }),
};

function defaultFixture(_input: Record<string, unknown>) {
  return { ok: true, data: [], note: "mocked" };
}

function buildMockHandlers(): Record<string, (input: Record<string, unknown>) => unknown> {
  const map: Record<string, (input: Record<string, unknown>) => unknown> = {};
  for (const name of ALL_TOOL_NAMES) {
    map[name] = FIXTURES[name] ?? defaultFixture;
  }
  return map;
}

const mockHandlers = buildMockHandlers();

function serializeToolResult(output: unknown): string {
  if (typeof output === "string") return output;
  return JSON.stringify(output);
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function isSubsequence(needle: string[], haystack: string[]): boolean {
  let i = 0;
  for (const h of haystack) {
    if (i < needle.length && h === needle[i]) i += 1;
  }
  return i === needle.length;
}

export const TEST_CASES: EvalTestCase[] = [
  {
    id: "smalltalk-greeting",
    userMessage: "Hallo!",
    expectNoTools: ALL_TOOL_NAMES,
    mustContain: [/./],
    mustNotContain: [/Tool/i],
  },
  {
    id: "kunde-suchen",
    userMessage: "Suche Kunde Polletti",
    expectTools: ["search_customers"],
  },
  {
    id: "tour-status",
    userMessage: "Wie ist der Status von Tour 42?",
    expectToolAnyOf: ["get_tour_status", "get_tour_detail"],
  },
  {
    id: "tippfehler-fuzzy",
    userMessage: "Hat poleti offene rechnungen?",
    expectTools: ["search_customers"],
    maxTurns: 4,
  },
  {
    id: "memory-save",
    userMessage: "Merk dir: Kunde X bevorzugt Termine am Vormittag",
    expectTools: ["save_memory"],
  },
  {
    id: "email-send",
    userMessage: "Schreib an info@firma.ch wegen Tour-Verlängerung",
    expectTools: ["send_email"],
    mustNotContain: [/kann.*nicht direkt/i],
  },
  {
    id: "auftrag-anlegen-start",
    userMessage: "Ich möchte einen neuen Auftrag anlegen",
    expectNoTools: [],
    mustContain: [/Kunde/i],
  },
  {
    id: "no-hallu-id",
    userMessage: "Was ist mit Auftrag #99999999?",
    expectToolAnyOf: ["get_order_detail", "get_order_by_id"],
    mustNotContain: [/[Ee]rfunden|wahrscheinlich|vermutlich/],
  },
  {
    id: "german-only",
    userMessage: "Hello, how are you?",
    mustContain: [/([äöüÄÖÜß]|[Hh]allo|[Gg]uten)/],
  },
  {
    id: "no-greeting-midconvo",
    priorMessages: [
      { role: "user", content: "Wir hatten eben über Tour 42 gesprochen." },
      {
        role: "assistant",
        content: "Genau — Tour 42 ist bei Polletti AG und der Status ist aktiv.",
      },
    ],
    userMessage: "Und der nächste?",
    mustNotContain: [/^(Hallo|Guten Morgen|Wie kann)/i],
  },
  {
    id: "rechnungen-kombi",
    userMessage: "Hat Müller offene Rechnungen?",
    expectTools: ["search_customers", "search_invoices"],
  },
  {
    id: "weather-honest",
    userMessage: "Wie wird das Wetter morgen in Zürich?",
    mustContain: [/meteoschweiz|ohne.*[Ww]etter|keine.*[Ee]chtzeit|nicht.*Live/i],
  },
  {
    id: "routing-honest",
    userMessage: "Wie lange brauche ich von der Albisstrasse Zürich nach Oetwil am See mit dem Auto?",
    mustContain: [
      /schätz|ungefähr|ca\.|circa|Maps|OpenStreetMap|routing|kein.*Routing|keinen.*Kartendienst/i,
    ],
  },
];

type ReplayFileV1 = {
  version?: number;
  cases?: EvalTestCase[];
};

export function loadReplayCaseFile(filePath: string): EvalTestCase[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as ReplayFileV1 | EvalTestCase[];
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.cases)) return data.cases;
  return [];
}

export function mergeEvalCases(base: EvalTestCase[], extra: EvalTestCase[]): EvalTestCase[] {
  const seen = new Set(base.map((c) => c.id));
  const out = [...base];
  for (const c of extra) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

export async function runEvalCase(client: Anthropic, tc: EvalTestCase): Promise<EvalCaseResult> {
  const fewShots = selectFewShots(tc.userMessage);
  const system = buildSystemPrompt({
    userName: "Eval-User",
    userEmail: "eval@propus.local",
    currentTime: new Date().toISOString(),
    timezone: "Europe/Zurich",
    memories: [],
    fewShots,
  });

  const tools = toAnthropicTools(allTools) as Anthropic.Messages.Tool[];
  const messages: MessageParam[] = [...(tc.priorMessages ?? []), { role: "user", content: tc.userMessage }];

  const orderedTools: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let lastModel = EVAL_MODEL;
  let finalText = "";
  const maxIters = tc.maxTurns ?? DEFAULT_LOOP_MAX;

  try {
    for (let iter = 0; iter < maxIters; iter += 1) {
      const response = await client.messages.create({
        model: EVAL_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system,
        tools,
        messages,
      });

      lastModel = response.model;
      inputTokens += response.usage?.input_tokens ?? 0;
      outputTokens += response.usage?.output_tokens ?? 0;

      const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

      if (toolUses.length === 0) {
        finalText = extractText(response.content);
        break;
      }

      for (const tu of toolUses) {
        orderedTools.push(tu.name);
      }

      const toolResultBlocks: ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const handler = mockHandlers[tu.name] ?? defaultFixture;
        const inputObj = (tu.input && typeof tu.input === "object" ? tu.input : {}) as Record<string, unknown>;
        const out = handler(inputObj);
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: serializeToolResult(out),
        });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResultBlocks });
    }

    if (finalText === "") {
      return {
        id: tc.id,
        pass: false,
        reason: "fail: Kein Antworttext (zu viele Tool-Runden oder maxTurns erreicht)",
        model: lastModel,
        tools: orderedTools,
        inputTokens,
        outputTokens,
        finalText: "",
        observedTools: tc.observedTools,
        driftOk: false,
        driftDetail: "kein finalText",
      };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      id: tc.id,
      pass: false,
      reason: `fail (api_error): ${msg.slice(0, 200)}`,
      model: lastModel,
      tools: orderedTools,
      inputTokens,
      outputTokens,
      finalText: "",
      observedTools: tc.observedTools,
      driftOk: false,
      driftDetail: msg.slice(0, 200),
    };
  }

  let pass = true;
  const reasons: string[] = [];

  let driftOk = true;
  let driftDetail: string | undefined;
  if (tc.observedTools && tc.observedTools.length > 0) {
    driftOk = isSubsequence(tc.observedTools, orderedTools);
    driftDetail = driftOk
      ? `drift ok: ${JSON.stringify(tc.observedTools)} ⊆ Lauf`
      : `drift: observed ${JSON.stringify(tc.observedTools)} nicht als Teilfolge in ${JSON.stringify(orderedTools)}`;
    if (!driftOk) {
      pass = false;
      reasons.push(driftDetail);
    }
  }

  if (tc.expectTools?.length) {
    if (!isSubsequence(tc.expectTools, orderedTools)) {
      pass = false;
      reasons.push(`expectTools subsequence ${JSON.stringify(tc.expectTools)} not in ${JSON.stringify(orderedTools)}`);
    }
  }

  if (tc.expectToolAnyOf?.length) {
    const hit = tc.expectToolAnyOf.some((n) => orderedTools.includes(n));
    if (!hit) {
      pass = false;
      reasons.push(`expectToolAnyOf: none of ${JSON.stringify(tc.expectToolAnyOf)} in ${JSON.stringify(orderedTools)}`);
    }
  }

  if (tc.expectNoTools && tc.expectNoTools.length > 0) {
    const forbidden = new Set(tc.expectNoTools);
    const bad = orderedTools.filter((n) => forbidden.has(n));
    if (bad.length > 0) {
      pass = false;
      reasons.push(`unexpected tools: ${bad.join(", ")}`);
    }
  }

  for (const r of tc.mustContain ?? []) {
    if (!r.test(finalText)) {
      pass = false;
      reasons.push(`mustContain failed: ${r}`);
    }
  }

  for (const r of tc.mustNotContain ?? []) {
    if (r.test(finalText)) {
      pass = false;
      reasons.push(`mustNotContain matched: ${r}`);
    }
  }

  return {
    id: tc.id,
    pass,
    reason: reasons.length ? reasons.join("; ") : "ok",
    model: lastModel,
    tools: orderedTools,
    inputTokens,
    outputTokens,
    finalText,
    observedTools: tc.observedTools,
    driftOk,
    driftDetail,
  };
}

export async function runEvalSuite(
  client: Anthropic,
  options?: {
    cases?: EvalTestCase[];
    onCase?: (result: EvalCaseResult) => void;
  },
): Promise<EvalSuiteSummary> {
  const cases = options?.cases ?? TEST_CASES;
  const results: EvalCaseResult[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const tc of cases) {
    const r = await runEvalCase(client, tc);
    results.push(r);
    totalIn += r.inputTokens;
    totalOut += r.outputTokens;
    options?.onCase?.(r);
  }

  const passed = results.filter((r) => r.pass).length;
  const failedCases = results
    .filter((r) => !r.pass)
    .map((r) => {
      const c = cases.find((x) => x.id === r.id);
      return { case: c!, result: r };
    })
    .filter((x) => x.case);

  return {
    passed,
    total: results.length,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    results,
    failedCases,
  };
}

function parseArgCase(): string | null {
  const a = process.argv.find((x) => x.startsWith("--case="));
  if (!a) return null;
  return a.slice("--case=".length).trim() || null;
}

function argvHasReplay(): boolean {
  return process.argv.includes("--replay");
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const replay = argvHasReplay();
  const caseId = parseArgCase();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is required");
    process.exit(1);
  }

  let cases = [...TEST_CASES];
  if (replay && fs.existsSync(REPLAY_JSON_PATH)) {
    const extra = loadReplayCaseFile(REPLAY_JSON_PATH);
    cases = mergeEvalCases(cases, extra);
  }

  if (caseId) {
    cases = cases.filter((c) => c.id === caseId);
    if (cases.length === 0) {
      console.error(`No case with id=${caseId}`);
      process.exit(1);
    }
  }

  const client = new Anthropic({ apiKey });
  const summary = await runEvalSuite(client, {
    cases,
    onCase: jsonOut
      ? undefined
      : (r) => {
          const mark = r.pass ? "✓" : "✗";
          const drift = r.driftDetail ? `  ${r.driftDetail}` : "";
          console.log(
            `${mark} ${r.id}  tools=[${r.tools.join(", ")}]  tokens=${r.inputTokens}+${r.outputTokens}  ${r.reason}${drift}`,
          );
        },
  });

  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          passed: summary.passed,
          total: summary.total,
          totalInputTokens: summary.totalInputTokens,
          totalOutputTokens: summary.totalOutputTokens,
          cases: summary.results,
          failedCases: summary.failedCases.map((f) => ({
            case: f.case,
            result: f.result,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log("");
    console.log(
      `Summary: ${summary.passed}/${summary.total} passed, total tokens=${summary.totalInputTokens}+${summary.totalOutputTokens}`,
    );
  }

  if (summary.passed < summary.total) {
    process.exit(1);
  }
}

if (isCliEntry()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
