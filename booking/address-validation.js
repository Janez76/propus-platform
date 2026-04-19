/**
 * Backend-Spiegel der zentralen Adress- und Kontakt-Validierung. Hält die Regeln
 * deckungsgleich zu `app/src/lib/addressValidation.ts`. Wird beim Booking-Submit
 * defensiv angewendet (zusätzlich zur Frontend-Validierung), insbesondere für
 * die Felder, die in customer_contacts geschrieben werden (E-Mail-Pflicht als
 * Match-Key für UNIQUE (customer_id, lower(email))).
 */

const HOUSE_NUMBER_RE = /^[0-9]{1,4}[a-zA-Z]?(?:\s*[/-]\s*[0-9]{1,4}[a-zA-Z]?)?$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const UID_CH_RE = /^CHE-\d{3}\.\d{3}\.\d{3}$/;
const PHONE_RE = /^[+0-9()\-\s.]{3,30}$/;

const trim = (v) => (typeof v === "string" ? v.trim() : "");

function ok() { return { valid: true }; }
function err(message) { return { valid: false, error: message }; }

function validateStreet(raw) {
  const v = trim(raw);
  if (!v) return err("Strasse ist erforderlich");
  if (v.length < 2) return err("Strasse muss mindestens 2 Zeichen lang sein");
  if (v.length > 100) return err("Strasse darf max. 100 Zeichen lang sein");
  return ok();
}

function validateHouseNumber(raw) {
  const v = trim(raw);
  if (!v) return err("Hausnummer ist erforderlich");
  if (v.length > 10) return err("Hausnummer darf max. 10 Zeichen lang sein");
  if (!HOUSE_NUMBER_RE.test(v)) return err("Hausnummer ungültig (z.B. 12, 12a, 7-9)");
  return ok();
}

function validateZip(raw, countryCode) {
  const v = trim(raw);
  if (!v) return err("PLZ ist erforderlich");
  const cc = String(countryCode || "CH").toUpperCase();
  if (cc === "CH" || cc === "FL" || cc === "LI" || cc === "AT") {
    if (!/^\d{4}$/.test(v)) return err("PLZ muss 4 Ziffern sein");
    return ok();
  }
  if (cc === "DE") {
    if (!/^\d{5}$/.test(v)) return err("PLZ muss 5 Ziffern sein");
    return ok();
  }
  if (v.length > 12) return err("PLZ zu lang");
  return ok();
}

function validateCity(raw) {
  const v = trim(raw);
  if (!v) return err("Ort ist erforderlich");
  if (v.length < 2) return err("Ort muss mindestens 2 Zeichen lang sein");
  if (v.length > 80) return err("Ort darf max. 80 Zeichen lang sein");
  return ok();
}

function validateCompanyName(raw) {
  const v = trim(raw);
  if (!v) return err("Firma ist erforderlich");
  if (v.length > 120) return err("Firma darf max. 120 Zeichen lang sein");
  return ok();
}

function validateUidOptional(raw) {
  const v = trim(raw);
  if (!v) return ok();
  if (!UID_CH_RE.test(v)) return err("UID-Format: CHE-123.456.789");
  return ok();
}

function validateFirstNameOptional(raw) {
  const v = trim(raw);
  if (!v) return ok();
  if (v.length > 60) return err("Vorname darf max. 60 Zeichen lang sein");
  return ok();
}

function validateLastName(raw) {
  const v = trim(raw);
  if (!v) return err("Nachname ist erforderlich");
  if (v.length < 2) return err("Nachname muss mindestens 2 Zeichen lang sein");
  if (v.length > 80) return err("Nachname darf max. 80 Zeichen lang sein");
  return ok();
}

function validateEmailRequired(raw) {
  const v = trim(raw);
  if (!v) return err("E-Mail ist erforderlich");
  if (v.length > 254) return err("E-Mail zu lang");
  if (!EMAIL_RE.test(v)) return err("E-Mail ungültig");
  return ok();
}

function validateEmailOptional(raw) {
  const v = trim(raw);
  if (!v) return ok();
  if (v.length > 254) return err("E-Mail zu lang");
  if (!EMAIL_RE.test(v)) return err("E-Mail ungültig");
  return ok();
}

function validatePhoneOptional(raw) {
  const v = trim(raw);
  if (!v) return ok();
  if (v.length > 30) return err("Telefon zu lang");
  if (!PHONE_RE.test(v)) return err("Telefon enthält ungültige Zeichen");
  return ok();
}

function validateStructuredAddress(input) {
  const errs = {};
  const cc = (input && input.countryCode) || "CH";
  const s = validateStreet(input && input.street);
  if (!s.valid) errs.street = s.error;
  const h = validateHouseNumber(input && input.houseNumber);
  if (!h.valid) errs.houseNumber = h.error;
  const z = validateZip(input && input.zip, cc);
  if (!z.valid) errs.zip = z.error;
  const c = validateCity(input && input.city);
  if (!c.valid) errs.city = c.error;
  return errs;
}

function validateBillingContact(input) {
  const errs = {};
  const f = validateFirstNameOptional(input && input.firstName);
  if (!f.valid) errs.firstName = f.error;
  const l = validateLastName(input && input.lastName);
  if (!l.valid) errs.lastName = l.error;
  const e = validateEmailRequired(input && input.email);
  if (!e.valid) errs.email = e.error;
  const p = validatePhoneOptional(input && input.phone);
  if (!p.valid) errs.phone = p.error;
  const m = validatePhoneOptional(input && input.phoneMobile);
  if (!m.valid) errs.phoneMobile = m.error;
  return errs;
}

module.exports = {
  validateStreet,
  validateHouseNumber,
  validateZip,
  validateCity,
  validateCompanyName,
  validateUidOptional,
  validateFirstNameOptional,
  validateLastName,
  validateEmailRequired,
  validateEmailOptional,
  validatePhoneOptional,
  validateStructuredAddress,
  validateBillingContact,
};
