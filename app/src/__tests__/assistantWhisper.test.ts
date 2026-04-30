import { describe, expect, it } from "vitest";

import { getWhisperAudioFilename, validateWhisperAudioBuffer } from "@/lib/assistant/whisper";

describe("assistant whisper audio helpers", () => {
  it("maps browser and mobile MIME types to Whisper-friendly filenames", () => {
    expect(getWhisperAudioFilename("audio/webm;codecs=opus")).toBe("audio.webm");
    expect(getWhisperAudioFilename("audio/webm")).toBe("audio.webm");
    expect(getWhisperAudioFilename("audio/mp4")).toBe("audio.m4a");
    expect(getWhisperAudioFilename("audio/x-m4a")).toBe("audio.m4a");
    expect(getWhisperAudioFilename("audio/mpeg")).toBe("audio.mp3");
    expect(getWhisperAudioFilename("audio/wav")).toBe("audio.wav");
    expect(getWhisperAudioFilename("audio/ogg;codecs=opus")).toBe("audio.ogg");
  });

  it("rejects empty and tiny audio buffers before Whisper is called", () => {
    expect(validateWhisperAudioBuffer(Buffer.alloc(0))).toEqual({
      ok: false,
      error: "Keine Audiodaten empfangen. Bitte Aufnahme erneut starten.",
    });
    expect(validateWhisperAudioBuffer(Buffer.alloc(128), { minBytes: 1024 })).toEqual({
      ok: false,
      error: "Aufnahme zu kurz. Bitte mindestens eine kurze Frage aufnehmen.",
    });
    expect(validateWhisperAudioBuffer(Buffer.alloc(2048), { minBytes: 1024 })).toEqual({ ok: true });
  });
});
