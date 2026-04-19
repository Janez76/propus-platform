/**
 * Zentrale Validierungs-Regeln für Adressen, Kontakte und Firmenangaben im
 * Buchungswizard und Admin-Panel. Siehe Prompt "Buchungsflow-Restrukturierung"
 * (Abschnitt 8) für die normative Referenz.
 *
 * Die Funktionen geben { valid: boolean; error?: string } zurück; leere Pflichtfelder
 * ergeben einen menschenlesbaren deutschen Error-String. UI-Layer übersetzt bei Bedarf.
 */

export type ValidationResult = { valid: true } | { valid: false; error: string };

const TRIM = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const HOUSE_NUMBER_RE = /^[0-9]{1,4}[a-zA-Z]?(?:\s*[/-]\s*[0-9]{1,4}[a-zA-Z]?)?$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const UID_CH_RE = /^CHE-\d{3}\.\d{3}\.\d{3}$/;
const PHONE_RE = /^[+0-9()\-\s.]{3,30}$/;

/** Schweizer / FL / Österreich / Deutschland — andere Länder werden als optional betrachtet. */
export type AddressCountryCode = "CH" | "FL" | "AT" | "DE" | string;

export function validateStreet(raw: unknown): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: false, error: "Strasse ist erforderlich" };
  if (v.length < 2) return { valid: false, error: "Strasse muss mindestens 2 Zeichen lang sein" };
  if (v.length > 100) return { valid: false, error: "Strasse darf max. 100 Zeichen lang sein" };
  return { valid: true };
}

/**
 * Hausnummer-Validierung. Akzeptiert: "12", "12a", "7-9", "22A", "15 / 17".
 * Leerer Wert ist hier ein Fehler (Pflicht); für Sonderfälle wie "Alte Mühle" ohne
 * Nummer soll die UI eine explizite Warn-Variante anbieten (Submit erlauben,
 * aber Hinweis anzeigen) — nicht über diesen Validator.
 */
export function validateHouseNumber(raw: unknown): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: false, error: "Hausnummer ist erforderlich" };
  if (v.length > 10) return { valid: false, error: "Hausnummer darf max. 10 Zeichen lang sein" };
  if (!HOUSE_NUMBER_RE.test(v)) {
    return { valid: false, error: "Hausnummer ungültig (z.B. 12, 12a, 7-9)" };
  }
  return { valid: true };
}

export function validateZip(raw: unknown, countryCode: AddressCountryCode = "CH"): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: false, error: "PLZ ist erforderlich" };
  const cc = String(countryCode || "CH").toUpperCase();
  if (cc === "CH" || cc === "FL" || cc === "LI" || cc === "AT") {
    if (!/^\d{4}$/.test(v)) return { valid: false, error: "PLZ muss 4 Ziffern sein" };
    return { valid: true };
  }
  if (cc === "DE") {
    if (!/^\d{5}$/.test(v)) return { valid: false, error: "PLZ muss 5 Ziffern sein" };
    return { valid: true };
  }
  // Andere Länder: nur grob validieren.
  if (v.length > 12) return { valid: false, error: "PLZ zu lang" };
  return { valid: true };
}

export function validateCity(raw: unknown): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: false, error: "Ort ist erforderlich" };
  if (v.length < 2) return { valid: false, error: "Ort muss mindestens 2 Zeichen lang sein" };
  if (v.length > 80) return { valid: false, error: "Ort darf max. 80 Zeichen lang sein" };
  return { valid: true };
}

export function validateCompanyName(raw: unknown): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: false, error: "Firma ist erforderlich" };
  if (v.length > 120) return { valid: false, error: "Firma darf max. 120 Zeichen lang sein" };
  return { valid: true };
}

/** UID/MWST-Nr optional — gibt nur bei gesetztem, aber formal falschem Wert einen Fehler. */
export function validateUidOptional(raw: unknown): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: true };
  if (!UID_CH_RE.test(v)) {
    return { valid: false, error: "UID-Format: CHE-123.456.789" };
  }
  return { valid: true };
}

export function validateFirstNameOptional(raw: unknown): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: true };
  if (v.length > 60) return { valid: false, error: "Vorname darf max. 60 Zeichen lang sein" };
  return { valid: true };
}

export function validateLastName(raw: unknown): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: false, error: "Nachname ist erforderlich" };
  if (v.length < 2) return { valid: false, error: "Nachname muss mindestens 2 Zeichen lang sein" };
  if (v.length > 80) return { valid: false, error: "Nachname darf max. 80 Zeichen lang sein" };
  return { valid: true };
}

export function validateEmailRequired(raw: unknown): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: false, error: "E-Mail ist erforderlich" };
  if (v.length > 254) return { valid: false, error: "E-Mail zu lang" };
  if (!EMAIL_RE.test(v)) return { valid: false, error: "E-Mail ungültig" };
  return { valid: true };
}

export function validateEmailOptional(raw: unknown): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: true };
  if (v.length > 254) return { valid: false, error: "E-Mail zu lang" };
  if (!EMAIL_RE.test(v)) return { valid: false, error: "E-Mail ungültig" };
  return { valid: true };
}

export function validatePhoneOptional(raw: unknown): ValidationResult {
  const v = TRIM(raw);
  if (!v) return { valid: true };
  if (v.length > 30) return { valid: false, error: "Telefon zu lang" };
  if (!PHONE_RE.test(v)) return { valid: false, error: "Telefon enthält ungültige Zeichen" };
  return { valid: true };
}

export type StructuredAddressInput = {
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  countryCode?: string;
};

/**
 * Validiert eine strukturierte Adresse en bloc. Gibt die gesammelten Fehler als
 * Map field → error-Message zurück. Leere Map = valide.
 */
export function validateStructuredAddress(input: StructuredAddressInput): Record<string, string> {
  const errs: Record<string, string> = {};
  const cc = input.countryCode || "CH";
  const street = validateStreet(input.street);
  if (!street.valid) errs.street = street.error;
  const hn = validateHouseNumber(input.houseNumber);
  if (!hn.valid) errs.houseNumber = hn.error;
  const zip = validateZip(input.zip, cc);
  if (!zip.valid) errs.zip = zip.error;
  const city = validateCity(input.city);
  if (!city.valid) errs.city = city.error;
  return errs;
}

export type BillingContactInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  phoneMobile?: string;
};

/**
 * Validiert einen Ansprechpartner (Haupt-Kontakt im Firma-Modus).
 * E-Mail ist Pflicht weil sie als Match-Key für customer_contacts UNIQUE
 * (customer_id, lower(email)) dient.
 */
export function validateBillingContact(input: BillingContactInput): Record<string, string> {
  const errs: Record<string, string> = {};
  const first = validateFirstNameOptional(input.firstName);
  if (!first.valid) errs.firstName = first.error;
  const last = validateLastName(input.lastName);
  if (!last.valid) errs.lastName = last.error;
  const email = validateEmailRequired(input.email);
  if (!email.valid) errs.email = email.error;
  const phone = validatePhoneOptional(input.phone);
  if (!phone.valid) errs.phone = phone.error;
  const mobile = validatePhoneOptional(input.phoneMobile);
  if (!mobile.valid) errs.phoneMobile = mobile.error;
  return errs;
}
