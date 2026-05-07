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
    // Mit Magic-Bytes-Check (Default seit Bug-Hunt M03): leere 2KB-Buffer
    // werden als Nicht-Audio erkannt — fuer den Legacy-Pfad checkMagicBytes
    // explizit ausschalten.
    expect(
      validateWhisperAudioBuffer(Buffer.alloc(2048), { minBytes: 1024, checkMagicBytes: false }),
    ).toEqual({ ok: true });
  });

  describe("magic-byte audio sniffer (Bug-Hunt M03)", () => {
    function withHeader(header: number[], totalBytes = 2048): Buffer {
      const buf = Buffer.alloc(totalBytes);
      for (let i = 0; i < header.length; i++) buf[i] = header[i];
      return buf;
    }

    it("accepts WebM/Matroska EBML header (1A 45 DF A3)", () => {
      expect(validateWhisperAudioBuffer(withHeader([0x1a, 0x45, 0xdf, 0xa3]))).toEqual({ ok: true });
    });

    it("accepts WAV (RIFF…WAVE)", () => {
      const buf = withHeader([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
      expect(validateWhisperAudioBuffer(buf)).toEqual({ ok: true });
    });

    it("accepts OggS", () => {
      expect(validateWhisperAudioBuffer(withHeader([0x4f, 0x67, 0x67, 0x53]))).toEqual({ ok: true });
    });

    it("accepts MP3 with ID3 tag", () => {
      expect(validateWhisperAudioBuffer(withHeader([0x49, 0x44, 0x33, 0x03, 0x00]))).toEqual({ ok: true });
    });

    it("accepts MP3 frame sync (FF Fx)", () => {
      expect(validateWhisperAudioBuffer(withHeader([0xff, 0xfb, 0x90, 0x40]))).toEqual({ ok: true });
    });

    it("accepts M4A/MP4 ftyp box", () => {
      // 4 bytes size + "ftyp" (66 74 79 70) at offset 4
      expect(
        validateWhisperAudioBuffer(withHeader([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70])),
      ).toEqual({ ok: true });
    });

    it("rejects ZIP archives (PK header)", () => {
      // PK\x03\x04 — would have been silently forwarded to OpenAI before.
      const result = validateWhisperAudioBuffer(withHeader([0x50, 0x4b, 0x03, 0x04]));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("kein erkanntes Audio-Format");
    });

    it("rejects PNG headers", () => {
      const result = validateWhisperAudioBuffer(withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      expect(result.ok).toBe(false);
    });

    it("rejects all-zero binary blobs", () => {
      const result = validateWhisperAudioBuffer(Buffer.alloc(2048));
      expect(result.ok).toBe(false);
    });
  });
});
