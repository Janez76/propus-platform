'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { CheckCircle2, FileText, ImageIcon, Loader2, MapPin, MapPinOff, Mic, Paperclip, RotateCcw, Send, StopCircle, Wrench, X, XCircle } from 'lucide-react';
import { PropiAvatar } from './PropiAvatar';
import { usePropiChat, type PropiAttachment } from './usePropiChat';
import { useGeolocation } from './useGeolocation';
import './propi-chat.css';

// Limits MIRRORN was das Backend in src/lib/assistant/attachments.ts erlaubt
// — Server-Validierung bleibt der Source-of-Truth, hier nur fuer fruehe UX-Fehler.
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];
const ACCEPT_ATTR = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES].join(',');

function fileToAttachment(file: File): Promise<PropiAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Konnte ${file.name} nicht lesen`));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error(`Unerwartetes FileReader-Format fuer ${file.name}`));
        return;
      }
      // result ist "data:<mime>;base64,<b64>" — Prefix abschneiden
      const commaIdx = result.indexOf(',');
      const data = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
      resolve({
        type: isImage ? 'image' : 'document',
        mediaType: file.type,
        data,
        filename: file.name,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

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
  // Stick-to-bottom-Flag: Auto-Scroll nur wenn der User ohnehin am Ende ist.
  // Sobald er hochscrollt um aelteres zu lesen, bleibt seine Scroll-Position
  // erhalten, statt vom naechsten Streaming-Tick wieder runtergesnappt zu
  // werden.
  const stickToBottomRef = useRef(true);
  const SCROLL_BOTTOM_TOLERANCE = 64;
  const handleBodyScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance <= SCROLL_BOTTOM_TOLERANCE;
  };

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) return;
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

  // ── Sprachnachricht: Halten zum Sprechen → Whisper /api/assistant/transcribe ──
  // Transkript landet im Eingabefeld (kein Auto-Send), damit der User noch
  // korrigieren kann bevor er auf Enter drueckt.
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef(0);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      chunksRef.current = [];
    };
  }, []);
  useEffect(() => {
    if (!voiceError) return;
    const id = setTimeout(() => setVoiceError(null), 4000);
    return () => clearTimeout(id);
  }, [voiceError]);

  const startRecording = async () => {
    if (voiceState !== 'idle' || loading) return;
    setVoiceError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Audioaufnahme von diesem Browser nicht unterstützt');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType =
        typeof MediaRecorder.isTypeSupported === 'function'
          ? candidates.find((m) => MediaRecorder.isTypeSupported(m))
          : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstart = () => { recordingStartedAtRef.current = Date.now(); };
      recorder.onstop = () => void transcribeRecording();
      recorder.start();
      recorderRef.current = recorder;
      setVoiceState('recording');
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Mikrofon-Zugriff fehlgeschlagen');
      setVoiceState('idle');
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const stopRecording = () => {
    if (voiceState === 'recording' && recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  // ── Datei-Anhaenge: Picker, Chips, Validierung ─────────────────────────
  const [attachments, setAttachments] = useState<PropiAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!attachmentError) return;
    const id = setTimeout(() => setAttachmentError(null), 5000);
    return () => clearTimeout(id);
  }, [attachmentError]);

  const openFilePicker = () => fileInputRef.current?.click();

  const onFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    setAttachmentError(null);

    const remainingSlots = MAX_ATTACHMENTS - attachments.length;
    if (remainingSlots <= 0) {
      setAttachmentError(`Maximal ${MAX_ATTACHMENTS} Anhaenge`);
      return;
    }
    const accepted = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setAttachmentError(`Nur die ersten ${remainingSlots} Datei(en) genommen — Limit ${MAX_ATTACHMENTS}.`);
    }

    let runningTotal = attachments.reduce((sum, a) => sum + a.size, 0);
    const valid: File[] = [];
    for (const f of accepted) {
      const ok =
        ALLOWED_IMAGE_TYPES.includes(f.type) || ALLOWED_DOCUMENT_TYPES.includes(f.type);
      if (!ok) {
        setAttachmentError(`${f.name}: Typ ${f.type || 'unbekannt'} nicht unterstützt`);
        continue;
      }
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(`${f.name}: ${formatBytes(f.size)} > Limit ${formatBytes(MAX_ATTACHMENT_BYTES)}`);
        continue;
      }
      if (runningTotal + f.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
        setAttachmentError(`Gesamtgroesse ueber ${formatBytes(MAX_ATTACHMENTS_TOTAL_BYTES)}`);
        break;
      }
      runningTotal += f.size;
      valid.push(f);
    }

    if (valid.length === 0) return;
    try {
      const results = await Promise.all(valid.map(fileToAttachment));
      setAttachments((prev) => [...prev, ...results]);
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Datei konnte nicht eingelesen werden');
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const transcribeRecording = async () => {
    setVoiceState('transcribing');
    try {
      const durationMs = Date.now() - recordingStartedAtRef.current;
      const blobType = recorderRef.current?.mimeType || chunksRef.current.find((c) => c.type)?.type || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: blobType });
      if (durationMs < 300 || blob.size < 1024) {
        setVoiceError('Aufnahme zu kurz — bitte länger halten.');
        return;
      }
      const ext = blobType.toLowerCase().includes('mp4')
        ? 'm4a'
        : blobType.toLowerCase().includes('ogg')
          ? 'ogg'
          : 'webm';
      const form = new FormData();
      form.append('audio', blob, `audio.${ext}`);
      const res = await fetch('/api/assistant/transcribe', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `Transkription fehlgeschlagen (${res.status})`);
      const text = data.text?.trim();
      if (text) {
        setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Transkription fehlgeschlagen');
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
      setVoiceState('idle');
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && attachments.length === 0) || loading) return;
    const toSendAttachments = attachments.length > 0 ? attachments : undefined;
    setInput('');
    setAttachments([]);
    void send(text, toSendAttachments);
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

      <div className="propi-chat-body" ref={bodyRef} onScroll={handleBodyScroll}>
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

      {voiceError && (
        <div className="propi-msg-error" role="alert" style={{ margin: '0 12px 6px' }}>
          {voiceError}
        </div>
      )}
      {attachmentError && (
        <div className="propi-msg-error" role="alert" style={{ margin: '0 12px 6px' }}>
          {attachmentError}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="propi-chat-attachments" role="list" aria-label="Ausgewählte Anhänge">
          {attachments.map((a, i) => (
            <div key={`${a.filename}-${i}`} className="propi-chat-attachment-chip" role="listitem">
              {a.type === 'image' ? <ImageIcon size={12} aria-hidden /> : <FileText size={12} aria-hidden />}
              <span className="propi-chat-attachment-name" title={a.filename}>{a.filename}</span>
              <span className="propi-chat-attachment-size">{formatBytes(a.size)}</span>
              <button
                type="button"
                className="propi-chat-attachment-remove"
                onClick={() => removeAttachment(i)}
                aria-label={`${a.filename} entfernen`}
                title="Entfernen"
              >
                <X size={11} aria-hidden />
              </button>
            </div>
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
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              onChange={onFilesSelected}
              style={{ display: 'none' }}
              aria-hidden
            />
            <button
              type="button"
              className="propi-chat-tool"
              data-active={attachments.length > 0 ? 'true' : undefined}
              onClick={openFilePicker}
              disabled={loading || attachments.length >= MAX_ATTACHMENTS}
              title={
                attachments.length >= MAX_ATTACHMENTS
                  ? `Maximal ${MAX_ATTACHMENTS} Anhänge`
                  : 'Datei anhängen (Bilder oder PDF)'
              }
              aria-label="Datei anhängen"
            >
              <Paperclip size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="propi-chat-tool"
              data-active={voiceState === 'recording' ? 'true' : undefined}
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
              onPointerCancel={stopRecording}
              disabled={voiceState === 'transcribing' || loading}
              title={
                voiceState === 'recording'
                  ? 'Aufnahme läuft, loslassen zum Senden'
                  : voiceState === 'transcribing'
                  ? 'Transkribiere…'
                  : 'Halten zum Sprechen'
              }
              aria-label={
                voiceState === 'recording'
                  ? 'Aufnahme läuft, loslassen zum Senden'
                  : 'Halten zum Sprechen'
              }
              aria-pressed={voiceState === 'recording'}
            >
              {voiceState === 'transcribing' ? (
                <Loader2 size={14} aria-hidden style={{ animation: 'propi-spin 1s linear infinite' }} />
              ) : (
                <Mic size={14} aria-hidden />
              )}
            </button>
          </div>
        </div>
        {loading ? (
          <button type="button" className="propi-chat-send" onClick={abort} title="Antwort abbrechen" aria-label="Antwort abbrechen" data-variant="stop">
            <StopCircle size={16} aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            className="propi-chat-send"
            disabled={!input.trim() && attachments.length === 0}
            title="Senden (Enter)"
            aria-label="Senden"
          >
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
