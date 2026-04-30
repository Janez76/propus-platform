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

export function ConversationView() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<unknown[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

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
    <section className="flex h-full min-h-[680px] flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card,#111217)] shadow-sm">
      <header className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent,#B68E20)]">Propus</div>
          <h1 className="text-xl font-semibold text-[var(--text-main)]">Assistant</h1>
        </div>
        <button
          type="button"
          className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)] disabled:opacity-40"
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

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-24 text-center">
            <Bot className="mb-4 h-10 w-10 text-[var(--accent,#B68E20)]" />
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
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent,#B68E20)]/15 text-[var(--accent,#B68E20)]">
                <Bot className="h-4 w-4" />
              </div>
            ) : null}
            <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-[var(--accent,#B68E20)] text-black" : "border border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-main)]"}`}>
              {message.toolCalls?.length ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {message.toolCalls.map((call, idx) => (
                    <span key={`${call.name}-${idx}`} className={`rounded-full px-2 py-0.5 text-[11px] ${call.error ? "bg-red-500/15 text-red-300" : "bg-[var(--accent,#B68E20)]/15 text-[var(--accent,#B68E20)]"}`}>
                      {call.name}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
            {message.role === "user" ? (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent,#B68E20)] text-black">
                <UserRound className="h-4 w-4" />
              </div>
            ) : null}
          </div>
        ))}

        {isLoading ? <div className="text-sm text-[var(--text-subtle)]">Assistant denkt nach ...</div> : null}
        {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}
      </div>

      <footer className="border-t border-[var(--border-soft)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="min-w-[220px] flex-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent,#B68E20)]"
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
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent,#B68E20)] px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Senden
          </button>
          <VoiceButton disabled={isLoading} onTranscript={(text) => void send(text)} onError={setError} />
        </div>
      </footer>
    </section>
  );
}
