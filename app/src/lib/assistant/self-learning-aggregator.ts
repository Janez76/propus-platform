/**
 * Aggregator: verdichtet Roh-Signale aus `assistant_implicit_signals` zu
 * konkreten Suggestions in `assistant_self_learning_suggestions`.
 *
 * Faustregeln:
 *  - 1× klare Korrektur mit confidence ≥ 0.85 → suggestion(kind=add_negative)
 *  - 2+ Korrekturen mit ähnlichem User-Topic-Token-Set in 24h → tune_prompt
 *  - 1× Dank+Folge-Frage zur selben Entität → add_few_shot
 *  - Tool-Error-Loop ≥1 → add_negative + tune_prompt
 *
 * Runs idempotent (markiert Signale als processed_at).
 */
import {
  insertSuggestion,
  listUnprocessedSignals,
  markSignalsProcessed,
  type ImplicitSignal,
} from "@/lib/assistant/self-learning-store";

function topicTokens(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4)
      .slice(0, 24),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export async function runAggregator(opts: { minConfidence: number }): Promise<{
  signalsProcessed: number;
  suggestionsCreated: number;
}> {
  const signals = await listUnprocessedSignals(500);
  if (signals.length === 0) return { signalsProcessed: 0, suggestionsCreated: 0 };

  // 1) Klare Korrekturen / Tool-Loops → 1:1 add_negative
  const negatives = signals.filter(
    (s) =>
      (s.signalType === "correction" && s.confidence >= 0.85) ||
      (s.signalType === "tool_error_loop" && s.confidence >= 0.85),
  );

  // 2) Klare Folge-Frage mit Dank → add_few_shot
  const positives = signals.filter(
    (s) => s.signalType === "follow_up" && s.confidence >= 0.6,
  );
  const thanksSignals = signals.filter((s) => s.signalType === "thanks" && s.confidence >= opts.minConfidence);

  // 3) Cluster aus Korrekturen → tune_prompt
  const corrections = signals.filter((s) => s.signalType === "correction");
  const clusters = clusterByTopic(corrections);

  let created = 0;
  const usedSignalIds = new Set<string>();

  for (const s of negatives) {
    if (!s.userMessageText || !s.assistantText) continue;
    await insertSuggestion({
      kind: "add_negative",
      confidence: s.confidence,
      signalCount: 1,
      preview: {
        userMessage: s.userMessageText,
        badResponse: s.assistantText,
        whyBad: explainSignal(s),
        signalType: s.signalType,
        evidence: s.evidence,
      },
      supportingSignals: [s.id],
    });
    created += 1;
    usedSignalIds.add(s.id);
  }

  for (const s of positives) {
    if (!s.userMessageText || !s.assistantText) continue;
    await insertSuggestion({
      kind: "add_few_shot",
      confidence: s.confidence,
      signalCount: 1,
      preview: {
        userMessage: s.userMessageText,
        assistantFinal: s.assistantText,
        assistantToolPlan: "(automatisch erkannt — bitte prüfen)",
        tags: ["auto", "follow-up"],
        signalType: s.signalType,
      },
      supportingSignals: [s.id],
    });
    created += 1;
    usedSignalIds.add(s.id);
  }

  for (const cluster of clusters) {
    if (cluster.signals.length < 2) continue;
    await insertSuggestion({
      kind: "tune_prompt",
      confidence: cluster.avgConfidence,
      signalCount: cluster.signals.length,
      preview: {
        topic: Array.from(cluster.topic).slice(0, 8).join(" "),
        examples: cluster.signals.slice(0, 3).map((s) => ({
          userMessage: s.userMessageText?.slice(0, 200),
          assistantText: s.assistantText?.slice(0, 240),
          why: explainSignal(s),
        })),
        recommendation:
          "Mehrere Korrekturen mit ähnlichem Thema. Prompt-Patch könnte helfen — ggf. Auto-Tune zulassen oder Regel anpassen.",
      },
      supportingSignals: cluster.signals.map((s) => s.id),
    });
    created += 1;
    cluster.signals.forEach((s) => usedSignalIds.add(s.id));
  }

  // Markiere ALLE betrachteten Signale als processed (auch die ohne Suggestion).
  // Sonst wachsen Tabellen unkontrolliert. Roh-Signale bleiben als historisches
  // Ledger erhalten, sind nur nicht mehr "unprocessed".
  await markSignalsProcessed(signals.map((s) => s.id));

  // Thanks ohne Folgefrage werden nur als „weiches" Signal behandelt — keine
  // explizite Suggestion, sie tauchen aber im History-Counter auf.
  void thanksSignals;

  return { signalsProcessed: signals.length, suggestionsCreated: created };
}

function explainSignal(s: ImplicitSignal): string {
  switch (s.signalType) {
    case "correction":
      return "User hat die Antwort korrigiert (impliziter Daumen runter).";
    case "tool_error_loop":
      return "Tool wurde mehrfach erfolglos aufgerufen — Antwort kam nicht zustande.";
    case "repeat":
      return "User stellte die Frage erneut, weil die Antwort nicht geholfen hat.";
    case "topic_shift":
      return "User hat das Thema nach einem Tool-Fehler verlassen — Antwort war nutzlos.";
    case "thanks":
      return "User hat sich bedankt.";
    case "follow_up":
      return "User stellt Folgefrage zur selben Entität — die Antwort hat geholfen.";
    default:
      return "Implizites Signal.";
  }
}

function clusterByTopic(
  signals: ImplicitSignal[],
): Array<{ topic: Set<string>; signals: ImplicitSignal[]; avgConfidence: number }> {
  const clusters: Array<{ topic: Set<string>; signals: ImplicitSignal[] }> = [];
  for (const s of signals) {
    const topic = topicTokens(s.userMessageText);
    let placed = false;
    for (const c of clusters) {
      if (jaccard(topic, c.topic) >= 0.3) {
        c.signals.push(s);
        for (const t of topic) c.topic.add(t);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ topic: new Set(topic), signals: [s] });
  }
  return clusters.map((c) => ({
    ...c,
    avgConfidence:
      c.signals.reduce((sum, s) => sum + s.confidence, 0) / Math.max(c.signals.length, 1),
  }));
}
