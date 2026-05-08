// Anhang-Schema fuer /api/assistant.
// Inline-Base64 weil das den Frontend-Code simpel haelt (kein Upload-Endpoint,
// keine temporaeren Dateien) und Anthropics Vision-API dasselbe Format will.
//
// Limits sind bewusst konservativ — Anthropic-Vision kostet, und JSON-Bodies
// >25 MB wuerden Reverse-Proxies und Express body-parser stressen.
import type Anthropic from "@anthropic-ai/sdk";

export const MAX_ATTACHMENTS_PER_REQUEST = 4;
/** 5 MB pro Datei nach base64-decode (bexio-typische Bonsai-Belege passen rein). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** 15 MB total — base64 inflated ~20 MB Wire. */
export const MAX_ATTACHMENTS_TOTAL_BYTES = 15 * 1024 * 1024;

export const ALLOWED_IMAGE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;
export const ALLOWED_DOCUMENT_MEDIA_TYPES = ["application/pdf"] as const;

export type AssistantAttachmentInput = {
  type: "image" | "document";
  /** MIME-Type, muss in den ALLOWED_*-Listen stehen. */
  mediaType: string;
  /** base64-encoded Datei-Bytes (ohne data: Prefix). */
  data: string;
  /** Optional: Dateiname fuer Logs/Persistenz. Nicht an Anthropic geschickt. */
  filename?: string;
};

export type AttachmentValidationError = {
  code:
    | "too_many"
    | "too_large_single"
    | "too_large_total"
    | "invalid_media_type"
    | "invalid_data"
    | "missing_fields"
    | "type_mediaType_mismatch";
  message: string;
};

export type ValidatedAttachments = {
  ok: true;
  attachments: AssistantAttachmentInput[];
  totalBytes: number;
};

export type ValidatedAttachmentsError = {
  ok: false;
  error: AttachmentValidationError;
};

/**
 * Validiert die Anhaenge aus dem Request-Body und gibt die normalisierte Liste
 * zurueck. Berechnet Decode-Groesse aus base64-Length (ohne tatsaechlich zu
 * decodieren — sparen wir Memory; Anthropic decodiert eh selbst).
 */
export function validateAttachments(
  raw: unknown,
): ValidatedAttachments | ValidatedAttachmentsError {
  if (raw == null) return { ok: true, attachments: [], totalBytes: 0 };
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      error: { code: "invalid_data", message: "attachments muss ein Array sein" },
    };
  }
  if (raw.length > MAX_ATTACHMENTS_PER_REQUEST) {
    return {
      ok: false,
      error: {
        code: "too_many",
        message: `Maximal ${MAX_ATTACHMENTS_PER_REQUEST} Anhaenge pro Anfrage`,
      },
    };
  }
  const out: AssistantAttachmentInput[] = [];
  let totalBytes = 0;
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") {
      return {
        ok: false,
        error: { code: "missing_fields", message: `attachments[${i}] ist kein Objekt` },
      };
    }
    const type = item.type;
    const mediaType = item.mediaType;
    const data = item.data;
    const filename = typeof item.filename === "string" ? item.filename.slice(0, 200) : undefined;
    if (type !== "image" && type !== "document") {
      return {
        ok: false,
        error: {
          code: "missing_fields",
          message: `attachments[${i}].type muss 'image' oder 'document' sein`,
        },
      };
    }
    if (typeof mediaType !== "string" || mediaType.length === 0) {
      return {
        ok: false,
        error: {
          code: "missing_fields",
          message: `attachments[${i}].mediaType fehlt`,
        },
      };
    }
    const allowedList =
      type === "image" ? ALLOWED_IMAGE_MEDIA_TYPES : ALLOWED_DOCUMENT_MEDIA_TYPES;
    if (!(allowedList as readonly string[]).includes(mediaType)) {
      return {
        ok: false,
        error: {
          code: "invalid_media_type",
          message: `attachments[${i}].mediaType '${mediaType}' nicht erlaubt (zulaessig: ${allowedList.join(", ")})`,
        },
      };
    }
    if (typeof data !== "string" || data.length === 0) {
      return {
        ok: false,
        error: {
          code: "invalid_data",
          message: `attachments[${i}].data fehlt oder leer`,
        },
      };
    }
    // Decodierte Groesse aus base64-Laenge schaetzen — ceil(len * 3/4) abzgl. padding
    const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
    const decodedBytes = Math.floor((data.length * 3) / 4) - padding;
    if (decodedBytes > MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: {
          code: "too_large_single",
          message: `attachments[${i}] zu gross (${Math.round(decodedBytes / 1024)} KB > ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB)`,
        },
      };
    }
    totalBytes += decodedBytes;
    if (totalBytes > MAX_ATTACHMENTS_TOTAL_BYTES) {
      return {
        ok: false,
        error: {
          code: "too_large_total",
          message: `Anhaenge zusammen zu gross (${Math.round(totalBytes / 1024)} KB > ${MAX_ATTACHMENTS_TOTAL_BYTES / 1024 / 1024} MB)`,
        },
      };
    }
    // Sehr lockerer base64-Sanity-Check (erlaubt = und URL-safe Varianten).
    if (!/^[A-Za-z0-9+/=_-]+$/.test(data)) {
      return {
        ok: false,
        error: {
          code: "invalid_data",
          message: `attachments[${i}].data ist kein gueltiges base64`,
        },
      };
    }
    out.push({ type, mediaType, data, ...(filename ? { filename } : {}) });
  }
  return { ok: true, attachments: out, totalBytes };
}

/**
 * Baut den Anthropic-MessageParam-Content fuer den User-Turn.
 * Ohne Anhaenge: einfacher String. Mit Anhaengen: ContentBlock-Array
 * (text + image-/document-Blocks). Anthropic akzeptiert beides.
 */
export function buildUserContentForAnthropic(
  text: string,
  attachments: AssistantAttachmentInput[],
): string | Anthropic.Messages.ContentBlockParam[] {
  if (attachments.length === 0) return text;
  const blocks: Anthropic.Messages.ContentBlockParam[] = [];
  // Text zuerst, damit das Modell den Kontext hat bevor es die Bilder ansieht.
  if (text.length > 0) {
    blocks.push({ type: "text", text });
  }
  for (const att of attachments) {
    if (att.type === "image") {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: att.mediaType as
            | "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp",
          data: att.data,
        },
      });
    } else {
      // PDF — Anthropic nimmt application/pdf als document
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: att.data,
        },
      });
    }
  }
  return blocks;
}
