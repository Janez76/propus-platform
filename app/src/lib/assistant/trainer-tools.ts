/**
 * Trainer-Toolset — der „Trainer-Chat" im Training-Panel hat KEINEN Zugriff auf
 * Kunden-/Auftrags-Tools. Er kann ausschließlich:
 *
 *   - Few-Shots hinzufügen / deaktivieren
 *   - Negativ-Beispiele speichern
 *   - System-Prompt ändern (mit Version + Diff + Rollback)
 *   - Memory-Notizen anlegen
 *   - Eval starten / Letzte Ergebnisse holen
 *   - Letzte Trainer-Aktion zurücknehmen
 *
 * So kann die Trainer-KI nichts in echten Daten kaputt machen.
 */
import type { ToolDefinition, ToolHandler, ToolContext } from "@/lib/assistant/tools";
import {
  insertFewShot,
  deactivateFewShot,
  insertNegativeExample,
  appendPromptVersion,
  rollbackPromptToVersion,
  getActivePromptVersion,
  listPromptVersions,
  recordTrainerAction,
  listRecentTrainerActions,
  markTrainerActionReverted,
  listRecentEvalRuns,
  listEvalCaseResultsForRun,
  listAllFewShotsFromDb,
} from "@/lib/assistant/training-store";
import { createMemory } from "@/lib/assistant/memory-store";
import { runAssistantEvalSuite, serializeEvalSummary } from "@/lib/assistant/training-runner";
import {
  createEvalRun,
  finalizeEvalRun,
  insertEvalCaseResult,
} from "@/lib/assistant/training-store";

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}
function asArrayOfString(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter((x) => x.length > 0);
}
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64) || `shot-${Date.now()}`;
}

export const trainerTools: ToolDefinition[] = [
  {
    name: "add_few_shot",
    description:
      "Speichert ein neues positives Beispiel (Few-Shot) für den Hauptassistenten. Nutze das, wenn der Trainer-User ein gutes Antwortmuster festhalten will. Pflichtfelder: user_message, assistant_tool_plan, assistant_final. Tags optional. Slug wird automatisch generiert wenn fehlt.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Stabiler Key (klein, mit Bindestrichen). Optional — wird sonst automatisch erzeugt." },
        user_message: { type: "string" },
        assistant_tool_plan: { type: "string", description: "Welche Tools der Assistant in welcher Reihenfolge nutzen soll." },
        assistant_final: { type: "string", description: "Wie die finale Antwort aussehen soll (Stil, Ton, Länge)." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["user_message", "assistant_tool_plan", "assistant_final"],
    },
    kind: "write",
  },
  {
    name: "deactivate_few_shot",
    description: "Deaktiviert ein Few-Shot-Beispiel anhand seines slug.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
    kind: "write",
  },
  {
    name: "list_few_shots",
    description: "Listet alle Few-Shots in der DB (slug, tags, ob aktiv). Default nur aktive.",
    input_schema: {
      type: "object",
      properties: { include_inactive: { type: "boolean" } },
    },
    kind: "read",
  },
  {
    name: "add_negative_example",
    description:
      "Speichert ein 'so NICHT antworten'-Beispiel. Nutze das, wenn der Hauptassistent etwas falsch gemacht hat und du ihm zeigen willst, was nicht akzeptabel ist. Pflicht: user_message, bad_response, why_bad. better_hint optional.",
    input_schema: {
      type: "object",
      properties: {
        user_message: { type: "string" },
        bad_response: { type: "string" },
        why_bad: { type: "string" },
        better_hint: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["user_message", "bad_response", "why_bad"],
    },
    kind: "write",
  },
  {
    name: "get_active_system_prompt",
    description: "Gibt den aktuell aktiven System-Prompt-Body und seine Version zurück. Nutze das vor update_system_prompt, um den aktuellen Stand zu lesen.",
    input_schema: { type: "object", properties: {} },
    kind: "read",
  },
  {
    name: "list_system_prompt_versions",
    description: "Listet die letzten N System-Prompt-Versionen mit Changelog und Aktiv-Flag.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
    kind: "read",
  },
  {
    name: "update_system_prompt",
    description:
      "Schreibt eine neue Version des System-Prompts und aktiviert sie. body = vollständiger neuer Prompt-Text. changelog = kurze Begründung für die Historie. ACHTUNG: erst `get_active_system_prompt` lesen, dann gezielt anpassen, NICHT komplett neu erfinden. Diese Aktion erfordert Bestätigung des Users.",
    input_schema: {
      type: "object",
      properties: {
        body: { type: "string" },
        changelog: { type: "string" },
        diff_summary: { type: "string", description: "Kurzer Mensch-lesbarer Diff (z. B. 'Regel 4 verschärft')" },
      },
      required: ["body", "changelog"],
    },
    kind: "write",
    requiresConfirmation: true,
  },
  {
    name: "rollback_system_prompt",
    description: "Rollt den aktiven System-Prompt auf eine ältere Versionsnummer zurück.",
    input_schema: {
      type: "object",
      properties: { version: { type: "number" } },
      required: ["version"],
    },
    kind: "write",
    requiresConfirmation: true,
  },
  {
    name: "save_trainer_memory",
    description: "Legt eine dauerhafte Notiz für den Hauptassistenten an (gleiches Memory-System wie 'merk dir').",
    input_schema: {
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    },
    kind: "write",
  },
  {
    name: "run_eval",
    description: "Startet die Eval-Suite und gibt eine Zusammenfassung mit pass/fail pro Case zurück. Speichert das Ergebnis in der Eval-Run-Historie für Trend-Anzeige.",
    input_schema: { type: "object", properties: {} },
    kind: "read",
  },
  {
    name: "list_recent_eval_runs",
    description: "Letzte Eval-Läufe mit passed/total und Tokens. Für Trend-Sparkline.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
    kind: "read",
  },
  {
    name: "get_eval_run_details",
    description: "Pro Eval-Run: alle Case-Ergebnisse mit Tools und finalText.",
    input_schema: {
      type: "object",
      properties: { run_id: { type: "string" } },
      required: ["run_id"],
    },
    kind: "read",
  },
  {
    name: "list_recent_trainer_actions",
    description: "Letzte Aktionen des Trainers (für 'undo'). Liefert id, action, payload, ob revertet.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
    kind: "read",
  },
  {
    name: "revert_trainer_action",
    description:
      "Macht eine vorherige Trainer-Aktion rückgängig (z. B. add_few_shot deaktivieren, Prompt rollbacken). Funktioniert nur, wenn die Aktion noch nicht reverted wurde.",
    input_schema: {
      type: "object",
      properties: { action_id: { type: "string" } },
      required: ["action_id"],
    },
    kind: "write",
    requiresConfirmation: true,
  },
];

async function recordAndReturn(ctx: ToolContext, action: string, payload: unknown, result: unknown): Promise<unknown> {
  try {
    await recordTrainerAction({
      userId: ctx.userId,
      action,
      payload,
      result,
    });
  } catch (err) {
    console.warn("[trainer-tools] record action failed:", err);
  }
  return result;
}

export const trainerHandlers: Record<string, ToolHandler> = {
  add_few_shot: async (input, ctx) => {
    const userMessage = asString(input.user_message).trim();
    const plan = asString(input.assistant_tool_plan).trim();
    const final = asString(input.assistant_final).trim();
    const tags = asArrayOfString(input.tags);
    if (!userMessage || !plan || !final) {
      return { error: "user_message, assistant_tool_plan und assistant_final sind Pflicht" };
    }
    const slug = asString(input.slug).trim() || slugify(userMessage);
    const id = await insertFewShot({
      slug,
      userMessage,
      assistantToolPlan: plan,
      assistantFinal: final,
      tags,
      source: "trainer_chat",
      createdBy: ctx.userEmail,
    });
    return recordAndReturn(ctx, "add_few_shot", { slug, tags }, { ok: true, id, slug });
  },

  deactivate_few_shot: async (input, ctx) => {
    const slug = asString(input.slug).trim();
    if (!slug) return { error: "slug fehlt" };
    const ok = await deactivateFewShot(slug);
    return recordAndReturn(ctx, "deactivate_few_shot", { slug }, { ok });
  },

  list_few_shots: async (input) => {
    const includeInactive = input.include_inactive === true;
    const rows = await listAllFewShotsFromDb(includeInactive);
    return rows.map((r) => ({
      id: r.id,
      slug: (r as unknown as { slug?: string }).slug,
      user: r.user,
      tags: r.tags,
      isActive: r.isActive,
      source: r.source,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  },

  add_negative_example: async (input, ctx) => {
    const userMessage = asString(input.user_message).trim();
    const badResponse = asString(input.bad_response).trim();
    const whyBad = asString(input.why_bad).trim();
    if (!userMessage || !badResponse || !whyBad) {
      return { error: "user_message, bad_response und why_bad sind Pflicht" };
    }
    const id = await insertNegativeExample({
      userMessage,
      badResponse,
      whyBad,
      betterHint: asString(input.better_hint).trim() || null,
      tags: asArrayOfString(input.tags),
      source: "trainer_chat",
      createdBy: ctx.userEmail,
    });
    return recordAndReturn(ctx, "add_negative_example", { userMessage }, { ok: true, id });
  },

  get_active_system_prompt: async () => {
    const v = await getActivePromptVersion();
    if (!v) return { active: false, note: "Kein DB-Prompt aktiv — Code-Default wird verwendet." };
    return {
      active: true,
      version: v.version,
      body: v.body,
      changelog: v.changelog,
      createdBy: v.createdBy,
      createdAt: v.createdAt,
    };
  },

  list_system_prompt_versions: async (input) => {
    const limit = typeof input.limit === "number" ? input.limit : 10;
    const rows = await listPromptVersions(limit);
    return rows.map((r) => ({
      version: r.version,
      changelog: r.changelog,
      diffSummary: r.diffSummary,
      isActive: r.isActive,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  },

  update_system_prompt: async (input, ctx) => {
    const body = asString(input.body);
    const changelog = asString(input.changelog).trim();
    if (!body || body.length < 200) return { error: "body ist zu kurz (mind. 200 Zeichen)" };
    if (!changelog) return { error: "changelog (Begründung) ist Pflicht" };
    const v = await appendPromptVersion({
      body,
      changelog,
      diffSummary: asString(input.diff_summary).trim() || null,
      createdBy: ctx.userEmail,
      source: "trainer_chat",
      activate: true,
    });
    return recordAndReturn(
      ctx,
      "update_system_prompt",
      { changelog, diffSummary: asString(input.diff_summary).trim() || null },
      { ok: true, version: v.version, id: v.id },
    );
  },

  rollback_system_prompt: async (input, ctx) => {
    const version = typeof input.version === "number" ? input.version : NaN;
    if (!Number.isInteger(version) || version <= 0) return { error: "version (positive Zahl) fehlt" };
    const v = await rollbackPromptToVersion(version, ctx.userEmail);
    if (!v) return { error: `Version ${version} existiert nicht` };
    return recordAndReturn(ctx, "rollback_system_prompt", { version }, { ok: true, newVersion: v.version });
  },

  save_trainer_memory: async (input, ctx) => {
    const body = asString(input.body).trim();
    if (!body) return { error: "body fehlt" };
    const mem = await createMemory(ctx.userId, body, "admin_created");
    return recordAndReturn(ctx, "save_trainer_memory", { body }, { ok: true, id: mem.id });
  },

  run_eval: async (_input, ctx) => {
    const active = await getActivePromptVersion().catch(() => null);
    const runId = await createEvalRun(ctx.userEmail, active?.id ?? null);
    try {
      const summary = await runAssistantEvalSuite();
      for (const r of summary.results) {
        await insertEvalCaseResult({
          runId,
          caseId: r.id,
          passed: r.pass,
          reason: r.reason,
          tools: r.tools,
          model: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          finalText: r.finalText.slice(0, 4000),
        });
      }
      await finalizeEvalRun({
        runId,
        totalCases: summary.total,
        passedCases: summary.passed,
        totalInputTokens: summary.totalInputTokens,
        totalOutputTokens: summary.totalOutputTokens,
      });
      const ser = serializeEvalSummary(summary);
      return recordAndReturn(ctx, "run_eval", { runId }, {
        runId,
        passed: ser.passed,
        total: ser.total,
        failedCaseIds: ser.failedCaseIds,
        totalInputTokens: ser.totalInputTokens,
        totalOutputTokens: ser.totalOutputTokens,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await finalizeEvalRun({
        runId,
        totalCases: 0,
        passedCases: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        notes: `error: ${msg.slice(0, 200)}`,
      });
      return { error: `Eval fehlgeschlagen: ${msg.slice(0, 200)}`, runId };
    }
  },

  list_recent_eval_runs: async (input) => {
    const limit = typeof input.limit === "number" ? input.limit : 10;
    return listRecentEvalRuns(limit);
  },

  get_eval_run_details: async (input) => {
    const runId = asString(input.run_id).trim();
    if (!runId) return { error: "run_id fehlt" };
    return listEvalCaseResultsForRun(runId);
  },

  list_recent_trainer_actions: async (input, ctx) => {
    const limit = typeof input.limit === "number" ? input.limit : 20;
    return listRecentTrainerActions(ctx.userId, limit);
  },

  revert_trainer_action: async (input, ctx) => {
    const id = asString(input.action_id).trim();
    if (!id) return { error: "action_id fehlt" };
    const all = await listRecentTrainerActions(ctx.userId, 100);
    const target = all.find((a) => a.id === id);
    if (!target) return { error: `Aktion ${id} nicht gefunden` };
    if (target.revertedAt) return { error: "Aktion ist bereits zurückgenommen" };

    let revertResult: unknown = { reverted: false };
    try {
      switch (target.action) {
        case "add_few_shot": {
          const slug = (target.payload as { slug?: string })?.slug;
          if (slug) revertResult = { reverted: true, deactivatedSlug: slug, ok: await deactivateFewShot(slug) };
          break;
        }
        case "update_system_prompt": {
          const versions = await listPromptVersions(20);
          // aktive Version ist die jüngste — eins zurück
          const active = versions.find((v) => v.isActive);
          const previous = versions.find((v) => !v.isActive && (active ? v.version < active.version : true));
          if (previous) {
            const v = await rollbackPromptToVersion(previous.version, ctx.userEmail);
            revertResult = { reverted: !!v, newVersion: v?.version };
          }
          break;
        }
        case "rollback_system_prompt": {
          // Rollback eines Rollbacks → auf vorletzte Version zurück
          const versions = await listPromptVersions(20);
          const active = versions.find((v) => v.isActive);
          const target2 = versions.find((v) => !v.isActive && (active ? v.version < active.version : true));
          if (target2) {
            const v = await rollbackPromptToVersion(target2.version, ctx.userEmail);
            revertResult = { reverted: !!v, newVersion: v?.version };
          }
          break;
        }
        case "save_trainer_memory":
        case "add_negative_example":
          revertResult = { reverted: false, note: "Diese Aktion wird derzeit nicht automatisch revertet — bitte manuell entfernen." };
          break;
        default:
          revertResult = { reverted: false, note: `Aktion ${target.action} hat keine Revert-Logik` };
      }
      await markTrainerActionReverted(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: `Revert fehlgeschlagen: ${msg.slice(0, 200)}` };
    }
    return revertResult;
  },
};
