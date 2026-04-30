'use client';

/**
 * ConversationView — Chat-Hauptansicht mit Verlauf, Voice-Button und Text-Input.
 */

import { useEffect, useRef, useState } from 'react';
import { VoiceButton } from './VoiceButton';
import { ChatBubble } from './ChatBubble';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ name: string; durationMs: number; error?: string }>;
}

export function ConversationView() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Backend-History (Anthropic Format) — Client-seitig gehalten
  const historyRef = useRef<unknown[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (userText: string) => {
    if (!userText.trim() || isLoading) return;
    setError(null);

    const userMsgId = crypto.randomUUID();
    setMessages((m) => [...m, { id: userMsgId, role: 'user', content: userText }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: userText, history: historyRef.current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Fehler ${res.status}`);
      }
      const data = (await res.json()) as {
        finalText: string;
        history: unknown[];
        toolCallsExecuted: Array<{ name: string; durationMs: number; error?: string }>;
      };
      historyRef.current = data.history;

      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.finalText,
          toolCalls: data.toolCallsExecuted.map((tc) => ({
            name: tc.name,
            durationMs: tc.durationMs,
            error: tc.error,
          })),
        },
      ]);

      // Optional: TTS-Ausgabe via Browser-API
      if ('speechSynthesis' in window && data.finalText) {
        const utterance = new SpeechSynthesisUtterance(data.finalText);
        utterance.lang = 'de-DE';
        utterance.rate = 1.05;
        speechSynthesis.speak(utterance);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranscript = (text: string) => {
    if (text.trim()) send(text);
  };

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    send(textInput);
    setTextInput('');
  };

  return (
    <div className="cv">
      <div className="cv__header">
        <div className="cv__brand">Propus Assistant</div>
        <button
          type="button"
          className="cv__clear"
          onClick={() => {
            setMessages([]);
            historyRef.current = [];
            setError(null);
          }}
          disabled={messages.length === 0}
        >
          Neu starten
        </button>
      </div>

      <div className="cv__messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="cv__empty">
            <div className="cv__empty-title">Halte den Button gedrückt und sprich.</div>
            <div className="cv__empty-hints">
              <div>„Welche Aufträge habe ich morgen?"</div>
              <div>„Lege einen Auftrag für Müller in Zürich an."</div>
              <div>„Wie viele Touren laufen in 30 Tagen ab?"</div>
              <div>„Schalte das Wohnzimmerlicht an."</div>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <ChatBubble key={m.id} role={m.role} content={m.content} toolCalls={m.toolCalls} />
        ))}
        {isLoading && <div className="cv__typing">denkt nach …</div>}
        {error && <div className="cv__error">{error}</div>}
      </div>

      <div className="cv__footer">
        <input
          className="cv__text"
          type="text"
          placeholder="Oder hier tippen …"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleTextSubmit();
            }
          }}
          disabled={isLoading}
        />
        <VoiceButton onTranscript={handleTranscript} onError={setError} disabled={isLoading} />
      </div>

      <style jsx>{`
        .cv {
          display: flex;
          flex-direction: column;
          height: 100vh;
          max-height: 100vh;
          background: #0c0d10;
          color: #f5f0e1;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .cv__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .cv__brand {
          font-family: 'DM Serif Display', serif;
          font-size: 1.25rem;
          color: #d4a93a;
          letter-spacing: 0.01em;
        }
        .cv__clear {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #f5f0e1;
          padding: 0.5rem 0.875rem;
          border-radius: 9999px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .cv__clear:hover:not(:disabled) {
          border-color: #b68e20;
        }
        .cv__clear:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .cv__messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
        }
        .cv__empty {
          margin: auto;
          text-align: center;
          color: rgba(245, 240, 225, 0.6);
        }
        .cv__empty-title {
          font-family: 'DM Serif Display', serif;
          font-size: 1.5rem;
          color: #f5f0e1;
          margin-bottom: 1.5rem;
        }
        .cv__empty-hints {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-size: 0.9rem;
          font-style: italic;
        }
        .cv__typing {
          font-size: 0.85rem;
          color: rgba(245, 240, 225, 0.5);
          padding: 0 0.5rem;
        }
        .cv__error {
          padding: 0.75rem 1rem;
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.3);
          border-radius: 0.5rem;
          color: #f87171;
          font-size: 0.85rem;
        }
        .cv__footer {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          background: #0c0d10;
        }
        .cv__text {
          flex: 1;
          padding: 0.875rem 1rem;
          background: #16181c;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 9999px;
          color: #f5f0e1;
          font-family: inherit;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .cv__text:focus {
          border-color: rgba(182, 142, 32, 0.5);
        }
        .cv__text::placeholder {
          color: rgba(245, 240, 225, 0.35);
        }
      `}</style>
    </div>
  );
}
