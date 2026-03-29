/**
 * template-renderer.js
 * Einfaches {{variable}}-Template-System (Mustache-kompatibel).
 * Laedt Templates aus DB; Fallback auf Hardcoded-Defaults aus emails.js.
 */
"use strict";

/**
 * Escaped einen String fuer sichere HTML-Ausgabe.
 */
function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Rendert ein Template-String mit Variablen.
 * {{variableName}} wird ersetzt; unbekannte Keys werden als Leerstring behandelt.
 *
 * @param {string} template
 * @param {Record<string, string|number|null|undefined>} variables
 * @returns {string}
 */
function renderTemplate(template, variables) {
  const vars = variables || {};
  return String(template || "").replace(/\{\{(\w+)\}\}/g, function(_, key) {
    const val = vars[key];
    return val != null ? escapeHtml(String(val)) : "";
  });
}

function firstNonEmpty() {
  for (const value of arguments) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function buildPhotographerRadiusLabel(value) {
  if (value == null || String(value).trim() === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value).trim();
  return n <= 0 ? "unbegrenzt" : `${Math.round(n)} km`;
}

function buildPhotographerContactSummary({ phone = "", mobile = "", whatsapp = "" } = {}) {
  const parts = [];
  const phoneText = String(phone || "").trim();
  const mobileText = String(mobile || "").trim();
  const whatsappText = String(whatsapp || "").trim();
  if (phoneText) parts.push(phoneText);
  if (mobileText) parts.push(`Mobile: ${mobileText}`);
  if (whatsappText) parts.push(`WhatsApp: ${whatsappText}`);
  return parts.join(" | ");
}

function refreshPhotographerDerivedVars(vars) {
  if (!vars || typeof vars !== "object") return vars;
  const phone = firstNonEmpty(vars.photographerPhone);
  const mobile = firstNonEmpty(vars.photographerMobile, vars.photographerPhoneMobile);
  const whatsapp = firstNonEmpty(vars.photographerWhatsApp);
  const initials = firstNonEmpty(vars.photographerInitials);
  const radiusRaw = firstNonEmpty(vars.photographerRadiusKm, vars.photographerMaxRadiusKm);

  vars.photographerPhone = phone;
  vars.photographerMobile = mobile;
  vars.photographerPhoneMobile = mobile;
  vars.photographerWhatsApp = whatsapp;
  vars.photographerInitials = initials;
  vars.photographerRadiusKm = radiusRaw;
  vars.photographerMaxRadiusKm = radiusRaw;
  vars.photographerRadiusLabel = buildPhotographerRadiusLabel(radiusRaw);
  vars.photographerContactSummary = buildPhotographerContactSummary({ phone, mobile, whatsapp });
  return vars;
}

async function enrichPhotographerVars(pool, vars) {
  refreshPhotographerDerivedVars(vars);
  const key = String(vars?.photographerKey || "").trim().toLowerCase();
  if (!pool || !key) return vars;

  const needsLookup = !vars.photographerPhone || !vars.photographerMobile || !vars.photographerWhatsApp || !vars.photographerInitials || !vars.photographerRadiusKm;
  if (!needsLookup) return vars;

  try {
    const { rows } = await pool.query(
      `SELECT p.name, p.email, p.phone, p.phone_mobile, p.whatsapp, p.initials, ps.max_radius_km
       FROM photographers p
       LEFT JOIN photographer_settings ps ON ps.photographer_key = p.key
       WHERE p.key = $1
       LIMIT 1`,
      [key]
    );
    const row = rows[0];
    if (row) {
      if (!String(vars.photographerName || "").trim()) vars.photographerName = row.name || "";
      if (!String(vars.photographerEmail || "").trim()) vars.photographerEmail = row.email || "";
      if (!String(vars.photographerPhone || "").trim()) vars.photographerPhone = row.phone || "";
      if (!String(vars.photographerMobile || "").trim()) vars.photographerMobile = row.phone_mobile || "";
      if (!String(vars.photographerWhatsApp || "").trim()) vars.photographerWhatsApp = row.whatsapp || "";
      if (!String(vars.photographerInitials || "").trim()) vars.photographerInitials = row.initials || "";
      if (!String(vars.photographerRadiusKm || "").trim() && row.max_radius_km != null) vars.photographerRadiusKm = String(row.max_radius_km);
    }
  } catch (err) {
    console.warn("[template-renderer] photographer lookup failed", key, err && err.message);
  }

  return refreshPhotographerDerivedVars(vars);
}

/**
 * Vereinheitlicht Rueckgaben von unterschiedlichen Mail-Sendern.
 * Legacy-Sender liefern oft kein Objekt zurueck; das gilt als "gesendet".
 *
 * @param {any} result
 * @returns {{sent: boolean, reason?: string}}
 */
function normalizeMailSendResult(result) {
  if (result && typeof result === "object") {
    if (Object.prototype.hasOwnProperty.call(result, "sent")) {
      return {
        sent: result.sent === true,
        reason: result.reason ? String(result.reason) : undefined,
      };
    }
    if (Object.prototype.hasOwnProperty.call(result, "ok")) {
      return {
        sent: result.ok === true,
        reason: result.ok === true ? undefined : (result.reason ? String(result.reason) : "send_not_ok"),
      };
    }
  }
  return { sent: true };
}

/**
 * Laedt ein Template aus der DB mit Sprachaufloesung und de-CH-Fallback (DoD G).
 *
 * Aufloesung (in dieser Reihenfolge):
 *   1. Exakte Sprache (language)
 *   2. Hauptsprache (z.B. "de" fuer "de-CH")
 *   3. Fallback "de-CH"
 *   4. Irgendein aktives Template mit diesem Key
 *
 * @param {object} pool - pg Pool
 * @param {string} key
 * @param {string} [language] - BCP-47 Sprachcode, z.B. "de-CH", "en", "sr-latn"
 * @returns {Promise<{subject: string, body_html: string, template_language: string}|null>}
 */
async function loadTemplate(pool, key, language) {
  if (!pool || !key) return null;
  try {
    const lang = String(language || "de-CH").toLowerCase();
    const mainLang = lang.split("-")[0]; // "de-CH" -> "de"

    // Kandidaten-Sprachen in Fallback-Reihenfolge
    const candidates = Array.from(new Set([lang, mainLang, "de-ch", "de"])).filter(Boolean);

    // Alle aktiven Templates fuer diesen Key laden
    const { rows } = await pool.query(
      "SELECT subject, body_html, template_language FROM email_templates WHERE key=$1 AND active=TRUE",
      [key]
    );

    if (!rows.length) return null;

    // Sprachaufloesung
    for (const candidate of candidates) {
      const match = rows.find(function(r) {
        return String(r.template_language || "de-CH").toLowerCase() === candidate;
      });
      if (match) return match;
    }

    // Letzter Fallback: erster verfuegbarer Eintrag
    return rows[0] || null;
  } catch (err) {
    console.error("[template-renderer] DB-Fehler beim Laden von Template", key, err && err.message);
    return null;
  }
}

/**
 * Speichert / aktualisiert ein Template in der DB.
 * Schreibt vorherigen Stand in email_template_history.
 *
 * @param {object} pool
 * @param {string} key
 * @param {object} data - { subject, body_html, label?, placeholders?, changed_by? }
 */
async function saveTemplate(pool, key, data) {
  const { subject, body_html, label, placeholders, changed_by } = data || {};

  // Existierenden Stand in History sichern
  const existing = await loadTemplate(pool, key);
  if (existing) {
    await pool.query(
      "INSERT INTO email_template_history (template_id, template_key, subject, body_html, changed_by) SELECT id, key, subject, body_html, $2 FROM email_templates WHERE key=$1",
      [key, changed_by || "admin"]
    );
  }

  // Upsert
  await pool.query(
    `INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, updated_at)
     VALUES ($1, $2, $3, $4, '', $5, TRUE, NOW())
     ON CONFLICT (key) DO UPDATE SET
       label=$2, subject=$3, body_html=$4, placeholders=$5, updated_at=NOW()`,
    [
      key,
      label || key,
      subject || "",
      body_html || "",
      JSON.stringify(placeholders || []),
    ]
  );
}

/**
 * Listet alle Templates aus der DB.
 * @param {object} pool
 */
async function listTemplates(pool) {
  if (!pool) return [];
  try {
    const { rows } = await pool.query(
      "SELECT id, key, label, subject, body_html, body_text, placeholders, active, updated_at FROM email_templates ORDER BY key"
    );
    return rows;
  } catch (err) {
    console.error("[template-renderer] listTemplates Fehler", err && err.message);
    return [];
  }
}

/**
 * Gibt die Versionshistorie eines Templates zurueck.
 * @param {object} pool
 * @param {string} key
 */
async function getTemplateHistory(pool, key) {
  if (!pool || !key) return [];
  try {
    const { rows } = await pool.query(
      "SELECT h.id, h.subject, h.body_html, h.changed_by, h.changed_at FROM email_template_history h JOIN email_templates t ON h.template_id=t.id WHERE t.key=$1 ORDER BY h.changed_at DESC LIMIT 20",
      [key]
    );
    return rows;
  } catch (err) {
    console.error("[template-renderer] getTemplateHistory Fehler", err && err.message);
    return [];
  }
}

/**
 * Stellt eine Version aus der History wieder her.
 * @param {object} pool
 * @param {number} historyId
 * @param {string} restoredBy
 */
async function restoreTemplateVersion(pool, historyId, restoredBy) {
  const { rows } = await pool.query(
    "SELECT h.*, t.key FROM email_template_history h JOIN email_templates t ON h.template_id=t.id WHERE h.id=$1",
    [historyId]
  );
  if (!rows[0]) throw new Error("History-Eintrag nicht gefunden");
  const entry = rows[0];
  await saveTemplate(pool, entry.key, {
    subject: entry.subject,
    body_html: entry.body_html,
    changed_by: restoredBy || "admin (restore)",
  });
  return entry;
}

// ─── Standard-Template-Variablen aus einer Order ableiten ────────────────────

/**
 * Baut das Standard-Variablen-Objekt aus einer Order fuer Templates.
 * @param {object} order
 * @param {object} extra - zusaetzliche Variablen (reviewLink, confirmationLink etc.)
 */
function buildTemplateVars(order, extra) {
  const billing = order.billing || {};
  const schedule = order.schedule || {};
  const photographer = order.photographer || {};
  const services = order.services || {};

  const packageName = (services.package && services.package.label) || "";
  const addonList = (services.addons || []).map(function(a) { return a.label || ""; }).filter(Boolean);
  const servicesSummary = [packageName, ...addonList].filter(Boolean).join(", ") || "—";

  const appointmentDate = schedule.date || "";
  const appointmentTime = schedule.time || "";

  const vars = {
    orderNo: String(order.orderNo || ""),
    customerName: billing.name || "",
    customerEmail: billing.email || "",
    customerPhone: billing.phone || "",
    customerSalutation: billing.salutation   || "",
    customerFirstName:  billing.first_name   || "",
    customerMobile:     billing.phone_mobile || "",
    customerStreet:     billing.street       || "",
    customerNotes:      billing.notes        || "",
    company: billing.company || "",
    address: order.address || "",
    zipCity: billing.zipcity || "",
    addressLine: [billing.zipcity, order.address].filter(Boolean).join(", ") || "",
    appointmentDate,
    appointmentTime,
    photographerKey: photographer.key || "",
    photographerName: photographer.name || "",
    photographerEmail: photographer.email || "",
    photographerPhone: photographer.phone || "",
    photographerMobile: photographer.phone_mobile || photographer.phoneMobile || "",
    photographerWhatsApp: photographer.whatsapp || "",
    photographerInitials: photographer.initials || "",
    photographerRadiusKm:
      photographer.max_radius_km != null
        ? String(photographer.max_radius_km)
        : photographer.radius_km != null
          ? String(photographer.radius_km)
          : photographer.maxRadiusKm != null
            ? String(photographer.maxRadiusKm)
            : "",
    packageName,
    servicesSummary,
    totalFormatted: (order.pricing && order.pricing.total != null)
      ? "CHF " + Number(order.pricing.total).toFixed(2)
      : "",
    companyName: process.env.COMPANY_NAME || "Propus",
    companyEmail: process.env.MAIL_FROM || "office@propus.ch",
    companyPhone: process.env.COMPANY_PHONE || "",
    orderRef: billing.order_ref || "",
    customerCompanyEmail: billing.company_email || "",
    customerCompanyPhone: billing.company_phone || "",
    altBillingCompany: billing.alt_company || "",
    altBillingCompanyEmail: billing.alt_company_email || "",
    altBillingCompanyPhone: billing.alt_company_phone || "",
    altBillingStreet: billing.alt_street || "",
    altBillingZipCity: billing.alt_zipcity || "",
    altBillingSalutation: billing.alt_salutation || "",
    altBillingFirstName: billing.alt_first_name || "",
    altBillingName: billing.alt_name || "",
    altBillingEmail: billing.alt_email || "",
    altBillingPhone: billing.alt_phone || "",
    altBillingMobile: billing.alt_phone_mobile || "",
    altBillingOrderRef: billing.alt_order_ref || "",
    altBillingNotes: billing.alt_notes || "",
  };

  try {
    const expiresRaw = order.provisionalExpiresAt || order.provisional_expires_at;
    vars.provisionalExpiresDate = expiresRaw
      ? new Date(expiresRaw).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric" })
      : "";
  } catch (_) { vars.provisionalExpiresDate = ""; }

  if (order.confirmationToken || order.confirmation_token) {
    const base = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
    vars.confirmationLink = `${base}/confirm?token=${order.confirmationToken || order.confirmation_token}`;
  }
  // Rueckwaertskompatibel fuer alte Templates/Callsites.
  vars.confirmUrl = vars.confirmationLink || "";

  // Status-Label (deutsch) fuer CC-Templates
  const STATUS_LABELS_DE = {
    pending:     "Ausstehend",
    provisional: "Termin provisorisch gebucht",
    confirmed:   "Bestätigt",
    paused:      "Pausiert",
    done:        "Erledigt",
    completed:   "Abgeschlossen",
    cancelled:   "Storniert",
    archived:    "Archiviert",
  };
  vars.statusLabel = STATUS_LABELS_DE[String(order.status || "").toLowerCase()] || String(order.status || "");
  vars.cancellationReason = order.cancel_reason || order.cancelReason || "";
  vars.pauseReason = order.pause_reason || order.pauseReason || "";

  const object = order.object || {};
  const OBJECT_TYPE_LABELS_DE = {
    apartment:    "Wohnung",
    single_house: "Einfamilienhaus",
    multi_house:  "Mehrfamilienhaus",
    commercial:   "Gewerbe",
    land:         "Grundstueck",
  };
  vars.objectType      = String(object.type || "");
  vars.objectTypeLabel = OBJECT_TYPE_LABELS_DE[vars.objectType] || vars.objectType;
  vars.objectArea      = object.area != null ? String(object.area) : "";
  vars.objectFloors    = object.floors != null ? String(object.floors) : "";
  vars.objectRooms     = object.rooms != null ? String(object.rooms) : "";
  vars.objectDesc      = object.desc ? String(object.desc) : "";
  vars.objectSpecials  = object.specials ? String(object.specials) : "";
  vars.onsiteName      = billing.onsiteName || object.onsiteName || "";
  vars.onsitePhone     = billing.onsitePhone || object.onsitePhone || "";
  vars.onsiteEmail =
    billing.onsiteEmail || object.onsiteEmail || order.onsiteEmail || order.onsite_email || "";
  const contactsRaw = order.onsiteContacts || order.onsite_contacts;
  vars.onsiteContacts = JSON.stringify(Array.isArray(contactsRaw) ? contactsRaw : []);

  const keyPickup = order.keyPickup || {};
  vars.keyPickupAddress = keyPickup.address ? String(keyPickup.address) : "";
  vars.keyPickupInfo = keyPickup.info ? String(keyPickup.info) :
    keyPickup.notes ? String(keyPickup.notes) : "";

  Object.assign(vars, extra || {});
  return refreshPhotographerDerivedVars(vars);
}

/**
 * Sendet Terminbenachrichtigungen an weitere eingeladene Personen (attendeeEmails).
 * Verwendet Template 'attendee_notification' – OHNE Preisangaben.
 * Idempotent via sendMailIdempotent (idempotency_key beinhaltet Status um Duplikate bei
 * verschiedenen Events zu vermeiden).
 *
 * @param {object} pool
 * @param {object} order
 * @param {string} statusForKey - Status der den Idempotency-Key differenziert (z.B. "confirmed")
 * @param {function} sendMail
 */
async function sendAttendeeNotifications(pool, order, statusForKey, sendMail) {
  const raw = (order.attendeeEmails || order.attendee_emails || "").trim();
  if (!raw || !pool || !sendMail) return { sent: 0, skipped: 0, failed: 0 };
  const emails = raw.split(",").map(function(e) { return e.trim(); }).filter(Boolean);
  if (!emails.length) return { sent: 0, skipped: 0, failed: 0 };

  const vars = buildTemplateVars(order, {});
  await enrichPhotographerVars(pool, vars);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const email of emails) {
    const idempKey = String(order.orderNo || order.order_no) + "_attendee_notification_" + statusForKey + "_" + email;
    try {
      const insertResult = await pool.query(
        `INSERT INTO email_send_log (idempotency_key, template_key, recipient, order_no, sent_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempKey, "attendee_notification", email, order.orderNo || order.order_no]
      );
      if (!insertResult || insertResult.rowCount !== 1) {
        skipped++;
        continue;
      }

      const tmplRows = await pool.query(
        "SELECT subject, body_html, body_text FROM email_templates WHERE key='attendee_notification' AND active=true ORDER BY template_language LIMIT 1"
      );
      if (!tmplRows.rows.length) {
        skipped++;
        await pool.query("DELETE FROM email_send_log WHERE idempotency_key=$1", [idempKey]).catch(function() {});
        continue;
      }
      const tmpl = tmplRows.rows[0];
      const subject = renderTemplate(tmpl.subject, vars);
      const html = renderTemplate(tmpl.body_html, vars);
      const text = renderTemplate(tmpl.body_text, vars);

      const sendResult = normalizeMailSendResult(await sendMail(email, subject, html, text));
      if (!sendResult.sent) {
        failed++;
        await pool.query("DELETE FROM email_send_log WHERE idempotency_key=$1", [idempKey]).catch(function() {});
        console.error("[attendee] Versand nicht bestaetigt:", { email, reason: sendResult.reason || "send_not_confirmed" });
        continue;
      }
      sent++;
    } catch (err) {
      failed++;
      await pool.query("DELETE FROM email_send_log WHERE idempotency_key=$1", [idempKey]).catch(function() {});
      console.error("[attendee] Fehler beim Senden an", email, err && err.message);
    }
  }
  return { sent, skipped, failed };
}

// ─── Verfuegbare Platzhalter-Dokumentation ───────────────────────────────────

const AVAILABLE_PLACEHOLDERS = [
  { key: "orderNo",             desc: "Auftragsnummer" },
  { key: "customerName",        desc: "Name des Kunden" },
  { key: "customerEmail",       desc: "E-Mail des Kunden" },
  { key: "customerPhone",       desc: "Telefon des Kunden" },
  { key: "customerSalutation",  desc: "Anrede des Kunden (Herr/Frau/Firma)" },
  { key: "customerFirstName",   desc: "Vorname des Kunden" },
  { key: "customerMobile",      desc: "Mobilnummer des Kunden" },
  { key: "customerStreet",      desc: "Rechnungsadresse Strasse des Kunden" },
  { key: "customerNotes",       desc: "Hinweise/Notizen des Kunden" },
  { key: "company",             desc: "Firma des Kunden" },
  { key: "customerCompanyEmail",desc: "Firma E-Mail des Kunden" },
  { key: "customerCompanyPhone",desc: "Firma Telefon des Kunden" },
  { key: "orderRef",            desc: "Bestellreferenz" },
  { key: "address",             desc: "Objektadresse" },
  { key: "zipCity",             desc: "PLZ/Ort" },
  { key: "addressLine",         desc: "PLZ/Ort + Objektadresse kombiniert (leer wenn beide fehlen)" },
  { key: "appointmentDate",     desc: "Termin Datum (YYYY-MM-DD)" },
  { key: "appointmentTime",     desc: "Termin Uhrzeit (HH:MM)" },
  { key: "photographerKey",     desc: "Key des Fotografen" },
  { key: "photographerName",    desc: "Name des Fotografen" },
  { key: "photographerPhone",   desc: "Telefon des Fotografen (falls in der Order hinterlegt)" },
  { key: "photographerEmail",   desc: "E-Mail des Fotografen" },
  { key: "photographerMobile",  desc: "Mobile des Fotografen" },
  { key: "photographerPhoneMobile", desc: "Alias fuer photographerMobile" },
  { key: "photographerWhatsApp",desc: "WhatsApp-Link des Fotografen" },
  { key: "photographerInitials",desc: "Initialen des Fotografen" },
  { key: "photographerRadiusKm",desc: "Radius des Fotografen in km (0 = unbegrenzt)" },
  { key: "photographerRadiusLabel", desc: "Radius formatiert (z.B. 30 km oder unbegrenzt)" },
  { key: "photographerContactSummary", desc: "Kompakte Kontaktzeile des Fotografen inkl. Mobile/WhatsApp" },
  { key: "packageName",         desc: "Paket-Name" },
  { key: "servicesSummary",     desc: "Alle Dienstleistungen (kommagetrennt)" },
  { key: "totalFormatted",      desc: "Gesamtbetrag (CHF)" },
  { key: "provisionalExpiresDate", desc: "Ablaufdatum Provisorium (dd.mm.yyyy)" },
  { key: "confirmationLink",    desc: "Link zur Bestaetigungsseite" },
  { key: "reviewLink",          desc: "Link zur internen Bewertungsseite" },
  { key: "googleReviewLink",    desc: "Link zu Google-Bewertung" },
  { key: "cancellationReason",  desc: "Stornierungsgrund" },
  { key: "pauseReason",         desc: "Pausierungsgrund" },
  { key: "statusLabel",         desc: "Status auf Deutsch (z.B. Bestätigt, Storniert)" },
  { key: "companyName",         desc: "Firmenname (aus ENV)" },
  { key: "companyEmail",        desc: "Firmen-E-Mail (aus ENV)" },
  { key: "companyPhone",        desc: "Firmen-Telefon (aus ENV)" },
  { key: "objectType",          desc: "Objektart (Rohwert, z.B. single_house)" },
  { key: "objectTypeLabel",     desc: "Objektart (lesbar, z.B. Einfamilienhaus)" },
  { key: "objectArea",          desc: "Flaeche des Objekts in m2" },
  { key: "objectFloors",        desc: "Anzahl Etagen" },
  { key: "objectRooms",         desc: "Zimmeranzahl" },
  { key: "objectDesc",          desc: "Objektbeschreibung" },
  { key: "objectSpecials",      desc: "Besonderheiten des Objekts" },
  { key: "onsiteName",          desc: "Name des Vor-Ort-Kontakts" },
  { key: "onsitePhone",         desc: "Telefon des Vor-Ort-Kontakts" },
  { key: "onsiteEmail",         desc: "E-Mail des Vor-Ort-Kontakts (Legacy: erster Kontakt)" },
  { key: "onsiteContacts",      desc: "JSON-Array aller Vor-Ort-Kontakte (name, phone, email, calendarInvite)" },
  { key: "altBillingCompany",   desc: "Abweichende Rechnungsfirma" },
  { key: "altBillingCompanyEmail", desc: "Abweichende Firmen-E-Mail" },
  { key: "altBillingCompanyPhone", desc: "Abweichendes Firmen-Telefon" },
  { key: "altBillingStreet",    desc: "Abweichende Rechnungsstrasse" },
  { key: "altBillingZipCity",   desc: "Abweichende Rechnungs-PLZ/Ort" },
  { key: "altBillingSalutation",desc: "Abweichende Kontakt-Anrede" },
  { key: "altBillingFirstName", desc: "Abweichender Kontakt-Vorname" },
  { key: "altBillingName",      desc: "Abweichender Kontakt-Nachname" },
  { key: "altBillingEmail",     desc: "Abweichende Kontakt-E-Mail" },
  { key: "altBillingPhone",     desc: "Abweichendes Kontakt-Telefon" },
  { key: "altBillingMobile",    desc: "Abweichendes Kontakt-Mobil" },
  { key: "altBillingOrderRef",  desc: "Referenz zur abweichenden Rechnungsadresse" },
  { key: "altBillingNotes",     desc: "Bemerkungen zur abweichenden Rechnungsadresse" },
  { key: "keyPickupAddress",    desc: "Adresse der Schluesselabholung" },
  { key: "keyPickupInfo",       desc: "Info/Hinweis zur Schluesselabholung" },
];

/**
 * Sendet eine Template-Mail idempotent mit Sprachaufloesung (DoD F + DoD G).
 *
 * Der idempotency_key ist: "<orderNo>_<templateKey>_<recipient>".
 * Template wird per Sprachaufloesung geladen (Fallback: de-CH).
 *
 * @param {object} pool - pg Pool
 * @param {string} templateKey
 * @param {string} recipient - E-Mail-Adresse
 * @param {number|string} orderNo
 * @param {object} vars - Template-Variablen (aus buildTemplateVars)
 * @param {Function} sendMail - async (to, subject, html, text) => void
 * @param {string} [language] - BCP-47 Sprachcode, z.B. "de-CH", "en"
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendMailIdempotent(pool, templateKey, recipient, orderNo, vars, sendMail, language) {
  if (!pool || !templateKey || !recipient || !sendMail) {
    return { sent: false, reason: "Fehlende Parameter" };
  }

  const idempotencyKey = String(orderNo || "0") + "_" + templateKey + "_" + String(recipient).toLowerCase();

  // Template mit Sprachaufloesung laden (Fallback: de-CH)
  const tmpl = await loadTemplate(pool, templateKey, language || "de-CH");
  if (!tmpl) {
    console.warn("[mail-idempotent] Template nicht gefunden:", templateKey);
    return { sent: false, reason: "template_not_found" };
  }

  const renderVars = await enrichPhotographerVars(pool, { ...(vars || {}) });
  const subject = renderTemplate(tmpl.subject, renderVars);
  const html = renderTemplate(tmpl.body_html, renderVars);
  const usedLanguage = tmpl.template_language || "de-CH";

  // Log-Eintrag VOR Versand (atomar via RETURNING fuer Race-Condition-Schutz)
  try {
    const insertResult = await pool.query(
      `INSERT INTO email_send_log (idempotency_key, order_no, template_key, recipient, template_language)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [idempotencyKey, orderNo || null, templateKey, recipient, usedLanguage]
    );
    if (!insertResult || insertResult.rowCount !== 1) {
      console.log("[mail-idempotent] bereits gesendet, uebersprungen:", { orderNo, templateKey, recipient });
      return { sent: false, reason: "already_sent" };
    }
  } catch (err) {
    console.error("[mail-idempotent] Log-Eintrag fehlgeschlagen:", err && err.message);
    return { sent: false, reason: "db_error" };
  }

  try {
    const sendResult = normalizeMailSendResult(await sendMail(recipient, subject, html, ""));
    if (!sendResult.sent) {
      throw new Error(sendResult.reason || "send_not_confirmed");
    }
    console.log("[mail-idempotent] gesendet:", { orderNo, templateKey, recipient, language: usedLanguage });
    return { sent: true, language: usedLanguage };
  } catch (err) {
    console.error("[mail-idempotent] Versand fehlgeschlagen:", { orderNo, templateKey, recipient, error: err && err.message });
    // Log-Eintrag loeschen damit Retry moeglich
    try {
      await pool.query("DELETE FROM email_send_log WHERE idempotency_key=$1", [idempotencyKey]);
    } catch (_) {}
    return { sent: false, reason: "send_error" };
  }
}

module.exports = {
  renderTemplate,
  escapeHtml,
  loadTemplate,
  saveTemplate,
  listTemplates,
  getTemplateHistory,
  restoreTemplateVersion,
  buildTemplateVars,
  enrichPhotographerVars,
  sendMailIdempotent,
  sendAttendeeNotifications,
  AVAILABLE_PLACEHOLDERS,
  normalizeMailSendResult,
};
