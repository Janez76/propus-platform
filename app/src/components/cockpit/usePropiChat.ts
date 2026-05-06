'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type PropiRole = 'user' | 'assistant';
export interface PropiMessage {
  role: PropiRole;
  content: string;
}

interface UsePropiChatOptions {
  endpoint?: string;
  storageKey?: string;
  initialMessage?: PropiMessage;
  /** Maximum messages stored locally / sent to API. Default 20. */
  maxHistory?: number;
}

interface ToolEvent {
  name: string;
  durationMs?: number;
  error?: string;
}

interface UsePropiChatReturn {
  messages: PropiMessage[];
  loading: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  reset: () => void;
  abort: () => void;
  /** Tool-Calls die Propi aktuell oder zuletzt ausgeführt hat (Phase A: read-only Status, Phase B: Confirms). */
  activeTools: ToolEvent[];
  /** Persistierte Conversation-ID (vom /api/assistant-Backend). */
  conversationId: string | null;
}

const DEFAULT_INITIAL: PropiMessage = {
  role: 'assistant',
  content: 'Hi 👋 Ich bin Propi — dein Propus-Co-Pilot. Was kann ich für dich tun?',
};

export function usePropiChat(options: UsePropiChatOptions = {}): UsePropiChatReturn {
  const {
    endpoint = '/api/assistant?stream=true',
    storageKey = 'propus.cockpit.propi.v1',
    initialMessage = DEFAULT_INITIAL,
    maxHistory = 20,
  } = options;

  const conversationStorageKey = `${storageKey}.conv`;

  const [messages, setMessages] = useState<PropiMessage[]>([initialMessage]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeTools, setActiveTools] = useState<ToolEvent[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter(
            (m: unknown): m is PropiMessage =>
              typeof m === 'object' &&
              m !== null &&
              ((m as PropiMessage).role === 'user' || (m as PropiMessage).role === 'assistant') &&
              typeof (m as PropiMessage).content === 'string',
          );
          if (valid.length > 0) setMessages([initialMessage, ...valid]);
        }
      }
      const cid = window.localStorage.getItem(conversationStorageKey);
      if (cid) setConversationId(cid);
    } catch {
      /* corrupt storage */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated || loading || typeof window === 'undefined') return;
    const persistable = messages.slice(1).filter((m) => m.content.length > 0);
    try {
      if (persistable.length === 0) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify(persistable.slice(-maxHistory)));
    } catch {
      /* quota */
    }
  }, [messages, hydrated, loading, storageKey, maxHistory]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      setLoading(true);
      setActiveTools([]);

      const userMsg: PropiMessage = { role: 'user', content: trimmed };
      // Phase A: /api/assistant erwartet { userMessage, history, conversationId? }.
      // History exkludiert das initialMessage-Greeting (kein DB-Echo nötig).
      const baseHistory = messages.slice(-maxHistory + 1);
      const historyForApi = (baseHistory[0] === messages[0] ? baseHistory.slice(1) : baseHistory)
        .filter((m) => !!m.content);

      setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            userMessage: trimmed,
            history: historyForApi,
            ...(conversationId ? { conversationId } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => null);
          throw new Error(errBody?.error ?? `Request fehlgeschlagen (${res.status}).`);
        }

        const headerCid = res.headers.get('X-Conversation-Id');
        if (headerCid) {
          setConversationId(headerCid);
          try { window.localStorage.setItem(conversationStorageKey, headerCid); } catch { /* quota */ }
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIdx;
          while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
            if (!dataLine) continue;

            let payload: Record<string, unknown>;
            try {
              payload = JSON.parse(dataLine.slice(6));
            } catch {
              continue;
            }

            const evtType = payload.type as string | undefined;
            if (evtType === 'text_delta' && typeof payload.text === 'string') {
              const t = payload.text;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + t };
                }
                return next;
              });
            } else if (evtType === 'tool_start' && typeof payload.name === 'string') {
              const name = payload.name;
              setActiveTools((prev) => [...prev, { name }]);
            } else if (evtType === 'tool_result' && typeof payload.name === 'string') {
              const name = payload.name;
              const durationMs = typeof payload.duration === 'number' ? payload.duration : undefined;
              const errMsg = typeof payload.error === 'string' ? payload.error : undefined;
              setActiveTools((prev) => {
                const next = [...prev];
                const idx = next.findLastIndex((t) => t.name === name && t.durationMs === undefined);
                if (idx >= 0) next[idx] = { ...next[idx], durationMs, error: errMsg };
                else next.push({ name, durationMs, error: errMsg });
                return next;
              });
            } else if (evtType === 'done') {
              const cid = typeof payload.conversationId === 'string' ? payload.conversationId : null;
              if (cid) {
                setConversationId(cid);
                try { window.localStorage.setItem(conversationStorageKey, cid); } catch { /* quota */ }
              }
            } else if (evtType === 'error') {
              throw new Error(typeof payload.error === 'string' ? payload.error : 'Streaming-Fehler.');
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler.';
        setError(msg);
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [endpoint, loading, maxHistory, messages, conversationId, conversationStorageKey],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([initialMessage]);
    setError(null);
    setActiveTools([]);
    setConversationId(null);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(storageKey);
        window.localStorage.removeItem(conversationStorageKey);
      } catch { /* quota */ }
    }
  }, [initialMessage, storageKey, conversationStorageKey]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  return { messages, loading, error, send, reset, abort, activeTools, conversationId };
}
