"use client";

import { Bot, Send, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VoiceButton } from "./VoiceButton";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; durationMs: number; error?: string }>;
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

export function ConversationView() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<unknown[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  async function loadHistory() {
    try {
      const res = await fetch("/api/assistant/history", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { conversations?: HistoryItem[] };
      if (res.ok) setHistoryItems(data.conversations || []);
    } catch {
      // Verlauf ist Komfort-UI; Chat selbst soll bei Fehlern weiter funktionieren.
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function send(userText: string) {
    const text = userText.trim();
    if (!text || isLoading) return;
    setError(null);
    setIsLoading(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: text }]);

    try {
      const res = await fetch("/api/assistant", {
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
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `Assistant-Fehler (${res.status})`);

      historyRef.current = data.history || [];
      conversationIdRef.current = data.conversationId || conversationIdRef.current;
      void loadHistory();
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
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assistant-Fehler");
    } finally {
      setIsLoading(false);
    }
  }

  function submitText() {
    const text = textInput;
    setTextInput("");
    void send(text);
  }

  return (
    <section className="grid h-[calc(100vh-1.5rem)] min-h-0 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] shadow-sm lg:h-[calc(100vh-3rem)] lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] px-5 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold-text,var(--accent))]">Propus</div>
          <h1 className="text-xl font-semibold text-[var(--text-main)]">Assistant</h1>
        </div>
        <button
          type="button"
          className="rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-subtle)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)] disabled:opacity-40"
          disabled={messages.length === 0}
          onClick={() => {
            setMessages([]);
            historyRef.current = [];
            conversationIdRef.current = null;
            setError(null);
          }}
        >
          Neu starten
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[var(--surface-raised)]/40 px-5 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-24 text-center">
            <Bot className="mb-4 h-10 w-10 text-[var(--gold-text,var(--accent))]" />
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Frag mich nach Aufträgen, Touren oder Posteingang.</h2>
            <p className="mt-2 text-sm text-[var(--text-subtle)]">
              Phase 1 ist bewusst read-only: Der Assistant liest Daten, führt aber keine Änderungen aus.
            </p>
            <div className="mt-6 grid gap-2 text-sm text-[var(--text-subtle)]">
              <span>„Welche Aufträge habe ich heute?“</span>
              <span>„Welche Touren laufen in den nächsten 30 Tagen ab?“</span>
              <span>„Gibt es offene Posteingang-Aufgaben?“</span>
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
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
            {message.role === "user" ? (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--gold-on-gold)]">
                <UserRound className="h-4 w-4" />
              </div>
            ) : null}
          </div>
        ))}

        {isLoading ? <div className="text-sm text-[var(--text-subtle)]">Assistant denkt nach ...</div> : null}
        {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--text-main)]">{error}</div> : null}
      </div>

      <footer className="border-t border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="min-w-[220px] flex-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitText();
              }
            }}
            placeholder="Nach Aufträgen, Touren oder Posteingang fragen ..."
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={submitText}
            disabled={isLoading || !textInput.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--gold-on-gold)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Senden
          </button>
          <VoiceButton disabled={isLoading} onTranscript={(text) => void send(text)} onError={setError} />
        </div>
      </footer>
      </div>

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
            return (
              <article key={item.id} className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-card,var(--surface))] p-3">
                <div className="text-sm font-medium text-[var(--text-main)]">{snippet}</div>
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
      </aside>
    </section>
  );
}
