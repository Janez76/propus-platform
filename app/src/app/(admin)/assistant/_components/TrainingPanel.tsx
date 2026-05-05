"use client";

/**
 * Training-Panel — vereinfachte, visuelle Variante.
 *
 * Drei sichtbare Sektionen statt fünf nackter Buttons:
 *  1. Gesundheits-Check (Eval) — Ampel + Sparkline + Detail pro Case
 *  2. Trainer-Chat — eigener Mini-Chat, der Few-Shots / Prompt / Memories pflegt
 *  3. Wissen — Few-Shots-Liste + Memories-Hinweis
 *
 * Plus Profi-Modus mit den alten Werkzeugen (Auto-Tuner, Replay-Harvest, Memory-Seed).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  Eye,
  Loader2,
  Pause,
  PlayCircle,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";

type EvalRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string | null;
  totalCases: number;
  passedCases: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

type SparkPoint = {
  runId: string;
  startedAt: string;
  passed: number;
  total: number;
  passRate: number;
};

type EvalCaseRow = {
  id: string;
  caseId: string;
  passed: boolean;
  reason: string | null;
  tools: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  finalText: string | null;
};

type FewShotRow = { id: string; tags: string[] };

type TrainerToolCall = {
  name: string;
  durationMs?: number;
  error?: string;
  output?: unknown;
};

type TrainerMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: TrainerToolCall[];
  pendingConfirmation?: {
    id: string;
    toolName: string;
    description: string;
    input: Record<string, unknown>;
  };
};

type TrainerHistoryItem = {
  role: "user" | "assistant";
  content: unknown;
};

type SelfLearningSettings = {
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
};

type SelfLearningRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  baselinePassRate: number | null;
  candidatePassRate: number | null;
  decision: string | null;
  signalsProcessed: number;
  notes: string | null;
};

type Suggestion = {
  id: string;
  kind: "add_few_shot" | "add_negative" | "tune_prompt" | "replay_harvest";
  status: "pending" | "accepted" | "rejected" | "auto_applied";
  confidence: number;
  signalCount: number;
  preview: Record<string, unknown>;
  createdAt: string;
};

type Props = {
  /** kommt aus ConversationView, damit der Trainer-Chat per "✏ trainieren"-Button vorausgefüllt werden kann. */
  initialContext?: string | null;
  onContextConsumed?: () => void;
};

export function TrainingPanel({ initialContext, onContextConsumed }: Props) {
  // ── Eval-Status ────────────────────────────────────────────────────────────
  const [recentRuns, setRecentRuns] = useState<EvalRun[]>([]);
  const [sparkline, setSparkline] = useState<SparkPoint[]>([]);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalDetailRunId, setEvalDetailRunId] = useState<string | null>(null);
  const [evalDetailCases, setEvalDetailCases] = useState<EvalCaseRow[]>([]);
  const [evalDetailLoading, setEvalDetailLoading] = useState(false);

  const refreshEvalRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/training/eval-runs?limit=10", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { runs: EvalRun[]; sparkline: SparkPoint[] };
      setRecentRuns(data.runs);
      setSparkline(data.sparkline);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    void refreshEvalRuns();
  }, [refreshEvalRuns]);

  const runEvalNow = useCallback(async () => {
    setEvalLoading(true);
    try {
      const res = await fetch("/api/assistant/training/eval", { method: "POST" });
      const data = await res.json() as { passed?: number; total?: number; failedCaseIds?: string[]; error?: string };
      if (!res.ok) {
        // Banner via console — UI banner kommt in ConversationView
        console.error("[training] eval", data.error);
      }
      await refreshEvalRuns();
    } finally {
      setEvalLoading(false);
    }
  }, [refreshEvalRuns]);

  const openRunDetail = useCallback(async (runId: string) => {
    setEvalDetailRunId(runId);
    setEvalDetailLoading(true);
    setEvalDetailCases([]);
    try {
      const res = await fetch(`/api/assistant/training/eval-runs?runId=${encodeURIComponent(runId)}`, { cache: "no-store" });
      const data = await res.json() as { cases?: EvalCaseRow[] };
      setEvalDetailCases(data.cases || []);
    } finally {
      setEvalDetailLoading(false);
    }
  }, []);

  const latestRun = recentRuns[0] ?? null;
  const passRate = latestRun && latestRun.totalCases > 0 ? latestRun.passedCases / latestRun.totalCases : null;
  const lampColor =
    passRate == null ? "bg-[var(--surface-raised)]" :
    passRate >= 0.95 ? "bg-emerald-500" :
    passRate >= 0.75 ? "bg-amber-500" :
    "bg-red-500";

  // ── Few-Shots ──────────────────────────────────────────────────────────────
  const [fewShots, setFewShots] = useState<FewShotRow[] | null>(null);
  const [fewShotsLoading, setFewShotsLoading] = useState(false);
  const [fewShotsExpanded, setFewShotsExpanded] = useState(false);

  const loadFewShots = useCallback(async () => {
    setFewShotsLoading(true);
    try {
      const res = await fetch("/api/assistant/training/few-shots", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { count: number; shots: FewShotRow[] };
      setFewShots(data.shots || []);
    } finally {
      setFewShotsLoading(false);
    }
  }, []);

  // ── Trainer-Chat ───────────────────────────────────────────────────────────
  const [trainerOpen, setTrainerOpen] = useState(true);
  const [trainerMessages, setTrainerMessages] = useState<TrainerMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! Sag mir, was am Hauptassistenten verbessert werden soll. Ich kann Beispiele speichern, den System-Prompt anpassen, Notizen ablegen und die Eval-Suite ausführen. Bei vagen Eingaben frage ich kurz nach.",
    },
  ]);
  const [trainerHistory, setTrainerHistory] = useState<TrainerHistoryItem[]>([]);
  const [trainerInput, setTrainerInput] = useState("");
  const [trainerLoading, setTrainerLoading] = useState(false);
  const [pendingContext, setPendingContext] = useState<string | null>(null);
  const trainerScrollRef = useRef<HTMLDivElement>(null);
  const trainerInputRef = useRef<HTMLInputElement>(null);
  /** Trainer-Send-Queue: Nachrichten die der User während der Bot noch antwortet abschickt. */
  const [trainerSendQueue, setTrainerSendQueue] = useState<string[]>([]);

  useEffect(() => {
    if (initialContext && initialContext.trim()) {
      setPendingContext(initialContext);
      setTrainerOpen(true);
      setTrainerMessages((prev) => [
        ...prev,
        {
          id: `ctx-${Date.now()}`,
          role: "assistant",
          content: `Ich habe den Hauptchat-Auszug bekommen — sag mir, was daran nicht passte oder was ich speichern soll.`,
        },
      ]);
      onContextConsumed?.();
    }
  }, [initialContext, onContextConsumed]);

  useEffect(() => {
    trainerScrollRef.current?.scrollTo({ top: trainerScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [trainerMessages, trainerLoading]);

  const sendTrainerWithText = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    const userMsg: TrainerMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setTrainerMessages((prev) => [...prev, userMsg]);
    setTrainerLoading(true);

    try {
      const res = await fetch("/api/assistant/trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: text,
          history: trainerHistory,
          conversationContext: pendingContext || undefined,
        }),
      });
      const data = await res.json() as {
        finalText?: string;
        history?: TrainerHistoryItem[];
        toolCallsExecuted?: TrainerToolCall[];
        pendingConfirmation?: TrainerMessage["pendingConfirmation"];
        error?: string;
      };
      // Kontext wird nur beim ersten Turn nach dem Klick mitgeschickt
      if (pendingContext) setPendingContext(null);

      if (!res.ok) {
        setTrainerMessages((prev) => [
          ...prev,
          { id: `e-${Date.now()}`, role: "assistant", content: `⚠ ${data.error ?? "Fehler"}` },
        ]);
      } else {
        setTrainerHistory(data.history ?? []);
        setTrainerMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: data.finalText || "(keine Antwort)",
            toolCalls: data.toolCallsExecuted,
            pendingConfirmation: data.pendingConfirmation,
          },
        ]);
        // Auto-Refresh wenn Training-relevante Tools liefen
        const ranEval = data.toolCallsExecuted?.some((c) => c.name === "run_eval");
        const ranFewShot = data.toolCallsExecuted?.some(
          (c) => c.name === "add_few_shot" || c.name === "deactivate_few_shot",
        );
        if (ranEval) void refreshEvalRuns();
        if (ranFewShot) void loadFewShots();
      }
    } catch (err) {
      setTrainerMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `⚠ Verbindungsfehler: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setTrainerLoading(false);
      // Auto-Fokus zurück ins Eingabefeld, damit der User direkt weiterschreiben kann
      window.setTimeout(() => trainerInputRef.current?.focus(), 50);
    }
  }, [trainerHistory, pendingContext, refreshEvalRuns, loadFewShots]);

  const sendTrainer = useCallback(async () => {
    const text = trainerInput.trim();
    if (!text) return;
    setTrainerInput("");
    if (trainerLoading) {
      // Aktueller Turn läuft → in Queue legen, automatisch nach Fertigstellung absenden
      setTrainerSendQueue((prev) => [...prev, text]);
      return;
    }
    void sendTrainerWithText(text);
  }, [trainerInput, trainerLoading, sendTrainerWithText]);

  // Queue-Effekt: sobald der Turn durch ist, nächste Nachricht automatisch senden.
  useEffect(() => {
    if (trainerLoading) return;
    if (trainerSendQueue.length === 0) return;
    const [next, ...rest] = trainerSendQueue;
    setTrainerSendQueue(rest);
    void sendTrainerWithText(next);
  }, [trainerLoading, trainerSendQueue, sendTrainerWithText]);

  const confirmTrainerAction = useCallback(
    async (msgId: string, approved: boolean) => {
      const msg = trainerMessages.find((m) => m.id === msgId);
      if (!msg?.pendingConfirmation) return;
      const pc = msg.pendingConfirmation;
      try {
        const res = await fetch("/api/assistant/trainer/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolName: pc.toolName, input: pc.input, approved }),
        });
        const data = await res.json() as { ok?: boolean; rejected?: boolean; result?: unknown; error?: string };
        // entferne pendingConfirmation auf der Nachricht
        setTrainerMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, pendingConfirmation: undefined } : m)),
        );
        const summary = approved
          ? data.error
            ? `⚠ ${data.error}`
            : `✓ ${pc.toolName} ausgeführt.`
          : "✗ Aktion abgebrochen.";
        setTrainerMessages((prev) => [
          ...prev,
          { id: `c-${Date.now()}`, role: "assistant", content: summary },
        ]);
        await refreshEvalRuns();
        await loadFewShots();
      } catch (err) {
        setTrainerMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: `⚠ ${err instanceof Error ? err.message : String(err)}`,
          },
        ]);
      }
    },
    [trainerMessages, refreshEvalRuns, loadFewShots],
  );

  const undoLastAction = useCallback(async () => {
    setTrainerInput("Mach die letzte Trainer-Aktion bitte rückgängig.");
    // direkt absenden
    setTimeout(() => void sendTrainer(), 50);
  }, [sendTrainer]);

  // ── Self-Learning ─────────────────────────────────────────────────────────
  const [slSettings, setSlSettings] = useState<SelfLearningSettings | null>(null);
  const [slRuns, setSlRuns] = useState<SelfLearningRun[]>([]);
  const [slSignals24h, setSlSignals24h] = useState<{ positive: number; negative: number }>({ positive: 0, negative: 0 });
  const [slLoading, setSlLoading] = useState(false);
  const [slRunNowLoading, setSlRunNowLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionBusy, setSuggestionBusy] = useState<string | null>(null);
  const [slBanner, setSlBanner] = useState<string | null>(null);
  const flashSl = (txt: string) => {
    setSlBanner(txt);
    window.setTimeout(() => setSlBanner((c) => (c === txt ? null : c)), 5000);
  };

  const loadSelfLearning = useCallback(async () => {
    setSlLoading(true);
    try {
      const [sRes, suggRes] = await Promise.all([
        fetch("/api/assistant/training/self-learning", { cache: "no-store" }),
        fetch("/api/assistant/training/self-learning/suggestions?status=pending&limit=20", { cache: "no-store" }),
      ]);
      if (sRes.ok) {
        const d = await sRes.json() as {
          settings: SelfLearningSettings;
          runs: SelfLearningRun[];
          signalsLast24h: { positive: number; negative: number };
        };
        setSlSettings(d.settings);
        setSlRuns(d.runs);
        setSlSignals24h(d.signalsLast24h);
      }
      if (suggRes.ok) {
        const d = await suggRes.json() as { suggestions: Suggestion[] };
        setSuggestions(d.suggestions);
      }
    } finally {
      setSlLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSelfLearning();
  }, [loadSelfLearning]);

  const toggleSlField = useCallback(async (field: "implicitFeedbackEnabled" | "autoTuneEnabled", value: boolean) => {
    setSlLoading(true);
    try {
      const res = await fetch("/api/assistant/training/self-learning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const d = await res.json() as { settings: SelfLearningSettings };
        setSlSettings(d.settings);
        flashSl(field === "autoTuneEnabled" ? (value ? "Auto-Tune aktiviert." : "Auto-Tune deaktiviert.") : (value ? "Implicit-Feedback an." : "Implicit-Feedback aus."));
      }
    } finally {
      setSlLoading(false);
    }
  }, []);

  const runSlNow = useCallback(async () => {
    setSlRunNowLoading(true);
    try {
      const res = await fetch("/api/assistant/training/self-learning/run", { method: "POST" });
      const d = await res.json() as { ok?: boolean; decision?: string; notes?: string; error?: string };
      flashSl(d.error ? `⚠ ${d.error}` : `✓ ${d.decision ?? "ok"} — ${d.notes ?? ""}`);
      await loadSelfLearning();
      await refreshEvalRuns();
    } finally {
      setSlRunNowLoading(false);
    }
  }, [loadSelfLearning, refreshEvalRuns]);

  const reviewSuggestion = useCallback(async (id: string, action: "accept" | "reject") => {
    setSuggestionBusy(id);
    try {
      const res = await fetch("/api/assistant/training/self-learning/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const d = await res.json() as { ok?: boolean; status?: string; error?: string };
      flashSl(d.error ? `⚠ ${d.error}` : action === "accept" ? "✓ übernommen" : "✗ verworfen");
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      if (action === "accept") void loadFewShots();
    } finally {
      setSuggestionBusy(null);
    }
  }, [loadFewShots]);

  // ── Profi-Modus ────────────────────────────────────────────────────────────
  const [proOpen, setProOpen] = useState(false);
  const [tuneLoading, setTuneLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState<"dry" | "live" | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayLimit, setReplayLimit] = useState(30);
  const [proBanner, setProBanner] = useState<string | null>(null);

  const flashPro = (txt: string) => {
    setProBanner(txt);
    window.setTimeout(() => setProBanner((cur) => (cur === txt ? null : cur)), 5000);
  };

  const runTune = useCallback(async () => {
    setTuneLoading(true);
    try {
      const res = await fetch("/api/assistant/training/tune", { method: "POST" });
      const data = await res.json() as { mdFilename?: string; error?: string };
      flashPro(data.error ? `⚠ ${data.error}` : `✓ Report: ${data.mdFilename ?? "ok"}`);
    } finally {
      setTuneLoading(false);
    }
  }, []);

  const runSeed = useCallback(async (dryRun: boolean) => {
    setSeedLoading(dryRun ? "dry" : "live");
    try {
      const res = await fetch("/api/assistant/training/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json() as { inserted?: number; skipped?: number; error?: string };
      flashPro(
        data.error
          ? `⚠ ${data.error}`
          : dryRun
            ? `Dry-Run ok — würde ${data.inserted ?? 0} hinzufügen, ${data.skipped ?? 0} übersprungen.`
            : `✓ ${data.inserted ?? 0} Memories geseedet.`,
      );
    } finally {
      setSeedLoading(null);
    }
  }, []);

  const runReplay = useCallback(async () => {
    setReplayLoading(true);
    try {
      const res = await fetch("/api/assistant/training/replay-harvest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: replayLimit }),
      });
      const data = await res.json() as { fileName?: string; count?: number; error?: string };
      flashPro(data.error ? `⚠ ${data.error}` : `✓ ${data.count ?? 0} Fälle in ${data.fileName ?? "replay-cases.json"}`);
    } finally {
      setReplayLoading(false);
    }
  }, [replayLimit]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* SEKTION 1: Gesundheits-Check */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={`mt-1.5 inline-block h-3 w-3 shrink-0 rounded-full ${lampColor}`} aria-hidden />
            <div>
              <div className="text-sm font-semibold text-[var(--text-main)]">Gesundheits-Check</div>
              <div className="text-[11px] text-[var(--text-subtle)]">
                Wie gut versteht der Assistant typische Anfragen?
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void runEvalNow()}
            disabled={evalLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--gold-on-gold)] disabled:opacity-50"
          >
            {evalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Jetzt prüfen
          </button>
        </div>

        {/* Status */}
        {latestRun ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium text-[var(--text-main)]">
              {latestRun.passedCases}/{latestRun.totalCases}
            </span>
            <span className="text-[var(--text-subtle)]">
              {new Date(latestRun.startedAt).toLocaleString("de-CH", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-[var(--text-subtle)]">
              · {latestRun.totalInputTokens + latestRun.totalOutputTokens} Tokens
            </span>
          </div>
        ) : (
          <div className="mt-3 text-xs text-[var(--text-subtle)]">Noch kein Lauf — klick „Jetzt prüfen".</div>
        )}

        {/* Sparkline */}
        {sparkline.length > 1 ? <Sparkline points={sparkline} onClick={(id) => void openRunDetail(id)} /> : null}

        {/* Fehler-Cases */}
        {latestRun && latestRun.passedCases < latestRun.totalCases ? (
          <button
            type="button"
            onClick={() => void openRunDetail(latestRun.id)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
          >
            <Eye className="h-3.5 w-3.5" />
            {latestRun.totalCases - latestRun.passedCases} Fehler ansehen
          </button>
        ) : null}

        {/* Detail-Modal-Inline */}
        {evalDetailRunId ? (
          <div className="mt-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--text-main)]">Lauf-Detail</span>
              <button
                type="button"
                onClick={() => setEvalDetailRunId(null)}
                className="rounded-md p-1 text-[var(--text-subtle)] hover:bg-[var(--surface)] hover:text-[var(--text-main)]"
                aria-label="Schließen"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
            {evalDetailLoading ? (
              <div className="mt-2 text-[11px] text-[var(--text-subtle)]">Lade…</div>
            ) : (
              <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto text-[11px]">
                {evalDetailCases.map((c) => (
                  <li
                    key={c.id}
                    className={`rounded border px-2 py-1.5 ${
                      c.passed
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-red-500/40 bg-red-500/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {c.passed ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-red-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[var(--text-main)]">{c.caseId}</div>
                        {!c.passed && c.reason ? (
                          <div className="mt-0.5 text-[var(--text-subtle)]">{c.reason}</div>
                        ) : null}
                        {c.tools.length > 0 ? (
                          <div className="mt-0.5 text-[var(--text-subtle)]">
                            Tools: {c.tools.join(" → ") || "(keine)"}
                          </div>
                        ) : null}
                        {c.finalText ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[var(--text-subtle)] hover:text-[var(--text-main)]">
                              Antwort anzeigen
                            </summary>
                            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-[var(--surface)] p-2">
                              {c.finalText.slice(0, 1500)}
                              {c.finalText.length > 1500 ? "\n…(gekürzt)" : ""}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      {/* SEKTION 2: Trainer-Chat */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]">
        <button
          type="button"
          className="flex w-full items-center justify-between p-4 text-left"
          onClick={() => setTrainerOpen((v) => !v)}
        >
          <div className="flex items-start gap-3">
            <Bot className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
            <div>
              <div className="text-sm font-semibold text-[var(--text-main)]">Trainer-Chat</div>
              <div className="text-[11px] text-[var(--text-subtle)]">
                Sag in Worten, was besser werden soll — die KI passt es an.
              </div>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-[var(--text-subtle)] transition ${trainerOpen ? "rotate-180" : ""}`} />
        </button>

        {trainerOpen ? (
          <div className="border-t border-[var(--border-soft)] p-3">
            <div
              ref={trainerScrollRef}
              className="max-h-72 space-y-2 overflow-y-auto rounded-lg bg-[var(--surface-raised)] p-3 text-xs"
            >
              {trainerMessages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg px-3 py-2 ${
                    m.role === "user"
                      ? "ml-auto max-w-[80%] bg-[var(--accent)]/15 text-[var(--text-main)]"
                      : "max-w-[90%] bg-[var(--surface)] text-[var(--text-main)]"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.toolCalls && m.toolCalls.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.toolCalls.map((c, idx) => (
                        <span
                          key={idx}
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            c.error
                              ? "bg-red-500/15 text-red-500"
                              : "bg-emerald-500/15 text-emerald-500"
                          }`}
                        >
                          {c.error ? "✗" : "✓"} {c.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {m.pendingConfirmation ? (
                    <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
                      <div className="text-[11px] font-medium text-amber-600">
                        Bestätigung: {m.pendingConfirmation.toolName}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-subtle)]">
                        {m.pendingConfirmation.description}
                      </div>
                      <pre className="mt-1 max-h-24 overflow-auto rounded bg-[var(--surface)] p-1.5 text-[10px]">
                        {JSON.stringify(m.pendingConfirmation.input, null, 2)}
                      </pre>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void confirmTrainerAction(m.id, true)}
                          className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                        >
                          Bestätigen
                        </button>
                        <button
                          type="button"
                          onClick={() => void confirmTrainerAction(m.id, false)}
                          className="rounded-md border border-[var(--border-soft)] px-2 py-1 text-[11px] text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
              {trainerLoading ? (
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-subtle)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Trainer denkt…
                </div>
              ) : null}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendTrainer();
              }}
              className="mt-2 flex gap-2"
            >
              <input
                ref={trainerInputRef}
                value={trainerInput}
                onChange={(e) => setTrainerInput(e.target.value)}
                placeholder={
                  trainerLoading
                    ? "Schon weiter tippen — wird nach Antwort gesendet …"
                    : 'z. B. "Speichere als Beispiel: Frage X → Antwort Y" oder "Eval starten"'
                }
                className="flex-1 rounded-md border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-main)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={!trainerInput.trim()}
                title={trainerLoading ? "In Warteschlange — wird nach Antwort gesendet" : "Senden"}
                className="relative inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--gold-on-gold)] disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {trainerLoading ? "Anstellen" : "Senden"}
                {trainerSendQueue.length > 0 ? (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                    {trainerSendQueue.length}
                  </span>
                ) : null}
              </button>
            </form>

            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setTrainerInput("Starte die Eval-Suite und nenne Fehler-Cases.")}
                className="rounded-full border border-[var(--border-soft)] px-2 py-1 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]"
              >
                Eval starten
              </button>
              <button
                type="button"
                onClick={() => setTrainerInput("Zeig mir den aktuellen System-Prompt.")}
                className="rounded-full border border-[var(--border-soft)] px-2 py-1 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]"
              >
                Prompt zeigen
              </button>
              <button
                type="button"
                onClick={() => setTrainerInput("Liste die letzten 10 Trainer-Aktionen.")}
                className="rounded-full border border-[var(--border-soft)] px-2 py-1 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]"
              >
                Verlauf
              </button>
              <button
                type="button"
                onClick={() => void undoLastAction()}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] px-2 py-1 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]"
              >
                <RotateCcw className="h-3 w-3" />
                Rückgängig
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* SEKTION 3: Wissen */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text-main)]">Wissen</div>
            <div className="text-[11px] text-[var(--text-subtle)]">
              Beispiele, die der Assistant als Muster nutzt.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setFewShotsExpanded((v) => !v);
              if (!fewShots) void loadFewShots();
            }}
            disabled={fewShotsLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text-main)] hover:bg-[var(--surface-raised)] disabled:opacity-50"
          >
            {fewShotsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {fewShots ? `${fewShots.length} Beispiele` : "Beispiele laden"}
          </button>
        </div>
        {fewShotsExpanded && fewShots ? (
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded bg-[var(--surface-raised)] p-2 text-[11px]">
            {fewShots.length === 0 ? (
              <li className="text-[var(--text-subtle)]">Noch keine Beispiele.</li>
            ) : null}
            {fewShots.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <span className="font-mono text-[var(--text-main)]">{s.id}</span>
                <span className="text-[var(--text-subtle)]">{s.tags.join(", ")}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* SEKTION 4: Self-Learning */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Brain className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
            <div>
              <div className="text-sm font-semibold text-[var(--text-main)]">Self-Learning</div>
              <div className="text-[11px] text-[var(--text-subtle)]">
                Lernt automatisch aus echten Konversationen.{" "}
                {slSettings?.pausedUntil && new Date(slSettings.pausedUntil) > new Date() ? (
                  <span className="text-amber-500">⏸ Stop-Loss aktiv bis {new Date(slSettings.pausedUntil).toLocaleString("de-CH")}</span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void runSlNow()}
            disabled={slRunNowLoading || !slSettings?.autoTuneEnabled}
            title={!slSettings?.autoTuneEnabled ? "Auto-Tune ist aus — erst aktivieren" : "Sofort einen Self-Learning-Lauf starten"}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text-main)] hover:bg-[var(--surface-raised)] disabled:opacity-50"
          >
            {slRunNowLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
            Jetzt lernen
          </button>
        </div>

        {slBanner ? (
          <div className="mt-2 rounded bg-[var(--surface-raised)] px-2 py-1 text-[11px] text-[var(--text-main)]">
            {slBanner}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-soft)] p-2 text-xs">
            <span className="flex items-center gap-2 text-[var(--text-main)]">
              <ThumbsUp className="h-3.5 w-3.5 text-emerald-500" /> Implicit-Feedback
            </span>
            <input
              type="checkbox"
              checked={!!slSettings?.implicitFeedbackEnabled}
              disabled={slLoading}
              onChange={(e) => void toggleSlField("implicitFeedbackEnabled", e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-soft)] p-2 text-xs">
            <span className="flex items-center gap-2 text-[var(--text-main)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" /> Auto-Tune (täglich)
            </span>
            <input
              type="checkbox"
              checked={!!slSettings?.autoTuneEnabled}
              disabled={slLoading}
              onChange={(e) => void toggleSlField("autoTuneEnabled", e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
        </div>

        {/* Mini-Stats */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-subtle)]">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="h-3 w-3 text-emerald-500" />
            <span className="font-medium text-[var(--text-main)]">{slSignals24h.positive}</span> 24h
          </span>
          <span className="inline-flex items-center gap-1">
            <ThumbsDown className="h-3 w-3 text-red-500" />
            <span className="font-medium text-[var(--text-main)]">{slSignals24h.negative}</span> 24h
          </span>
          {slSettings?.consecutiveFailures ? (
            <span className="inline-flex items-center gap-1 text-amber-500">
              <Pause className="h-3 w-3" />
              {slSettings.consecutiveFailures} Fehlschläge in Folge
            </span>
          ) : null}
          {slRuns[0] ? (
            <span>
              Letzter Lauf: {new Date(slRuns[0].startedAt).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {slRuns[0].decision ?? "—"}
            </span>
          ) : null}
        </div>

        {/* Pending Suggestions */}
        {suggestions.length > 0 ? (
          <div className="mt-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--text-main)]">
                {suggestions.length} Vorschläge zur Sichtung
              </span>
              <button
                type="button"
                onClick={() => void loadSelfLearning()}
                className="text-[11px] text-[var(--text-subtle)] hover:text-[var(--text-main)]"
              >
                Neu laden
              </button>
            </div>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {suggestions.map((s) => {
                const p = s.preview as Record<string, unknown>;
                const confidencePct = Math.round(s.confidence * 100);
                return (
                  <li
                    key={s.id}
                    className="rounded border border-[var(--border-soft)] bg-[var(--surface)] p-2 text-[11px]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            s.kind === "add_negative"
                              ? "bg-red-500/15 text-red-500"
                              : s.kind === "add_few_shot"
                                ? "bg-emerald-500/15 text-emerald-500"
                                : s.kind === "tune_prompt"
                                  ? "bg-amber-500/15 text-amber-500"
                                  : "bg-[var(--surface-raised)] text-[var(--text-subtle)]"
                          }`}
                        >
                          {s.kind === "add_negative" ? "Negativ" : s.kind === "add_few_shot" ? "Beispiel" : s.kind === "tune_prompt" ? "Prompt-Tune" : "Replay"}
                        </span>
                        <span className="text-[var(--text-subtle)]">
                          {confidencePct}% · {s.signalCount}× Signal
                        </span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          disabled={suggestionBusy === s.id}
                          onClick={() => void reviewSuggestion(s.id, "accept")}
                          title="Übernehmen"
                          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          disabled={suggestionBusy === s.id}
                          onClick={() => void reviewSuggestion(s.id, "reject")}
                          title="Verwerfen"
                          className="rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          ✗
                        </button>
                      </div>
                    </div>
                    {p.userMessage ? (
                      <div className="mt-1 line-clamp-2 text-[var(--text-main)]">
                        <span className="text-[var(--text-subtle)]">Frage:</span> {String(p.userMessage)}
                      </div>
                    ) : null}
                    {p.badResponse ? (
                      <div className="mt-0.5 line-clamp-2 text-[var(--text-subtle)]">
                        <span className="text-red-500">Falsch:</span> {String(p.badResponse)}
                      </div>
                    ) : null}
                    {p.assistantFinal ? (
                      <div className="mt-0.5 line-clamp-2 text-[var(--text-subtle)]">
                        <span className="text-emerald-500">Antwort:</span> {String(p.assistantFinal)}
                      </div>
                    ) : null}
                    {p.recommendation ? (
                      <div className="mt-0.5 text-[var(--text-subtle)]">{String(p.recommendation)}</div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="mt-3 rounded bg-[var(--surface-raised)] px-2 py-1.5 text-[11px] text-[var(--text-subtle)]">
            Keine Vorschläge offen. Implicit-Feedback sammelt im Hintergrund — beim nächsten Auto-Tune wertet der Aggregator aus.
          </div>
        )}

        {/* Letzte Self-Learning-Runs */}
        {slRuns.length > 0 ? (
          <details className="mt-3 text-[11px]">
            <summary className="cursor-pointer text-[var(--text-subtle)] hover:text-[var(--text-main)]">
              Letzte Self-Learning-Läufe ({slRuns.length})
            </summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded bg-[var(--surface-raised)] p-2">
              {slRuns.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-[var(--text-main)]">
                      {new Date(r.startedAt).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="ml-2 text-[var(--text-subtle)]">
                      {r.trigger} · {r.signalsProcessed}× Signal
                    </span>
                    {r.notes ? <div className="text-[var(--text-subtle)] line-clamp-1">{r.notes}</div> : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${
                      r.decision === "activated"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : r.decision === "rejected"
                          ? "bg-red-500/15 text-red-500"
                          : r.decision === "paused_stop_loss"
                            ? "bg-amber-500/15 text-amber-500"
                            : "bg-[var(--surface)] text-[var(--text-subtle)]"
                    }`}
                  >
                    {r.decision ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {/* PROFI-MODUS */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => setProOpen((v) => !v)}
          className="flex w-full items-center justify-between p-3 text-left"
        >
          <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">
            <Wrench className="h-3.5 w-3.5" />
            Profi-Modus
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-[var(--text-subtle)] transition ${proOpen ? "rotate-180" : ""}`} />
        </button>
        {proOpen ? (
          <div className="border-t border-[var(--border-soft)] p-3 text-xs">
            {proBanner ? (
              <div className="mb-2 rounded bg-[var(--surface-raised)] px-2 py-1 text-[11px] text-[var(--text-main)]">
                {proBanner}
              </div>
            ) : null}

            <div className="space-y-3">
              <ProRow
                title="Auto-Tuner"
                desc="Opus schlägt Prompt-Patches vor — überschreibt nichts."
                action="Report erzeugen"
                loading={tuneLoading}
                onClick={() => void runTune()}
              />
              <ProRow
                title="Memory-Seed (YAML)"
                desc="Idempotent aus scripts/seed-memories.yaml."
                action="Dry-Run"
                action2="Seed schreiben"
                loading={seedLoading === "dry"}
                loading2={seedLoading === "live"}
                onClick={() => void runSeed(true)}
                onClick2={() => void runSeed(false)}
              />
              <div className="rounded-lg border border-[var(--border-soft)] p-2.5">
                <div className="text-[11px] font-medium text-[var(--text-main)]">Replay-Harvest</div>
                <div className="text-[11px] text-[var(--text-subtle)]">
                  Eigene Konversationen als replay-cases.json exportieren.
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={replayLimit}
                    onChange={(e) => setReplayLimit(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 rounded-md border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 py-1 text-[11px]"
                  />
                  <button
                    type="button"
                    disabled={replayLoading}
                    onClick={() => void runReplay()}
                    className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--gold-on-gold)] disabled:opacity-50"
                  >
                    {replayLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ProRow(props: {
  title: string;
  desc: string;
  action: string;
  action2?: string;
  loading?: boolean;
  loading2?: boolean;
  onClick: () => void;
  onClick2?: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-soft)] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-[var(--text-main)]">{props.title}</div>
          <div className="text-[11px] text-[var(--text-subtle)]">{props.desc}</div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {props.action2 ? (
            <button
              type="button"
              disabled={props.loading || props.loading2}
              onClick={props.onClick}
              className="rounded-md border border-[var(--border-soft)] px-2 py-1 text-[11px] text-[var(--text-main)] hover:bg-[var(--surface-raised)] disabled:opacity-50"
            >
              {props.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : props.action}
            </button>
          ) : null}
          <button
            type="button"
            disabled={props.loading || props.loading2}
            onClick={props.action2 ? props.onClick2 : props.onClick}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-[var(--gold-on-gold)] disabled:opacity-50"
          >
            {(props.action2 ? props.loading2 : props.loading) ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {props.action2 ?? props.action}
          </button>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ points, onClick }: { points: SparkPoint[]; onClick: (runId: string) => void }) {
  const w = 220;
  const h = 36;
  const pad = 4;
  const path = useMemo(() => {
    if (points.length < 2) return "";
    const minRate = 0;
    const maxRate = 1;
    const xStep = (w - pad * 2) / (points.length - 1);
    return points
      .map((p, i) => {
        const x = pad + i * xStep;
        const y = h - pad - ((p.passRate - minRate) / (maxRate - minRate)) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points]);

  return (
    <div className="mt-3">
      <svg width={w} height={h} className="text-[var(--accent)]">
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="currentColor" strokeOpacity={0.1} strokeDasharray="2 2" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
        {points.map((p, i) => {
          const xStep = (w - pad * 2) / (points.length - 1);
          const x = pad + i * xStep;
          const y = h - pad - p.passRate * (h - pad * 2);
          const isFail = p.passRate < 1;
          return (
            <circle
              key={p.runId}
              cx={x}
              cy={y}
              r={2.5}
              fill={isFail ? "#ef4444" : "#10b981"}
              className="cursor-pointer"
              onClick={() => onClick(p.runId)}
            >
              <title>
                {new Date(p.startedAt).toLocaleString("de-CH")}: {p.passed}/{p.total}
              </title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
