/** Einheitliche Anzeige z. B. `v2.3.288` für /api/health buildId oder /VERSION-Text. */
export function normalizeAppVersionLabel(raw: string): string {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (v.includes("<!doctype") || v.includes("<html")) return "";
  const cleaned = v.replace(/^\uFEFF/, "").replace(/\s+/g, "").replace(/^v+/i, "");
  if (!cleaned || !/^[a-zA-Z0-9._-]+$/.test(cleaned)) return "";
  return `v${cleaned}`;
}
