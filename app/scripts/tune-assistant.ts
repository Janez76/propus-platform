/**
 * Nach Eval: Claude Opus schlägt Text-Patches für system-prompt.ts vor (kein Auto-Write).
 * ANTHROPIC_API_KEY erforderlich. Optional: --apply <patch-id> wendet EINEN Patch manuell an.
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { runEvalSuite, TEST_CASES, type EvalTestCase, type EvalCaseResult } from "./eval-assistant";
import { MODEL_IDS } from "../src/lib/assistant/model-router";

const SCRIPT_DIR_FROM_URL = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT_FROM_URL = path.join(SCRIPT_DIR_FROM_URL, "..");

function resolveExisting(candidates: string[], fallbackIndex = 0): string {
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      // ignore
    }
  }
  return candidates[fallbackIndex] ?? candidates[0];
}

function resolveSystemPromptPath(): string {
  return resolveExisting([
    path.join(process.cwd(), "src", "lib", "assistant", "system-prompt.ts"),
    path.join(APP_ROOT_FROM_URL, "src", "lib", "assistant", "system-prompt.ts"),
  ]);
}

function resolveScriptsDir(): string {
  const candidates = [path.join(process.cwd(), "scripts"), SCRIPT_DIR_FROM_URL];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      // ignore
    }
  }
  const target = candidates[0];
  fs.mkdirSync(target, { recursive: true });
  return target;
}

const SYSTEM_PROMPT_PATH = resolveSystemPromptPath();

function isCliEntry(): boolean {
  const script = path.normalize(fileURLToPath(import.meta.url));
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.normalize(argv1) === script;
}

type ProposedPatch = { id: string; find: string; replace: string; rationale?: string };

export type TuneReportJson = {
  timestamp: string;
  model: string;
  evalSummary: { passed: number; total: number };
  systemPromptPath: string;
  failedCases: Array<{
    id: string;
    userMessage: string;
    reason: string;
    tools: string[];
    finalTextPreview: string;
    observedTools?: string[];
    driftDetail?: string;
  }>;
  patches: ProposedPatch[];
  opusRationale?: string;
};

export type TuneReportResult = {
  report: TuneReportJson;
  mdContent: string;
  jsonBasename: string;
  mdBasename: string;
  reportsDir: string;
};

function parseArgCase(): string | null {
  const a = process.argv.find((x) => x.startsWith("--case="));
  if (!a) return null;
  return a.slice("--case=".length).trim() || null;
}

function parseApplyPatchId(): string | null {
  const i = process.argv.indexOf("--apply");
  if (i < 0 || !process.argv[i + 1]) return null;
  return process.argv[i + 1].trim() || null;
}

function latestTuneReportJsonPath(): string | null {
  const dir = resolveScriptsDir();
  const files = fs.readdirSync(dir).filter((f) => /^tuning-report-.*\.json$/.test(f));
  if (files.length === 0) return null;
  files.sort((a, b) => {
    const ta = fs.statSync(path.join(dir, a)).mtimeMs;
    const tb = fs.statSync(path.join(dir, b)).mtimeMs;
    return tb - ta;
  });
  return path.join(dir, files[0]!);
}

function simpleDiffLine(oldLine: string, newLine: string): string {
  if (oldLine === newLine) return ` ${oldLine}`;
  return [`-${oldLine}`, `+${newLine}`].join("\n");
}

function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

async function proposePatchesWithOpus(
  client: Anthropic,
  systemPromptSource: string,
  failed: Array<{ case: EvalTestCase; result: EvalCaseResult }>,
): Promise<{ rationale: string; patches: ProposedPatch[] }> {
  const failedBrief = failed.map((f) => ({
    id: f.case.id,
    userMessage: f.case.userMessage,
    expectTools: f.case.expectTools,
    expectToolAnyOf: f.case.expectToolAnyOf,
    mustContain: f.case.mustContain?.map((r) => r.toString()),
    reason: f.result.reason,
    toolsUsed: f.result.tools,
    finalText: f.result.finalText.slice(0, 1200),
    observedTools: f.result.observedTools,
    drift: f.result.driftDetail,
  }));

  const userBlock = [
    "Fehlgeschlagene Eval-Fälle (JSON):",
    JSON.stringify(failedBrief, null, 2),
    "",
    "Aktueller system-prompt.ts (vollständig, nur zur Referenz — Patches müssen exakte `find`-Strings aus dieser Datei enthalten):",
    systemPromptSource,
  ].join("\n");

  const system = [
    "Du hilfst beim Verbessern des System-Prompts für den Propus Assistant.",
    "Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Code-Fence) in exakt dieser Form:",
    '{"rationale":"string","patches":[{"id":"p1","find":"exakter Teilstring aus der Datei","replace":"Ersatz","rationale":"optional"}]}',
    "Jeder find-String muss eindeutig vorkommen. Kleine, fokussierte Patches bevorzugen.",
  ].join("\n");

  const res = await client.messages.create({
    model: MODEL_IDS.opus,
    max_tokens: 8192,
    temperature: 0,
    system,
    messages: [{ role: "user", content: userBlock }],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();

  let parsed: { rationale?: string; patches?: ProposedPatch[] };
  try {
    parsed = JSON.parse(text) as { rationale?: string; patches?: ProposedPatch[] };
  } catch {
    throw new Error(`Opus lieferte kein parsbares JSON. Rohtext (Anfang): ${text.slice(0, 500)}`);
  }

  const patches = Array.isArray(parsed.patches) ? parsed.patches : [];
  const withIds = patches.map((p, i) => ({
    id: String(p.id || `patch-${i + 1}`),
    find: String(p.find || ""),
    replace: String(p.replace || ""),
    rationale: p.rationale ? String(p.rationale) : undefined,
  }));

  return { rationale: String(parsed.rationale || ""), patches: withIds };
}

export function writeMarkdownReport(report: TuneReportJson, mdPath: string): void {
  const lines: string[] = [
    `# Tuning-Report ${report.timestamp}`,
    "",
    `Eval: ${report.evalSummary.passed}/${report.evalSummary.total} bestanden.`,
    "",
    "## Fehlgeschlagene Fälle",
    "",
  ];
  for (const f of report.failedCases) {
    lines.push(`### ${f.id}`, "", `- **Grund:** ${f.reason}`, `- **User:** ${f.userMessage.slice(0, 200)}`, "");
  }
  lines.push("## Vorgeschlagene Patches", "");
  for (const p of report.patches) {
    lines.push(`### ${p.id}`, "", `- ${p.rationale || report.opusRationale || ""}`, "```diff");
    const oldLines = p.find.split("\n");
    const newLines = p.replace.split("\n");
    const n = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < n; i += 1) {
      const o = oldLines[i] ?? "";
      const ne = newLines[i] ?? "";
      if (o !== ne) {
        lines.push(`-${o}`);
        lines.push(`+${ne}`);
      } else lines.push(` ${o}`);
    }
    lines.push("```", "");
  }
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
}

async function runApply(patchId: string): Promise<void> {
  const jsonPath = latestTuneReportJsonPath();
  if (!jsonPath) {
    console.error(`Keine tuning-report-*.json unter ${resolveScriptsDir()} gefunden.`);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as TuneReportJson;
  const patch = report.patches.find((p) => p.id === patchId);
  if (!patch || !patch.find) {
    console.error(`Patch id=${patchId} nicht gefunden in ${path.basename(jsonPath)}`);
    process.exit(1);
  }

  const current = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");
  if (!current.includes(patch.find)) {
    console.error("find-String kommt in system-prompt.ts nicht vor (Datei geändert?).");
    process.exit(1);
  }
  const next = current.replace(patch.find, patch.replace);

  console.log("Vorschau (erste Unterschiede Zeile für Zeile im Ersetzungsblock):");
  const oldL = patch.find.split("\n");
  const newL = patch.replace.split("\n");
  for (let i = 0; i < Math.max(oldL.length, newL.length); i += 1) {
    const o = oldL[i] ?? "";
    const n = newL[i] ?? "";
    if (o !== n) console.log(simpleDiffLine(o, n));
  }

  const ok = await promptYesNo("Patch anwenden? [y/N] ");
  if (!ok) {
    console.log("Abgebrochen.");
    return;
  }

  fs.writeFileSync(SYSTEM_PROMPT_PATH, next, "utf8");
  console.log(`Geschrieben: ${SYSTEM_PROMPT_PATH}`);
}

/**
 * Generiert Eval + Opus-Tuning-Report, schreibt JSON/MD unter scripts/tuning-report-* und liefert Inhalte für API/UI.
 */
export async function runTuneReportGeneration(
  client: Anthropic,
  options?: { caseId?: string | null },
): Promise<TuneReportResult> {
  const systemPromptSource = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");

  let cases: EvalTestCase[] | undefined;
  const caseId = options?.caseId?.trim() || null;
  if (caseId) {
    cases = TEST_CASES.filter((c) => c.id === caseId);
    if (cases.length === 0) {
      throw new Error(`Unbekannte case id: ${caseId}`);
    }
  }

  const summary = await runEvalSuite(client, cases ? { cases } : undefined);

  const failed = summary.failedCases;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonBasename = `tuning-report-${ts}.json`;
  const mdBasename = `tuning-report-${ts}.md`;
  const reportsDir = resolveScriptsDir();
  const jsonPath = path.join(reportsDir, jsonBasename);
  const mdPath = path.join(reportsDir, mdBasename);

  if (failed.length === 0) {
    const minimal: TuneReportJson = {
      timestamp: new Date().toISOString(),
      model: MODEL_IDS.opus,
      evalSummary: { passed: summary.passed, total: summary.total },
      systemPromptPath: SYSTEM_PROMPT_PATH,
      failedCases: [],
      patches: [],
    };
    fs.writeFileSync(jsonPath, JSON.stringify(minimal, null, 2), "utf8");
    writeMarkdownReport(minimal, mdPath);
    const mdContent = fs.readFileSync(mdPath, "utf8");
    return { report: minimal, mdContent, jsonBasename, mdBasename, reportsDir };
  }

  const aggregatedPatches: ProposedPatch[] = [];
  const rationales: string[] = [];
  for (const failure of failed) {
    const proposed = await proposePatchesWithOpus(client, systemPromptSource, [failure]);
    rationales.push(`[${failure.case.id}] ${proposed.rationale}`);
    for (const p of proposed.patches) {
      aggregatedPatches.push({
        id: `${failure.case.id}-${p.id}`,
        find: p.find,
        replace: p.replace,
        rationale: p.rationale,
      });
    }
  }

  const report: TuneReportJson = {
    timestamp: new Date().toISOString(),
    model: MODEL_IDS.opus,
    evalSummary: { passed: summary.passed, total: summary.total },
    systemPromptPath: SYSTEM_PROMPT_PATH,
    failedCases: failed.map((f) => ({
      id: f.case.id,
      userMessage: f.case.userMessage,
      reason: f.result.reason,
      tools: f.result.tools,
      finalTextPreview: f.result.finalText.slice(0, 500),
      observedTools: f.result.observedTools,
      driftDetail: f.result.driftDetail,
    })),
    patches: aggregatedPatches,
    opusRationale: rationales.join("\n\n"),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  writeMarkdownReport(report, mdPath);
  const mdContent = fs.readFileSync(mdPath, "utf8");
  return { report, mdContent, jsonBasename, mdBasename, reportsDir };
}

async function main() {
  const applyId = parseApplyPatchId();
  if (applyId) {
    await runApply(applyId);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is required");
    process.exit(1);
  }

  const caseId = parseArgCase();
  const client = new Anthropic({ apiKey });

  try {
    const { jsonBasename, mdBasename, report, reportsDir } = await runTuneReportGeneration(client, {
      caseId,
    });
    const jsonPath = path.join(reportsDir, jsonBasename);
    const mdPath = path.join(reportsDir, mdBasename);

    if (report.failedCases.length === 0) {
      console.log(`Alle Tests grün (${report.evalSummary.passed}/${report.evalSummary.total}). Kein Tuning nötig.`);
      console.log(`Leerer Report: ${jsonPath}`);
      return;
    }

    console.log(`Report geschrieben:\n  ${jsonPath}\n  ${mdPath}`);
    console.log(`Patches: ${report.patches.map((p) => p.id).join(", ") || "(keine)"}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

if (isCliEntry()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}