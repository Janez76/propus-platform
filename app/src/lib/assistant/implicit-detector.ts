/**
 * Implicit-Feedback-Detector — wird **nach** jedem User-Turn aufgerufen und
 * leitet aus Sprache + Tool-Verlauf Roh-Signale ab. Schreibt in
 * `assistant_implicit_signals`. Aggregator verdichtet später zu Suggestions.
 *
 * Ziel: passives Lernen ohne Klick. Heuristiken bewusst konservativ —
 * polarity ∈ {-1,0,1} mit confidence ∈ [0..1]. Nur Signale mit
 * confidence ≥ Settings.minSignalConfidence bekommen 1:1-Auto-Folgeaktionen,
 * leichtere Signale fließen aggregiert in Suggestions.
 */
import {
  insertImplicitSignal,
  type ImplicitSignalType,
} from "@/lib/assistant/self-learning-store";

type PriorTurn = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; error?: string }>;
};

type DetectorInput = {
  userId: string;
  conversationId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  /** Aktuelle User-Nachricht (Trigger des Turns) */
  currentUserMessage: string;
  /** Antwort des Assistenten auf den vorigen Turn (Bezugspunkt für Korrektur/Dank) */
  previousAssistantText: string | null;
  /** Tool-Aufrufe die in diesem Turn erfolgten (für Loop-Erkennung) */
  currentToolCalls?: Array<{ name: string; error?: string }>;
  /** Tool-Aufrufe vorheriger Turns (für Loop-Detection über mehrere Turns) */
  recentToolCalls?: Array<{ turn: number; name: string; error?: string }>;
  /** Letzte 6 Turns für Repeat-Heuristik */
  recentHistory?: PriorTurn[];
};

const THANKS_REGEX = /\b(danke|danke\s*sch[öo]n|merci|perfekt|passt|super|grossartig|großartig|alles\s*klar|okay\s*danke|stimmt\s*so)\b/i;
const CORRECTION_REGEX = /\b(nein\b|nicht\s*so|falsch|stimmt\s*nicht|ich\s*meinte|ich\s*meine|so\s*nicht|nicht\s*gemeint|gemeint\s*habe\s*ich)\b/i;
const FRUSTRATION_REGEX = /\b(immer\s*noch|wieso|warum\s*nicht|funktioniert\s*nicht|tut\s*nichts|nochmal|geht\s*nicht)\b/i;

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

type Detection = {
  signalType: ImplicitSignalType;
  polarity: -1 | 0 | 1;
  confidence: number;
  evidence: Record<string, unknown>;
};

export function detectImplicitSignals(input: DetectorInput): Detection[] {
  const out: Detection[] = [];
  const currentLower = input.currentUserMessage.toLowerCase().trim();

  // 1) Dank → +1 (mittlere Konfidenz, weil "danke schon mal" auch generic sein kann)
  if (THANKS_REGEX.test(currentLower) && currentLower.length < 80) {
    out.push({
      signalType: "thanks",
      polarity: 1,
      confidence: 0.75,
      evidence: { match: currentLower.match(THANKS_REGEX)?.[0] ?? null },
    });
  }

  // 2) Korrektur → -1 (hohe Konfidenz wenn "nein" + Bezug am Anfang)
  if (CORRECTION_REGEX.test(currentLower)) {
    const startsWithNo = /^(nein|ne,|ne\b|nicht|falsch|stimmt\s*nicht)/i.test(currentLower);
    out.push({
      signalType: "correction",
      polarity: -1,
      confidence: startsWithNo ? 0.85 : 0.65,
      evidence: { match: currentLower.match(CORRECTION_REGEX)?.[0] ?? null, startsWithNo },
    });
  }

  // 3) Frustrations-Marker → -1 (mittlere Konfidenz)
  if (FRUSTRATION_REGEX.test(currentLower)) {
    out.push({
      signalType: "correction",
      polarity: -1,
      confidence: 0.55,
      evidence: { match: currentLower.match(FRUSTRATION_REGEX)?.[0] ?? null, kind: "frustration" },
    });
  }

  // 4) Repeat: gleiche/ähnliche Frage wie unmittelbar vorige User-Frage → -1
  //    Antwort hat offensichtlich nicht geholfen.
  const priorUser = (input.recentHistory ?? []).filter((t) => t.role === "user").slice(-2, -1)[0];
  if (priorUser) {
    const sim = jaccard(tokenize(input.currentUserMessage), tokenize(priorUser.content));
    if (sim >= 0.55 && input.currentUserMessage.length > 8) {
      out.push({
        signalType: "repeat",
        polarity: -1,
        confidence: Math.min(0.9, 0.6 + sim * 0.4),
        evidence: { jaccard: Number(sim.toFixed(2)), priorPreview: priorUser.content.slice(0, 120) },
      });
    }
  }

  // 5) Tool-Error-Loop: gleiches Tool 3× erfolglos im jetzigen Turn ODER
  //    in den letzten 3 Turns
  const toolNames: string[] = [];
  const toolErrors = new Map<string, number>();
  const sources: Array<{ name: string; error?: string }> = [
    ...(input.currentToolCalls ?? []),
    ...((input.recentToolCalls ?? []).map((c) => ({ name: c.name, error: c.error }))),
  ];
  for (const c of sources) {
    toolNames.push(c.name);
    if (c.error) toolErrors.set(c.name, (toolErrors.get(c.name) ?? 0) + 1);
  }
  for (const [name, count] of toolErrors) {
    if (count >= 3) {
      out.push({
        signalType: "tool_error_loop",
        polarity: -1,
        confidence: 0.9,
        evidence: { tool: name, errorCount: count },
      });
    }
  }

  // 6) Topic-Shift nach Fehler: vorige Antwort enthielt "Fehler:" und User
  //    spricht etwas komplett Anderes an (Jaccard < 0.05)
  if (input.previousAssistantText && /Fehler:|Tool-Fehler|technisch/i.test(input.previousAssistantText)) {
    const sim = jaccard(tokenize(input.currentUserMessage), tokenize(input.previousAssistantText));
    if (sim < 0.05 && input.currentUserMessage.length > 12) {
      out.push({
        signalType: "topic_shift",
        polarity: -1,
        confidence: 0.55,
        evidence: { jaccard: Number(sim.toFixed(2)), reason: "user gibt Fehler-Topic auf" },
      });
    }
  }

  // 7) Follow-up: Folgefrage referenziert dieselbe Entität (Tour-Nr / Auftrags-Nr) → +1 schwach
  if (input.previousAssistantText) {
    const idMatches = /\b(?:Tour|Auftrag|Bestellung|Order|Rechnung|Invoice)\s*#?\s*(\d{1,7})\b/gi;
    const idsInPrev = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = idMatches.exec(input.previousAssistantText))) idsInPrev.add(m[1]);
    idMatches.lastIndex = 0;
    let referencedAgain = false;
    while ((m = idMatches.exec(input.currentUserMessage))) {
      if (idsInPrev.has(m[1])) {
        referencedAgain = true;
        break;
      }
    }
    if (referencedAgain) {
      out.push({
        signalType: "follow_up",
        polarity: 1,
        confidence: 0.6,
        evidence: { reusedEntity: true },
      });
    }
  }

  return out;
}

export async function recordImplicitSignals(
  baseInput: DetectorInput,
  detections: Detection[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const d of detections) {
    try {
      const id = await insertImplicitSignal({
        conversationId: baseInput.conversationId,
        userMessageId: baseInput.userMessageId,
        assistantMessageId: baseInput.assistantMessageId,
        userId: baseInput.userId,
        signalType: d.signalType,
        polarity: d.polarity,
        confidence: d.confidence,
        userMessageText: baseInput.currentUserMessage.slice(0, 2000),
        assistantText: baseInput.previousAssistantText?.slice(0, 4000) ?? null,
        evidence: d.evidence,
      });
      if (id) ids.push(id);
    } catch (err) {
      console.warn("[implicit-detector] insert failed:", err);
    }
  }
  return ids;
}

export async function detectAndRecordImplicit(input: DetectorInput): Promise<{
  detections: Detection[];
  signalIds: string[];
}> {
  const detections = detectImplicitSignals(input);
  const signalIds = detections.length > 0 ? await recordImplicitSignals(input, detections) : [];
  return { detections, signalIds };
}
