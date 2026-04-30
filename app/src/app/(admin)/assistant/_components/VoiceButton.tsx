"use client";

import { Mic, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type VoiceButtonProps = {
  onTranscript: (text: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
};

type RecordingState = "idle" | "recording" | "transcribing";

const MIN_RECORDING_MS = 300;
const MIN_AUDIO_BYTES = 1024;
const RECORDER_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function selectRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return RECORDER_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function audioExtensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  return "webm";
}

export function VoiceButton({ onTranscript, onError, disabled }: VoiceButtonProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef(0);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startRecording() {
    if (disabled || state !== "idle") return;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Audioaufnahme wird von diesem Browser nicht unterstützt");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = selectRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => void transcribe();
      recordingStartedAtRef.current = Date.now();
      recorder.start();
      recorderRef.current = recorder;
      setState("recording");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Mikrofon-Zugriff fehlgeschlagen");
    }
  }

  async function transcribe() {
    setState("transcribing");
    try {
      const durationMs = Date.now() - recordingStartedAtRef.current;
      const blobType = recorderRef.current?.mimeType || chunksRef.current.find((chunk) => chunk.type)?.type || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: blobType });
      if (durationMs < MIN_RECORDING_MS || blob.size < MIN_AUDIO_BYTES) {
        onError("Aufnahme zu kurz. Bitte mindestens eine kurze Frage aufnehmen.");
        return;
      }
      const form = new FormData();
      form.append("audio", blob, `audio.${audioExtensionForMimeType(blob.type)}`);
      const res = await fetch("/api/assistant/transcribe", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `Transkription fehlgeschlagen (${res.status})`);
      if (data.text?.trim()) onTranscript(data.text.trim());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Transkription fehlgeschlagen");
    } finally {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setState("idle");
    }
  }

  function stopRecording() {
    if (state === "recording" && recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  return (
    <button
      type="button"
      onPointerDown={startRecording}
      onPointerUp={stopRecording}
      onPointerLeave={stopRecording}
      onPointerCancel={stopRecording}
      disabled={disabled || state === "transcribing"}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/40 bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-main)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-50 data-[recording=true]:bg-[var(--accent)] data-[recording=true]:text-[var(--gold-on-gold)]"
      data-recording={state === "recording" ? "true" : "false"}
      aria-label={state === "recording" ? "Aufnahme läuft, loslassen zum Senden" : "Halten zum Sprechen"}
    >
      {state === "transcribing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
      {state === "idle" ? "Halten zum Sprechen" : state === "recording" ? "Aufnahme läuft ..." : "Transkribiere ..."}
    </button>
  );
}
