"use strict";

const SUSPICIOUS_SEQUENCES = [
  "Ã",
  "Â",
  "â",
  "ð",
  "�",
  "Ãƒ",
  "Ã¢",
  "Ã‚",
];

function countSuspiciousSequences(value) {
  const text = String(value || "");
  let count = 0;
  for (const needle of SUSPICIOUS_SEQUENCES) {
    let idx = text.indexOf(needle);
    while (idx !== -1) {
      count += 1;
      idx = text.indexOf(needle, idx + needle.length);
    }
  }
  return count;
}

function looksLikeMojibake(value) {
  const text = String(value || "");
  if (!text) return false;
  return countSuspiciousSequences(text) > 0;
}

function scoreTextQuality(value) {
  const text = String(value || "");
  const suspicious = countSuspiciousSequences(text);
  const replacement = (text.match(/\uFFFD/g) || []).length;
  const control = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  return (suspicious * 10) + (replacement * 20) + (control * 30);
}

function decodeLatin1AsUtf8(value) {
  return Buffer.from(String(value || ""), "latin1").toString("utf8");
}

function normalizeCommonArtifacts(value) {
  return String(value || "")
    .replace(/Ã¢â‚¬Â·/g, "·")
    .replace(/Ã¢â‚¬â€œ/g, "–")
    .replace(/Ã¢â‚¬â€�/g, "—")
    .replace(/Ã¢â‚¬Å“/g, "\"")
    .replace(/Ã¢â‚¬\u009d/g, "\"")
    .replace(/Ã¢â‚¬Ëœ/g, "'")
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã‚Â°/g, "°")
    .replace(/Ã‚Â²/g, "²")
    .replace(/Ã‚ /g, " ")
    .replace(/Â /g, " ")
    .replace(/(?<=\d)\uFFFD\uFFFD(?=\s*[A-Za-z])/g, "°")
    .replace(/(?<=\d)\?\?(?=\s*[A-Za-z])/g, "°");
}

function repairTextEncoding(value) {
  const original = String(value || "");
  const normalizedOriginal = normalizeCommonArtifacts(original).replace(/\u0000/g, "");
  if (!looksLikeMojibake(original)) return normalizedOriginal;

  let best = original;
  let bestScore = scoreTextQuality(original);
  let current = original;

  for (let i = 0; i < 3; i += 1) {
    let candidate = "";
    try {
      candidate = decodeLatin1AsUtf8(current);
    } catch {
      break;
    }
    if (!candidate || candidate === current) break;

    const candidateScore = scoreTextQuality(candidate);
    if (candidateScore < bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
    current = candidate;
    if (!looksLikeMojibake(candidate)) break;
  }

  return normalizeCommonArtifacts(best).replace(/\u0000/g, "");
}

function normalizeTextDeep(value) {
  if (typeof value === "string") return repairTextEncoding(value);
  if (Array.isArray(value)) return value.map((item) => normalizeTextDeep(item));
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value;

  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = normalizeTextDeep(nested);
  }
  return out;
}

module.exports = {
  looksLikeMojibake,
  repairTextEncoding,
  normalizeTextDeep,
};
