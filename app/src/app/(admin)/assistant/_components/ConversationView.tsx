"use client";

import { AlertCircle, Bot, Brain, CheckCircle, Clock, Send, Settings, ShieldAlert, Trash2, UserRound, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceButton } from "./VoiceButton";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; durationMs?: number; error?: string }>;
  isStreaming?: boolean;
  modelUsed?: string;
  escalated?: boolean;
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
  customerId: number | null;
  customerName: string | null;
  bookingOrderNo: number | null;
  bookingAddress: string | null;
  tourId: number | null;
  tourLabel: string | null;
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
};

type MemoryItem = {
  id: string;
  body: string;
  source: string;
  createdAt: string;
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
    <div className="mx-auto max-w-[78%] rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface)] p-4 shadow-md">
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
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [showMemories, setShowMemories] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [restoredBanner, setRestoredBanner] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<{ message: string; code?: ErrorCode } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ total: number; limit: number }>({ total: 0, limit: 500_000 });
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const historyRef = useRef<unknown[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, pendingConfirmation]);

  async function loadHistory() {
    try {
      const res = await fetch("/api/assistant/history", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { conversations?: HistoryItem[] };
      if (res.ok) setHistoryItems(data.conversations || []);
    } catch { /* non-critical */ }
  }

  async function loadMemories() {
    try {
      const res = await fetch("/api/assistant/memories", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { memories?: MemoryItem[] };
      if (res.ok) setMemories(data.memories || []);
    } catch { /* non-critical */ }
  }

  async function loadSettings() {
    try {
      const res = await fetch("/api/assistant/settings", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: AssistantSettings;
        usage?: { totalTokens: number };
        availableTools?: ToolInfo[];
        availableModels?: ModelInfo[];
        isAdmin?: boolean;
      };
      if (res.ok && data.settings) {
        setSettings(data.settings);
        setTokenUsage({ total: data.usage?.totalTokens || 0, limit: data.settings.dailyTokenLimit });
        setAvailableTools(data.availableTools || []);
        setAvailableModels(data.availableModels || []);
        setIsAdmin(Boolean(data.isAdmin));
      }
    } catch { /* non-critical */ }
  }

  async function deleteMemory(id: string) {
    try {
      await fetch(`/api/assistant/memories/${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
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
    } catch { /* non-critical */ }
  }

  useEffect(() => {
    void loadHistory();
    void loadMemories();
    void loadSettings();
  }, []);

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
    setMessages((current) => [
      ...current,
      { id: streamingMsgId, role: "assistant", content: "", toolCalls: [], isStreaming: true },
    ]);

    try {
      const res = await fetch("/api/assistant?stream=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: text,
          history: historyRef.current,
          conversationId: conversationIdRef.current,
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

          if (event.type === "text_delta") {
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
            setMessages((current) =>
              current.map((m) =>
                m.id === streamingMsgId ? { ...m, isStreaming: false, modelUsed: event.modelUsed as string | undefined, escalated: event.escalated as boolean | undefined } : m,
              ),
            );
            historyRef.current = [];
            void loadHistory();
            void loadSettings();
          } else if (event.type === "error") {
            throw { message: event.error as string, code: "model_error" as ErrorCode };
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
  }, []);

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: text,
          history: historyRef.current,
          conversationId: conversationIdRef.current,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        finalText?: string;
        history?: unknown[];
        conversationId?: string;
        toolCallsExecuted?: Array<{ name: string; durationMs: number; error?: string }>;
        pendingConfirmation?: PendingConfirmation;
        modelUsed?: string;
        escalated?: boolean;
        error?: string;
        code?: ErrorCode;
      };
      if (!res.ok) throw { message: data.error || `Fehler (${res.status})`, code: data.code };

      historyRef.current = data.history || [];
      conversationIdRef.current = data.conversationId || conversationIdRef.current;
      setRestoredBanner(false);
      void loadHistory();
      void loadSettings();
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
        },
      ]);

      if (data.pendingConfirmation) {
        setPendingConfirmation(data.pendingConfirmation);
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
    <section className="grid h-[calc(100vh-1.5rem)] min-h-0 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] shadow-sm lg:h-[calc(100vh-3rem)] lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] px-5 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold-text,var(--accent))]">Propus</div>
          <h1 className="text-xl font-semibold text-[var(--text-main)]">Assistant</h1>
        </div>
        <div className="flex items-center gap-2">
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
            }}
          >
            Neu starten
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[var(--surface-raised)]/40 px-5 py-5">
        {restoredBanner ? (
          <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-4 py-2.5 text-center text-sm text-[var(--text-subtle)]">
            Ältere Konversation geladen — neuer Kontext ab hier
          </div>
        ) : null}

        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-24 text-center">
            <Bot className="mb-4 h-10 w-10 text-[var(--gold-text,var(--accent))]" />
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Frag mich nach Aufträgen, Touren oder Posteingang.</h2>
            <p className="mt-2 text-sm text-[var(--text-subtle)]">
              Ich kann Daten lesen und auf Wunsch Aufgaben, Tickets und Notizen erstellen oder Statusänderungen vorschlagen — mit Bestätigung.
            </p>
            <div className="mt-6 grid gap-2 text-sm text-[var(--text-subtle)]">
              <span>„Welche Aufträge habe ich heute?"</span>
              <span>„Erstelle ein Ticket für Tour 123: Startpunkt anpassen"</span>
              <span>„Setze Auftrag 456 auf erledigt"</span>
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            {message.role === "assistant" ? (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-subtle,var(--surface-raised))] text-[var(--gold-text,var(--accent))]">
                <Bot className="h-4 w-4" />
              </div>
            ) : null}
            <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "bg-[var(--accent)] text-[var(--gold-on-gold)]" : "border border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-main)]"}`}>
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
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.isStreaming ? (
                <span className="mt-1 inline-block h-4 w-1 animate-pulse bg-[var(--accent)]" />
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
            <span>{error.code && ERROR_DISPLAY[error.code] ? ERROR_DISPLAY[error.code] : error.message}</span>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="min-w-[220px] flex-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-50"
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
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--gold-on-gold)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Senden
          </button>
          <VoiceButton disabled={inputDisabled} onTranscript={(text) => void send(text)} onError={(msg) => setError({ message: msg })} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-[11px] ${tokenColor}`}>
            ~{Math.round(tokenUsage.total / 1000)}k Token heute
          </span>
          {tokenPct > 80 ? (
            <span className="text-[11px] text-yellow-500">
              {Math.round(tokenPct)}% des Tageslimits
            </span>
          ) : null}
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

      <aside className="hidden min-h-0 border-l border-[var(--border-soft)] bg-[var(--surface)]/80 lg:flex lg:flex-col">
        <div className="border-b border-[var(--border-soft)] px-4 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)]">Verlauf</div>
          <h2 className="mt-1 text-sm font-semibold text-[var(--text-main)]">Letzte 20 Chats</h2>
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
            return (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                className={`cursor-pointer rounded-xl border p-3 transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-raised)] ${isActive ? "border-[var(--accent)]/50 bg-[var(--accent)]/5" : "border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))]"}`}
                onClick={() => void loadConversation(item.id)}
                onKeyDown={(e) => { if (e.key === "Enter") void loadConversation(item.id); }}
              >
                <div className="text-sm font-medium text-[var(--text-main)] line-clamp-2">{snippet}</div>
                <div className="mt-1 text-[11px] text-[var(--text-subtle)]">
                  {new Date(item.updatedAt).toLocaleString("de-CH", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
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
      </aside>
    </section>
  );
}
