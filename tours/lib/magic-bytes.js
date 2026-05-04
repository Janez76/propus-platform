/**
 * tours/lib/magic-bytes.js
 *
 * Minimaler Magic-Bytes-Validator ohne externe Dep — verhindert dass ein
 * Angreifer eine ausfuehrbare Datei mit gespoofter `Content-Type`-Header
 * oder gefaelschter Endung hochlaedt (Bug-Hunt T13 MEDIUM).
 *
 * Multer's `fileFilter` prueft nur `originalname`/`mimetype`, beides
 * client-controlled. Der Magic-Bytes-Check liest die ersten Bytes des
 * Buffers und vergleicht sie gegen bekannte Signaturen.
 *
 * Verwendung (nach multer.single/multi):
 *   const ok = magicBytes.matchesKind(req.file.buffer, "image");
 *   if (!ok) return res.status(415).json({ error: "Unsupported file type" });
 */

"use strict";

/**
 * Bekannte Datei-Signaturen. Buffer-Vergleich erfolgt byte-genau am Anfang
 * des Files. Mehrere Signaturen pro Kind sind moeglich (z.B. JPEG hat
 * mehrere SOI-Marker je nach Encoder).
 */
// Object.freeze (tief): schuetzt vor versehentlichem Ueberschreiben durch
// fremden Code, der die Allowlist abschwaechen koennte (CodeRabbit Nitpick).
const SIGNATURES = Object.freeze({
  png:  Object.freeze([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])]),
  jpeg: Object.freeze([Buffer.from([0xFF, 0xD8, 0xFF])]),
  gif:  Object.freeze([Buffer.from("GIF87a"), Buffer.from("GIF89a")]),
  webp: Object.freeze([
    // RIFF....WEBP — Bytes 0-3 = "RIFF", 8-11 = "WEBP"
    // hier wird nur das RIFF-Prefix geprueft; voller Check via offset=8
    Buffer.from("RIFF"),
  ]),
  pdf:  Object.freeze([Buffer.from("%PDF-")]),
  // CSV/XML/JSON sind Text — kein einheitlicher Magic-Bytes-Check moeglich.
  // Stattdessen: erste ~1KB UTF-8-decodieren und auf erwartete Patterns testen.
});

const KIND_GROUPS = Object.freeze({
  image: Object.freeze(["png", "jpeg", "gif", "webp"]),
  pdf:   Object.freeze(["pdf"]),
});

/**
 * Prueft ob der Buffer mit einer der angegebenen Signaturen beginnt.
 */
function matchesSignature(buffer, sig) {
  if (!Buffer.isBuffer(buffer) || buffer.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buffer[i] !== sig[i]) return false;
  }
  return true;
}

/** Prueft ob der Buffer einer bestimmten Datei-Art entspricht. */
function matchesType(buffer, type) {
  // Buffer-Guard ZUERST: matchesType wird auch von matchesKind() mit
  // potenziell undefined buffer aufgerufen (CodeRabbit Critical).
  if (!Buffer.isBuffer(buffer)) return false;
  const sigs = SIGNATURES[type];
  if (!sigs) return false;
  if (type === "webp") {
    if (buffer.length < 12) return false;
    if (!matchesSignature(buffer, SIGNATURES.webp[0])) return false;
    return buffer.slice(8, 12).toString("ascii") === "WEBP";
  }
  return sigs.some((sig) => matchesSignature(buffer, sig));
}

/**
 * Prueft ob der Buffer zu einer Kind-Gruppe gehoert (z.B. "image" =
 * png/jpeg/gif/webp).
 */
function matchesKind(buffer, kind) {
  const types = KIND_GROUPS[kind];
  if (!types) return false;
  return types.some((type) => matchesType(buffer, type));
}

/**
 * Heuristischer Text-Check: erste 1KB als UTF-8 decodieren und gegen ein
 * Regex-Pattern testen. Fuer CSV/XML — lockerer als Magic-Bytes, aber
 * besser als nur originalname-Pruefung.
 */
function matchesTextPattern(buffer, pattern) {
  if (!Buffer.isBuffer(buffer)) return false;
  const head = buffer.slice(0, 1024).toString("utf8").trim();
  return pattern.test(head);
}

const TEXT_PATTERNS = {
  csv: /^[^\n\r]*[;,\t][^\n\r]*[\r\n]?/, // mind. ein Trennzeichen in der ersten Zeile
  xml: /^<\?xml\s|^<[A-Za-z]/i,
};

function matchesText(buffer, type) {
  const pattern = TEXT_PATTERNS[type];
  if (!pattern) return false;
  return matchesTextPattern(buffer, pattern);
}

module.exports = {
  matchesSignature,
  matchesType,
  matchesKind,
  matchesText,
  SIGNATURES,
  KIND_GROUPS,
};
