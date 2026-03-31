import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Send } from "lucide-react";
import { getToursAdminAiChatConfig, postToursAdminAiChat } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminAiChatConfigQueryKey } from "../../../lib/queryKeys";

const LEGACY = "/tour-manager/admin/ai-chat";

type Msg = { role: "user" | "assistant"; content: string };

export function ToursAdminAiChatPage() {
  const qk = toursAdminAiChatConfigQueryKey();
  const queryFn = useCallback(() => getToursAdminAiChatConfig(), []);
  const { data, loading, error } = useQuery(qk, queryFn, { staleTime: 60_000 });

  const allowedModels = (data?.allowedModels as string[]) || ["gpt-5.4", "gpt-5-mini", "gpt-4.1"];
  const adminName = String(data?.adminName || "Admin");

  const [model, setModel] = useState("gpt-5.4");
  useEffect(() => {
    if (data?.defaultModel) setModel(String(data.defaultModel));
  }, [data?.defaultModel]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);

  if (loading && !data) return <p className="text-sm text-[var(--text-subtle)]">Laden …</p>;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setChatErr(null);
    const userMsg: Msg = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setPending(true);
    try {
      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const r = await postToursAdminAiChat({
        message: text,
        history: history.slice(-12),
        model,
        path: typeof window !== "undefined" ? window.location.pathname : "",
      });
      const answer = String((r as { answer?: string }).answer || "");
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch (err) {
      setChatErr(err instanceof Error ? err.message : "Fehler");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">KI-Chat</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">
          Vereinfachte Chat-Antworten (ohne Bestätigungs-Aktionen wie im{" "}
          <a href={LEGACY} className="text-[var(--accent)] hover:underline">
            klassischen Admin
          </a>
          ).
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {chatErr ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {chatErr}
        </div>
      ) : null}

      <p className="text-sm text-[var(--text-main)]">Hallo {adminName}</p>

      <div className="surface-card-strong flex flex-col min-h-[360px] max-h-[60vh]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {messages.length === 0 ? (
            <p className="text-[var(--text-subtle)]">Stelle eine Frage zum Tour-Manager …</p>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 max-w-[95%] whitespace-pre-wrap ${
                  m.role === "user" ? "bg-[var(--accent)]/15 ml-8" : "bg-[var(--surface)] border border-[var(--border-soft)] mr-8"
                }`}
              >
                {m.content}
              </div>
            ))
          )}
        </div>
        <form onSubmit={send} className="border-t border-[var(--border-soft)] p-3 flex flex-wrap gap-2 items-center">
          <label className="text-xs text-[var(--text-subtle)] flex items-center gap-1">
            Modell
            <select
              className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 text-xs"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {allowedModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <input
            className="flex-1 min-w-[160px] rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nachricht …"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Senden
          </button>
        </form>
      </div>
    </div>
  );
}
