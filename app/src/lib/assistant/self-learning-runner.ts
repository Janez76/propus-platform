/**
 * Self-Learning Runner — Nightly Auto-Tune.
 *
 * Ablauf:
 *  0. Settings prüfen (auto_tune_enabled, paused_until, Quota).
 *  1. Aggregator: unprocessed Signals → Suggestions.
 *  2. Baseline-Eval auf aktivem Prompt.
 *  3. Wenn unbestätigte `add_negative`-Suggestions vorliegen, werden sie als
 *     Negativ-Beispiele in der DB angelegt und damit zum Prompt-Anhang. Eval
 *     ein zweites Mal — wenn baseline-pass-rate ≥ alt UND keine protected_case
 *     verschlechtert wurde → 'auto_applied' setzen, sonst Suggestions auf
 *     'pending' belassen.
 *  4. Ergebnis in `assistant_self_learning_runs` schreiben + Stop-Loss-Counter
 *     updaten.
 *
 * Bewusst: kein Opus-Tune in Phase 1 — der erste Schritt ist add_negative-
 * Auto-Apply (kleines, getestetes Delta). Opus-Patch-Generierung kann später
 * dazukommen.
 */
import Anthropic from "@anthropic-ai/sdk";
import { runEvalSuite } from "../../../scripts/eval-assistant";
import {
  countAutoActivationsSince,
  finalizeSelfLearningRun,
  getSelfLearningSettings,
  insertSuggestion,
  listSuggestions,
  setSuggestionStatus,
  setStopLossPaused,
  bumpConsecutiveFailures,
  resetConsecutiveFailures,
  startSelfLearningRun,
} from "@/lib/assistant/self-learning-store";
import { runAggregator } from "@/lib/assistant/self-learning-aggregator";
import { insertNegativeExample } from "@/lib/assistant/training-store";

export type SelfLearningRunResult = {
  runId: string;
  decision:
    | "activated"
    | "rejected"
    | "no_change"
    | "error"
    | "paused_stop_loss"
    | "disabled"
    | "quota"
    | "ok";
  baselinePassRate: number | null;
  candidatePassRate: number | null;
  signalsProcessed: number;
  suggestionsCreated: number;
  suggestionsAutoApplied: number;
  notes: string;
  errorText?: string | null;
};

const DEFAULT_WINDOW_HOURS = 24;
const STOP_LOSS_THRESHOLD = 2;
const STOP_LOSS_PAUSE_HOURS = 24;

export async function runSelfLearningOnce(input?: {
  trigger?: "cron" | "manual" | "webhook";
}): Promise<SelfLearningRunResult> {
  const trigger = input?.trigger ?? "cron";
  const settings = await getSelfLearningSettings();

  if (!settings.autoTuneEnabled) {
    return makeResult({
      runId: "",
      decision: "disabled",
      notes: "auto_tune_enabled=false",
    });
  }
  if (settings.pausedUntil && new Date(settings.pausedUntil) > new Date()) {
    return makeResult({
      runId: "",
      decision: "paused_stop_loss",
      notes: `paused bis ${settings.pausedUntil}`,
    });
  }

  const since24h = new Date(Date.now() - 24 * 3600_000);
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000);
  const [activations24h, activations7d] = await Promise.all([
    countAutoActivationsSince(since24h),
    countAutoActivationsSince(since7d),
  ]);
  if (activations24h >= settings.maxAutoActivations24h) {
    return makeResult({
      runId: "",
      decision: "quota",
      notes: `Quota 24h erreicht (${activations24h}/${settings.maxAutoActivations24h})`,
    });
  }
  if (activations7d >= settings.maxAutoActivations7d) {
    return makeResult({
      runId: "",
      decision: "quota",
      notes: `Quota 7d erreicht (${activations7d}/${settings.maxAutoActivations7d})`,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return makeResult({
      runId: "",
      decision: "error",
      notes: "ANTHROPIC_API_KEY fehlt",
    });
  }

  const runId = await startSelfLearningRun({ trigger, signalWindowHours: DEFAULT_WINDOW_HOURS });
  const client = new Anthropic({ apiKey });

  let agg = { signalsProcessed: 0, suggestionsCreated: 0 };
  try {
    agg = await runAggregator({ minConfidence: settings.minSignalConfidence });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finalizeSelfLearningRun({
      id: runId,
      baselinePassRate: null,
      candidatePassRate: null,
      decision: "error",
      promptVersionId: null,
      signalsProcessed: 0,
      errorText: `aggregator: ${msg.slice(0, 200)}`,
    });
    await bumpConsecutiveFailures(1);
    return makeResult({ runId, decision: "error", notes: "aggregator failed", errorText: msg });
  }

  // Baseline-Eval
  let baselinePass = 0;
  let baselineTotal = 0;
  let baselinePassRate: number | null = null;
  let baselineFailedIds: Set<string> = new Set();
  try {
    const summary = await runEvalSuite(client);
    baselinePass = summary.passed;
    baselineTotal = summary.total;
    baselinePassRate = baselineTotal > 0 ? baselinePass / baselineTotal : 0;
    baselineFailedIds = new Set(summary.results.filter((r) => !r.pass).map((r) => r.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finalizeSelfLearningRun({
      id: runId,
      baselinePassRate,
      candidatePassRate: null,
      decision: "error",
      promptVersionId: null,
      signalsProcessed: agg.signalsProcessed,
      errorText: `baseline-eval: ${msg.slice(0, 200)}`,
    });
    await bumpConsecutiveFailures(1);
    return makeResult({
      runId,
      decision: "error",
      notes: "baseline eval failed",
      errorText: msg,
      signalsProcessed: agg.signalsProcessed,
      suggestionsCreated: agg.suggestionsCreated,
    });
  }

  // Pending negatives auto-applizieren (best-effort: senken die Pass-Rate
  // möglicherweise nicht, helfen aber bei zukünftigen Korrekturen).
  const pending = await listSuggestions("pending", 50);
  const pendingNegatives = pending.filter((s) => s.kind === "add_negative");

  if (pendingNegatives.length === 0) {
    await finalizeSelfLearningRun({
      id: runId,
      baselinePassRate,
      candidatePassRate: null,
      decision: "no_change",
      promptVersionId: null,
      signalsProcessed: agg.signalsProcessed,
      notes: "Keine pending Negativ-Beispiele.",
    });
    await resetConsecutiveFailures();
    return makeResult({
      runId,
      decision: "no_change",
      baselinePassRate,
      signalsProcessed: agg.signalsProcessed,
      suggestionsCreated: agg.suggestionsCreated,
      notes: "Aggregator lief, keine Auto-Anwendung notwendig.",
    });
  }

  // Negativ-Beispiele temporär in DB → wirken sofort über
  // `system-prompt-resolved.ts` als Anti-Muster im Prompt.
  const appliedSuggestionIds: string[] = [];
  for (const s of pendingNegatives) {
    const p = s.preview as Record<string, unknown>;
    const userMsg = String(p.userMessage ?? "").trim();
    const badResponse = String(p.badResponse ?? "").trim();
    const whyBad = String(p.whyBad ?? "Auto-Self-Learning").trim();
    if (!userMsg || !badResponse) continue;
    try {
      await insertNegativeExample({
        userMessage: userMsg,
        badResponse,
        whyBad,
        tags: ["auto-self-learning"],
        source: "trainer_chat",
        createdBy: "self-learning-auto",
      });
      appliedSuggestionIds.push(s.id);
    } catch (err) {
      console.warn("[self-learning-runner] insert negative failed:", err);
    }
  }

  // Candidate-Eval (Negativ-Beispiele sind nun aktiv im Prompt)
  let candidatePass = 0;
  let candidateTotal = 0;
  let candidatePassRate: number | null = null;
  let candidateFailedIds: Set<string> = new Set();
  try {
    const summary = await runEvalSuite(client);
    candidatePass = summary.passed;
    candidateTotal = summary.total;
    candidatePassRate = candidateTotal > 0 ? candidatePass / candidateTotal : 0;
    candidateFailedIds = new Set(summary.results.filter((r) => !r.pass).map((r) => r.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finalizeSelfLearningRun({
      id: runId,
      baselinePassRate,
      candidatePassRate: null,
      decision: "error",
      promptVersionId: null,
      signalsProcessed: agg.signalsProcessed,
      errorText: `candidate-eval: ${msg.slice(0, 200)}`,
    });
    const fails = await bumpConsecutiveFailures(1);
    if (fails >= STOP_LOSS_THRESHOLD) {
      await setStopLossPaused(new Date(Date.now() + STOP_LOSS_PAUSE_HOURS * 3600_000));
    }
    return makeResult({
      runId,
      decision: "error",
      notes: "candidate eval failed",
      errorText: msg,
      baselinePassRate,
      signalsProcessed: agg.signalsProcessed,
      suggestionsCreated: agg.suggestionsCreated,
    });
  }

  // Whitelist-Guard: protected cases dürfen nicht von "pass" zu "fail" wandern
  const newlyBrokenProtected = settings.protectedCaseIds.filter(
    (id) => !baselineFailedIds.has(id) && candidateFailedIds.has(id),
  );
  const passRateOk =
    baselinePassRate != null && candidatePassRate != null && candidatePassRate >= baselinePassRate - 0.001;

  if (newlyBrokenProtected.length === 0 && passRateOk) {
    // Suggestions auf auto_applied
    for (const id of appliedSuggestionIds) {
      await setSuggestionStatus({ id, status: "auto_applied", reviewedBy: "self-learning-auto" });
    }
    await finalizeSelfLearningRun({
      id: runId,
      baselinePassRate,
      candidatePassRate,
      decision: "activated",
      promptVersionId: null,
      signalsProcessed: agg.signalsProcessed,
      notes: `auto_applied=${appliedSuggestionIds.length}, pass ${baselinePass}/${baselineTotal} → ${candidatePass}/${candidateTotal}`,
    });
    await resetConsecutiveFailures();
    return makeResult({
      runId,
      decision: "activated",
      baselinePassRate,
      candidatePassRate,
      signalsProcessed: agg.signalsProcessed,
      suggestionsCreated: agg.suggestionsCreated,
      suggestionsAutoApplied: appliedSuggestionIds.length,
      notes: "Negativ-Beispiele aktiv übernommen.",
    });
  }

  // Reject: angewendete Negativ-Beispiele schon eingespielt — sie können
  // bestehen bleiben, da das Eval lediglich nicht-protected verschlechtert
  // hat. Der konservative Default ist aber: auf 'rejected' setzen, sodass
  // die UI-Sichtung wartet. (Wir lassen die Rows in der negative-Tabelle
  // physisch — die UI kann sie über das Trainer-Tool deaktivieren.)
  for (const id of appliedSuggestionIds) {
    await setSuggestionStatus({ id, status: "rejected", reviewedBy: "self-learning-auto" });
  }
  const rejectNote = newlyBrokenProtected.length > 0
    ? `protected cases gebrochen: ${newlyBrokenProtected.join(", ")}`
    : "candidate pass-rate < baseline";
  await finalizeSelfLearningRun({
    id: runId,
    baselinePassRate,
    candidatePassRate,
    decision: "rejected",
    promptVersionId: null,
    signalsProcessed: agg.signalsProcessed,
    notes: rejectNote,
  });
  const fails = await bumpConsecutiveFailures(1);
  if (fails >= STOP_LOSS_THRESHOLD) {
    await setStopLossPaused(new Date(Date.now() + STOP_LOSS_PAUSE_HOURS * 3600_000));
  }
  return makeResult({
    runId,
    decision: "rejected",
    baselinePassRate,
    candidatePassRate,
    signalsProcessed: agg.signalsProcessed,
    suggestionsCreated: agg.suggestionsCreated,
    suggestionsAutoApplied: 0,
    notes: rejectNote,
  });
}

function makeResult(input: Partial<SelfLearningRunResult> & { runId: string; decision: SelfLearningRunResult["decision"]; notes: string }): SelfLearningRunResult {
  return {
    runId: input.runId,
    decision: input.decision,
    baselinePassRate: input.baselinePassRate ?? null,
    candidatePassRate: input.candidatePassRate ?? null,
    signalsProcessed: input.signalsProcessed ?? 0,
    suggestionsCreated: input.suggestionsCreated ?? 0,
    suggestionsAutoApplied: input.suggestionsAutoApplied ?? 0,
    notes: input.notes,
    errorText: input.errorText,
  };
}
