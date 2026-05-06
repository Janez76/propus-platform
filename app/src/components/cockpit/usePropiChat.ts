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

interface UsePropiChatReturn {
  messages: PropiMessage[];
  loading: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  reset: () => void;
  abort: () => void;
}

const DEFAULT_INITIAL: PropiMessage = {
  role: 'assistant',
  content: 'Hi 👋 Ich bin Propi — dein Propus-Co-Pilot. Was kann ich für dich tun?',
};

export function usePropiChat(options: UsePropiChatOptions = {}): UsePropiChatReturn {
  const {
    endpoint = '/api/chat',
    storageKey = 'propus.cockpit.propi.v1',
    initialMessage = DEFAULT_INITIAL,
    maxHistory = 20,
  } = options;

  const [messages, setMessages] = useState<PropiMessage[]>([initialMessage]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
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

      const userMsg: PropiMessage = { role: 'user', content: trimmed };
      const baseHistory = messages.slice(-maxHistory + 1);
      const apiMessages: PropiMessage[] = [...baseHistory, userMsg].filter((m) => !!m.content);
      if (apiMessages[0] === messages[0]) apiMessages.shift();

      setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => null);
          throw new Error(errBody?.error ?? `Request fehlgeschlagen (${res.status}).`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nlIdx;
          while ((nlIdx = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 2);
            const lines = chunk.split('\n');
            const evt = lines.find((l) => l.startsWith('event: '))?.slice(7).trim();
            const data = lines.find((l) => l.startsWith('data: '))?.slice(6);
            if (!evt || !data) continue;

            try {
              const payload = JSON.parse(data);
              if (evt === 'delta' && typeof payload.text === 'string') {
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'assistant') {
                    next[next.length - 1] = { ...last, content: last.content + payload.text };
                  }
                  return next;
                });
              } else if (evt === 'error') {
                throw new Error(payload?.error ?? 'Streaming-Fehler.');
              }
            } catch (e) {
              if (evt === 'error') throw e;
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
    [endpoint, loading, maxHistory, messages],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([initialMessage]);
    setError(null);
    if (typeof window !== 'undefined') window.localStorage.removeItem(storageKey);
  }, [initialMessage, storageKey]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  return { messages, loading, error, send, reset, abort };
}
