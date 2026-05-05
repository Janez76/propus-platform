/**
 * DB-Layer für Live-Training (Few-Shots, Negativ-Beispiele, Prompt-Versionen,
 * Eval-Runs, Trainer-Audit). Code-FEW_SHOTS in `few-shot-examples.ts` dient als
 * Fallback, wenn die DB leer ist (frische Installation).
 */
import { query, queryOne } from "@/lib/db";
import type { FewShot } from "@/lib/assistant/few-shot-examples";

export type DbFewShot = FewShot & {
  source: "seed" | "admin_ui" | "trainer_chat" | "feedback_thumb";
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NegativeExample = {
  id: string;
  userMessage: string;
  badResponse: string;
  whyBad: string;
  betterHint: string | null;
  tags: string[];
  isActive: boolean;
  createdAt: string;
};

export type PromptVersion = {
  id: string;
  version: number;
  body: string;
  changelog: string;
  diffSummary: string | null;
  createdBy: string | null;
  source: "seed" | "trainer_chat" | "admin_ui" | "auto_tuner";
  isActive: boolean;
  createdAt: string;
};

export type EvalRunRow = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string | null;
  totalCases: number;
  passedCases: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  promptVersionId: string | null;
  notes: string | null;
};

export type EvalCaseResultRow = {
  id: string;
  runId: string;
  caseId: string;
  passed: boolean;
  reason: string | null;
  tools: string[];
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  finalText: string | null;
  createdAt: string;
};

// ── Few-Shots ────────────────────────────────────────────────────────────────

/**
 * Idempotent: spielt die Code-Defaults als DB-Rows ein, **falls die Tabelle leer ist**.
 * Wird einmal pro Server-Lifetime geprüft (in-memory Flag), damit nicht jeder
 * Request einen COUNT(*) macht. Auf einer normalen Boot-Sequenz also 1 zusätzliche
 * Query.
 */
let _seedCheckedThisProcess = false;
export async function ensureFewShotSeed(
  defaults: Array<{ id: string; user: string; assistantToolPlan: string; assistantFinal: string; tags: string[] }>,
): Promise<{ seeded: number }> {
  if (_seedCheckedThisProcess) return { seeded: 0 };
  _seedCheckedThisProcess = true;
  try {
    const row = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM tour_manager.assistant_few_shots`,
    );
    if (Number(row?.count || 0) > 0) return { seeded: 0 };
    let n = 0;
    for (const d of defaults) {
      try {
        await query(
          `INSERT INTO tour_manager.assistant_few_shots
             (slug, user_message, assistant_tool_plan, assistant_final, tags, source, created_by)
           VALUES ($1, $2, $3, $4, $5, 'seed', 'code-default')
           ON CONFLICT (slug) DO NOTHING`,
          [d.id, d.user, d.assistantToolPlan, d.assistantFinal, d.tags],
        );
        n += 1;
      } catch (err) {
        console.warn("[training-store] seed insert failed:", err);
      }
    }
    return { seeded: n };
  } catch (err) {
    console.warn("[training-store] ensureFewShotSeed failed:", err);
    _seedCheckedThisProcess = false; // erneut probieren
    return { seeded: 0 };
  }
}

export async function listActiveFewShotsFromDb(): Promise<DbFewShot[]> {
  return query<DbFewShot>(
    `SELECT id::text AS id,
            slug AS slug,
            user_message AS user,
            assistant_tool_plan AS "assistantToolPlan",
            assistant_final AS "assistantFinal",
            tags,
            source,
            is_active AS "isActive",
            created_by AS "createdBy",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM tour_manager.assistant_few_shots
     WHERE is_active = TRUE
     ORDER BY updated_at DESC
     LIMIT 200`,
  ).then((rows) =>
    rows.map((r) => ({
      ...r,
      // selectFewShots erwartet stabile id (nehmen slug, fallback auf uuid)
      id: (r as unknown as { slug?: string }).slug || r.id,
    })),
  );
}

export async function listAllFewShotsFromDb(includeInactive: boolean): Promise<DbFewShot[]> {
  const where = includeInactive ? "TRUE" : "is_active = TRUE";
  return query<DbFewShot>(
    `SELECT id::text AS id,
            slug AS slug,
            user_message AS user,
            assistant_tool_plan AS "assistantToolPlan",
            assistant_final AS "assistantFinal",
            tags,
            source,
            is_active AS "isActive",
            created_by AS "createdBy",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM tour_manager.assistant_few_shots
     WHERE ${where}
     ORDER BY updated_at DESC
     LIMIT 500`,
  );
}

export async function insertFewShot(input: {
  slug: string;
  userMessage: string;
  assistantToolPlan: string;
  assistantFinal: string;
  tags: string[];
  source: "seed" | "admin_ui" | "trainer_chat" | "feedback_thumb";
  createdBy: string | null;
  sourceConversation?: string | null;
  sourceMessage?: string | null;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO tour_manager.assistant_few_shots
       (slug, user_message, assistant_tool_plan, assistant_final, tags, source,
        created_by, source_conversation, source_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (slug) DO UPDATE SET
       user_message = EXCLUDED.user_message,
       assistant_tool_plan = EXCLUDED.assistant_tool_plan,
       assistant_final = EXCLUDED.assistant_final,
       tags = EXCLUDED.tags,
       is_active = TRUE
     RETURNING id::text AS id`,
    [
      input.slug,
      input.userMessage,
      input.assistantToolPlan,
      input.assistantFinal,
      input.tags,
      input.source,
      input.createdBy,
      input.sourceConversation ?? null,
      input.sourceMessage ?? null,
    ],
  );
  return row?.id ?? "";
}

export async function deactivateFewShot(slug: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE tour_manager.assistant_few_shots
     SET is_active = FALSE
     WHERE slug = $1
     RETURNING id::text AS id`,
    [slug],
  );
  return !!row;
}

// ── Negativ-Beispiele ────────────────────────────────────────────────────────

export async function insertNegativeExample(input: {
  userMessage: string;
  badResponse: string;
  whyBad: string;
  betterHint?: string | null;
  tags?: string[];
  source: "admin_ui" | "trainer_chat" | "feedback_thumb";
  createdBy: string | null;
  sourceConversation?: string | null;
  sourceMessage?: string | null;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO tour_manager.assistant_negative_examples
       (user_message, bad_response, why_bad, better_hint, tags, source,
        created_by, source_conversation, source_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id::text AS id`,
    [
      input.userMessage,
      input.badResponse,
      input.whyBad,
      input.betterHint ?? null,
      input.tags ?? [],
      input.source,
      input.createdBy,
      input.sourceConversation ?? null,
      input.sourceMessage ?? null,
    ],
  );
  return row?.id ?? "";
}

export async function listActiveNegativeExamples(limit = 30): Promise<NegativeExample[]> {
  return query<NegativeExample>(
    `SELECT id::text AS id,
            user_message AS "userMessage",
            bad_response AS "badResponse",
            why_bad AS "whyBad",
            better_hint AS "betterHint",
            tags,
            is_active AS "isActive",
            created_at AS "createdAt"
     FROM tour_manager.assistant_negative_examples
     WHERE is_active = TRUE
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
}

// ── Prompt-Versionen ─────────────────────────────────────────────────────────

export async function getActivePromptVersion(): Promise<PromptVersion | null> {
  return queryOne<PromptVersion>(
    `SELECT id::text AS id, version, body, changelog, diff_summary AS "diffSummary",
            created_by AS "createdBy", source, is_active AS "isActive",
            created_at AS "createdAt"
     FROM tour_manager.assistant_prompt_versions
     WHERE is_active = TRUE
     LIMIT 1`,
  );
}

export async function listPromptVersions(limit = 30): Promise<PromptVersion[]> {
  return query<PromptVersion>(
    `SELECT id::text AS id, version, body, changelog, diff_summary AS "diffSummary",
            created_by AS "createdBy", source, is_active AS "isActive",
            created_at AS "createdAt"
     FROM tour_manager.assistant_prompt_versions
     ORDER BY version DESC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
}

export async function appendPromptVersion(input: {
  body: string;
  changelog: string;
  diffSummary?: string | null;
  createdBy: string | null;
  source: "seed" | "trainer_chat" | "admin_ui" | "auto_tuner";
  activate: boolean;
}): Promise<PromptVersion> {
  const max = await queryOne<{ max: number | null }>(
    `SELECT MAX(version) AS max FROM tour_manager.assistant_prompt_versions`,
  );
  const nextVersion = (max?.max ?? 0) + 1;

  if (input.activate) {
    await query(`UPDATE tour_manager.assistant_prompt_versions SET is_active = FALSE WHERE is_active = TRUE`);
  }

  const row = await queryOne<PromptVersion>(
    `INSERT INTO tour_manager.assistant_prompt_versions
       (version, body, changelog, diff_summary, created_by, source, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id::text AS id, version, body, changelog, diff_summary AS "diffSummary",
               created_by AS "createdBy", source, is_active AS "isActive",
               created_at AS "createdAt"`,
    [
      nextVersion,
      input.body,
      input.changelog,
      input.diffSummary ?? null,
      input.createdBy,
      input.source,
      input.activate,
    ],
  );
  return row!;
}

export async function rollbackPromptToVersion(version: number, byUser: string | null): Promise<PromptVersion | null> {
  const target = await queryOne<PromptVersion>(
    `SELECT id::text AS id, version, body, changelog, diff_summary AS "diffSummary",
            created_by AS "createdBy", source, is_active AS "isActive",
            created_at AS "createdAt"
     FROM tour_manager.assistant_prompt_versions WHERE version = $1`,
    [version],
  );
  if (!target) return null;
  return appendPromptVersion({
    body: target.body,
    changelog: `Rollback auf Version ${version}`,
    diffSummary: `Rollback auf v${version} (urspr. von ${target.createdBy ?? "?"})`,
    createdBy: byUser,
    source: "trainer_chat",
    activate: true,
  });
}

// ── Eval-Runs ────────────────────────────────────────────────────────────────

export async function createEvalRun(triggeredBy: string | null, promptVersionId: string | null): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO tour_manager.assistant_eval_runs (triggered_by, prompt_version_id)
     VALUES ($1, $2)
     RETURNING id::text AS id`,
    [triggeredBy, promptVersionId],
  );
  return row?.id ?? "";
}

export async function finalizeEvalRun(input: {
  runId: string;
  totalCases: number;
  passedCases: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  notes?: string | null;
}): Promise<void> {
  await query(
    `UPDATE tour_manager.assistant_eval_runs
     SET finished_at = NOW(),
         total_cases = $2,
         passed_cases = $3,
         total_input_tokens = $4,
         total_output_tokens = $5,
         notes = $6
     WHERE id = $1`,
    [
      input.runId,
      input.totalCases,
      input.passedCases,
      input.totalInputTokens,
      input.totalOutputTokens,
      input.notes ?? null,
    ],
  );
}

export async function insertEvalCaseResult(input: {
  runId: string;
  caseId: string;
  passed: boolean;
  reason: string | null;
  tools: string[];
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  finalText: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO tour_manager.assistant_eval_case_results
       (run_id, case_id, passed, reason, tools, model, input_tokens, output_tokens, final_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.runId,
      input.caseId,
      input.passed,
      input.reason,
      input.tools,
      input.model,
      input.inputTokens,
      input.outputTokens,
      input.finalText,
    ],
  );
}

export async function listRecentEvalRuns(limit = 10): Promise<EvalRunRow[]> {
  return query<EvalRunRow>(
    `SELECT id::text AS id,
            started_at AS "startedAt",
            finished_at AS "finishedAt",
            triggered_by AS "triggeredBy",
            total_cases AS "totalCases",
            passed_cases AS "passedCases",
            total_input_tokens AS "totalInputTokens",
            total_output_tokens AS "totalOutputTokens",
            prompt_version_id::text AS "promptVersionId",
            notes
     FROM tour_manager.assistant_eval_runs
     WHERE finished_at IS NOT NULL
     ORDER BY started_at DESC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
}

export async function listEvalCaseResultsForRun(runId: string): Promise<EvalCaseResultRow[]> {
  return query<EvalCaseResultRow>(
    `SELECT id::text AS id,
            run_id::text AS "runId",
            case_id AS "caseId",
            passed,
            reason,
            tools,
            model,
            input_tokens AS "inputTokens",
            output_tokens AS "outputTokens",
            final_text AS "finalText",
            created_at AS "createdAt"
     FROM tour_manager.assistant_eval_case_results
     WHERE run_id = $1
     ORDER BY case_id`,
    [runId],
  );
}

// ── Trainer-Audit ────────────────────────────────────────────────────────────

export async function recordTrainerAction(input: {
  userId: string;
  action: string;
  payload: unknown;
  result: unknown;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO tour_manager.assistant_trainer_actions (user_id, action, payload, result)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id::text AS id`,
    [input.userId, input.action, JSON.stringify(input.payload ?? {}), JSON.stringify(input.result ?? {})],
  );
  return row?.id ?? "";
}

export async function listRecentTrainerActions(userId: string, limit = 20): Promise<
  Array<{
    id: string;
    action: string;
    payload: unknown;
    result: unknown;
    revertedAt: string | null;
    createdAt: string;
  }>
> {
  return query(
    `SELECT id::text AS id, action, payload, result,
            reverted_at AS "revertedAt", created_at AS "createdAt"
     FROM tour_manager.assistant_trainer_actions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, Math.min(Math.max(limit, 1), 100)],
  );
}

export async function markTrainerActionReverted(id: string): Promise<void> {
  await query(`UPDATE tour_manager.assistant_trainer_actions SET reverted_at = NOW() WHERE id = $1`, [id]);
}
