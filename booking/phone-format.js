/**
 * Schweizer Telefonnummer ins Format +41 xx xxx xx xx bringen.
 * Leere Eingaben bleiben leer.
 */
function sanitizePhoneInput(input) {
  return String(input || "")
    .replace(/┬á/g, " ")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPhoneCH(input) {
  if (input == null || input === "") return "";
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

module.exports = { formatPhoneCH, sanitizePhoneInput };
