'use client';

/**
 * VoiceButton — Push-to-Talk Recording.
 * Hält Aufnahme im MediaRecorder, schickt an /api/assistant/transcribe.
 */

import { useEffect, useRef, useState } from 'react';

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

type State = 'idle' | 'recording' | 'transcribing';

// Bevorzugt webm/opus (Chrome/Firefox/Edge), fällt auf MP4/AAC zurück (Safari/iOS).
// Whisper akzeptiert webm, m4a, mp3, mp4, mpeg, mpga, wav, oga, ogg, flac.
const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
];

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported?.(candidate)) return candidate;
  }
  return ''; // Browser-Default
}

function mimeTypeToExtension(mime: string): string {
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

export function VoiceButton({ onTranscript, onError, disabled }: VoiceButtonProps) {
  const [state, setState] = useState<State>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    if (disabled || state !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        setState('transcribing');
        const blobType = recorder.mimeType || mimeType || chunksRef.current[0]?.type || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobType });
        const ext = mimeTypeToExtension(blobType);
        const fd = new FormData();
        fd.append('audio', blob, `audio.${ext}`);
        try {
          const res = await fetch('/api/assistant/transcribe', { method: 'POST', body: fd });
          if (!res.ok) throw new Error(`Transkription fehlgeschlagen (${res.status})`);
          const data = (await res.json()) as { text: string };
          onTranscript(data.text);
        } catch (err) {
          onError?.(err instanceof Error ? err.message : 'Fehler');
        } finally {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setState('idle');
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setState('recording');
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Mikrofon-Zugriff verweigert');
    }
  };

  const stopRecording = () => {
    if (state === 'recording' && recorderRef.current) {
      recorderRef.current.stop();
    }
  };

  return (
    <button
      type="button"
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onMouseLeave={stopRecording}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      disabled={disabled || state === 'transcribing'}
      aria-label={state === 'recording' ? 'Aufnahme läuft, loslassen zum Senden' : 'Halten zum Sprechen'}
      className="propus-voice-btn"
      data-state={state}
    >
      <span className="propus-voice-btn__icon">
        {state === 'transcribing' ? (
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
            </circle>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </span>
      <span className="propus-voice-btn__label">
        {state === 'idle' && 'Halten zum Sprechen'}
        {state === 'recording' && 'Aufnahme läuft …'}
        {state === 'transcribing' && 'Verarbeite …'}
      </span>

      <style jsx>{`
        .propus-voice-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1.5rem;
          border-radius: 9999px;
          background: #0c0d10;
          color: #f5f0e1;
          border: 1px solid rgba(182, 142, 32, 0.4);
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 0.95rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
        }
        .propus-voice-btn:hover:not(:disabled) {
          border-color: #b68e20;
          box-shadow: 0 0 0 4px rgba(182, 142, 32, 0.12);
        }
        .propus-voice-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .propus-voice-btn[data-state='recording'] {
          background: #b68e20;
          color: #0c0d10;
          border-color: #d4a93a;
          animation: propus-pulse 1.4s ease-in-out infinite;
        }
        .propus-voice-btn[data-state='transcribing'] {
          background: #1a1c20;
        }
        .propus-voice-btn__icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        @keyframes propus-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(182, 142, 32, 0.5); }
          50% { box-shadow: 0 0 0 12px rgba(182, 142, 32, 0); }
        }
      `}</style>
    </button>
  );
}
