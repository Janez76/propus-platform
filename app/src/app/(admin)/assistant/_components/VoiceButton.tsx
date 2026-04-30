"use client";

import { Mic, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type VoiceButtonProps = {
  onTranscript: (text: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
};

type RecordingState = "idle" | "recording" | "transcribing";

export function VoiceButton({ onTranscript, onError, disabled }: VoiceButtonProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startRecording() {
    if (disabled || state !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => void transcribe();
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
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "audio.webm");
      const res = await fetch("/api/assistant/transcribe", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `Transkription fehlgeschlagen (${res.status})`);
      if (data.text?.trim()) onTranscript(data.text.trim());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Transkription fehlgeschlagen");
    } finally {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
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
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onMouseLeave={stopRecording}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      disabled={disabled || state === "transcribing"}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--accent,#B68E20)]/40 px-4 py-2 text-sm font-medium text-[var(--text-main)] transition hover:border-[var(--accent,#B68E20)] disabled:cursor-not-allowed disabled:opacity-50 data-[recording=true]:bg-[var(--accent,#B68E20)] data-[recording=true]:text-black"
      data-recording={state === "recording" ? "true" : "false"}
      aria-label={state === "recording" ? "Aufnahme läuft, loslassen zum Senden" : "Halten zum Sprechen"}
    >
      {state === "transcribing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
      {state === "idle" ? "Halten zum Sprechen" : state === "recording" ? "Aufnahme läuft ..." : "Transkribiere ..."}
    </button>
  );
}
