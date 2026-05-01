"use client";

import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Bot,
  Brain,
  CheckCircle,
  ChevronDown,
  Copy,
  GraduationCap,
  History as HistoryIcon,
  Loader2,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Smartphone,
  Trash2,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASSISTANT_MODEL_MODE_STORAGE_KEY,
  type AssistantModelMode,
  parseAssistantModelMode,
} from "@/lib/assistant/assistant-model-mode";
import { formatModelLabel } from "@/lib/assistant/model-router";
import { VoiceButton } from "./VoiceButton";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; durationMs?: number; error?: string }>;
  isStreaming?: boolean;
  modelUsed?: string;
  escalated?: boolean;
  modelModeNotice?: string;
};

type PendingConfirmation = {
  id: string;
  toolName: string;
  description: string;
  input: Record<string, unknown>;
};

type HistoryItem = {
  id: string;
  title: string | null;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  customerId: number | null;
  customerName: string | null;
  bookingOrderNo: number | null;
  bookingAddress: string | null;
  tourId: number | null;
  tourLabel: string | null;
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
};

type HistoryFilter = "active" | "archived" | "trash";

const HISTORY_FILTERS: Array<{ key: HistoryFilter; label: string }> = [
  { key: "active", label: "Aktiv" },
  { key: "archived", label: "Archiv" },
  { key: "trash", label: "Papierkorb" },
];

type MemoryItem = {
  id: string;
  body: string;
  source: string;
  createdAt: string;
};

type MobileToken = {
  id: string;
  label: string;
  scope: string;
  created_at: string;
  last_used_at: string | null;
};

type ErrorCode = "auth_failed" | "rate_limited" | "model_error" | "tool_error" | "validation_error";

type AssistantSettings = {
  model: string;
  enabledTools: string[];
  dailyTokenLimit: number;
  streamingEnabled: boolean;
};

type ToolInfo = { name: string; description: string };
type ModelInfo = { id: string; label: string };

type UsagePeriodFooter = { totalTokens: number; costChf: number };

function formatUsageTokens(n: number): string {
  return new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function formatUsageChf(amount: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const INPUT_LABELS: Record<string, string> = {
  title: "Titel",
  description: "Beschreibung",
  priority: "Priorität",
  due_at: "Fällig am",
  conversation_id: "Konversation",
  customer_id: "Kunde",
  module: "Modul",
  subject: "Betreff",
  category: "Kategorie",
  reference_id: "Referenz-ID",
  reference_type: "Referenztyp",
  body_text: "Text",
  to: "An",
  body_html: "Inhalt",
  order_no: "Auftrag",
  new_status: "Neuer Status",
  note: "Notiz",
};

const ERROR_DISPLAY: Record<ErrorCode, string> = {
  auth_failed: "Anmeldung fehlgeschlagen. Bitte neu einloggen.",
  rate_limited: "Anfragelimit erreicht. Bitte warten.",
  model_error: "Claude ist gerade nicht erreichbar. Bitte in 30s erneut versuchen.",
  tool_error: "Fehler bei der Tool-Ausführung.",
  validation_error: "Ungültige Anfrage.",
};

/** Rate limits: show API `message` (daily budget vs. provider 429); other codes keep catalog text when set. */
function formatAssistantErrorBanner(error: { message: string; code?: ErrorCode }): string {
  if (error.code === "rate_limited") {
    const detail = error.message?.trim();
    if (detail) return detail;
    return ERROR_DISPLAY.rate_limited;
  }
  if (error.code && ERROR_DISPLAY[error.code]) {
    return ERROR_DISPLAY[error.code];
  }
  return error.message;
}

function ConfirmationCard({
  confirmation,
  onConfirm,
  onCancel,
  isProcessing,
}: {
  confirmation: PendingConfirmation;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}) {
  const entries = Object.entries(confirmation.input).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );

  return (
    <div className="mx-auto max-w-[78%] rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface)] p-4 shadow-md sm:max-w-[78%] max-sm:mx-0 max-sm:max-w-full">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-[var(--gold-text,var(--accent))]" />
        <span className="text-sm font-semibold text-[var(--text-main)]">{confirmation.description}</span>
      </div>
      <div className="mb-4 space-y-1.5">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-2 text-sm">
            <span className="shrink-0 font-medium text-[var(--text-subtle)]">{INPUT_LABELS[key] || key}:</span>
            <span className="text-[var(--text-main)] break-all">
              {typeof value === "string" && value.length > 200 ? `${value.slice(0, 200)}…` : String(value)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isProcessing}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--gold-on-gold)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle className="h-4 w-4" />
          Bestätigen
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-subtle)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <XCircle className="h-4 w-4" />
          Abbrechen
        </button>
      </div>
    </div>
  );
}

export function ConversationView() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("active");
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryToast, setMemoryToast] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [showMobileTokens, setShowMobileTokens] = useState(false);
  const [mobileTokens, setMobileTokens] = useState<MobileToken[]>([]);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [restoredBanner, setRestoredBanner] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<{ message: string; code?: ErrorCode } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ total: number; limit: number }>({ total: 0, limit: 500_000 });
  const [usagePeriods, setUsagePeriods] = useState<{
    today: UsagePeriodFooter;
    week: UsagePeriodFooter;
    month: UsagePeriodFooter;
  }>({
    today: { totalTokens: 0, costChf: 0 },
    week: { totalTokens: 0, costChf: 0 },
    month: { totalTokens: 0, costChf: 0 },
  });
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [trainingFewShots, setTrainingFewShots] = useState<{ count: number; shots: Array<{ id: string; tags: string[] }> } | null>(null);
  const [trainingFewShotsListOpen, setTrainingFewShotsListOpen] = useState(false);
  const [trainingFewShotsLoading, setTrainingFewShotsLoading] = useState(false);
  const [trainingEvalLoading, setTrainingEvalLoading] = useState(false);
  const [trainingEvalSummaryText, setTrainingEvalSummaryText] = useState<string | null>(null);
  const [trainingTuneLoading, setTrainingTuneLoading] = useState(false);
  const [trainingTuneInfo, setTrainingTuneInfo] = useState<{
    mdFilename: string;
    markdownPreview: string;
    previewTruncated: boolean;
    markdownFull: string;
    responseTruncatedAt100kb: boolean;
  } | null>(null);
  const [trainingSeedLoading, setTrainingSeedLoading] = useState<"dry" | "live" | null>(null);
  const [trainingReplayLoading, setTrainingReplayLoading] = useState(false);
  const [trainingReplayLimit, setTrainingReplayLimit] = useState(30);
  const [trainingReplayMessage, setTrainingReplayMessage] = useState<string | null>(null);
  const [trainingBanner, setTrainingBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [modelMode, setModelMode] = useState<AssistantModelMode>("auto");
  /** Last resolved Claude model label for header (streaming updates + last reply). */
  const [liveModelLabel, setLiveModelLabel] = useState<string | null>(null);
  const historyRef = useRef<unknown[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Aborts stale history GETs so an older in-flight response cannot overwrite after delete/archive. */
  const historyFetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, pendingConfirmation]);

  useEffect(() => {
    if (!memoryToast) return;
    const t = window.setTimeout(() => setMemoryToast(false), 3200);
    return () => window.clearTimeout(t);
  }, [memoryToast]);

  const loadHistory = useCallback(async (options?: { q?: string; filter?: HistoryFilter }) => {
    historyFetchAbortRef.current?.abort();
    const ac = new AbortController();
    historyFetchAbortRef.current = ac;
    try {
      const q = options?.q ?? "";
      const filter = options?.filter ?? "active";
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (filter !== "active") params.set("filter", filter);
      const url = params.toString() ? `/api/assistant/history?${params}` : "/api/assistant/history";
      const res = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        signal: ac.signal,
      });
      const data = (await res.json().catch(() => ({}))) as { conversations?: HistoryItem[] };
      if (res.ok) setHistoryItems(data.conversations || []);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err && typeof err === "object" && (err as { name?: string }).name === "AbortError") return;
      /* non-critical */
    }
  }, []);

  async function loadMemories() {
    try {
      const res = await fetch("/api/assistant/memories", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { memories?: MemoryItem[] };
      if (res.ok) setMemories(data.memories || []);
    } catch { /* non-critical */ }
  }

  async function loadSettings() {
    try {
      const [res, resUsage] = await Promise.all([
        fetch("/api/assistant/settings", { cache: "no-store" }),
        fetch("/api/assistant/usage", { cache: "no-store" }),
      ]);
      const data = (await res.json().catch(() => ({}))) as {
        settings?: AssistantSettings;
        usage?: { totalTokens: number };
        availableTools?: ToolInfo[];
        availableModels?: ModelInfo[];
        isAdmin?: boolean;
      };
      const usagePayload = (await resUsage.json().catch(() => ({}))) as {
        today?: { totalTokens?: number; costChf?: number };
        week?: { totalTokens?: number; costChf?: number };
        month?: { totalTokens?: number; costChf?: number };
      };

      if (res.ok && data.settings) {
        setSettings(data.settings);
        const todayTotal =
          resUsage.ok && usagePayload.today?.totalTokens != null
            ? usagePayload.today.totalTokens
            : data.usage?.totalTokens || 0;
        setTokenUsage({ total: todayTotal, limit: data.settings.dailyTokenLimit });
        setAvailableTools(data.availableTools || []);
        setAvailableModels(data.availableModels || []);
        setIsAdmin(Boolean(data.isAdmin));
      }

      if (resUsage.ok && usagePayload.today && usagePayload.week && usagePayload.month) {
        setUsagePeriods({
          today: {
            totalTokens: usagePayload.today.totalTokens ?? 0,
            costChf: usagePayload.today.costChf ?? 0,
          },
          week: {
            totalTokens: usagePayload.week.totalTokens ?? 0,
            costChf: usagePayload.week.costChf ?? 0,
          },
          month: {
            totalTokens: usagePayload.month.totalTokens ?? 0,
            costChf: usagePayload.month.costChf ?? 0,
          },
        });
      }
    } catch { /* non-critical */ }
  }

  async function deleteMemory(id: string) {
    try {
      await fetch(`/api/assistant/memories/${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch { /* non-critical */ }
  }

  async function loadMobileTokens() {
    try {
      const res = await fetch("/api/assistant/tokens", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { tokens?: MobileToken[] };
      if (res.ok) setMobileTokens(data.tokens || []);
    } catch { /* non-critical */ }
  }

  async function createMobileToken() {
    if (tokenBusy) return;
    setTokenBusy(true);
    setCreatedToken(null);
    try {
      const res = await fetch("/api/assistant/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newTokenLabel.trim() || "Mobile" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string };
      if (res.ok && data.token) {
        setCreatedToken(data.token);
        setNewTokenLabel("");
        void loadMobileTokens();
      }
    } catch { /* non-critical */ }
    setTokenBusy(false);
  }

  async function revokeMobileToken(id: string) {
    try {
      await fetch(`/api/assistant/tokens/${id}`, { method: "DELETE" });
      setMobileTokens((prev) => prev.filter((t) => t.id !== id));
    } catch { /* non-critical */ }
  }

  async function loadConversation(id: string) {
    try {
      const res = await fetch(`/api/assistant/history/${id}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        conversation?: { id: string; title: string | null };
        messages?: Array<{ id: string; role: string; content: unknown }>;
      };
      if (!res.ok || !data.ok) return;

      const displayMessages: DisplayMessage[] = (data.messages || [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : (m.content as Record<string, string>)?.text || "",
          toolCalls: (m.content as Record<string, unknown>)?.toolCalls as DisplayMessage["toolCalls"],
        }));

      setMessages(displayMessages);
      conversationIdRef.current = id;
      historyRef.current = [];
      setRestoredBanner(true);
      setError(null);
      setPendingConfirmation(null);
      setHistorySheetOpen(false);
    } catch { /* non-critical */ }
  }

  async function updateHistoryItem(id: string, action: "archive" | "unarchive" | "trash" | "restore") {
    if (historyBusyId) return;
    setHistoryBusyId(id);
    try {
      const res = await fetch(`/api/assistant/history/${id}`, {
        method: action === "trash" ? "DELETE" : "PATCH",
        headers: action === "trash" ? undefined : { "Content-Type": "application/json" },
        body: action === "trash"
          ? undefined
          : JSON.stringify(
              action === "restore"
                ? { deleted: false }
                : { archived: action === "archive" },
            ),
      });
      if (res.ok) {
        historyFetchAbortRef.current?.abort();
        setHistoryItems((current) => current.filter((item) => item.id !== id));
        if (action === "trash" && conversationIdRef.current === id) {
          conversationIdRef.current = null;
          setRestoredBanner(false);
        }
        void loadHistory({ q: historySearch, filter: historyFilter });
      }
    } catch { /* non-critical */ }
    setHistoryBusyId(null);
  }

  useEffect(() => {
    void loadHistory();
    void loadMemories();
    void loadSettings();
    void loadMobileTokens();
  }, [loadHistory]);

  useEffect(() => {
    try {
      setModelMode(parseAssistantModelMode(localStorage.getItem(ASSISTANT_MODEL_MODE_STORAGE_KEY)));
    } catch {
      /* ignore */
    }
  }, []);

  function persistModelMode(next: AssistantModelMode) {
    setModelMode(next);
    try {
      localStorage.setItem(ASSISTANT_MODEL_MODE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory({ q: historySearch, filter: historyFilter });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [historyFilter, historySearch, loadHistory]);

  async function handleConfirm(approved: boolean) {
    if (!pendingConfirmation) return;
    setIsConfirming(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId: pendingConfirmation.id, approved }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: Record<string, unknown>;
        rejected?: boolean;
        error?: string;
        message?: string;
      };

      if (!res.ok) throw new Error(data.error || `Fehler (${res.status})`);

      const statusText = approved
        ? data.result?.message || "Aktion ausgeführt."
        : "Abgebrochen.";

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: String(statusText),
          toolCalls: approved ? [{ name: pendingConfirmation.toolName, durationMs: 0 }] : undefined,
        },
      ]);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Bestätigungsfehler" });
    } finally {
      setPendingConfirmation(null);
      setIsConfirming(false);
    }
  }

  const sendStreaming = useCallback(async (text: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    const streamingMsgId = crypto.randomUUID();
    setLiveModelLabel(null);
    setMessages((current) => [
      ...current,
      { id: streamingMsgId, role: "assistant", content: "", toolCalls: [], isStreaming: true },
    ]);

    try {
      const res = await fetch("/api/assistant?stream=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Assistant-Model-Mode": modelMode,
        },
        body: JSON.stringify({
          userMessage: text,
          history: historyRef.current,
          conversationId: conversationIdRef.current,
          modelMode,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: ErrorCode };
        throw { message: data.error || `Fehler (${res.status})`, code: data.code };
      }

      const convId = res.headers.get("X-Conversation-Id");
      if (convId) conversationIdRef.current = convId;

      const reader = res.body?.getReader();
      if (!reader) throw { message: "Streaming nicht unterstützt" };

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          let event: Record<string, unknown>;
          try { event = JSON.parse(json); } catch { continue; }

          if (event.type === "meta") {
            const label =
              typeof event.modelLabel === "string" && event.modelLabel.trim()
                ? event.modelLabel
                : formatModelLabel(String(event.model ?? ""));
            if (label.trim()) setLiveModelLabel(label.trim());
          } else if (event.type === "text_delta") {
            setMessages((current) =>
              current.map((m) =>
                m.id === streamingMsgId ? { ...m, content: m.content + (event.text as string) } : m,
              ),
            );
          } else if (event.type === "tool_start") {
            setMessages((current) =>
              current.map((m) =>
                m.id === streamingMsgId
                  ? { ...m, toolCalls: [...(m.toolCalls || []), { name: event.name as string }] }
                  : m,
              ),
            );
          } else if (event.type === "tool_result") {
            setMessages((current) =>
              current.map((m) => {
                if (m.id !== streamingMsgId) return m;
                const calls = [...(m.toolCalls || [])];
                const idx = calls.findLastIndex((c) => c.name === event.name);
                if (idx >= 0) {
                  calls[idx] = { ...calls[idx], durationMs: event.duration as number, error: event.error as string | undefined };
                }
                return { ...m, toolCalls: calls };
              }),
            );
          } else if (event.type === "done") {
            const doneLabel =
              typeof event.modelLabel === "string" && event.modelLabel.trim()
                ? event.modelLabel.trim()
                : formatModelLabel(String(event.modelUsed ?? event.model ?? ""));
            if (doneLabel) setLiveModelLabel(doneLabel);
            setMessages((current) =>
              current.map((m) =>
                m.id === streamingMsgId
                  ? {
                      ...m,
                      isStreaming: false,
                      modelUsed: event.modelUsed as string | undefined,
                      escalated: event.escalated as boolean | undefined,
                      modelModeNotice: event.modelModeNotice as string | undefined,
                    }
                  : m,
              ),
            );
            historyRef.current = Array.isArray(event.history) ? event.history as unknown[] : [];
            void loadHistory();
            void loadSettings();
            if (event.memorySaved) {
              setMemoryToast(true);
              void loadMemories();
            }
          } else if (event.type === "error") {
            const msg =
              typeof event.error === "string" && event.error.trim()
                ? event.error
                : "Streaming-Fehler";
            const fromEvent = event.code as ErrorCode | undefined;
            const inferred: ErrorCode | undefined =
              !fromEvent && (msg.includes("rate_limit") || msg.includes("429"))
                ? "rate_limited"
                : undefined;
            throw { message: msg, code: fromEvent ?? inferred ?? "model_error" };
          }
        }
      }

      setMessages((current) =>
        current.map((m) =>
          m.id === streamingMsgId ? { ...m, isStreaming: false } : m,
        ),
      );
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      const errObj = err as { message?: string; code?: ErrorCode };
      setError({ message: errObj.message || "Streaming-Fehler", code: errObj.code });
      setMessages((current) => current.filter((m) => m.id !== streamingMsgId || m.content));
    }
  }, [loadHistory, modelMode]);

  async function send(userText: string) {
    const text = userText.trim();
    if (!text || isLoading || pendingConfirmation) return;
    setError(null);
    setIsLoading(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: text }]);

    const useStreaming = settings?.streamingEnabled !== false;

    if (useStreaming) {
      await sendStreaming(text);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/assistant?stream=false", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Assistant-Model-Mode": modelMode,
        },
        body: JSON.stringify({
          userMessage: text,
          history: historyRef.current,
          conversationId: conversationIdRef.current,
          modelMode,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        finalText?: string;
        history?: unknown[];
        conversationId?: string;
        toolCallsExecuted?: Array<{ name: string; durationMs: number; error?: string }>;
        pendingConfirmation?: PendingConfirmation;
        modelUsed?: string;
        modelLabel?: string;
        escalated?: boolean;
        memorySaved?: boolean;
        modelModeNotice?: string;
        error?: string;
        code?: ErrorCode;
      };
      if (!res.ok) throw { message: data.error || `Fehler (${res.status})`, code: data.code };

      historyRef.current = data.history || [];
      conversationIdRef.current = data.conversationId || conversationIdRef.current;
      setRestoredBanner(false);
      void loadHistory();
      void loadSettings();
      const resolvedLabel =
        typeof data.modelLabel === "string" && data.modelLabel.trim()
          ? data.modelLabel.trim()
          : data.modelUsed
            ? formatModelLabel(data.modelUsed)
            : null;
      if (resolvedLabel) setLiveModelLabel(resolvedLabel);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.finalText || "",
          toolCalls: (data.toolCallsExecuted || []).map((call) => ({
            name: call.name,
            durationMs: call.durationMs,
            error: call.error,
          })),
          modelUsed: data.modelUsed,
          escalated: data.escalated,
          modelModeNotice: data.modelModeNotice,
        },
      ]);

      if (data.pendingConfirmation) {
        setPendingConfirmation(data.pendingConfirmation);
      }

      if (data.memorySaved) {
        setMemoryToast(true);
        void loadMemories();
      }
    } catch (err) {
      const errObj = err as { message?: string; code?: ErrorCode };
      setError({ message: errObj.message || "Assistant-Fehler", code: errObj.code });
    } finally {
      setIsLoading(false);
    }
  }

  function submitText() {
    const text = textInput;
    setTextInput("");
    void send(text);
  }

  async function saveSettings(patch: Partial<AssistantSettings>) {
    try {
      const res = await fetch("/api/assistant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as { settings?: AssistantSettings };
      if (res.ok && data.settings) setSettings(data.settings);
    } catch { /* non-critical */ }
  }

  const inputDisabled = isLoading || !!pendingConfirmation;
  const tokenPct = tokenUsage.limit > 0 ? (tokenUsage.total / tokenUsage.limit) * 100 : 0;
  const tokenColor = tokenPct > 95 ? "text-red-500" : tokenPct > 80 ? "text-yellow-500" : "text-[var(--text-subtle)]";

  return (
    <section className="relative grid h-[calc(100dvh-1rem)] min-h-0 min-w-0 max-w-full grid-cols-1 grid-rows-1 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] shadow-sm sm:h-[calc(100dvh-1.5rem)] sm:rounded-2xl lg:h-[calc(100vh-3rem)] lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-0 min-w-0 max-w-full flex-col">
      <header className="relative border-b border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))]">
        {memoryToast ? (
          <div
            className="absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-100 shadow-md"
            role="status"
          >
            Erinnerung gespeichert
          </div>
        ) : null}

        {/* Mobile: kompakter Single-Row Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 lg:hidden">
          <div className="flex min-w-0 shrink items-baseline gap-1.5">
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--gold-text,var(--accent))]">Propus</span>
            <h1 className="truncate text-sm font-semibold text-[var(--text-main)]">Assistant</h1>
          </div>
          <div
            className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] p-0.5"
            role="radiogroup"
            aria-label="Modellmodus für Anfragen"
          >
            {(
              [
                { key: "auto" as const, labelShort: "Auto", title: "Standard: Haiku startet und kann bis zum Server-Maximum eskalieren" },
                { key: "sonnet" as const, labelShort: "Son.", title: "Fix auf Sonnet (oder tiefer bei Server-Limit), ohne Auto-Eskalation" },
                { key: "opus" as const, labelShort: "Opus", title: "Fix auf Opus (oder tiefer bei Server-Limit), ohne Auto-Eskalation" },
              ] as const
            ).map((opt) => {
              const active = modelMode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={opt.title}
                  onClick={() => persistModelMode(opt.key)}
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold transition ${
                    active
                      ? "bg-[var(--accent)] text-[var(--gold-on-gold)]"
                      : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {opt.labelShort}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setHistorySheetOpen(true)}
            className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-subtle)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
            title="Verlauf, Erinnerungen & Mobile-Zugang"
            aria-label="Verlauf öffnen"
          >
            <HistoryIcon className="h-4 w-4" />
            {historyItems.length > 0 ? (
              <span className="absolute right-1 top-1 inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-subtle)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
            title="Einstellungen"
            aria-label="Einstellungen"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={messages.length === 0}
            onClick={() => {
              setMessages([]);
              historyRef.current = [];
              conversationIdRef.current = null;
              setError(null);
              setRestoredBanner(false);
              setPendingConfirmation(null);
              setLiveModelLabel(null);
            }}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-subtle)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)] disabled:opacity-30 disabled:hover:bg-transparent"
            title="Neu starten"
            aria-label="Neu starten"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop: bisheriger 2-zeiliger Header */}
        <div className="hidden flex-col gap-3 px-5 py-4 lg:flex lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex w-full min-w-0 items-center justify-between gap-2 lg:w-auto lg:max-w-[55%]">
            <div className="min-w-0 shrink-0">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold-text,var(--accent))]">Propus</div>
              <h1 className="text-xl font-semibold text-[var(--text-main)]">Assistant</h1>
            </div>
            <div
              className="flex max-w-full min-w-0 shrink flex-wrap items-center justify-end gap-0.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] p-0.5 sm:justify-center"
              role="radiogroup"
              aria-label="Modellmodus für Anfragen"
            >
              {(
                [
                  { key: "auto" as const, label: "Auto", title: "Standard: Haiku startet und kann bis zum Server-Maximum eskalieren" },
                  { key: "sonnet" as const, label: "Sonnet fix", title: "Fix auf Sonnet (oder tiefer bei Server-Limit), ohne Auto-Eskalation" },
                  { key: "opus" as const, label: "Opus fix", title: "Fix auf Opus (oder tiefer bei Server-Limit), ohne Auto-Eskalation" },
                ] as const
              ).map((opt) => {
                const active = modelMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={opt.title}
                    onClick={() => persistModelMode(opt.key)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-card,var(--surface))] ${
                      active
                        ? "bg-[var(--accent)] text-[var(--gold-on-gold)]"
                        : "text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          {liveModelLabel ? (
            <div
              className="w-full min-w-0 shrink-0 text-center text-[11px] text-[var(--text-subtle)] lg:w-auto lg:text-left"
              title="Zuletzt verwendetes Claude-Modell für die Antwort"
            >
              <span className="font-medium text-[var(--text-main)]">Modell:</span>{" "}
              <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 py-0.5 font-medium text-[var(--gold-text,var(--accent))]">
                {liveModelLabel}
              </span>
            </div>
          ) : messages.some((m) => m.isStreaming) ? (
            <div className="w-full min-w-0 shrink-0 text-center text-[11px] text-[var(--text-subtle)] lg:w-auto lg:text-left">
              <span className="font-medium text-[var(--text-main)]">Modell:</span>{" "}
              <span className="animate-pulse">…</span>
            </div>
          ) : null}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:justify-start lg:ml-auto">
            <button
              type="button"
              className="rounded-full border border-[var(--border-soft)] bg-[var(--surface)] p-2 text-[var(--text-subtle)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
              onClick={() => setShowSettings(true)}
              title="Einstellungen"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-subtle)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)] disabled:opacity-40"
              disabled={messages.length === 0}
              onClick={() => {
                setMessages([]);
                historyRef.current = [];
                conversationIdRef.current = null;
                setError(null);
                setRestoredBanner(false);
                setPendingConfirmation(null);
                setLiveModelLabel(null);
              }}
            >
              Neu starten
            </button>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden bg-[var(--surface-raised)]/40 px-3 py-4 sm:px-5 sm:py-5">
        {restoredBanner ? (
          <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-4 py-2.5 text-center text-sm text-[var(--text-subtle)]">
            Ältere Konversation geladen — neuer Kontext ab hier
          </div>
        ) : null}

        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-12 text-center sm:py-24">
            <Bot className="mb-4 h-10 w-10 text-[var(--gold-text,var(--accent))]" />
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Frag mich nach Aufträgen, Touren oder Posteingang.</h2>
            <p className="mt-2 text-sm text-[var(--text-subtle)]">
              Ich kann Daten lesen und auf Wunsch Aufgaben, Tickets und Notizen erstellen oder Statusänderungen vorschlagen — mit Bestätigung.
            </p>
            <div className="mt-6 flex w-full flex-wrap justify-center gap-2">
              {[
                "Welche Aufträge habe ich heute?",
                "Zeig mir den Posteingang von heute",
                "Welche Touren laufen aktuell?",
                "Welche Tickets sind offen?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={inputDisabled}
                  onClick={() => void send(prompt)}
                  className="rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-main)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 hover:text-[var(--gold-text,var(--accent))] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className={`flex min-w-0 gap-2 sm:gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            {message.role === "assistant" ? (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-subtle,var(--surface-raised))] text-[var(--gold-text,var(--accent))]">
                <Bot className="h-4 w-4" />
              </div>
            ) : null}
            <div className={`min-w-0 max-w-[min(100%,calc(100vw-4.5rem),28rem)] rounded-2xl px-3 py-3 text-sm leading-6 shadow-sm sm:max-w-[78%] sm:px-4 ${message.role === "user" ? "bg-[var(--accent)] text-[var(--gold-on-gold)]" : "border border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-main)]"}`}>
              {message.toolCalls?.length ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {message.toolCalls.map((call, idx) => (
                    <span key={`${call.name}-${idx}`} className={`rounded-full border px-2 py-0.5 text-[11px] ${call.error ? "border-red-500/30 bg-red-500/10 text-[var(--text-main)]" : "border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--gold-text,var(--accent))]"}`}>
                      {call.name}
                      {call.durationMs != null && !call.error ? <span className="ml-1 opacity-60">{call.durationMs}ms</span> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</div>
              {message.isStreaming ? (
                <span className="mt-1 inline-block h-4 w-1 animate-pulse bg-[var(--accent)]" />
              ) : null}
              {message.modelUsed || message.modelModeNotice ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {message.modelUsed ? (
                    <span className="inline-block rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-2 py-0.5 text-[10px] text-[var(--gold-text,var(--accent))]">
                      {message.escalated ? "⚡ " : null}
                      {formatModelLabel(message.modelUsed)}
                    </span>
                  ) : null}
                  {message.modelModeNotice ? (
                    <span className="inline-block rounded-full border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] text-[var(--text-subtle)]">
                      {message.modelModeNotice}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {message.role === "user" ? (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--gold-on-gold)]">
                <UserRound className="h-4 w-4" />
              </div>
            ) : null}
          </div>
        ))}

        {pendingConfirmation ? (
          <ConfirmationCard
            confirmation={pendingConfirmation}
            onConfirm={() => void handleConfirm(true)}
            onCancel={() => void handleConfirm(false)}
            isProcessing={isConfirming}
          />
        ) : null}

        {isLoading && !messages.some((m) => m.isStreaming) ? (
          <div className="text-sm text-[var(--text-subtle)]">Assistant denkt nach ...</div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--text-main)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <span>{formatAssistantErrorBanner(error)}</span>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
        {/* Mobile: Single-Pill mit Mic + Input + Send */}
        <div className="lg:hidden">
          <div className="flex min-w-0 items-center gap-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] py-1 pl-1 pr-1.5 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20">
            <VoiceButton
              variant="icon"
              disabled={inputDisabled}
              onTranscript={(text) => void send(text)}
              onError={(msg) => setError({ message: msg })}
            />
            <input
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-subtle)] disabled:opacity-50"
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitText();
                }
              }}
              placeholder={pendingConfirmation ? "Bestätigen oder abbrechen …" : "Nachricht …"}
              disabled={inputDisabled}
            />
            <button
              type="button"
              onClick={submitText}
              disabled={inputDisabled || !textInput.trim()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--gold-on-gold)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Senden"
              title="Senden"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-[var(--text-subtle)]">
            <span className="min-w-0 truncate">
              {liveModelLabel ? (
                <>
                  <span className="text-[var(--text-main)]">Modell:</span>{" "}
                  <span className="text-[var(--gold-text,var(--accent))]">{liveModelLabel}</span>
                  <span className="mx-1.5 opacity-40">·</span>
                </>
              ) : null}
              <span className={`tabular-nums ${tokenColor}`}>
                {formatUsageTokens(usagePeriods.today.totalTokens)} Tok / {formatUsageChf(usagePeriods.today.costChf)} heute
              </span>
            </span>
            {tokenPct > 80 ? (
              <span className="shrink-0 text-yellow-500">{Math.round(tokenPct)}%</span>
            ) : null}
          </div>
        </div>

        {/* Desktop: Bisherige Footer-Struktur */}
        <div className="hidden lg:block">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              className="min-h-11 min-w-0 w-full flex-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-50 sm:min-w-[12rem]"
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitText();
                }
              }}
              placeholder={pendingConfirmation ? "Bitte bestätige oder brich die Aktion ab …" : "Nach Aufträgen, Touren oder Posteingang fragen ..."}
              disabled={inputDisabled}
            />
            <button
              type="button"
              onClick={submitText}
              disabled={inputDisabled || !textInput.trim()}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--gold-on-gold)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Senden
            </button>
            <VoiceButton disabled={inputDisabled} onTranscript={(text) => void send(text)} onError={(msg) => setError({ message: msg })} />
          </div>
          <div className="mt-2 flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
              <div className="grid w-full min-w-[16rem] max-w-full grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[10px] leading-tight sm:min-w-0 sm:max-w-md sm:gap-x-3 sm:text-[11px]">
                <span className="text-[var(--text-subtle)]" aria-hidden />
                <span className="text-[var(--text-subtle)]">Heute</span>
                <span className="text-[var(--text-subtle)]">Diese Woche</span>
                <span className="text-[var(--text-subtle)]">Dieser Monat</span>
                <span className="text-[var(--text-subtle)]">Token</span>
                <span className={`tabular-nums ${tokenColor}`}>{formatUsageTokens(usagePeriods.today.totalTokens)}</span>
                <span className="tabular-nums text-[var(--text-subtle)]">{formatUsageTokens(usagePeriods.week.totalTokens)}</span>
                <span className="tabular-nums text-[var(--text-subtle)]">{formatUsageTokens(usagePeriods.month.totalTokens)}</span>
                <span className="text-[var(--text-subtle)]">Kosten</span>
                <span className={`tabular-nums ${tokenColor}`}>{formatUsageChf(usagePeriods.today.costChf)}</span>
                <span className="tabular-nums text-[var(--text-subtle)]">{formatUsageChf(usagePeriods.week.costChf)}</span>
                <span className="tabular-nums text-[var(--text-subtle)]">{formatUsageChf(usagePeriods.month.costChf)}</span>
              </div>
            </div>
            {tokenPct > 80 ? (
              <span className="shrink-0 text-[11px] text-yellow-500 sm:pt-0.5">
                {Math.round(tokenPct)}% des Tageslimits
              </span>
            ) : null}
          </div>
        </div>
      </footer>
      </div>

      {/* Settings Panel */}
      {showSettings ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-main)]">Assistant-Einstellungen</h2>
              <button type="button" onClick={() => setShowSettings(false)} className="text-[var(--text-subtle)] hover:text-[var(--text-main)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">Modell</label>
                <select
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                  value={settings?.model || ""}
                  onChange={(e) => isAdmin && void saveSettings({ model: e.target.value })}
                  disabled={!isAdmin}
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">Tageslimit (Tokens)</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                  value={settings?.dailyTokenLimit || 500000}
                  onChange={(e) => isAdmin && void saveSettings({ dailyTokenLimit: Number(e.target.value) })}
                  disabled={!isAdmin}
                  min={10000}
                  step={50000}
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--text-main)]">Streaming</label>
                <button
                  type="button"
                  className={`relative h-6 w-11 rounded-full transition ${settings?.streamingEnabled ? "bg-[var(--accent)]" : "bg-[var(--border-soft)]"}`}
                  onClick={() => isAdmin && void saveSettings({ streamingEnabled: !settings?.streamingEnabled })}
                  disabled={!isAdmin}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settings?.streamingEnabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-main)]">Tools</label>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-soft)] p-2">
                  {availableTools.map((tool) => {
                    const enabled = settings?.enabledTools?.includes(tool.name) ?? true;
                    return (
                      <label key={tool.name} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--surface-raised)]">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => {
                            if (!isAdmin) return;
                            const current = settings?.enabledTools || availableTools.map((t) => t.name);
                            const next = enabled
                              ? current.filter((n) => n !== tool.name)
                              : [...current, tool.name];
                            void saveSettings({ enabledTools: next });
                          }}
                          disabled={!isAdmin}
                          className="accent-[var(--accent)]"
                        />
                        <span className="text-[var(--text-main)]">{tool.name}</span>
                        <span className="ml-auto truncate text-[11px] text-[var(--text-subtle)]">{tool.description.slice(0, 40)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {!isAdmin ? (
                <p className="text-xs text-[var(--text-subtle)]">Nur Super-Admins können Einstellungen ändern.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {historySheetOpen ? (
        <button
          type="button"
          aria-label="Verlauf schließen"
          onClick={() => setHistorySheetOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      ) : null}

      <aside
        className={`flex min-h-0 min-w-0 flex-col bg-[var(--surface-card,var(--surface))] lg:border-l lg:border-[var(--border-soft)] max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[85dvh] max-lg:rounded-t-2xl max-lg:border max-lg:border-[var(--border-soft)] max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200 max-lg:will-change-transform ${historySheetOpen ? "max-lg:translate-y-0" : "max-lg:translate-y-full max-lg:pointer-events-none"}`}
      >
        <div className="lg:hidden">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--border-soft)]" aria-hidden />
          <div className="flex items-center justify-between px-4 pb-1 pt-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)]">Verlauf</span>
            <button
              type="button"
              onClick={() => setHistorySheetOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
              aria-label="Schließen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="border-b border-[var(--border-soft)] px-4 py-4 max-lg:pt-1">
          <div className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)] lg:block">Verlauf</div>
          <h2 className="text-sm font-semibold text-[var(--text-main)] lg:mt-1">Letzte 20 Chats</h2>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              className="w-full rounded-full border border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] py-2 pl-8 pr-3 text-xs text-[var(--text-main)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
              placeholder="Chats suchen ..."
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
            />
          </div>
          <div className="mt-2 flex gap-1">
            {HISTORY_FILTERS.map((filter) => {
              const active = historyFilter === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setHistoryFilter(filter.key)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    active
                      ? "bg-[var(--accent)] text-[var(--gold-on-gold)]"
                      : "border border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {historyItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-soft)] px-3 py-4 text-sm text-[var(--text-subtle)]">
              Noch kein Verlauf vorhanden.
            </div>
          ) : null}
          {historyItems.map((item) => {
            const snippet = item.lastUserMessage || item.title || "Ohne Titel";
            const isActive = conversationIdRef.current === item.id;
            const isBusy = historyBusyId === item.id;
            return (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                className={`group cursor-pointer rounded-xl border p-3 transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-raised)] ${isActive ? "border-[var(--accent)]/50 bg-[var(--accent)]/5" : "border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))]"}`}
                onClick={() => void loadConversation(item.id)}
                onKeyDown={(e) => { if (e.key === "Enter") void loadConversation(item.id); }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[var(--text-main)] line-clamp-2">{snippet}</div>
                    <div className="mt-1 text-[11px] text-[var(--text-subtle)]">
                      {new Date(item.updatedAt).toLocaleString("de-CH", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                    {historyFilter === "trash" ? (
                      <button
                        type="button"
                        className="rounded-md p-1 text-[var(--text-subtle)] transition hover:bg-emerald-500/10 hover:text-emerald-500 disabled:opacity-40"
                        title="Wiederherstellen"
                        disabled={isBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void updateHistoryItem(item.id, "restore");
                        }}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-md p-1 text-[var(--text-subtle)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--gold-text,var(--accent))] disabled:opacity-40"
                        title={historyFilter === "archived" ? "Aus Archiv holen" : "Archivieren"}
                        disabled={isBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void updateHistoryItem(item.id, historyFilter === "archived" ? "unarchive" : "archive");
                        }}
                      >
                        {historyFilter === "archived" ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {historyFilter !== "trash" ? (
                      <button
                        type="button"
                        className="rounded-md p-1 text-[var(--text-subtle)] transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                        title="In Papierkorb"
                        disabled={isBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void updateHistoryItem(item.id, "trash");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.customerId ? (
                    <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] text-[var(--gold-text,var(--accent))]">
                      Kunde: {item.customerName || `#${item.customerId}`}
                    </span>
                  ) : null}
                  {item.bookingOrderNo ? (
                    <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] text-[var(--gold-text,var(--accent))]">
                      Auftrag #{item.bookingOrderNo}
                    </span>
                  ) : null}
                  {item.tourId ? (
                    <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] text-[var(--gold-text,var(--accent))]">
                      Tour: {item.tourLabel || `#${item.tourId}`}
                    </span>
                  ) : null}
                  {!item.customerId && !item.bookingOrderNo && !item.tourId ? (
                    <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] text-[var(--text-subtle)]">
                      keine Zuordnung
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        <div className="border-t border-[var(--border-soft)]">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-[var(--surface-raised)]"
            onClick={() => setShowMemories(!showMemories)}
          >
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-[var(--gold-text,var(--accent))]" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)]">Erinnerungen</span>
            </div>
            {memories.length > 0 ? (
              <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--gold-text,var(--accent))]">
                {memories.length}
              </span>
            ) : null}
          </button>
          {showMemories ? (
            <div className="max-h-52 space-y-1.5 overflow-y-auto px-3 pb-3">
              {memories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border-soft)] px-3 py-2 text-xs text-[var(--text-subtle)]">
                  Keine Erinnerungen. Sag z. B. &quot;Merk dir: …&quot;
                </div>
              ) : null}
              {memories.map((mem) => (
                <div key={mem.id} className="group flex items-start gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] px-3 py-2">
                  <span className="flex-1 text-xs leading-5 text-[var(--text-main)]">{mem.body}</span>
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--text-subtle)] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                    onClick={() => void deleteMemory(mem.id)}
                    title="Erinnerung löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--border-soft)]">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-[var(--surface-raised)]"
            onClick={() => setShowMobileTokens(!showMobileTokens)}
          >
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-[var(--gold-text,var(--accent))]" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)]">Mobile-Zugang</span>
            </div>
            {mobileTokens.length > 0 ? (
              <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--gold-text,var(--accent))]">
                {mobileTokens.length}
              </span>
            ) : null}
          </button>
          {showMobileTokens ? (
            <div className="max-h-60 space-y-2 overflow-y-auto px-3 pb-3">
              <div className="flex gap-1.5">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-main)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)]"
                  placeholder="Label (z. B. iPhone Janez)"
                  value={newTokenLabel}
                  onChange={(e) => setNewTokenLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void createMobileToken(); }}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-[var(--gold-on-gold)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  onClick={() => void createMobileToken()}
                  disabled={tokenBusy}
                >
                  Erstellen
                </button>
              </div>

              {createdToken ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                  <div className="text-[11px] font-semibold text-emerald-400">Neuer Token — nur jetzt sichtbar:</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <code className="flex-1 break-all rounded bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--text-main)] select-all">{createdToken}</code>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-[var(--text-subtle)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
                      onClick={() => void navigator.clipboard.writeText(createdToken)}
                      title="Kopieren"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : null}

              {mobileTokens.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border-soft)] px-3 py-2 text-xs text-[var(--text-subtle)]">
                  Keine aktiven Mobile-Tokens.
                </div>
              ) : null}
              {mobileTokens.map((t) => (
                <div key={t.id} className="group flex items-start gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] px-3 py-2">
                  <div className="flex-1">
                    <div className="text-xs font-medium text-[var(--text-main)]">{t.label || "Ohne Label"}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--text-subtle)]">
                      Erstellt: {new Date(t.created_at).toLocaleDateString("de-CH")}
                      {t.last_used_at ? ` · Zuletzt: ${new Date(t.last_used_at).toLocaleDateString("de-CH")}` : " · Noch nie benutzt"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--text-subtle)] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                    onClick={() => void revokeMobileToken(t.id)}
                    title="Token widerrufen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </aside>
    </section>
  );
}
