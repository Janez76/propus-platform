const templateRenderer = require("../template-renderer");

function fmt(val) {
  return val && String(val).trim() ? String(val).trim() : null;
}

async function resolvePhotographerCalendarVars(pool, order, extra = {}) {
  const vars = templateRenderer.buildTemplateVars(order, extra);
  await templateRenderer.enrichPhotographerVars(pool, vars);
  return vars;
}

/**
 * Kurzer Orts-Titel fuer Kalender-Betreff (PLZ/Ort oder letztes Adresssegment).
 */
function calendarAddressTitle(order) {
  const billing = order.billing || {};
  const zipCity = String(billing.zipcity || "").trim();
  const addressText = String(order.address || "").trim();
  if (!addressText) return zipCity || "Ort";
  const parts = addressText.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || addressText;
  return /\b\d{4,5}\b/.test(last) ? last : addressText;
}

/**
 * Variablen fuer calendar_templates (customer_event / photographer_event).
 * Baut auf buildTemplateVars auf und ergaenzt Bloecke wie customerBlock, keyPickupBlock.
 *
 * @param {object} order
 * @param {object} [extra]
 * @param {string} [extra.photographerPhone]
 * @param {"comma"|"bullets"} [extra.servicesSummaryMode] - bullets fuer Fotografen-Template
 */
function buildCalendarVars(order, extra = {}) {
  const base = templateRenderer.buildTemplateVars(order, extra);
  const billing = order.billing || {};
  const object = order.object || {};
  const services = order.services || {};
  const photographer = order.photographer || {};
  const keyPickup = order.keyPickup || {};

  const address = calendarAddressTitle(order);

  const packageLabel = (services.package && services.package.label) || "";
  const addonList = (services.addons || []).map((a) => a.label || "").filter(Boolean);
  const servicesComma = [packageLabel, ...addonList].filter(Boolean).join(", ") || "—";
  const servicesBullets = [packageLabel, ...addonList].filter(Boolean).map((l) => `   • ${l}`).join("\n") || "—";
  const mode = extra.servicesSummaryMode === "bullets" ? "bullets" : "comma";
  const servicesSummary = mode === "bullets" ? servicesBullets : servicesComma;

  const typeLabel = base.objectTypeLabel || String(object.type || "").trim();
  const areaPart = object.area != null && String(object.area).trim() !== "" ? `${object.area} m²` : "";
  const roomsPart = object.rooms != null && String(object.rooms).trim() !== "" ? `${object.rooms} Zi.` : "";
  const floorsPart = object.floors != null && String(object.floors).trim() !== "" ? `${object.floors} Etagen/Ebene` : "";
  const objectSummary = [typeLabel, areaPart, roomsPart, floorsPart].filter(Boolean).join(" · ") || "—";

  const clientName = (billing.name || "").trim();
  const clientPhone = (billing.phone || "").trim();
  const clientMobile = (billing.phone_mobile || "").trim();
  const clientEmail = (billing.email || "").trim();
  const clientCompanyEmail = (billing.company_email || "").trim();
  const clientCompanyPhone = (billing.company_phone || "").trim();
  const orderRef = (billing.order_ref || "").trim();
  const altContactName = [billing.alt_salutation, billing.alt_first_name, billing.alt_name].filter(Boolean).join(" ").trim();
  const altCompany = (billing.alt_company || "").trim();
  const altCompanyEmail = (billing.alt_company_email || "").trim();
  const altCompanyPhone = (billing.alt_company_phone || "").trim();
  const altStreet = (billing.alt_street || "").trim();
  const altZipCity = (billing.alt_zipcity || "").trim();
  const altEmail = (billing.alt_email || "").trim();
  const altPhone = (billing.alt_phone || "").trim();
  const altMobile = (billing.alt_phone_mobile || "").trim();
  const customerLines = [];
  if (clientName) customerLines.push(`   ${clientName}`);
  if (clientPhone) customerLines.push(`   Tel: ${clientPhone}`);
  if (clientMobile) customerLines.push(`   Mobil: ${clientMobile}`);
  if (clientEmail) customerLines.push(`   E-Mail: ${clientEmail}`);
  if (clientCompanyEmail) customerLines.push(`   Firma E-Mail: ${clientCompanyEmail}`);
  if (clientCompanyPhone) customerLines.push(`   Firma Tel: ${clientCompanyPhone}`);
  if (orderRef) customerLines.push(`   Referenz: ${orderRef}`);
  if (altCompany || altContactName || altStreet || altZipCity) {
    customerLines.push("   Abweichende Rechnungsadresse:");
    if (altCompany) customerLines.push(`     Firma: ${altCompany}`);
    if (altCompanyEmail) customerLines.push(`     Firma E-Mail: ${altCompanyEmail}`);
    if (altCompanyPhone) customerLines.push(`     Firma Tel: ${altCompanyPhone}`);
    if (altStreet) customerLines.push(`     Strasse: ${altStreet}`);
    if (altZipCity) customerLines.push(`     PLZ / Ort: ${altZipCity}`);
    if (altContactName) customerLines.push(`     Kontakt: ${altContactName}`);
    if (altEmail) customerLines.push(`     Kontakt E-Mail: ${altEmail}`);
    if (altPhone) customerLines.push(`     Kontakt Tel: ${altPhone}`);
    if (altMobile) customerLines.push(`     Kontakt Mobil: ${altMobile}`);
  }
  const customerBlock = customerLines.join("\n") || "—";

  const onsiteName = (billing.onsiteName || object.onsiteName || "").trim();
  const onsitePhone = (billing.onsitePhone || object.onsitePhone || "").trim();
  let onsiteBlock = "";
  if (onsiteName || onsitePhone) {
    onsiteBlock = `👤 Vor Ort: ${[onsiteName, onsitePhone ? `Tel: ${onsitePhone}` : null].filter(Boolean).join(" | ")}`;
  }

  const notes = (billing.notes || "").trim();
  const notesBlock = notes ? `💬 Hinweise: ${notes}` : "";

  const kpAddr = (keyPickup.address || "").trim();
  const kpInfo = (keyPickup.info || keyPickup.notes || "").trim();
  let keyPickupBlock = "";
  if (kpAddr || kpInfo) {
    const lines = ["🔑 Schlüsselabholung:"];
    if (kpAddr) lines.push(`   ${kpAddr}`);
    if (kpInfo) lines.push(`   Info: ${kpInfo}`);
    keyPickupBlock = lines.join("\n");
  }

  const photogName = (photographer.name || "").trim();
  const photogPhone = String(base.photographerPhone || extra.photographerPhone || "").trim();
  const photogMobile = String(base.photographerMobile || "").trim();
  const photogWhatsapp = String(base.photographerWhatsApp || "").trim();
  const photogEmail = String(base.photographerEmail || photographer.email || "").trim();
  const photogInitials = String(base.photographerInitials || "").trim();
  const photogRadiusLabel = String(base.photographerRadiusLabel || "").trim();
  const photographerLines = [];
  if (photogName) photographerLines.push(`   ${photogInitials ? `${photogInitials} · ${photogName}` : photogName}`);
  if (photogPhone) photographerLines.push(`   Tel: ${photogPhone}`);
  if (photogMobile) photographerLines.push(`   Mobile: ${photogMobile}`);
  if (photogWhatsapp) photographerLines.push(`   WhatsApp: ${photogWhatsapp}`);
  if (photogEmail) photographerLines.push(`   E-Mail: ${photogEmail}`);
  if (photogRadiusLabel) photographerLines.push(`   Radius: ${photogRadiusLabel}`);
  const photographerBlock = photographerLines.join("\n") || "—";

  const baseUrl = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
  const adminLink = `${baseUrl}/admin.html?order=${order.orderNo || ""}`;

  return {
    ...base,
    address,
    addressLine: base.addressLine || [billing.zipcity, order.address].filter(Boolean).join(", ") || "",
    objectSummary,
    servicesSummary,
    customerBlock,
    onsiteBlock,
    notesBlock,
    keyPickupBlock,
    photographerBlock,
    photographerName: photogName || "—",
    photographerPhone: photogPhone,
    photographerMobile: photogMobile,
    photographerWhatsApp: photogWhatsapp,
    photographerInitials: photogInitials,
    photographerRadiusLabel: photogRadiusLabel,
    photographerContactSummary: base.photographerContactSummary || "",
    photographerEmail: photogEmail,
    packageName: packageLabel || "—",
    adminLink,
  };
}

function normalizeCalendarBody(text) {
  return String(text || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Vor DB-Betreff PROVISORISCH/BESTAETIGT setzen (wie frueher buildCalendarSubject).
 */
function applyCalendarEventTypePrefix(renderedSubject, { eventType, expiresAt } = {}) {
  const sub = String(renderedSubject || "").trim();
  if (eventType === "provisional") {
    const expStr = expiresAt
      ? ` (läuft ab ${new Date(expiresAt).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })})`
      : "";
    return `PROVISORISCH - ${sub}${expStr}`;
  }
  if (eventType === "confirmed") {
    return `BESTAETIGT - ${sub}`;
  }
  return sub;
}

/**
 * Kalender-Template aus DB laden und rendern. Fallback: buildCalendarContent + buildCalendarSubject.
 *
 * @param {import("pg").Pool} pool
 * @param {"customer_event"|"photographer_event"} templateKey
 * @param {object} order
 * @param {object} [options]
 */
async function renderStoredCalendarTemplate(pool, templateKey, order, options = {}) {
  const {
    photogPhone = "—",
    eventType,
    expiresAt,
  } = options;

  const servicesSummaryMode = templateKey === "photographer_event" ? "bullets" : "comma";
  const enrichedPhotographerVars = await resolvePhotographerCalendarVars(pool, order, { photographerPhone: photogPhone });
  const vars = buildCalendarVars(order, { ...enrichedPhotographerVars, servicesSummaryMode });

  let subjectTpl = null;
  let bodyTpl = null;
  if (pool) {
    try {
      const { rows } = await pool.query(
        "SELECT subject, body FROM calendar_templates WHERE key = $1 AND active = true LIMIT 1",
        [templateKey]
      );
      if (rows[0]) {
        subjectTpl = rows[0].subject;
        bodyTpl = rows[0].body;
      }
    } catch (err) {
      console.warn("[calendar] template load failed", templateKey, err && err.message);
    }
  }

  const addressText = order.address || "";
  const object = order.object || {};
  const titleForLegacy = calendarAddressTitle(order);

  if (subjectTpl != null && bodyTpl != null) {
    let subject = templateRenderer.renderTemplate(subjectTpl, vars);
    subject = applyCalendarEventTypePrefix(subject, { eventType, expiresAt });
    let body = templateRenderer.renderTemplate(bodyTpl, vars);
    body = normalizeCalendarBody(body);
    return { subject, body, addressText };
  }

  // ─── Fallback (kein DB-Template) ─────────────────────────────────────────
  const objectInfo = [
    "Adresse: " + (addressText || "—"),
    "Objektart: " + (object && object.type || "—"),
    "Flaeche: " + (object && object.area || "—") + " m2",
  ].join("\n");

  const servicesText = [
    (order.services && order.services.package && order.services.package.label) || "",
    ...((order.services && order.services.addons) || []).map((a) => a.label || ""),
  ].filter(Boolean).join("\n");

  const calDescription = buildCalendarContent({
    objectInfo,
    address: addressText,
    object: order.object || {},
    servicesText,
    billing: order.billing || {},
    keyPickup: order.keyPickup || null,
    photographer: {
      name: enrichedPhotographerVars.photographerName || (order.photographer && order.photographer.name) || "",
      phone: enrichedPhotographerVars.photographerPhone || photogPhone || "—",
      phone_mobile: enrichedPhotographerVars.photographerMobile || "",
      whatsapp: enrichedPhotographerVars.photographerWhatsApp || "",
      initials: enrichedPhotographerVars.photographerInitials || "",
      radiusLabel: enrichedPhotographerVars.photographerRadiusLabel || "",
      email: enrichedPhotographerVars.photographerEmail || (order.photographer && order.photographer.email) || "",
    },
    orderNo: order.orderNo,
  });

  const calSubject = buildCalendarSubject({
    title: titleForLegacy,
    orderNo: order.orderNo,
    eventType,
    expiresAt,
  });

  return { subject: calSubject, body: calDescription, addressText };
}

function buildCalendarContent({ objectInfo, address, object, servicesText, billing, keyPickup, photographer, orderNo }) {
  const lines = [];

  const addr = fmt(address) || (fmt(objectInfo) ? objectInfo.split("\n")[0] : null);
  if (addr) lines.push(`\uD83D\uDCCD Adresse: ${addr}`);

  const type = fmt(object?.type);
  const area = fmt(object?.area) ? `${object.area} m\u00b2` : null;
  const rooms = fmt(object?.rooms) ? `${object.rooms} Zi.` : null;
  const floors = fmt(object?.floors) ? `${object.floors} Etagen/Ebene` : null;
  const objParts = [type, area, rooms, floors].filter(Boolean).join(" \u00b7 ");
  if (objParts) lines.push(`\uD83C\uDFE0 Objekt: ${objParts}`);

  const serviceLines = String(servicesText || "")
    .split("\n").map((l) => l.trim()).filter(Boolean);
  if (serviceLines.length) {
    lines.push("\uD83D\uDEE0 Dienstleistungen:");
    serviceLines.forEach((l) => lines.push(`   \u2022 ${l}`));
  }

  lines.push("");

  const clientName = fmt(billing?.name);
  const clientPhone = fmt(billing?.phone);
  const clientMobile = fmt(billing?.phone_mobile);
  const clientEmail = fmt(billing?.email);
  const clientCompanyEmail = fmt(billing?.company_email);
  const clientCompanyPhone = fmt(billing?.company_phone);
  const orderRef = fmt(billing?.order_ref);
  if (clientName || clientPhone || clientMobile || clientEmail || clientCompanyEmail || clientCompanyPhone || orderRef) {
    lines.push("\uD83D\uDCDE Kontakt:");
    if (clientName) lines.push(`   ${clientName}`);
    if (clientPhone) lines.push(`   Tel: ${clientPhone}`);
    if (clientMobile) lines.push(`   Mobil: ${clientMobile}`);
    if (clientEmail) lines.push(`   E-Mail: ${clientEmail}`);
    if (clientCompanyEmail) lines.push(`   Firma E-Mail: ${clientCompanyEmail}`);
    if (clientCompanyPhone) lines.push(`   Firma Tel: ${clientCompanyPhone}`);
    if (orderRef) lines.push(`   Referenz: ${orderRef}`);
  }

  const onsiteName = fmt(billing?.onsiteName);
  const onsitePhone = fmt(billing?.onsitePhone);
  if (onsiteName || onsitePhone) {
    lines.push("   Vor Ort: " + [onsiteName, onsitePhone ? `Tel: ${onsitePhone}` : null].filter(Boolean).join(" | "));
  }

  const photogName = fmt(photographer?.name);
  const photogPhone = fmt(photographer?.phone);
  const photogMobile = fmt(photographer?.phone_mobile || photographer?.mobile);
  const photogWhatsApp = fmt(photographer?.whatsapp);
  const photogInitials = fmt(photographer?.initials);
  const photogRadiusLabel = fmt(photographer?.radiusLabel);
  const photogEmail = fmt(photographer?.email);
  if (photogName || photogPhone || photogMobile || photogWhatsApp || photogEmail || photogRadiusLabel) {
    const title = photogInitials && photogName ? `${photogInitials} · ${photogName}` : (photogName || photogInitials);
    lines.push("\uD83D\uDCF8 Fotograf: " + [title, photogPhone, photogEmail].filter(Boolean).join(" | "));
    if (photogMobile) lines.push(`   Mobile: ${photogMobile}`);
    if (photogWhatsApp) lines.push(`   WhatsApp: ${photogWhatsApp}`);
    if (photogRadiusLabel) lines.push(`   Radius: ${photogRadiusLabel}`);
  }

  const notes = fmt(billing?.notes);
  if (notes) lines.push(`\uD83D\uDCAC Hinweise: ${notes}`);

  const altContactName = [billing?.alt_salutation, billing?.alt_first_name, billing?.alt_name].map(fmt).filter(Boolean).join(" ");
  const altCompany = fmt(billing?.alt_company);
  const altCompanyEmail = fmt(billing?.alt_company_email);
  const altCompanyPhone = fmt(billing?.alt_company_phone);
  const altStreet = fmt(billing?.alt_street);
  const altZipCity = fmt(billing?.alt_zipcity);
  const altEmail = fmt(billing?.alt_email);
  const altPhone = fmt(billing?.alt_phone);
  const altMobile = fmt(billing?.alt_phone_mobile);
  if (altCompany || altContactName || altStreet || altZipCity) {
    lines.push("\uD83E\uDDFE Abweichende Rechnungsadresse:");
    if (altCompany) lines.push(`   Firma: ${altCompany}`);
    if (altCompanyEmail) lines.push(`   Firma E-Mail: ${altCompanyEmail}`);
    if (altCompanyPhone) lines.push(`   Firma Tel: ${altCompanyPhone}`);
    if (altStreet) lines.push(`   Strasse: ${altStreet}`);
    if (altZipCity) lines.push(`   PLZ / Ort: ${altZipCity}`);
    if (altContactName) lines.push(`   Kontakt: ${altContactName}`);
    if (altEmail) lines.push(`   Kontakt E-Mail: ${altEmail}`);
    if (altPhone) lines.push(`   Kontakt Tel: ${altPhone}`);
    if (altMobile) lines.push(`   Kontakt Mobil: ${altMobile}`);
  }

  const kpAddr = keyPickup?.address?.trim();
  const kpInfo = (keyPickup?.info || keyPickup?.notes || "").trim();
  if (kpAddr || kpInfo) {
    lines.push("\uD83D\uDD11 Schl\u00fcsselabholung:");
    if (kpAddr) lines.push(`   ${kpAddr}`);
    if (kpInfo) lines.push(`   Info: ${kpInfo}`);
  }

  if (orderNo) {
    lines.push(`\n#${orderNo}`);
    const baseUrl = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
    lines.push(`Link: ${baseUrl}/admin.html?order=${orderNo}`);
  }

  return lines.join("\n");
}

/**
 * Baut den Kalender-Event-Titel.
 */
function buildCalendarSubject({ title, orderNo, eventType, expiresAt }) {
  if (eventType === "provisional") {
    const expStr = expiresAt
      ? ` (laeuft ab ${new Date(expiresAt).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })})`
      : "";
    return `PROVISORISCH - ${title} (#${orderNo})${expStr}`;
  }
  if (eventType === "confirmed") {
    return `BESTAETIGT - ${title} (#${orderNo})`;
  }
  return `Shooting ${title} (#${orderNo})`;
}

module.exports = {
  buildCalendarContent,
  buildCalendarSubject,
  buildCalendarVars,
  renderStoredCalendarTemplate,
  normalizeCalendarBody,
  applyCalendarEventTypePrefix,
  calendarAddressTitle,
};
