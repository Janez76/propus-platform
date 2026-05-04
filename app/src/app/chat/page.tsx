"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { UIButton } from "@/components/ui/UIButton";
import { UIInput } from "@/components/ui/UIInput";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "Grüezi! Ich bin der Propus-Chatbot. Wie kann ich Ihnen heute weiterhelfen?",
};

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setError(null);
    setInput("");
    setLoading(true);

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const apiMessages = [...messages, userMsg].filter((m) => m !== INITIAL_MESSAGE);
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({ error: "Fehler beim Abrufen der Antwort." }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const block of events) {
          const lines = block.split("\n");
          let eventName = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          let parsed: { text?: string; error?: string };
          try {
            parsed = JSON.parse(dataLine);
          } catch {
            continue;
          }

          if (eventName === "delta" && parsed.text) {
            const chunk = parsed.text;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + chunk };
              }
              return next;
            });
          } else if (eventName === "error") {
            throw new Error(parsed.error || "Streaming-Fehler.");
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
      setError(message);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.content === "") next.pop();
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-8" style={{ background: "var(--bg)" }}>
      <Card className="flex w-full max-w-2xl flex-col gap-4" >
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
            Propus Chatbot
          </h1>
          <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
            Test-Chatbot — keine Daten werden gespeichert.
          </p>
        </header>

        <div
          ref={scrollRef}
          className="flex h-[60vh] flex-col gap-3 overflow-y-auto rounded-lg p-3"
          style={{ background: "var(--surface-alt, var(--bg))", border: "1px solid var(--border-soft)" }}
        >
          {messages.map((m, idx) => (
            <MessageBubble key={idx} role={m.role} content={m.content} pending={loading && idx === messages.length - 1 && m.role === "assistant" && m.content === ""} />
          ))}
        </div>

        {error && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ background: "rgba(220,60,60,0.1)", color: "#c93b3b", border: "1px solid rgba(220,60,60,0.3)" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <UIInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Frage zu Propus stellen…"
            disabled={loading}
            className="flex-1"
            autoFocus
          />
          <UIButton type="submit" variant="primary" disabled={loading || !input.trim()}>
            {loading ? "…" : "Senden"}
          </UIButton>
        </form>
      </Card>
    </main>
  );
}

function MessageBubble({ role, content, pending }: { role: ChatRole; content: string; pending?: boolean }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed"
        style={
          isUser
            ? { background: "var(--brand, #B68E20)", color: "#fff" }
            : { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border-soft)" }
        }
      >
        {pending ? <span className="opacity-60">tippt …</span> : content}
      </div>
    </div>
  );
}
