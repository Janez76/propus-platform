/**
 * Versucht Freitext-Adresse in Strasse, PLZ, Ort zu splitten.
 * Muster: "Musterstrasse 1, 8000 Zürich"
 */
export function splitAddressLine(address: string | null | undefined): {
  street: string;
  zip: string;
  city: string;
} {
  const raw = String(address || "").trim();
  if (!raw) {
    return { street: "", zip: "", city: "" };
  }
  // Kein /s-Flag (lib < es2018): multiline per [\s\S]
  const m = raw.match(/^([\s\S]+?),\s*(\d{4})\s+([^\n]+?)$/);
  if (m) {
    return { street: m[1].trim(), zip: m[2], city: m[3].trim() };
  }
  return { street: raw, zip: "", city: "" };
}

export function joinAddressLine(street: string, zip: string, city: string): string {
  const s = street.trim();
  const z = zip.trim();
  const c = city.trim();
  if (z && c) return `${s}, ${z} ${c}`;
  if (z) return `${s}, ${z}`;
  return s;
}
