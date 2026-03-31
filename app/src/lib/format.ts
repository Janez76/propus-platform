export function formatCHF(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace(/\s/g, ' ');
}

export function formatSwissDate(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

export function formatSwissDateTime(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export function formatArea(area: number): string {
  return `${area.toLocaleString('de-CH')} m²`;
}

export function sanitizePhoneInput(input: string): string {
  return String(input || "")
    .replace(/┬á/g, " ")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Formatiert eine Schweizer Telefonnummer ins einheitliche Format +41 xx xxx xx xx.
 * Leere Eingaben bleiben leer. Ungültige/zu kurze Nummern werden unverändert zurückgegeben.
 */
export function formatPhoneCH(input: string): string {
  const cleaned = sanitizePhoneInput(input);
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";
  let num = digits;
  if (num.startsWith("41") && num.length >= 11) num = num.slice(2);
  else if (num.startsWith("0") && num.length >= 10) num = num.slice(1);
  if (num.length < 9) return cleaned;
  const a = num.slice(0, 2);
  const b = num.slice(2, 5);
  const c = num.slice(5, 7);
  const d = num.slice(7, 9);
  return `+41 ${a} ${b} ${c} ${d}`;
}

/** Ziffern fuer wa.me (Landesvorwahl CH ohne +), z. B. +41 79 662 40 45 -> 41796624045 */
export function digitsForWhatsAppMe(input: string): string {
  const digits = sanitizePhoneInput(input).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 10) return `41${digits.slice(1)}`;
  if (digits.startsWith("41")) return digits;
  return digits;
}

export function buildWhatsAppMeLink(input: string): string {
  const d = digitsForWhatsAppMe(input);
  if (!d || d.length < 9) return "";
  return `https://wa.me/${d}`;
}

/** Heuristik: CH-Mobil (41 + 7x, min. 11 Ziffern) — Festnetz z. B. +41 44 … schliesst aus. */
export function looksLikeSwissMobile(input: string): boolean {
  const d = digitsForWhatsAppMe(input);
  if (d.length < 11 || !d.startsWith("41")) return false;
  return d[2] === "7";
}

/** Anzeige +41 xx xxx xx xx (oder Rohwert, wenn nicht als CH erkennbar). */
export function formatPhoneDisplay(value?: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return formatPhoneCH(raw) || raw;
}

/** `tel:`-URL mit E.164 (+ und Ziffern, keine Leerzeichen). */
export function phoneTelHref(input: string): string | null {
  const raw = sanitizePhoneInput(input);
  if (!raw) return null;
  const d = digitsForWhatsAppMe(raw);
  if (!d || d.length < 9) return null;
  return `tel:+${d}`;
}
