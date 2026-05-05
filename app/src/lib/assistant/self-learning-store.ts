/**
 * DB-Layer für Self-Learning: Implicit Signals, Suggestions, Auto-Tune-Runs,
 * Settings. Wird von:
 *   - `implicit-detector.ts` (Schreib-Pfad nach jedem Assistant-Turn)
 *   - `self-learning-aggregator.ts` (Verdichtung Roh → Suggestion)
 *   - `self-learning-runner.ts` (Nightly Auto-Tune)
 *   - `app/src/app/api/assistant/training/self-learning/*` (Panel-UI)
 * verwendet.
 */
import { query, queryOne } from "@/lib/db";

export type ImplicitSignalType =
  | "thanks"
  | "correction"
  | "repeat"
  | "topic_shift"
  | "tool_error_loop"
  | "follow_up";

export type ImplicitSignal = {
  id: string;
  conversationId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  userId: string;
  signalType: ImplicitSignalType;
  polarity: -1 | 0 | 1;
  confidence: number;
  userMessageText: string | null;
  assistantText: string | null;
  evidence: unknown;
  processedAt: string | null;
  createdAt: string;
};

export type SuggestionKind = "add_few_shot" | "add_negative" | "tune_prompt" | "replay_harvest";
export type SuggestionStatus = "pending" | "accepted" | "rejected" | "auto_applied";

export type SelfLearningSuggestion = {
  id: string;
  kind: SuggestionKind;
  status: SuggestionStatus;
  confidence: number;
  signalCount: number;
  preview: Record<string, unknown>;
  supportingSignals: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type SelfLearningRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: "cron" | "manual" | "webhook";
  baselinePassRate: number | null;
  candidatePassRate: number | null;
  decision: "activated" | "rejected" | "no_change" | "error" | "paused_stop_loss" | null;
  promptVersionId: string | null;
  signalWindowHours: number;
  signalsProcessed: number;
  notes: string | null;
  errorText: string | null;
};

export type SelfLearningSettings = {
  implicitFeedbackEnabled: boolean;
  autoTuneEnabled: boolean;
  autoTuneCron: string;
  minSignalConfidence: number;
  protectedCaseIds: string[];
  maxAutoActivations24h: number;
  maxAutoActivations7d: number;
  consecutiveFailures: number;
  pausedUntil: string | null;
  notifyEmail: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

// ── Settings ────────────────────────────────────────────────────────────────

export async function getSelfLearningSettings(): Promise<SelfLearningSettings> {
  const row = await queryOne<SelfLearningSettings>(
    `SELECT implicit_feedback_enabled AS "implicitFeedbackEnabled",
            auto_tune_enabled         AS "autoTuneEnabled",
            auto_tune_cron            AS "autoTuneCron",
            min_signal_confidence::float8 AS "minSignalConfidence",
            protected_case_ids        AS "protectedCaseIds",
            max_auto_activations_24h  AS "maxAutoActivations24h",
            max_auto_activations_7d   AS "maxAutoActivations7d",
            consecutive_failures      AS "consecutiveFailures",
            paused_until              AS "pausedUntil",
            notify_email              AS "notifyEmail",
            updated_at                AS "updatedAt",
            updated_by                AS "updatedBy"
     FROM tour_manager.assistant_self_learning_settings
     WHERE id = 1`,
  );
  if (row) return row;
  // Defensive: Falls Row nicht existiert (Migration noch nicht durch) → Default
  return {
    implicitFeedbackEnabled: true,
    autoTuneEnabled: false,
    autoTuneCron: "0 3 * * *",
    minSignalConfidence: 0.7,
    protectedCaseIds: [
      "smalltalk-greeting",
      "german-only",
      "email-send",
      "weather-honest",
      "routing-honest",
      "no-hallu-id",
    ],
    maxAutoActivations24h: 1,
    maxAutoActivations7d: 3,
    consecutiveFailures: 0,
    pausedUntil: null,
    notifyEmail: null,
    updatedAt: new Date().toISOString(),
    updatedBy: null,
  };
}

export async function updateSelfLearningSettings(
  patch: Partial<Pick<SelfLearningSettings,
    "implicitFeedbackEnabled" | "autoTuneEnabled" | "autoTuneCron" |
    "minSignalConfidence" | "maxAutoActivations24h" | "maxAutoActivations7d" |
    "notifyEmail">>,
  updatedBy: string | null,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.implicitFeedbackEnabled !== undefined) { sets.push(`implicit_feedback_enabled = $${i++}`); vals.push(patch.implicitFeedbackEnabled); }
  if (patch.autoTuneEnabled !== undefined) { sets.push(`auto_tune_enabled = $${i++}`); vals.push(patch.autoTuneEnabled); }
  if (patch.autoTuneCron !== undefined) { sets.push(`auto_tune_cron = $${i++}`); vals.push(patch.autoTuneCron); }
  if (patch.minSignalConfidence !== undefined) { sets.push(`min_signal_confidence = $${i++}`); vals.push(patch.minSignalConfidence); }
  if (patch.maxAutoActivations24h !== undefined) { sets.push(`max_auto_activations_24h = $${i++}`); vals.push(patch.maxAutoActivations24h); }
  if (patch.maxAutoActivations7d !== undefined) { sets.push(`max_auto_activations_7d = $${i++}`); vals.push(patch.maxAutoActivations7d); }
  if (patch.notifyEmail !== undefined) { sets.push(`notify_email = $${i++}`); vals.push(patch.notifyEmail); }
  if (sets.length === 0) return;
  sets.push(`updated_at = NOW()`);
  sets.push(`updated_by = $${i++}`); vals.push(updatedBy);
  await query(
    `UPDATE tour_manager.assistant_self_learning_settings
     SET ${sets.join(", ")}
     WHERE id = 1`,
    vals,
  );
}

export async function setStopLossPaused(until: Date | null): Promise<void> {
  await query(
    `UPDATE tour_manager.assistant_self_learning_settings
     SET paused_until = $1, updated_at = NOW()
     WHERE id = 1`,
    [until],
  );
}

export async function bumpConsecutiveFailures(delta: number): Promise<number> {
  const row = await queryOne<{ counter: number }>(
    `UPDATE tour_manager.assistant_self_learning_settings
     SET consecutive_failures = GREATEST(consecutive_failures + $1, 0),
         updated_at = NOW()
     WHERE id = 1
     RETURNING consecutive_failures AS counter`,
    [delta],
  );
  return row?.counter ?? 0;
}

export async function resetConsecutiveFailures(): Promise<void> {
  await query(
    `UPDATE tour_manager.assistant_self_learning_settings
     SET consecutive_failures = 0, updated_at = NOW()
     WHERE id = 1`,
  );
}

// ── Implicit Signals ────────────────────────────────────────────────────────

export async function insertImplicitSignal(input: {
  conversationId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  userId: string;
  signalType: ImplicitSignalType;
  polarity: -1 | 0 | 1;
  confidence: number;
  userMessageText: string | null;
  assistantText: string | null;
  evidence?: unknown;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO tour_manager.assistant_implicit_signals
       (conversation_id, user_message_id, assistant_message_id, user_id,
        signal_type, polarity, confidence, user_message_text, assistant_text, evidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING id::text AS id`,
    [
      input.conversationId,
      input.userMessageId,
      input.assistantMessageId,
      input.userId,
      input.signalType,
      input.polarity,
      input.confidence,
      input.userMessageText,
      input.assistantText,
      JSON.stringify(input.evidence ?? {}),
    ],
  );
  return row?.id ?? "";
}

export async function listUnprocessedSignals(limit = 200): Promise<ImplicitSignal[]> {
  return query<ImplicitSignal>(
    `SELECT id::text AS id,
            conversation_id::text AS "conversationId",
            user_message_id::text AS "userMessageId",
            assistant_message_id::text AS "assistantMessageId",
            user_id AS "userId",
            signal_type AS "signalType",
            polarity,
            confidence::float8 AS confidence,
            user_message_text AS "userMessageText",
            assistant_text AS "assistantText",
            evidence,
            processed_at AS "processedAt",
            created_at AS "createdAt"
     FROM tour_manager.assistant_implicit_signals
     WHERE processed_at IS NULL
     ORDER BY created_at
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 1000)],
  );
}

export async function markSignalsProcessed(signalIds: string[]): Promise<void> {
  if (signalIds.length === 0) return;
  await query(
    `UPDATE tour_manager.assistant_implicit_signals
     SET processed_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [signalIds],
  );
}

export async function countSignalsSince(since: Date): Promise<{ positive: number; negative: number }> {
  const row = await queryOne<{ positive: string; negative: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE polarity = 1)::text  AS positive,
       COUNT(*) FILTER (WHERE polarity = -1)::text AS negative
     FROM tour_manager.assistant_implicit_signals
     WHERE created_at >= $1`,
    [since],
  );
  return {
    positive: Number(row?.positive ?? 0),
    negative: Number(row?.negative ?? 0),
  };
}

// ── Suggestions ─────────────────────────────────────────────────────────────

export async function insertSuggestion(input: {
  kind: SuggestionKind;
  confidence: number;
  signalCount: number;
  preview: Record<string, unknown>;
  supportingSignals: string[];
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO tour_manager.assistant_self_learning_suggestions
       (kind, confidence, signal_count, preview, supporting_signals)
     VALUES ($1, $2, $3, $4::jsonb, $5::uuid[])
     RETURNING id::text AS id`,
    [
      input.kind,
      input.confidence,
      input.signalCount,
      JSON.stringify(input.preview),
      input.supportingSignals,
    ],
  );
  return row?.id ?? "";
}

export async function listSuggestions(status: SuggestionStatus | "all", limit = 50): Promise<SelfLearningSuggestion[]> {
  const where = status === "all" ? "TRUE" : "status = $1";
  const params: unknown[] = status === "all" ? [Math.min(Math.max(limit, 1), 200)] : [status, Math.min(Math.max(limit, 1), 200)];
  const limitParam = status === "all" ? "$1" : "$2";
  return query<SelfLearningSuggestion>(
    `SELECT id::text AS id, kind, status,
            confidence::float8 AS confidence,
            signal_count AS "signalCount",
            preview,
            ARRAY(SELECT s::text FROM unnest(supporting_signals) s) AS "supportingSignals",
            reviewed_by AS "reviewedBy",
            reviewed_at AS "reviewedAt",
            created_at AS "createdAt"
     FROM tour_manager.assistant_self_learning_suggestions
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT ${limitParam}`,
    params,
  );
}

export async function setSuggestionStatus(input: {
  id: string;
  status: SuggestionStatus;
  reviewedBy: string | null;
}): Promise<void> {
  await query(
    `UPDATE tour_manager.assistant_self_learning_suggestions
     SET status = $2,
         reviewed_by = COALESCE($3, reviewed_by),
         reviewed_at = NOW()
     WHERE id = $1`,
    [input.id, input.status, input.reviewedBy],
  );
}

export async function getSuggestion(id: string): Promise<SelfLearningSuggestion | null> {
  return queryOne<SelfLearningSuggestion>(
    `SELECT id::text AS id, kind, status,
            confidence::float8 AS confidence,
            signal_count AS "signalCount",
            preview,
            ARRAY(SELECT s::text FROM unnest(supporting_signals) s) AS "supportingSignals",
            reviewed_by AS "reviewedBy",
            reviewed_at AS "reviewedAt",
            created_at AS "createdAt"
     FROM tour_manager.assistant_self_learning_suggestions
     WHERE id = $1`,
    [id],
  );
}

// ── Auto-Tune-Runs ──────────────────────────────────────────────────────────

export async function startSelfLearningRun(input: {
  trigger: "cron" | "manual" | "webhook";
  signalWindowHours: number;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO tour_manager.assistant_self_learning_runs
       (trigger, signal_window_hours)
     VALUES ($1, $2)
     RETURNING id::text AS id`,
    [input.trigger, input.signalWindowHours],
  );
  return row?.id ?? "";
}

export async function finalizeSelfLearningRun(input: {
  id: string;
  baselinePassRate: number | null;
  candidatePassRate: number | null;
  decision: SelfLearningRun["decision"];
  promptVersionId: string | null;
  signalsProcessed: number;
  notes?: string | null;
  errorText?: string | null;
}): Promise<void> {
  await query(
    `UPDATE tour_manager.assistant_self_learning_runs
     SET finished_at = NOW(),
         baseline_pass_rate = $2,
         candidate_pass_rate = $3,
         decision = $4,
         prompt_version_id = $5,
         signals_processed = $6,
         notes = $7,
         error_text = $8
     WHERE id = $1`,
    [
      input.id,
      input.baselinePassRate,
      input.candidatePassRate,
      input.decision,
      input.promptVersionId,
      input.signalsProcessed,
      input.notes ?? null,
      input.errorText ?? null,
    ],
  );
}

export async function listRecentSelfLearningRuns(limit = 20): Promise<SelfLearningRun[]> {
  return query<SelfLearningRun>(
    `SELECT id::text AS id,
            started_at AS "startedAt",
            finished_at AS "finishedAt",
            trigger,
            baseline_pass_rate::float8 AS "baselinePassRate",
            candidate_pass_rate::float8 AS "candidatePassRate",
            decision,
            prompt_version_id::text AS "promptVersionId",
            signal_window_hours AS "signalWindowHours",
            signals_processed AS "signalsProcessed",
            notes,
            error_text AS "errorText"
     FROM tour_manager.assistant_self_learning_runs
     ORDER BY started_at DESC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
}

export async function countAutoActivationsSince(since: Date): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM tour_manager.assistant_self_learning_runs
     WHERE started_at >= $1 AND decision = 'activated'`,
    [since],
  );
  return Number(row?.count ?? 0);
}
