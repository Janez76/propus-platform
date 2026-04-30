'use client';

/**
 * ChatBubble — einzelne Nachricht im Chat-Verlauf.
 */

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ name: string; durationMs: number; error?: string }>;
}

export function ChatBubble({ role, content, toolCalls }: ChatBubbleProps) {
  return (
    <div className={`bubble bubble--${role}`}>
      {toolCalls && toolCalls.length > 0 && (
        <div className="bubble__tools">
          {toolCalls.map((tc, i) => (
            <span key={i} className={`bubble__tool ${tc.error ? 'bubble__tool--error' : ''}`}>
              {tc.error ? '⚠' : '⚙'} {tc.name}
              <span className="bubble__tool-time">{tc.durationMs}ms</span>
            </span>
          ))}
        </div>
      )}
      <div className="bubble__content">{content}</div>

      <style jsx>{`
        .bubble {
          max-width: 80%;
          padding: 0.875rem 1.125rem;
          border-radius: 1.25rem;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 0.95rem;
          line-height: 1.55;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .bubble--user {
          align-self: flex-end;
          background: #b68e20;
          color: #0c0d10;
          border-bottom-right-radius: 0.375rem;
        }
        .bubble--assistant {
          align-self: flex-start;
          background: #16181c;
          color: #f5f0e1;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-bottom-left-radius: 0.375rem;
        }
        .bubble__tools {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
          margin-bottom: 0.5rem;
        }
        .bubble__tool {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.25rem 0.625rem;
          background: rgba(182, 142, 32, 0.12);
          border: 1px solid rgba(182, 142, 32, 0.3);
          border-radius: 0.5rem;
          font-size: 0.75rem;
          color: #d4a93a;
          font-family: 'JetBrains Mono', monospace;
        }
        .bubble__tool--error {
          background: rgba(220, 38, 38, 0.12);
          border-color: rgba(220, 38, 38, 0.4);
          color: #f87171;
        }
        .bubble__tool-time {
          opacity: 0.65;
        }
      `}</style>
    </div>
  );
}
