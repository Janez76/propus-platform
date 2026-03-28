const ACTION_PATTERNS = [
  { type: 'send_renewal_email', pattern: /(verlaengerungsmail|verlängerungsmail|renewal mail|mail senden|erneut senden)/i },
  { type: 'check_payment', pattern: /(zahlung pruefen|zahlung prüfen|payment check|bezahlt.*pruefen|bezahlt.*prüfen|rechnungsstatus pruefen|rechnungsstatus prüfen)/i },
  { type: 'archive_tour', pattern: /(archivier|tour archivieren|jetzt archivieren)/i },
  { type: 'unarchive_matterport', pattern: /(reaktivier|unarchiv|matterport.*aktivieren|matterport.*reaktivieren)/i },
  { type: 'decline_tour', pattern: /(nicht verlaengern|nicht verlängern|kuendigen|kündigen|ablehnen)/i },
  { type: 'approve_suggestion', pattern: /(vorschlag bestaetigen|vorschlag bestätigen|ki-vorschlag bestaetigen|ki-vorschlag bestätigen|anwenden)/i },
  { type: 'reject_suggestion', pattern: /(vorschlag ablehnen|ki-vorschlag ablehnen|verwerfen)/i },
  { type: 'sync_mail_suggestions', pattern: /(mail-vorschlaege synchronisieren|mail-vorschläge synchronisieren|mails synchronisieren|exchange abrufen)/i },
  { type: 'sync_invoice_suggestions', pattern: /(rechnungsvorschlaege synchronisieren|rechnungsvorschläge synchronisieren|rechnungen synchronisieren)/i },
];

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return compactText(value)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function extractEmailAddress(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].trim().toLowerCase() : null;
}

function extractObjectQuery(text) {
  const value = compactText(text);
  if (!value) return null;

  // Führende Verben entfernen (suche, zeige, liste, finde, hol, lad, ...)
  const withoutVerb = value.replace(/^\s*(?:such[e]?|zeig[e]?|list[e]?|find[e]?|hol[e]?|lad[e]?|gib|show|get|fetch)\s+/i, '').trim();

  const patternedMatch = withoutVerb.match(
    /\b(?:mails?|emails?|nachrichten|status|details?|infos?|touren?|tour|objekte?|objekt|kunden?|kunde|rechnungen?|rechnung)\s+(?:zu|von|vom|fuer|für|bei|zur?|zum|mit|des?|der|im|in)\s+(.+)$/i
  );
  if (patternedMatch?.[1]) {
    return compactText(patternedMatch[1]);
  }

  // Fallback: Führungsverb+Substantiv-Muster direkt (z.B. "suche richard")
  const simpleMatch = value.match(
    /^\s*(?:such[e]?|zeig[e]?|list[e]?|find[e]?|hol[e]?)\s+(?:touren?|kunden?|rechnungen?|mails?)?\s*(.{2,}?)\s*$/i
  );
  if (simpleMatch?.[1] && !simpleMatch[1].match(/^(?:touren?|kunden?|rechnungen?|mails?)$/i)) {
    return compactText(simpleMatch[1]);
  }

  const addressLikeMatch = value.match(/\b([A-Za-zÄÖÜäöüß][^,]+?\d+[a-zA-Z]?(?:,\s*\d{4,5}\s+[A-Za-zÄÖÜäöüß][^,]*)?)$/);
  if (addressLikeMatch?.[1]) {
    return compactText(addressLikeMatch[1]);
  }

  return null;
}

function extractExplicitTargets(message) {
  const text = compactText(message);
  const normalized = normalizeText(text);
  const tourId = text.match(/\btour\s*#?\s*(\d{1,9})\b/i)?.[1] || null;
  const suggestionId = text.match(/\bvorschlag\s+([a-f0-9-]{20,})\b/i)?.[1] || null;
  const exxasCustomerId = text.match(/\b(?:exxas\s+)?kunde\s*#?\s*(\d{1,12})\b/i)?.[1] || null;
  const invoiceNumber = text.match(/\b(?:rechnung|rechnungsnummer|invoice)\s*#?\s*([a-z0-9][a-z0-9\-\/]{2,})\b/i)?.[1] || null;
  const matterportSpaceId = text.match(/\bmatterport\s+([A-Za-z0-9_-]{6,})\b/)?.[1]
    || text.match(/my\.matterport\.com\/show\/\?m=([A-Za-z0-9_-]+)/i)?.[1]
    || null;
  const email = extractEmailAddress(text);
  const objectQuery = extractObjectQuery(text);

  return {
    raw: text,
    normalized,
    tourId: tourId ? parseInt(tourId, 10) : null,
    suggestionId: suggestionId || null,
    exxasCustomerId: exxasCustomerId ? String(exxasCustomerId) : null,
    invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : null,
    matterportSpaceId: matterportSpaceId ? String(matterportSpaceId).trim() : null,
    email,
    objectQuery: objectQuery || null,
  };
}

function detectActionType(message) {
  const text = compactText(message);
  if (!text) return null;
  const match = ACTION_PATTERNS.find((entry) => entry.pattern.test(text));
  return match?.type || null;
}

function classifyReadIntent(message, context = {}) {
  const targets = extractExplicitTargets(message);
  const text = targets.normalized;
  const actionType = detectActionType(message);
  if (actionType) {
    return { mode: 'write', actionType, targets };
  }

  const readHints = /(zeige|liste|pruef|prüf|check|status|welche|welcher|wann|offen|bezahlt|faellig|fällig|mails?|emails?|kunde|rechnung|matterport|tour)/i;
  const mentionsTour = /(tour|objekt|verlanger|verlaenger|verlänger|hosting|ablauf|erneuer)/i.test(text);
  const wantsMatterport = /(matterport|modellstatus|erstellt|aktiv|archiviert|tour-status)/i.test(text)
    || (!!(targets.tourId || context?.effectiveTourId) && mentionsTour);
  const wantsExxas = /(exxas|rechnung|rechnungsstatus|zahlung|offen|faellig|fällig|kunde|abo|vertrag|verlanger|verlaenger|verlänger|erneuer)/i.test(text);
  const wantsExchange = /(mail|email|exchange|nachricht|nachrichten|antwort)/i.test(text);

  const hasExplicitReadTarget = !!(
    targets.tourId
    || targets.exxasCustomerId
    || targets.email
    || targets.matterportSpaceId
    || targets.invoiceNumber
    || targets.objectQuery
    || context?.effectiveTourId
  );

  if (!readHints.test(message) && !hasExplicitReadTarget) {
    return { mode: 'chat', actionType: null, targets };
  }

  return {
    mode: 'read',
    actionType: null,
    wantsMatterport,
    wantsExxas,
    wantsExchange,
    targets,
  };
}

function sourceLabel(source) {
  switch (source) {
    case 'local':
      return 'Quelle: lokaler Sync';
    case 'exxas':
      return 'Quelle: Exxas live';
    case 'matterport':
      return 'Quelle: Matterport live';
    case 'exchange':
      return 'Quelle: Exchange live';
    default:
      return 'Quelle: unbekannt';
  }
}

function buildBulletSection(source, lines) {
  const filtered = (lines || []).filter(Boolean);
  if (!filtered.length) return null;
  return [sourceLabel(source), ...filtered.map((line) => `- ${line}`)].join('\n');
}

module.exports = {
  ACTION_PATTERNS,
  buildBulletSection,
  classifyReadIntent,
  compactText,
  detectActionType,
  extractEmailAddress,
  extractExplicitTargets,
  extractObjectQuery,
  normalizeText,
  sourceLabel,
};
