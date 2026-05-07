'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { CheckCircle2, MapPin, MapPinOff, Mic, Paperclip, RotateCcw, Send, StopCircle, Wrench, XCircle } from 'lucide-react';
import { PropiAvatar } from './PropiAvatar';
import { usePropiChat } from './usePropiChat';
import { useGeolocation } from './useGeolocation';
import './propi-chat.css';

interface PropiChatProps {
  quickPrompts?: string[];
  greeting?: string;
}

const DEFAULT_PROMPTS = [
  '📊 Wochenrückblick',
  '📅 Wo bin ich morgen?',
  '⚡ Mahnungen senden',
  '💰 Cashflow Mai',
  '📷 Bildauswahl-Status',
];

export function PropiChat({ quickPrompts = DEFAULT_PROMPTS, greeting }: PropiChatProps) {
  const initialMessage = greeting ? { role: 'assistant' as const, content: greeting } : undefined;
  const geo = useGeolocation();
  const { messages, loading, error, send, reset, abort, activeTools } = usePropiChat({
    ...(initialMessage ? { initialMessage } : {}),
    location: geo.position,
  });
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  // Auto-Focus: beim Mount + nach jedem Streaming-Ende. So muss der User
  // nicht jedes Mal in das Eingabefeld klicken um zu schreiben.
  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    void send(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const handleQuickPrompt = (text: string) => {
    if (loading) return;
    void send(text);
  };

  return (
    <div className="propi-chat" role="region" aria-label="Propi Chat">
      <header className="propi-chat-head">
        <PropiAvatar size={36} followCursor={false} />
        <div className="propi-chat-head-text">
          <h4>Propi</h4>
          <small>
            <span className="propi-chat-online" />
            Online · Claude Sonnet 4.6
          </small>
        </div>
        <div className="propi-chat-actions">
          <button
            type="button"
            className="propi-chat-icon-btn"
            onClick={reset}
            title="Neuer Chat"
            aria-label="Neuer Chat"
            disabled={loading || messages.length <= 1}
          >
            <RotateCcw size={14} aria-hidden />
          </button>
        </div>
      </header>

      <div className="propi-chat-body" ref={bodyRef}>
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const isStreaming = loading && isLast && m.role === 'assistant';
          return (
            <div
              key={i}
              className={`propi-msg propi-msg-${m.role}`}
              data-streaming={isStreaming || undefined}
            >
              {m.role === 'assistant' && (
                <div className="propi-msg-avatar">
                  <PropiAvatar size={26} followCursor={false} />
                </div>
              )}
              <div className="propi-msg-body">
                {isStreaming && activeTools.length > 0 && (
                  <ToolPills tools={activeTools} />
                )}
                <div className="propi-msg-content">
                  {m.content || (isStreaming && activeTools.length === 0 ? <TypingDots /> : null)}
                </div>
              </div>
            </div>
          );
        })}
        {error && (
          <div className="propi-msg-error" role="alert">
            <strong>Fehler:</strong> {error}
          </div>
        )}
      </div>

      {quickPrompts.length > 0 && (
        <div className="propi-chat-prompts">
          {quickPrompts.map((p) => (
            <button
              key={p}
              type="button"
              className="propi-chat-qp"
              onClick={() => handleQuickPrompt(p.replace(/^\p{Emoji}\s*/u, ''))}
              disabled={loading}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <form className="propi-chat-input" onSubmit={handleSubmit}>
        <div className="propi-chat-input-field">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Frag Propi etwas…"
            rows={1}
            maxLength={4000}
            aria-label="Nachricht an Propi"
            disabled={loading}
          />
          <div className="propi-chat-tools">
            <button
              type="button"
              className="propi-chat-tool"
              data-active={geo.enabled && geo.position ? 'true' : undefined}
              onClick={() => (geo.enabled ? geo.clear() : void geo.request())}
              title={
                geo.position
                  ? `Standort aktiv (±${Math.round(geo.position.accuracy)}m) — Klick zum Deaktivieren`
                  : geo.errorCode === 'denied'
                  ? 'Standort: Browser-Berechtigung verweigert. Klick zum erneuten Anfragen, oder im Browser-Schloss-Symbol freigeben.'
                  : geo.errorCode === 'unsupported'
                  ? 'Standort: Browser unterstützt Geolocation nicht.'
                  : geo.error
                  ? `Standort nicht verfügbar: ${geo.error} — Klick zum erneuten Versuch.`
                  : 'Standort teilen — Propi kann dann Routen + Reisezeiten berechnen'
              }
              aria-label={geo.enabled ? 'Standort deaktivieren' : 'Standort teilen'}
              aria-pressed={geo.enabled && !!geo.position}
            >
              {geo.enabled && geo.position ? (
                <MapPin size={14} aria-hidden />
              ) : geo.error ? (
                <MapPinOff size={14} aria-hidden />
              ) : (
                <MapPin size={14} aria-hidden />
              )}
            </button>
            <button type="button" className="propi-chat-tool" title="Datei anhängen (bald)" aria-label="Datei anhängen" disabled>
              <Paperclip size={14} aria-hidden />
            </button>
            <button type="button" className="propi-chat-tool" title="Sprachnachricht (bald)" aria-label="Sprachnachricht" disabled>
              <Mic size={14} aria-hidden />
            </button>
          </div>
        </div>
        {loading ? (
          <button type="button" className="propi-chat-send" onClick={abort} title="Antwort abbrechen" aria-label="Antwort abbrechen" data-variant="stop">
            <StopCircle size={16} aria-hidden />
          </button>
        ) : (
          <button type="submit" className="propi-chat-send" disabled={!input.trim()} title="Senden (Enter)" aria-label="Senden">
            <Send size={16} aria-hidden />
          </button>
        )}
      </form>

      <div className="propi-chat-foot">
        Propi kann Fehler machen · <kbd>P</kbd> öffnet Chat · <kbd>⇧ Enter</kbd> für neue Zeile
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="propi-typing" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

interface ToolPillsProps {
  tools: { name: string; durationMs?: number; error?: string }[];
}

function ToolPills({ tools }: ToolPillsProps) {
  return (
    <div className="propi-tool-pills" role="status" aria-label="Propi nutzt Tools">
      {tools.map((t, i) => {
        const state = t.error ? 'error' : t.durationMs !== undefined ? 'done' : 'running';
        const Icon = state === 'error' ? XCircle : state === 'done' ? CheckCircle2 : Wrench;
        return (
          <span key={i} className="propi-tool-pill" data-state={state} title={t.error ?? t.name}>
            <Icon size={10} aria-hidden className={state === 'running' ? 'propi-tool-pill-spin' : undefined} />
            <code className="propi-tool-pill-name">{t.name}</code>
            {t.durationMs !== undefined && !t.error && (
              <span className="propi-tool-pill-dur">{t.durationMs}ms</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
