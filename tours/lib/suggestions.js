const { pool } = require('./db');
const { logAction } = require('./actions');
const { classifyEmailIntentWithAi, prefilterEmailIntentWithAi, getAiConfig } = require('./ai');
const exxas = require('./exxas');
const { fetchMailboxMessages, getGraphConfig } = require('./microsoft-graph');
const { extractMatterportId, getExxasContractId, getTourObjectLabel, normalizeTourRow } = require('./normalize');

let schemaEnsured = false;

const MAIL_PROMPT_VERSION = 'mail-intent-v2';
const MAIL_PIPELINE_VERSION = 'mail-suggestions-v3';

async function ensureSchema() {
  if (schemaEnsured) return;
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS customer_intent VARCHAR(30)`);
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS customer_intent_source VARCHAR(30)`);
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS customer_intent_note TEXT`);
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS customer_intent_confidence NUMERIC(5,2)`);
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS customer_intent_updated_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS customer_transfer_requested BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS customer_billing_attention BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(64)`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS amount_chf NUMERIC(10,2)`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30)`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payment_source VARCHAR(30)`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payment_note TEXT`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS recorded_by TEXT`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS subscription_start_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS subscription_end_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS invoice_kind VARCHAR(40)`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payrexx_payment_url TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.incoming_emails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mailbox_upn TEXT NOT NULL,
      graph_message_id TEXT NOT NULL UNIQUE,
      internet_message_id TEXT,
      conversation_id TEXT,
      subject TEXT,
      from_email TEXT,
      from_name TEXT,
      received_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      body_preview TEXT,
      body_text TEXT,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      matched_tour_id INTEGER REFERENCES tour_manager.tours(id),
      processing_status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (processing_status IN ('new','matched','suggested','reviewed','ignored','error')),
      raw_json JSONB,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.outgoing_emails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tour_id INTEGER NOT NULL REFERENCES tour_manager.tours(id) ON DELETE CASCADE,
      mailbox_upn TEXT NOT NULL,
      graph_message_id TEXT UNIQUE,
      internet_message_id TEXT,
      conversation_id TEXT,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      template_key TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      details_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.ai_suggestions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      suggestion_type VARCHAR(30) NOT NULL CHECK (suggestion_type IN ('invoice_match','email_intent')),
      source_key TEXT NOT NULL UNIQUE,
      source_invoice_id INTEGER REFERENCES tour_manager.exxas_invoices(id),
      source_email_id UUID REFERENCES tour_manager.incoming_emails(id) ON DELETE CASCADE,
      tour_id INTEGER REFERENCES tour_manager.tours(id),
      suggested_action VARCHAR(40) NOT NULL,
      confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
      reason TEXT,
      model_name TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected','applied')),
      details_json JSONB,
      reviewed_by TEXT,
      reviewed_note TEXT,
      gold_tour_id INTEGER REFERENCES tour_manager.tours(id),
      gold_intent VARCHAR(40),
      gold_action VARCHAR(40),
      review_reason TEXT,
      review_source VARCHAR(40),
      prompt_version TEXT,
      pipeline_version TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE tour_manager.ai_suggestions ADD COLUMN IF NOT EXISTS gold_tour_id INTEGER REFERENCES tour_manager.tours(id)`);
  await pool.query(`ALTER TABLE tour_manager.ai_suggestions ADD COLUMN IF NOT EXISTS gold_intent VARCHAR(40)`);
  await pool.query(`ALTER TABLE tour_manager.ai_suggestions ADD COLUMN IF NOT EXISTS gold_action VARCHAR(40)`);
  await pool.query(`ALTER TABLE tour_manager.ai_suggestions ADD COLUMN IF NOT EXISTS review_reason TEXT`);
  await pool.query(`ALTER TABLE tour_manager.ai_suggestions ADD COLUMN IF NOT EXISTS review_source VARCHAR(40)`);
  await pool.query(`ALTER TABLE tour_manager.ai_suggestions ADD COLUMN IF NOT EXISTS prompt_version TEXT`);
  await pool.query(`ALTER TABLE tour_manager.ai_suggestions ADD COLUMN IF NOT EXISTS pipeline_version TEXT`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incoming_emails_received_at ON tour_manager.incoming_emails(received_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incoming_emails_from_email ON tour_manager.incoming_emails(from_email)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incoming_emails_matched_tour_id ON tour_manager.incoming_emails(matched_tour_id) WHERE matched_tour_id IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incoming_emails_conversation_id ON tour_manager.incoming_emails(conversation_id) WHERE conversation_id IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incoming_emails_processing_status ON tour_manager.incoming_emails(processing_status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incoming_emails_mailbox_received ON tour_manager.incoming_emails(mailbox_upn, received_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_outgoing_emails_tour_id ON tour_manager.outgoing_emails(tour_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_outgoing_emails_recipient ON tour_manager.outgoing_emails(recipient_email)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_outgoing_emails_conversation ON tour_manager.outgoing_emails(conversation_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_outgoing_emails_template_key ON tour_manager.outgoing_emails(template_key)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_outgoing_emails_sent_at ON tour_manager.outgoing_emails(sent_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON tour_manager.ai_suggestions(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_type ON tour_manager.ai_suggestions(suggestion_type)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_tour_id ON tour_manager.ai_suggestions(tour_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_source_email_id ON tour_manager.ai_suggestions(source_email_id) WHERE source_email_id IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_source_key ON tour_manager.ai_suggestions(source_key)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_created_at ON tour_manager.ai_suggestions(created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_review_source ON tour_manager.ai_suggestions(review_source) WHERE review_source IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_pipeline_version ON tour_manager.ai_suggestions(pipeline_version) WHERE pipeline_version IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tours_matterport_space_id ON tour_manager.tours(matterport_space_id) WHERE matterport_space_id IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tours_customer_email ON tour_manager.tours(customer_email) WHERE customer_email IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tours_customer_intent ON tour_manager.tours(customer_intent) WHERE customer_intent IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_exxas_invoices_tour_id ON tour_manager.exxas_invoices(tour_id) WHERE tour_id IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_exxas_invoices_ref_vertrag ON tour_manager.exxas_invoices(ref_vertrag) WHERE ref_vertrag IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_exxas_invoices_exxas_status ON tour_manager.exxas_invoices(exxas_status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_exxas_invoices_zahlungstermin ON tour_manager.exxas_invoices(zahlungstermin) WHERE zahlungstermin IS NOT NULL');
  schemaEnsured = true;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  const stopwords = new Set([
    'der', 'die', 'das', 'und', 'oder', 'von', 'mit', 'fuer', 'für', 'auf', 'im', 'in', 'an', 'am', 'zu',
    'ihr', 'ihre', 'ihren', 'wir', 'sie', 'dass', 'bitte',
    'gmbh', 'holding', 'gruppe', 'group', 'company', 'immobilien', 'verwaltung', 'verwaltungen',
    'services', 'service', 'realestate', 'property',
  ]);
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !stopwords.has(token));
}

function tokenOverlapScore(left, right) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return overlap;
}

function normalizeSubject(value) {
  return normalizeText(value)
    .replace(/^(re|aw|wg)\s+/g, '')
    .trim();
}

function extractFirstEmail(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].trim().toLowerCase() : null;
}

function extractEmailDomain(value) {
  const email = extractFirstEmail(value);
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1].trim().toLowerCase();
}

function isSpecificCustomerDomain(domain) {
  if (!domain) return false;
  const publicDomains = new Set([
    'gmail.com',
    'hotmail.com',
    'outlook.com',
    'bluewin.ch',
    'icloud.com',
    'yahoo.com',
    'yahoo.de',
    'gmx.ch',
    'gmx.net',
    'gmx.de',
    'hotmail.ch',
    'live.com',
  ]);
  return !publicDomains.has(String(domain).trim().toLowerCase());
}

function extractMatterportIdFromText(value) {
  const text = String(value || '');
  const directLink = text.match(/https?:\/\/my\.matterport\.com\/show\/\?m=([A-Za-z0-9_-]+)/i);
  if (directLink?.[1]) return directLink[1];
  return extractMatterportId(text);
}

function compactReference(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function referenceAppearsInText(text, reference, minLength = 5) {
  const haystack = compactReference(text);
  const needle = compactReference(reference);
  return needle.length >= minLength && haystack.includes(needle);
}

function rememberCandidate(mapScores, mapReasons, tourId, score, reasonParts) {
  if (!tourId) return;
  const existingScore = mapScores.get(tourId) || 0;
  const existingReasons = mapReasons.get(tourId) || [];
  const mergedReasons = [...new Set([...existingReasons, ...reasonParts.filter(Boolean)])];
  if (score > existingScore) {
    mapScores.set(tourId, score);
  }
  mapReasons.set(tourId, mergedReasons);
}

const MATCH_SCORE = {
  MATTERPORT_LINK_EXACT: 210,
  THREAD_EXACT: 220,
  SUBJECT_MATCH: 120,
  OUTGOING_RECIPIENT_MATCH: 80,
  OUTGOING_RENEWAL_THREAD: 40,
  CUSTOMER_EMAIL_EXACT: 170,
  CUSTOMER_DOMAIN_MATCH: 95,
  CONTACT_NAME_MATCH: 115,
  INVOICE_NUMBER: 185,
  INVOICE_EXXAS_ID: 165,
  INVOICE_CONTRACT_REF: 175,
  INVOICE_CUSTOMER_REF: 150,
  TOUR_CONTRACT_EXACT: 185,
  TOUR_CONTRACT_NUMBER: 160,
  TOUR_CUSTOMER_NUMBER: 145,
  INVOICE_CUSTOMER_NAME_STRONG: 135,
  INVOICE_BILLING_CONTACT_STRONG: 120,
  TOUR_CUSTOMER_NAME_BASE: 55,
  TOUR_OBJECT_NAME_BASE: 60,
};

const MATCH_PRIORITY_RULES = [
  {
    id: 'thread',
    label: 'Gleicher Thread',
    rank: 700,
    matches: [
      /^gleiches Mail-Thread \/ conversationId$/,
      /^Betreff passt zu gesendeter Mail$/,
      /^gesendete Verlängerungsmail vorhanden$/,
    ],
  },
  {
    id: 'matterport',
    label: 'Gleiche Matterport-ID',
    rank: 600,
    matches: [
      /^Matterport-Link passt exakt$/,
    ],
  },
  {
    id: 'invoice',
    label: 'Rechnungsnummer',
    rank: 500,
    matches: [
      /^Rechnungsnummer passt/,
      /^Exxas-Rechnungs-ID passt/,
    ],
  },
  {
    id: 'contract',
    label: 'Vertrag / Abo',
    rank: 400,
    matches: [
      /^Exxas-Vertrag passt/,
      /^Exxas-Abo\/Vertrag passt exakt$/,
      /^Exxas-Vertragsnummer passt$/,
    ],
  },
  {
    id: 'customer_email',
    label: 'Kunden-/Kontakt-Mail',
    rank: 360,
    matches: [
      /^Kunden-E-Mail passt exakt$/,
      /^Kunden-Domain passt$/,
      /^Kontaktname passt$/,
    ],
  },
  {
    id: 'customer_number',
    label: 'Kundennummer',
    rank: 300,
    matches: [
      /^Exxas-Kunde passt/,
      /^Exxas-Kundennummer passt$/,
    ],
  },
  {
    id: 'billing_contact',
    label: 'Rechnungsadresse / Kontakt',
    rank: 220,
    matches: [
      /^Exxas-Rechnungsadresse\/Kontakt passt/,
      /^Exxas-Firma\/Kunde passt/,
    ],
  },
  {
    id: 'customer_name',
    label: 'Kundenname',
    rank: 140,
    matches: [
      /^Absender passt exakt$/,
      /^Absender passt zu einer gesendeten Mail$/,
      /^Exxas-Kundenname aehnlich$/,
    ],
  },
  {
    id: 'object',
    label: 'Kundenname / Objekt',
    rank: 100,
    matches: [
      /^Exxas-Objekt\/Bezeichnung aehnlich$/,
      /^Antwort kam kurz nach Erinnerungsmail$/,
    ],
  },
];

function getReasonPriority(reason) {
  for (const rule of MATCH_PRIORITY_RULES) {
    if (rule.matches.some((pattern) => pattern.test(reason))) {
      return rule;
    }
  }
  return { id: 'other', label: 'Sonstiger Treffer', rank: 0 };
}

function getCandidatePrioritySummary(reasons, score) {
  const primaryReason = (reasons || [])
    .map((reason) => ({ reason, priority: getReasonPriority(reason) }))
    .sort((a, b) => b.priority.rank - a.priority.rank)[0];

  return {
    id: primaryReason?.priority?.id || 'other',
    label: primaryReason?.priority?.label || 'Sonstiger Treffer',
    rank: primaryReason?.priority?.rank || 0,
    primaryReason: primaryReason?.reason || null,
    score,
  };
}

function compareEmailCandidates(left, right) {
  const leftPriority = left.matchPriority?.rank || 0;
  const rightPriority = right.matchPriority?.rank || 0;
  if (rightPriority !== leftPriority) return rightPriority - leftPriority;
  if (right.score !== left.score) return right.score - left.score;
  return (right.reasons?.length || 0) - (left.reasons?.length || 0);
}

function resolveEmailCandidateDecision(candidates) {
  const primaryCandidate = candidates[0] || null;
  const secondaryCandidate = candidates[1] || null;
  if (!primaryCandidate) {
    return {
      selectedCandidate: null,
      primaryCandidate: null,
      secondaryCandidate: null,
      ambiguous: false,
      reason: 'Kein passender Tour-Kandidat gefunden',
    };
  }

  const primaryRank = primaryCandidate.matchPriority?.rank || 0;
  const secondaryRank = secondaryCandidate?.matchPriority?.rank || 0;
  const scoreGap = secondaryCandidate ? (primaryCandidate.score - secondaryCandidate.score) : primaryCandidate.score;
  const hasHardIdentityAnchor = primaryCandidate.reasons?.some((reason) => (
    reason === 'Kunden-E-Mail passt exakt' || reason === 'Kontaktname passt'
  ));
  const hasSoftIdentityAnchor = primaryCandidate.reasons?.some((reason) => (
    reason === 'Kunden-Domain passt'
  ));
  const isStrongAnchor = primaryRank >= 400 || primaryCandidate.score >= 185 || hasHardIdentityAnchor;
  const weakHeuristicOnly = primaryRank <= 220;
  const nearTie = !!secondaryCandidate && scoreGap < 25 && Math.abs(primaryRank - secondaryRank) <= 120;
  const sameWeakBand = !!secondaryCandidate && weakHeuristicOnly && secondaryRank <= 220;

  if (weakHeuristicOnly && !hasHardIdentityAnchor && !hasSoftIdentityAnchor) {
    return {
      selectedCandidate: null,
      primaryCandidate,
      secondaryCandidate,
      ambiguous: true,
      reason: 'Nur heuristische Zuordnung über Name/Kontakt/Objekt ohne harten Mail-/Vertragsanker',
    };
  }

  if (nearTie || sameWeakBand) {
    return {
      selectedCandidate: isStrongAnchor && scoreGap >= 45 ? primaryCandidate : null,
      primaryCandidate,
      secondaryCandidate,
      ambiguous: !isStrongAnchor || scoreGap < 45,
      reason: secondaryCandidate
        ? `Mehrdeutig: Tour ${primaryCandidate.tour.id} und Tour ${secondaryCandidate.tour.id} liegen zu nah beieinander`
        : 'Mehrdeutiger Tour-Kandidat',
    };
  }

  return {
    selectedCandidate: primaryCandidate,
    primaryCandidate,
    secondaryCandidate,
    ambiguous: false,
    reason: primaryCandidate.matchPriority?.primaryReason || 'Eindeutiger Tour-Kandidat',
  };
}

function getInvoiceSuggestionAction(score, confidence) {
  if (score >= 120 || confidence >= 0.92) return 'link_invoice_to_tour';
  if (score >= 80) return 'review_invoice_match';
  return 'review_manual';
}

function classifyInvoiceStatus(invoice) {
  if (invoice.exxas_status === 'bz') return 'paid';
  const due = invoice.zahlungstermin ? new Date(invoice.zahlungstermin) : null;
  if (due && due < new Date()) return 'overdue';
  return 'sent';
}

function buildInvoiceReason(parts) {
  return parts.filter(Boolean).join(' · ');
}

function scoreInvoiceAgainstTour(invoice, tour) {
  let score = 0;
  const reasons = [];
  const contractId = getExxasContractId(tour);
  if (contractId && invoice.ref_vertrag && String(contractId) === String(invoice.ref_vertrag)) {
    score += 120;
    reasons.push('Vertrag passt exakt');
  }
  if (tour.kunde_ref && invoice.ref_kunde && String(tour.kunde_ref) === String(invoice.ref_kunde)) {
    score += 40;
    reasons.push('Kunde passt exakt');
  }
  const nameOverlap = tokenOverlapScore(invoice.kunde_name, tour.customer_name || tour.kunde_ref);
  if (nameOverlap > 0) {
    score += Math.min(25, nameOverlap * 8);
    reasons.push('Kundenname aehnlich');
  }
  const objectOverlap = tokenOverlapScore(invoice.bezeichnung, getTourObjectLabel(tour));
  if (objectOverlap > 0) {
    score += Math.min(30, objectOverlap * 10);
    reasons.push('Objekt/Bezeichnung aehnlich');
  }
  const invoiceText = normalizeText(invoice.bezeichnung);
  if (invoiceText.includes('hosting')) score += 6;
  if (invoiceText.includes('vr tour') || invoiceText.includes('matterport')) score += 8;
  if (tour.price != null && invoice.preis_brutto != null) {
    const delta = Math.abs(parseFloat(tour.price) - parseFloat(invoice.preis_brutto));
    if (delta <= 0.1) {
      score += 20;
      reasons.push('Preis passt exakt');
    } else if (delta <= 5) {
      score += 8;
      reasons.push('Preis passt ungefaehr');
    }
  }
  if (tour.last_email_sent_at && invoice.dok_datum) {
    const days = Math.abs(Math.round((new Date(invoice.dok_datum) - new Date(tour.last_email_sent_at)) / 86400000));
    if (days <= 21) {
      score += 18;
      reasons.push('zeitlich nahe an Erinnerungsmail');
    } else if (days <= 60) {
      score += 8;
    }
  }
  if (['ACTIVE', 'EXPIRING_SOON', 'AWAITING_CUSTOMER_DECISION', 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'].includes(tour.status)) {
    score += 6;
  }
  return { score, reasons };
}

function detectEmailIntentRules(email) {
  const text = normalizeText([
    email.subject,
    email.bodyText,
    email.body_text,
    email.bodyPreview,
    email.body_preview,
  ].filter(Boolean).join(' '));
  const ruleSets = [
    {
      intent: 'renew_no',
      action: 'mark_decline',
      confidence: 0.96,
      matches: [/nicht mehr verlaengern/, /nicht verlaengern/, /keine verlaengerung/, /bitte archivieren/, /nicht mehr benoetig/, /nicht mehr noetig/, /kann weg/],
      reason: 'Text spricht klar gegen eine Verlängerung',
    },
    {
      intent: 'transfer_requested',
      action: 'flag_transfer',
      confidence: 0.93,
      matches: [/uebertrag/, /uebernehmen/, /eigenes matterport/, /eigenen matterport/, /transfer/],
      reason: 'Text deutet auf einen Transfer an den Kunden hin',
    },
    {
      intent: 'renew_yes',
      action: 'mark_accept',
      confidence: 0.9,
      matches: [/bitte verlaengern/, /gerne verlaengern/, /weiterhin nutzen/, /weiter nutzen/, /behalten/, /ok verlaengern/],
      reason: 'Text spricht fuer eine gewünschte Verlängerung',
    },
    {
      intent: 'billing_question',
      action: 'review_billing',
      confidence: 0.78,
      matches: [/rechnung/, /bezahlt/, /ueberwiesen/, /kosten/, /preis/, /bitte nochmals senden/],
      reason: 'Text wirkt wie eine Rückfrage zu Rechnung oder Zahlung',
    },
  ];
  for (const rule of ruleSets) {
    if (rule.matches.some((pattern) => pattern.test(text))) {
      return {
        intent: rule.intent,
        action: rule.action,
        confidence: rule.confidence,
        reason: rule.reason,
        source: 'rule',
      };
    }
  }
  return {
    intent: 'unclear',
    action: 'review_manual',
    confidence: 0.35,
    reason: 'Keine eindeutige Absicht in der E-Mail erkannt',
    source: 'rule',
  };
}

function classifyIncomingEmailScope(email, bestCandidate) {
  const subject = normalizeText(email.subject);
  const body = normalizeText([
    email.bodyText,
    email.body_text,
    email.bodyPreview,
    email.body_preview,
  ].filter(Boolean).join(' '));
  const combined = `${subject} ${body}`.trim();
  const hasMatterportLink = /my\.matterport\.com\/show\/\?m=/i.test(String(email.bodyText || email.body_text || email.bodyPreview || email.body_preview || ''));
  const anchoredToRenewalThread = !!bestCandidate?.reasons?.some((reason) => (
    reason === 'gleiches Mail-Thread / conversationId'
      || reason === 'Betreff passt zu gesendeter Mail'
      || reason === 'gesendete Verlängerungsmail vorhanden'
      || reason === 'Matterport-Link passt exakt'
      || reason.startsWith('Rechnungsnummer passt')
      || reason.startsWith('Exxas-Rechnungs-ID passt')
      || reason.startsWith('Exxas-Vertrag passt')
      || reason.startsWith('Exxas-Kunde passt')
      || reason === 'Exxas-Abo/Vertrag passt exakt'
      || reason === 'Exxas-Vertragsnummer passt'
      || reason === 'Exxas-Kundennummer passt'
  ));
  const exactSenderMatch = !!bestCandidate?.reasons?.some((reason) => (
    reason === 'Absender passt exakt' || reason === 'Kunden-E-Mail passt exakt'
  ));
  const fromEmail = String(extractFirstEmail(email.fromEmail || email.from_email) || '').trim().toLowerCase();
  const renewalSignals = [
    /matterport/,
    /virtuell(?:er|e)? rundgang/,
    /rundgang/,
    /tour hosting/,
    /hosting/,
    /verlaenger/,
    /archivier/,
    /transfer/,
    /my matterport/,
    /show m/,
    /\babo\b/,
  ];
  const intentSignals = [
    /rechnung/,
    /bezahlt/,
    /ueberwiesen/,
    /zahlung/,
    /kosten/,
    /preis/,
    /nicht verlaengern/,
    /bitte verlaengern/,
  ];
  const negativeSignals = [
    /ricardo/,
    /preisvorschlag/,
    /dji mavic/,
    /bestellung/,
    /lieferung/,
    /sendungsverfolg/,
    /kauf bestaetigung/,
    /zahlungserinnerung/,
    /shooting digitale/,
    /kojenbeschrieb/,
    /offerte/,
    /angebot erhalten/,
    // Neue Auftraege / Terminabsprachen ohne Verlängerungsbezug
    /neuer fotoauftrag/,
    /neuer auftrag/,
    /neues shooting/,
    /foto ?auftrag/,
    /filmauftrag/,
    /\bauftrag\b/,
    /\bbuchung\b/,
    /shooting.*auftrag/,
    /auftrag.*shooting/,
    /terminabstimmung/,
    /terminvorschlag/,
    /wetter.*termin/,
    /termin.*wetter/,
    /gerne sende ich.*auftrag/,
    /objektadresse.*aufnahmen/,
    /abschluss ihres projekts/,
    /bereitstellung der bearbeiteten materialien/,
    /bildauswahl/,
    /bildanpass/,
    /bildbearbeitung/,
    /retusch/,
    /grundrisse?/,
    /beschriftung/,
    /bereitstellung/,
    /materialien/,
    /supportproblem/,
    /matterport support/,
    /zugriff auf anwendungen/,
    /teams einladung/,
    /baustelle/,
    /gebaeudeisometrie/,
    /teaser bild/,
    /qr ?code/,
    /objektlink/,
    /objectlink/,
    /link zum objekt/,
    /link zum inserat/,
    /link anbei/,
  ];
  const negativeSenderSignals = [
    /@ricardo\.ch$/,
    /@paypal\./,
    /@digitec\./,
    /@galaxus\./,
    /@sanitastroesch\.ch$/,
    /^support@matterport\.com$/,
  ];

  if (negativeSignals.some((pattern) => pattern.test(combined)) || negativeSenderSignals.some((pattern) => pattern.test(fromEmail))) {
    return { relevant: false, reason: 'Mail passt zu Fremdhandel, allgemeiner Rechnung oder sonstigem Nicht-Tour-Thema' };
  }

  if (anchoredToRenewalThread) {
    return { relevant: true, reason: 'Mail gehört zu einer bekannten Verlängerungs-Konversation' };
  }
  if (hasMatterportLink || renewalSignals.some((pattern) => pattern.test(combined))) {
    return { relevant: true, reason: 'Mail enthält Matterport-/Tour-/Verlängerungsbezug' };
  }
  if (exactSenderMatch && intentSignals.some((pattern) => pattern.test(combined))) {
    return { relevant: true, reason: 'Passender Absender mit inhaltlichem Hinweis auf Zahlung/Verlängerung' };
  }
  return { relevant: false, reason: 'Kein ausreichender Bezug zu Matterport, Tour oder Verlängerung' };
}

function scoreEmailAgainstTour(email, tour) {
  let score = 0;
  const reasons = [];
  const fromEmail = extractFirstEmail(email.fromEmail || email.from_email);
  const fromDomain = extractEmailDomain(fromEmail);
  const tourEmail = extractFirstEmail(tour.customer_email);
  const tourDomain = extractEmailDomain(tourEmail);
  if (fromEmail && tourEmail && fromEmail === tourEmail) {
    score += MATCH_SCORE.CUSTOMER_EMAIL_EXACT;
    reasons.push('Kunden-E-Mail passt exakt');
  } else if (fromDomain && tourDomain && fromDomain === tourDomain && isSpecificCustomerDomain(fromDomain)) {
    score += MATCH_SCORE.CUSTOMER_DOMAIN_MATCH;
    reasons.push('Kunden-Domain passt');
  }
  const receivedAt = email.receivedAt || email.received_at;
  if (tour.last_email_sent_at && receivedAt) {
    const days = Math.round((new Date(receivedAt) - new Date(tour.last_email_sent_at)) / 86400000);
    if (days >= 0 && days <= 30) {
      score += 20;
      reasons.push('Antwort kam kurz nach Erinnerungsmail');
    }
  }
  if (['AWAITING_CUSTOMER_DECISION', 'EXPIRING_SOON', 'ACTIVE'].includes(tour.status)) {
    score += 5;
  }
  return { score, reasons };
}

async function findOutgoingAnchorCandidates(email) {
  const outgoingMatches = await pool.query(
    `SELECT *
     FROM tour_manager.outgoing_emails
     WHERE LOWER(recipient_email) = LOWER($1)
       AND sent_at > NOW() - INTERVAL '12 months'
     ORDER BY sent_at DESC`,
    [email.from_email || '']
  );
  const directTourScores = new Map();
  const directTourReasons = new Map();
  const emailConversationId = email.conversation_id || null;
  const emailSubject = normalizeSubject(email.subject);

  for (const row of outgoingMatches.rows) {
    if (!row.tour_id) continue;

    let score = 80;
    const reasons = ['Absender passt zu einer gesendeten Mail'];

    if (row.template_key === 'renewal_request') {
      score += MATCH_SCORE.OUTGOING_RENEWAL_THREAD;
      reasons.push('gesendete Verlängerungsmail vorhanden');
    }
    if (emailConversationId && row.conversation_id && emailConversationId === row.conversation_id) {
      score += MATCH_SCORE.THREAD_EXACT;
      reasons.push('gleiches Mail-Thread / conversationId');
    }
    if (emailSubject && row.subject && emailSubject === normalizeSubject(row.subject)) {
      score += MATCH_SCORE.SUBJECT_MATCH;
      reasons.push('Betreff passt zu gesendeter Mail');
    }

    const existingScore = directTourScores.get(row.tour_id) || 0;
    if (score > existingScore) {
      directTourScores.set(row.tour_id, score);
      directTourReasons.set(row.tour_id, reasons);
    }
  }

  return { directTourScores, directTourReasons };
}

async function findDirectContentCandidates(email) {
  const directTourScores = new Map();
  const directTourReasons = new Map();
  const fromEmail = extractFirstEmail(email.from_email || email.fromEmail);
  const fromDomain = extractEmailDomain(fromEmail);
  const senderNameText = String(email.from_name || '').trim();
  const rawText = [
    email.subject,
    email.bodyText,
    email.body_text,
    email.bodyPreview,
    email.body_preview,
  ].filter(Boolean).join(' ');
  const senderIdentityText = [
    senderNameText,
    fromEmail,
  ].filter(Boolean).join(' ');

  const matterportId = extractMatterportIdFromText(rawText);
  if (matterportId) {
    const linkMatches = await pool.query(
      `SELECT id
       FROM tour_manager.tours
       WHERE matterport_space_id = $1
          OR tour_url ILIKE $2
       ORDER BY updated_at DESC NULLS LAST`,
      [matterportId, `%${matterportId}%`]
    );
    for (const row of linkMatches.rows) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.id,
        MATCH_SCORE.MATTERPORT_LINK_EXACT,
        ['Matterport-Link passt exakt']
      );
    }
  }

  const invoiceMatches = await pool.query(
    `SELECT tour_id, nummer, exxas_document_id, ref_vertrag, ref_kunde, kunde_name, kunde_kontakt, 'exxas' AS source
     FROM tour_manager.exxas_invoices
     WHERE tour_id IS NOT NULL
     UNION ALL
     SELECT tour_id, invoice_number AS nummer, exxas_invoice_id AS exxas_document_id, NULL AS ref_vertrag, NULL AS ref_kunde, NULL AS kunde_name, NULL AS kunde_kontakt, 'renewal' AS source
     FROM tour_manager.renewal_invoices
     WHERE tour_id IS NOT NULL`
  ).catch(() => ({ rows: [] }));

  for (const row of invoiceMatches.rows) {
    if (referenceAppearsInText(rawText, row.nummer)) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.tour_id,
        MATCH_SCORE.INVOICE_NUMBER,
        [`Rechnungsnummer passt (${row.source})`]
      );
    } else if (referenceAppearsInText(rawText, row.exxas_document_id)) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.tour_id,
        MATCH_SCORE.INVOICE_EXXAS_ID,
        [`Exxas-Rechnungs-ID passt (${row.source})`]
      );
    }
    if (referenceAppearsInText(rawText, row.ref_vertrag)) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.tour_id,
        MATCH_SCORE.INVOICE_CONTRACT_REF,
        [`Exxas-Vertrag passt ueber Rechnung (${row.source})`]
      );
    }
    if (referenceAppearsInText(rawText, row.ref_kunde)) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.tour_id,
        MATCH_SCORE.INVOICE_CUSTOMER_REF,
        [`Exxas-Kunde passt ueber Rechnung (${row.source})`]
      );
    }
    const invoiceCustomerOverlap = tokenOverlapScore(senderIdentityText, row.kunde_name);
    if (invoiceCustomerOverlap >= 2) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.tour_id,
        MATCH_SCORE.INVOICE_CUSTOMER_NAME_STRONG + Math.min(15, invoiceCustomerOverlap * 4),
        [`Exxas-Firma/Kunde passt ueber Rechnung (${row.source})`]
      );
    }
    const invoiceContactOverlap = tokenOverlapScore(senderNameText, row.kunde_kontakt);
    if ((senderNameText && invoiceContactOverlap >= 1) || referenceAppearsInText(senderIdentityText, row.kunde_kontakt, 5)) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.tour_id,
        MATCH_SCORE.INVOICE_BILLING_CONTACT_STRONG + Math.min(10, invoiceContactOverlap * 3),
        [`Exxas-Rechnungsadresse/Kontakt passt (${row.source})`]
      );
    }
  }

  const tourMatches = await pool.query(
    `SELECT id, exxas_abo_id, exxas_subscription_id, nummer, kunde_ref, customer_name, customer_email, customer_contact, object_label, bezeichnung
     FROM tour_manager.tours
     WHERE status != 'ARCHIVED'
     ORDER BY updated_at DESC NULLS LAST`
  ).catch(() => ({ rows: [] }));

  for (const row of tourMatches.rows) {
    if (referenceAppearsInText(rawText, row.exxas_abo_id) || referenceAppearsInText(rawText, row.exxas_subscription_id)) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.id,
        MATCH_SCORE.TOUR_CONTRACT_EXACT,
        ['Exxas-Abo/Vertrag passt exakt']
      );
    }
    if (referenceAppearsInText(rawText, row.nummer)) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.id,
        MATCH_SCORE.TOUR_CONTRACT_NUMBER,
        ['Exxas-Vertragsnummer passt']
      );
    }
    if (referenceAppearsInText(rawText, row.kunde_ref)) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.id,
        MATCH_SCORE.TOUR_CUSTOMER_NUMBER,
        ['Exxas-Kundennummer passt']
      );
    }

    const tourCustomerEmail = extractFirstEmail(row.customer_email);
    const tourCustomerDomain = extractEmailDomain(tourCustomerEmail);
    if (fromEmail && tourCustomerEmail && fromEmail === tourCustomerEmail) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.id,
        MATCH_SCORE.CUSTOMER_EMAIL_EXACT,
        ['Kunden-E-Mail passt exakt']
      );
    } else if (fromDomain && tourCustomerDomain && fromDomain === tourCustomerDomain && isSpecificCustomerDomain(fromDomain)) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.id,
        MATCH_SCORE.CUSTOMER_DOMAIN_MATCH,
        ['Kunden-Domain passt']
      );
    }

    const contactOverlap = tokenOverlapScore(senderNameText, row.customer_contact);
    if ((senderNameText && contactOverlap >= 1) || referenceAppearsInText(senderIdentityText, row.customer_contact, 5)) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.id,
        MATCH_SCORE.CONTACT_NAME_MATCH + Math.min(10, contactOverlap * 4),
        ['Kontaktname passt']
      );
    }

    const customerOverlap = tokenOverlapScore(senderIdentityText, row.customer_name || row.kunde_ref);
    if (customerOverlap >= 2) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.id,
        MATCH_SCORE.TOUR_CUSTOMER_NAME_BASE + Math.min(20, customerOverlap * 5),
        ['Exxas-Kundenname aehnlich']
      );
    }

    const objectOverlap = tokenOverlapScore(rawText, row.object_label || row.bezeichnung);
    if (objectOverlap >= 2) {
      rememberCandidate(
        directTourScores,
        directTourReasons,
        row.id,
        MATCH_SCORE.TOUR_OBJECT_NAME_BASE + Math.min(25, objectOverlap * 6),
        ['Exxas-Objekt/Bezeichnung aehnlich']
      );
    }
  }

  return { directTourScores, directTourReasons };
}

async function upsertSuggestion(payload) {
  await pool.query(
    `INSERT INTO tour_manager.ai_suggestions (
      suggestion_type, source_key, source_invoice_id, source_email_id, tour_id,
      suggested_action, confidence, reason, model_name, status, details_json,
      prompt_version, pipeline_version, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10::jsonb,$11,$12,NOW())
    ON CONFLICT (source_key) DO UPDATE SET
      source_invoice_id = EXCLUDED.source_invoice_id,
      source_email_id = EXCLUDED.source_email_id,
      tour_id = EXCLUDED.tour_id,
      suggested_action = EXCLUDED.suggested_action,
      confidence = EXCLUDED.confidence,
      reason = EXCLUDED.reason,
      model_name = EXCLUDED.model_name,
      details_json = EXCLUDED.details_json,
      prompt_version = EXCLUDED.prompt_version,
      pipeline_version = EXCLUDED.pipeline_version,
      status = CASE
        WHEN tour_manager.ai_suggestions.status IN ('approved','applied') THEN tour_manager.ai_suggestions.status
        ELSE 'open'
      END,
      updated_at = NOW()`,
    [
      payload.suggestionType,
      payload.sourceKey,
      payload.sourceInvoiceId || null,
      payload.sourceEmailId || null,
      payload.tourId || null,
      payload.suggestedAction,
      payload.confidence || 0,
      payload.reason || null,
      payload.modelName || null,
      JSON.stringify(payload.details || {}),
      payload.promptVersion || MAIL_PROMPT_VERSION,
      payload.pipelineVersion || MAIL_PIPELINE_VERSION,
    ]
  );
}

async function getInvoiceLinkSuggestionsForTour(tourInput, options = {}) {
  await ensureSchema();
  const tour = normalizeTourRow(tourInput);
  if (!tour?.id) return [];

  const scanLimit = Math.max(10, Math.min(parseInt(options.scanLimit || '250', 10), 500));
  const limit = Math.max(1, Math.min(parseInt(options.limit || '5', 10), 20));
  const invoicesResult = await pool.query(
    `SELECT *
     FROM tour_manager.exxas_invoices
     WHERE tour_id IS NULL
     ORDER BY zahlungstermin DESC NULLS LAST, dok_datum DESC NULLS LAST
     LIMIT $1`,
    [scanLimit]
  );

  return invoicesResult.rows
    .map((invoice) => {
      const scored = scoreInvoiceAgainstTour(invoice, tour);
      return {
        invoice,
        score: scored.score,
        reasons: scored.reasons,
      };
    })
    .filter((entry) => entry.score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      ...entry.invoice,
      suggestion_score: entry.score,
      suggestion_reasons: entry.reasons,
      suggestion_confidence: Math.max(0.4, Math.min(0.99, entry.score / 160)),
      suggestion_action: getInvoiceSuggestionAction(entry.score, Math.max(0.4, Math.min(0.99, entry.score / 160))),
    }));
}

function scoreCustomerAgainstTour(customer, contacts, tourInput) {
  const tour = normalizeTourRow(tourInput);
  let score = 0;
  const reasons = [];
  const customerNumber = String(customer?.nummer || customer?.id || '').trim();
  const customerName = customer?.firmenname || '';
  const customerEmail = String(customer?.email || '').trim().toLowerCase();
  const tourCustomerNumber = String(tour?.kunde_ref || '').trim();
  const tourCustomerName = tour?.customer_name || tour?.kunde_ref || '';
  const tourCustomerEmail = String(tour?.customer_email || '').trim().toLowerCase();
  const tourContact = String(tour?.customer_contact || '').trim();
  const contactEmails = (contacts || []).map((contact) => String(contact?.email || '').trim().toLowerCase()).filter(Boolean);
  const contactNames = (contacts || []).map((contact) => String(contact?.name || '').trim()).filter(Boolean);

  if (tourCustomerNumber && customerNumber && tourCustomerNumber === customerNumber) {
    score += 130;
    reasons.push('Exxas-Kundennummer passt exakt');
  }
  if (tourCustomerEmail && customerEmail && tourCustomerEmail === customerEmail) {
    score += 110;
    reasons.push('Kunden-E-Mail passt exakt');
  } else if (tourCustomerEmail && contactEmails.includes(tourCustomerEmail)) {
    score += 105;
    reasons.push('Kontakt-E-Mail passt exakt');
  }
  const customerNameOverlap = tokenOverlapScore(tourCustomerName, customerName);
  if (customerNameOverlap > 0) {
    score += Math.min(55, customerNameOverlap * 12);
    reasons.push('Kundenname ähnlich');
  }
  const contactNameOverlap = Math.max(0, ...contactNames.map((name) => tokenOverlapScore(tourContact, name)));
  if (tourContact && contactNameOverlap > 0) {
    score += Math.min(30, contactNameOverlap * 10);
    reasons.push('Kontaktname ähnlich');
  } else if (tourContact && contactNames.some((name) => normalizeText(name) === normalizeText(tourContact))) {
    score += 35;
    reasons.push('Kontaktname passt exakt');
  }
  if (tourCustomerEmail && customerEmail && tourCustomerEmail.split('@')[1] && tourCustomerEmail.split('@')[1] === customerEmail.split('@')[1]) {
    score += 10;
    reasons.push('E-Mail-Domain passt');
  }
  return { score, reasons };
}

async function getCustomerLinkSuggestionsForTour(tourInput, options = {}) {
  const tour = normalizeTourRow(tourInput);
  if (!tour?.id) return [];

  const limit = Math.max(1, Math.min(parseInt(options.limit || '5', 10), 20));
  const scanLimit = Math.max(5, Math.min(parseInt(options.scanLimit || '10', 10), 20));
  const rawTerms = [
    tour.customer_name,
    tour.kunde_ref,
    tour.customer_contact,
    (tour.customer_email || '').split('@')[0],
  ].map((value) => String(value || '').trim()).filter((value) => value.length >= 2);
  const searchTerms = [...new Set(rawTerms)].slice(0, 4);
  if (!searchTerms.length) return [];

  const candidateMap = new Map();
  for (const term of searchTerms) {
    // eslint-disable-next-line no-await-in-loop
    const result = await exxas.searchCustomers(term).catch(() => ({ customers: [] }));
    for (const customer of (result.customers || []).slice(0, 10)) {
      const key = String(customer.id || customer.nummer || '').trim();
      if (!key) continue;
      if (!candidateMap.has(key)) {
        candidateMap.set(key, customer);
      }
    }
  }

  const preRanked = [...candidateMap.values()]
    .map((customer) => ({
      customer,
      roughScore: scoreCustomerAgainstTour(customer, [], tour).score,
    }))
    .sort((a, b) => b.roughScore - a.roughScore)
    .slice(0, scanLimit);

  const suggestions = [];
  for (const entry of preRanked) {
    // eslint-disable-next-line no-await-in-loop
    const contactsResult = await exxas.getContactsForCustomer(entry.customer.id).catch(() => ({ contacts: [] }));
    const contacts = contactsResult.contacts || [];
    const scored = scoreCustomerAgainstTour(entry.customer, contacts, tour);
    if (scored.score < 25) continue;
    const bestContact = contacts.find((contact) => contact.email) || contacts[0] || null;
    suggestions.push({
      ...entry.customer,
      contacts,
      suggestion_score: scored.score,
      suggestion_reasons: scored.reasons,
      suggestion_confidence: Math.max(0.35, Math.min(0.99, scored.score / 150)),
      best_email: bestContact?.email || entry.customer.email || '',
      best_contact_name: bestContact?.name || '',
    });
  }

  return suggestions
    .sort((a, b) => b.suggestion_score - a.suggestion_score)
    .slice(0, limit);
}

async function syncInvoiceSuggestions(options = {}) {
  await ensureSchema();
  await pool.query(`
    UPDATE tour_manager.ai_suggestions s
    SET status = 'applied', updated_at = NOW()
    FROM tour_manager.exxas_invoices e
    WHERE s.suggestion_type = 'invoice_match'
      AND s.status = 'open'
      AND s.source_invoice_id = e.id
      AND e.tour_id IS NOT NULL
  `);
  const limit = Math.max(1, Math.min(parseInt(options.limit || '200', 10), 500));
  const invoicesResult = await pool.query(
    `SELECT e.*
     FROM tour_manager.exxas_invoices e
     WHERE e.tour_id IS NULL
     ORDER BY e.dok_datum DESC NULLS LAST, e.synced_at DESC
     LIMIT $1`,
    [limit]
  );
  const toursResult = await pool.query(`
    SELECT *
    FROM tour_manager.tours
    WHERE status != 'ARCHIVED'
    ORDER BY updated_at DESC NULLS LAST, id DESC
  `);
  const tours = toursResult.rows.map(normalizeTourRow);
  let created = 0;
  for (const invoice of invoicesResult.rows) {
    const ranked = tours
      .map((tour) => ({ tour, ...scoreInvoiceAgainstTour(invoice, tour) }))
      .filter((entry) => entry.score >= 55)
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) continue;
    const best = ranked[0];
    const runnerUp = ranked[1];
    const confidence = Math.max(0.4, Math.min(0.99, best.score / 160));
    const action = getInvoiceSuggestionAction(best.score, confidence);
    const diff = best.score - (runnerUp?.score || 0);
    await upsertSuggestion({
      suggestionType: 'invoice_match',
      sourceKey: `invoice:${invoice.id}`,
      sourceInvoiceId: invoice.id,
      tourId: best.tour.id,
      suggestedAction: action,
      confidence,
      reason: buildInvoiceReason([...best.reasons, diff >= 20 ? 'deutlich besser als weitere Treffer' : null]),
      modelName: 'rules-v1',
      details: {
        invoice: {
          id: invoice.id,
          nummer: invoice.nummer,
          kunde_name: invoice.kunde_name,
          bezeichnung: invoice.bezeichnung,
          preis_brutto: invoice.preis_brutto,
          ref_vertrag: invoice.ref_vertrag,
          ref_kunde: invoice.ref_kunde,
        },
        candidateTour: {
          id: best.tour.id,
          customer_name: best.tour.customer_name || best.tour.kunde_ref,
          object_label: getTourObjectLabel(best.tour),
          contract_id: getExxasContractId(best.tour),
          status: best.tour.status,
        },
        score: best.score,
        runnerUpScore: runnerUp?.score || null,
      },
    });
    created++;
  }
  return { processed: invoicesResult.rows.length, suggestions: created };
}

async function storeIncomingEmail(email, mailboxUpn) {
  const result = await pool.query(
    `INSERT INTO tour_manager.incoming_emails (
      mailbox_upn, graph_message_id, internet_message_id, conversation_id, subject,
      from_email, from_name, received_at, sent_at, body_preview, body_text, is_read, raw_json, synced_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11,$12,$13::jsonb,NOW(),NOW())
    ON CONFLICT (graph_message_id) DO UPDATE SET
      internet_message_id = EXCLUDED.internet_message_id,
      conversation_id = EXCLUDED.conversation_id,
      subject = EXCLUDED.subject,
      from_email = EXCLUDED.from_email,
      from_name = EXCLUDED.from_name,
      received_at = EXCLUDED.received_at,
      sent_at = EXCLUDED.sent_at,
      body_preview = EXCLUDED.body_preview,
      body_text = EXCLUDED.body_text,
      is_read = EXCLUDED.is_read,
      raw_json = EXCLUDED.raw_json,
      synced_at = NOW(),
      updated_at = NOW()
    RETURNING *`,
    [
      mailboxUpn,
      email.graphMessageId,
      email.internetMessageId,
      email.conversationId,
      email.subject,
      email.fromEmail,
      email.fromName,
      email.receivedAt,
      email.sentAt,
      email.bodyPreview,
      email.bodyText,
      email.isRead,
      JSON.stringify(email.raw || {}),
    ]
  );
  return result.rows[0];
}

async function syncSentMailboxAnchors(options = {}) {
  await ensureSchema();
  const config = getGraphConfig();
  const sharedTop = Math.max(1, Math.min(parseInt(options.top || config.sentTop || '200', 10), 1000));
  const top = Math.max(1, Math.min(parseInt(options.topSent || options.sentTop || sharedTop, 10), 1000));
  const lookbackMonths = Math.max(1, parseInt(options.lookbackMonths || config.lookbackMonths || '6', 10) || 6);
  const since = new Date();
  since.setMonth(since.getMonth() - lookbackMonths);
  const sinceDate = since.toISOString();
  const mailboxes = options.mailboxUpn
    ? [String(options.mailboxUpn).trim().toLowerCase()]
    : config.mailboxUpns;
  let synced = 0;

  for (const mailboxUpn of mailboxes) {
    const { messages, error } = await fetchMailboxMessages({
      mailboxUpn,
      folder: 'sentitems',
      top,
      sinceDate,
    });
    if (error) continue;

    for (const message of messages) {
      const bodyText = message.bodyText || message.bodyPreview || '';
      const matterportId = extractMatterportIdFromText(bodyText);
      const recipientEmail = message.toRecipients?.[0]?.address || extractFirstEmail(bodyText);
      if (!matterportId && !recipientEmail) continue;

      const tourResult = await pool.query(
        `SELECT *
         FROM tour_manager.tours t
         WHERE (
           ($1 != '' AND matterport_space_id = $1)
           OR ($1 != '' AND tour_url ILIKE $2)
           OR ($3 != '' AND (
             LOWER(COALESCE(t.customer_email, '')) = LOWER($3)
             OR EXISTS (
               SELECT 1 FROM core.customers c
               WHERE core.customer_email_matches($3, c.email, c.email_aliases)
                 AND core.customer_email_matches(t.customer_email, c.email, c.email_aliases)
             )
           ))
         )
         ORDER BY
           CASE WHEN ($1 != '' AND matterport_space_id = $1) THEN 0 ELSE 1 END,
           updated_at DESC NULLS LAST
         LIMIT 1`,
        [
          matterportId || '',
          matterportId ? `%${matterportId}%` : '',
          recipientEmail || '',
        ]
      );
      const tour = tourResult.rows[0];
      if (!tour?.id || !recipientEmail) continue;

      await pool.query(
        `INSERT INTO tour_manager.outgoing_emails (
          tour_id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
          recipient_email, subject, template_key, sent_at, details_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'sent_mail_anchor',$8::timestamptz,$9::jsonb)
        ON CONFLICT (graph_message_id) DO UPDATE SET
          tour_id = EXCLUDED.tour_id,
          mailbox_upn = EXCLUDED.mailbox_upn,
          internet_message_id = EXCLUDED.internet_message_id,
          conversation_id = EXCLUDED.conversation_id,
          recipient_email = EXCLUDED.recipient_email,
          subject = EXCLUDED.subject,
          sent_at = EXCLUDED.sent_at,
          details_json = EXCLUDED.details_json`,
        [
          tour.id,
          mailboxUpn,
          message.graphMessageId,
          message.internetMessageId,
          message.conversationId,
          recipientEmail,
          message.subject || '(ohne Betreff)',
          message.sentAt || message.receivedAt || new Date().toISOString(),
          JSON.stringify({
            source: 'sentitems',
            matterportId: matterportId || null,
            recipientEmail,
            preview: message.bodyPreview || null,
          }),
        ]
      );
      synced++;
    }
  }

  return { synced };
}

async function findEmailCandidates(email) {
  const [
    outgoingCandidates,
    contentCandidates,
  ] = await Promise.all([
    findOutgoingAnchorCandidates(email),
    findDirectContentCandidates(email),
  ]);
  const directTourScores = new Map();
  const directTourReasons = new Map();

  for (const [tourId, score] of outgoingCandidates.directTourScores.entries()) {
    rememberCandidate(directTourScores, directTourReasons, tourId, score, outgoingCandidates.directTourReasons.get(tourId) || []);
  }
  for (const [tourId, score] of contentCandidates.directTourScores.entries()) {
    rememberCandidate(directTourScores, directTourReasons, tourId, score, contentCandidates.directTourReasons.get(tourId) || []);
  }

  const anchoredTourIds = [...directTourScores.keys()];
  const results = await pool.query(
    `SELECT *
     FROM tour_manager.tours t
     WHERE (
       id = ANY($2::int[])
       OR LOWER(COALESCE(t.customer_email, '')) = LOWER($1)
       OR EXISTS (
         SELECT 1 FROM core.customers c
         WHERE core.customer_email_matches($1, c.email, c.email_aliases)
           AND core.customer_email_matches(t.customer_email, c.email, c.email_aliases)
       )
     )
     ORDER BY last_email_sent_at DESC NULLS LAST, updated_at DESC NULLS LAST
     LIMIT 120`,
    [email.from_email || '', anchoredTourIds]
  );
  const ranked = results.rows
    .map((tour) => {
      const base = scoreEmailAgainstTour(email, tour);
      const directScore = directTourScores.get(tour.id) || 0;
      const reasons = [...(directTourReasons.get(tour.id) || []), ...base.reasons];
      const totalScore = base.score + directScore;
      return {
        tour: normalizeTourRow(tour),
        score: totalScore,
        reasons,
        matchPriority: getCandidatePrioritySummary(reasons, totalScore),
      };
    })
    .filter((entry) => entry.score >= 90)
    .sort(compareEmailCandidates);
  return ranked;
}

async function getSimilarReviewedSuggestions(email, candidates = [], limit = 3) {
  const fromEmail = String(email?.from_email || '').trim().toLowerCase();
  const domain = fromEmail.includes('@') ? fromEmail.split('@')[1] : null;
  const tourIds = candidates.slice(0, 3).map((entry) => entry.tour?.id).filter(Boolean);
  if (!fromEmail && !domain && !tourIds.length) return [];

  const result = await pool.query(
    `SELECT s.id, s.status, s.gold_intent, s.gold_action, s.review_reason, s.reason,
            s.tour_id, s.reviewed_at, s.review_source,
            m.subject, m.from_email,
            COALESCE(t.object_label, t.bezeichnung) AS object_label,
            COALESCE(t.customer_name, t.kunde_ref) AS customer_name
     FROM tour_manager.ai_suggestions s
     LEFT JOIN tour_manager.incoming_emails m ON m.id = s.source_email_id
     LEFT JOIN tour_manager.tours t ON t.id = COALESCE(s.gold_tour_id, s.tour_id)
     WHERE s.suggestion_type = 'email_intent'
       AND s.status IN ('approved', 'applied', 'rejected')
       AND (
         ($1::text <> '' AND LOWER(COALESCE(m.from_email, '')) = $1)
         OR ($2::text IS NOT NULL AND LOWER(COALESCE(split_part(m.from_email, '@', 2), '')) = $2)
         OR (array_length($3::int[], 1) IS NOT NULL AND COALESCE(s.gold_tour_id, s.tour_id) = ANY($3::int[]))
       )
     ORDER BY s.reviewed_at DESC NULLS LAST, s.updated_at DESC
     LIMIT $4`,
    [fromEmail, domain, tourIds, Math.max(1, Math.min(limit, 5))]
  ).catch(() => ({ rows: [] }));

  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    subject: row.subject,
    from_email: row.from_email,
    final_intent: row.gold_intent || null,
    final_action: row.gold_action || null,
    review_reason: row.review_reason || row.reason || null,
    review_source: row.review_source || null,
    tour_id: row.tour_id,
    object_label: row.object_label,
    customer_name: row.customer_name,
    reviewed_at: row.reviewed_at,
  }));
}

async function syncMailboxSuggestions(options = {}) {
  await ensureSchema();
  const config = getGraphConfig();
  const sharedTop = Math.max(1, Math.min(parseInt(options.top || '200', 10), 1000));
  const topInbox = Math.max(1, Math.min(parseInt(options.topInbox || options.inboxTop || config.inboxTop || sharedTop, 10), 1000));
  const topSent = Math.max(1, Math.min(parseInt(options.topSent || options.sentTop || config.sentTop || sharedTop, 10), 1000));
  const lookbackMonths = Math.max(1, parseInt(options.lookbackMonths || config.lookbackMonths || '6', 10) || 6);
  const since = new Date();
  since.setMonth(since.getMonth() - lookbackMonths);
  const sinceDate = since.toISOString();
  const mailboxes = options.mailboxUpn
    ? [String(options.mailboxUpn).trim().toLowerCase()]
    : config.mailboxUpns;
  let processed = 0;
  let suggestions = 0;
  const mailboxErrors = [];

  for (const mailboxUpn of mailboxes) {
    await syncSentMailboxAnchors({ mailboxUpn, topSent, lookbackMonths });
    const { messages, error } = await fetchMailboxMessages({
      mailboxUpn,
      folder: 'inbox',
      top: topInbox,
      sinceDate,
    });
    if (error) {
      mailboxErrors.push(`${mailboxUpn}: ${error}`);
      continue;
    }
    processed += messages.length;
    for (const message of messages) {
      const stored = await storeIncomingEmail(message, mailboxUpn);
      const candidates = await findEmailCandidates(stored);
      const candidateDecision = resolveEmailCandidateDecision(candidates);
      const best = candidateDecision.primaryCandidate;
      const selectedCandidate = candidateDecision.selectedCandidate;
      const scopeCheck = classifyIncomingEmailScope(stored, best);
      if (!scopeCheck.relevant) {
        await pool.query(
          `UPDATE tour_manager.incoming_emails
           SET matched_tour_id = NULL,
               processing_status = 'ignored',
               updated_at = NOW()
           WHERE id = $1`,
          [stored.id]
        );
        await pool.query(
          `UPDATE tour_manager.ai_suggestions
           SET status = CASE WHEN status = 'open' THEN 'rejected' ELSE status END,
               reviewed_by = CASE WHEN status = 'open' THEN 'system' ELSE reviewed_by END,
               reviewed_note = CASE WHEN status = 'open' THEN $2 ELSE reviewed_note END,
               reviewed_at = CASE WHEN status = 'open' THEN NOW() ELSE reviewed_at END,
               updated_at = NOW()
           WHERE suggestion_type = 'email_intent'
             AND source_email_id = $1`,
          [stored.id, `Automatisch ausgeblendet: ${scopeCheck.reason}`]
        );
        continue;
      }
      const ruleResult = detectEmailIntentRules(stored);
      let finalResult = ruleResult;
      let modelName = 'rules-v2';
      const aiConfig = getAiConfig();
      const matchedTourId = selectedCandidate?.tour?.id || null;
      const reviewExamples = await getSimilarReviewedSuggestions(stored, candidates, 3);
      const canUseAi = !!aiConfig.apiKey && candidates.length > 0 && !!matchedTourId && !candidateDecision.ambiguous;

      const aiPayload = canUseAi ? {
        mailbox: mailboxUpn,
        prompt_version: MAIL_PROMPT_VERSION,
        pipeline_version: MAIL_PIPELINE_VERSION,
        email: {
          subject: stored.subject,
          from_email: stored.from_email,
          received_at: stored.received_at,
          body_text: stored.body_text || stored.body_preview,
        },
        rule_hint: ruleResult,
        candidates: candidates.slice(0, 3).map((entry) => ({
          tour_id: entry.tour.id,
          customer_name: entry.tour.customer_name || entry.tour.kunde_ref,
          object_label: getTourObjectLabel(entry.tour),
          status: entry.tour.status,
          score: entry.score,
          reasons: entry.reasons,
          match_priority: entry.matchPriority,
        })),
        review_examples: reviewExamples,
      } : null;

      if (canUseAi) {
        const { result: prefilterResult } = await prefilterEmailIntentWithAi(aiPayload);
        if (
          prefilterResult?.intent
          && prefilterResult?.action
          && prefilterResult?.should_escalate === false
          && Number(prefilterResult.confidence) >= 0.75
        ) {
          finalResult = {
            intent: prefilterResult.intent,
            action: prefilterResult.action,
            confidence: Number(prefilterResult.confidence) || 0.5,
            reason: prefilterResult.reason || 'KI-Vorfilter',
            source: 'ai',
          };
          modelName = aiConfig.prefilterModel;
        } else {
          const { result } = await classifyEmailIntentWithAi(aiPayload);
          if (result?.intent && result?.action) {
            finalResult = {
              intent: result.intent,
              action: result.action,
              confidence: Number(result.confidence) || 0.5,
              reason: result.reason || 'KI-Vorschlag',
              source: 'ai',
            };
            modelName = aiConfig.model;
          } else if (ruleResult.intent !== 'unclear') {
            finalResult = ruleResult;
            modelName = 'rules-v1';
          }
        }
      }

      await pool.query(
        `UPDATE tour_manager.incoming_emails
         SET matched_tour_id = $1,
             processing_status = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [
          matchedTourId,
          candidateDecision.ambiguous ? 'suggested' : (!matchedTourId ? 'matched' : (finalResult.intent === 'unclear' ? 'matched' : 'suggested')),
          stored.id,
        ]
      );

      if (!matchedTourId && !candidateDecision.ambiguous) {
        continue;
      }

      if (candidateDecision.ambiguous && !matchedTourId) {
        finalResult = {
          intent: 'unclear',
          action: 'review_manual',
          confidence: Math.max(0.35, Math.min(0.6, Number(best?.score || 0) / 300)),
          reason: candidateDecision.reason,
          source: 'rules',
        };
      }

      await upsertSuggestion({
        suggestionType: 'email_intent',
        sourceKey: `email:${stored.id}`,
        sourceEmailId: stored.id,
        tourId: matchedTourId,
        suggestedAction: finalResult.action,
        confidence: finalResult.confidence,
        reason: finalResult.reason,
        modelName,
        promptVersion: MAIL_PROMPT_VERSION,
        pipelineVersion: MAIL_PIPELINE_VERSION,
        details: {
          intent: finalResult.intent,
          source: finalResult.source,
          scope_reason: scopeCheck.reason,
          assignment_diagnostics: {
            ambiguous: candidateDecision.ambiguous,
            selected_tour_id: matchedTourId,
            reason: candidateDecision.reason,
          },
          email: {
            subject: stored.subject,
            from_email: stored.from_email,
            received_at: stored.received_at,
            body_preview: stored.body_preview,
            body_text: stored.body_text,
            mailbox_upn: mailboxUpn,
          },
          candidate: best ? {
            id: best.tour.id,
            score: best.score,
            reasons: best.reasons,
            match_priority: best.matchPriority,
            customer_name: best.tour.customer_name || best.tour.kunde_ref,
            object_label: getTourObjectLabel(best.tour),
          } : null,
          alternative_candidates: candidates.slice(1, 3).map((entry) => ({
            id: entry.tour.id,
            score: entry.score,
            reasons: entry.reasons,
            match_priority: entry.matchPriority,
            customer_name: entry.tour.customer_name || entry.tour.kunde_ref,
            object_label: getTourObjectLabel(entry.tour),
          })),
          review_examples: reviewExamples,
        },
      });
      suggestions++;
    }
  }
  return {
    processed,
    suggestions,
    error: processed === 0 && mailboxErrors.length ? mailboxErrors.join(' | ') : null,
    mailboxErrors,
    mailboxes,
    lookbackMonths,
    topInbox,
    topSent,
  };
}

async function listSuggestions(filters = {}) {
  await ensureSchema();
  const params = [];
  let i = 1;
  let query = `
    SELECT s.*,
      t.customer_name, t.kunde_ref, t.customer_email, t.object_label, t.bezeichnung, t.status AS tour_status,
      e.nummer AS invoice_number, e.kunde_name AS invoice_customer_name, e.bezeichnung AS invoice_label, e.preis_brutto,
      m.subject AS email_subject, m.from_email, m.received_at, m.body_preview, m.body_text
    FROM tour_manager.ai_suggestions s
    LEFT JOIN tour_manager.tours t ON t.id = s.tour_id
    LEFT JOIN tour_manager.exxas_invoices e ON e.id = s.source_invoice_id
    LEFT JOIN tour_manager.incoming_emails m ON m.id = s.source_email_id
    WHERE 1=1
      AND NOT (
        s.suggestion_type = 'email_intent'
        AND s.status = 'rejected'
        AND s.reviewed_by = 'system'
        AND (
          COALESCE(s.reviewed_note, '') LIKE 'Automatisch ausgeblendet:%'
          OR COALESCE(s.reviewed_note, '') = 'Automatisch bereinigt: irrelevante Fremd-/Rechnungs-/Marketplace-Mail ohne Tour-Bezug'
        )
      )
  `;
  if (filters.status) {
    query += ` AND s.status = $${i++}`;
    params.push(filters.status);
  }
  if (filters.type) {
    query += ` AND s.suggestion_type = $${i++}`;
    params.push(filters.type);
  }
  query += ' ORDER BY s.status ASC, s.confidence DESC, s.created_at DESC';
  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    ...row,
    confidence_percent: Math.round((parseFloat(row.confidence) || 0) * 100),
  }));
}

async function getSuggestionById(id) {
  await ensureSchema();
  const result = await pool.query(
    `SELECT s.*,
      t.customer_name, t.kunde_ref, t.customer_email, t.customer_contact, t.object_label, t.bezeichnung,
      t.status AS tour_status, t.tour_url, t.matterport_space_id,
      t.matterport_created_at,
      COALESCE(t.term_end_date, t.ablaufdatum) AS tour_term_end_date,
      t.term_start_date,
      t.price AS tour_price,
      t.customer_intent, t.customer_intent_confidence, t.customer_intent_note,
      e.nummer AS invoice_number, e.kunde_name AS invoice_customer_name, e.bezeichnung AS invoice_label, e.preis_brutto, e.ref_vertrag, e.ref_kunde,
      m.subject AS email_subject, m.from_email, m.from_name, m.received_at, m.body_preview, m.body_text, m.mailbox_upn, m.raw_json AS email_raw_json
    FROM tour_manager.ai_suggestions s
    LEFT JOIN tour_manager.tours t ON t.id = s.tour_id
    LEFT JOIN tour_manager.exxas_invoices e ON e.id = s.source_invoice_id
    LEFT JOIN tour_manager.incoming_emails m ON m.id = s.source_email_id
    WHERE s.id = $1
      AND NOT (
        s.suggestion_type = 'email_intent'
        AND s.status = 'rejected'
        AND s.reviewed_by = 'system'
        AND (
          COALESCE(s.reviewed_note, '') LIKE 'Automatisch ausgeblendet:%'
          OR COALESCE(s.reviewed_note, '') = 'Automatisch bereinigt: irrelevante Fremd-/Rechnungs-/Marketplace-Mail ohne Tour-Bezug'
        )
      )
    LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getSuggestionStats() {
  await ensureSchema();
  const stats = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'open')::int AS open,
      COUNT(*) FILTER (WHERE status = 'approved' OR status = 'applied')::int AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
      COUNT(*) FILTER (WHERE suggestion_type = 'invoice_match' AND status = 'open')::int AS invoices_open,
      COUNT(*) FILTER (WHERE suggestion_type = 'email_intent' AND status = 'open')::int AS emails_open
    FROM tour_manager.ai_suggestions
    WHERE NOT (
      suggestion_type = 'email_intent'
      AND status = 'rejected'
      AND reviewed_by = 'system'
      AND (
        COALESCE(reviewed_note, '') LIKE 'Automatisch ausgeblendet:%'
        OR COALESCE(reviewed_note, '') = 'Automatisch bereinigt: irrelevante Fremd-/Rechnungs-/Marketplace-Mail ohne Tour-Bezug'
      )
    )
  `);
  return stats.rows[0] || { open: 0, approved: 0, rejected: 0, invoices_open: 0, emails_open: 0 };
}

async function buildTrainingDataset(limit = 500) {
  await ensureSchema();
  const result = await pool.query(
    `SELECT s.id, s.suggestion_type, s.status, s.tour_id, s.gold_tour_id, s.gold_intent, s.gold_action,
            s.review_reason, s.review_source, s.prompt_version, s.pipeline_version,
            s.reason AS suggestion_reason, s.reviewed_at, s.created_at,
            m.subject AS email_subject, m.from_email, m.body_preview, m.body_text, m.mailbox_upn,
            o.subject AS outgoing_subject, o.recipient_email, o.template_key,
            COALESCE(t.object_label, t.bezeichnung) AS object_label,
            COALESCE(t.customer_name, t.kunde_ref) AS customer_name,
            last_action.action AS customer_action,
            last_action.created_at AS customer_action_at,
            last_action.details_json AS customer_action_details
     FROM tour_manager.ai_suggestions s
     LEFT JOIN tour_manager.incoming_emails m ON m.id = s.source_email_id
     LEFT JOIN tour_manager.outgoing_emails o ON o.tour_id = COALESCE(s.gold_tour_id, s.tour_id)
     LEFT JOIN tour_manager.tours t ON t.id = COALESCE(s.gold_tour_id, s.tour_id)
     LEFT JOIN LATERAL (
       SELECT a.action, a.created_at, a.details_json
       FROM tour_manager.actions_log a
       WHERE a.tour_id = COALESCE(s.gold_tour_id, s.tour_id)
         AND a.action IN ('CUSTOMER_YES', 'CUSTOMER_NO', 'SEND_RENEWAL_EMAIL', 'APPROVE_AI_SUGGESTION')
       ORDER BY a.created_at DESC
       LIMIT 1
     ) last_action ON TRUE
     WHERE s.suggestion_type = 'email_intent'
       AND s.status IN ('approved', 'applied', 'rejected')
       AND (s.gold_action IS NOT NULL OR s.review_reason IS NOT NULL OR s.reviewed_note IS NOT NULL)
     ORDER BY s.reviewed_at DESC NULLS LAST, s.updated_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(parseInt(limit, 10) || 500, 5000))]
  );

  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    gold_tour_id: row.gold_tour_id || row.tour_id || null,
    gold_intent: row.gold_intent || null,
    gold_action: row.gold_action || null,
    review_reason: row.review_reason || row.suggestion_reason || null,
    review_source: row.review_source || null,
    prompt_version: row.prompt_version || MAIL_PROMPT_VERSION,
    pipeline_version: row.pipeline_version || MAIL_PIPELINE_VERSION,
    email: {
      subject: row.email_subject,
      from_email: row.from_email,
      body_preview: row.body_preview,
      body_text: row.body_text,
      mailbox_upn: row.mailbox_upn,
    },
    tour: {
      id: row.gold_tour_id || row.tour_id || null,
      object_label: row.object_label,
      customer_name: row.customer_name,
    },
    outgoing_hint: {
      subject: row.outgoing_subject,
      recipient_email: row.recipient_email,
      template_key: row.template_key,
    },
    customer_signal: {
      action: row.customer_action || null,
      at: row.customer_action_at || null,
      details: row.customer_action_details || null,
    },
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
  }));
}

async function upsertRenewalInvoiceFromExxas(tourId, invoiceRow) {
  const status = classifyInvoiceStatus(invoiceRow);
  const existing = await pool.query(
    `SELECT id FROM tour_manager.renewal_invoices
     WHERE tour_id = $1 AND exxas_invoice_id = $2
     LIMIT 1`,
    [tourId, invoiceRow.exxas_document_id]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO tour_manager.renewal_invoices (
      tour_id, exxas_invoice_id, invoice_number, period_start, period_end, invoice_status, sent_at, paid_at
    ) VALUES ($1,$2,$3,NULL,NULL,$4,$5::timestamptz,$6::timestamptz)
    RETURNING id`,
    [
      tourId,
      invoiceRow.exxas_document_id,
      invoiceRow.nummer || null,
      status,
      invoiceRow.dok_datum || null,
      status === 'paid' ? (invoiceRow.zahlungstermin || invoiceRow.dok_datum || null) : null,
    ]
  );
  return created.rows[0]?.id || null;
}

async function approveSuggestion(id, reviewerRef) {
  await ensureSchema();
  const result = await pool.query(
    `SELECT * FROM tour_manager.ai_suggestions WHERE id = $1 LIMIT 1`,
    [id]
  );
  const suggestion = result.rows[0];
  if (!suggestion) throw new Error('Vorschlag nicht gefunden');
  if (suggestion.status !== 'open') throw new Error('Vorschlag wurde bereits bearbeitet');
  const details = suggestion.details_json || {};
  const approvedIntent = details.intent || suggestion.gold_intent || null;
  const approvedAction = suggestion.suggested_action || suggestion.gold_action || null;

  if (suggestion.suggestion_type === 'invoice_match' && suggestion.source_invoice_id && suggestion.tour_id) {
    const invoiceResult = await pool.query('SELECT * FROM tour_manager.exxas_invoices WHERE id = $1', [suggestion.source_invoice_id]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error('Rechnung nicht gefunden');
    await pool.query(
      `UPDATE tour_manager.exxas_invoices
       SET tour_id = $1, synced_at = NOW()
       WHERE id = $2`,
      [suggestion.tour_id, suggestion.source_invoice_id]
    );
    await upsertRenewalInvoiceFromExxas(suggestion.tour_id, invoice);
    await logAction(suggestion.tour_id, 'admin', reviewerRef, 'APPROVE_AI_SUGGESTION', {
      type: 'invoice_match',
      invoice_id: suggestion.source_invoice_id,
    });
  } else if (suggestion.suggestion_type === 'email_intent' && suggestion.tour_id) {
    const intent = details.intent || null;
    const confidence = Number(suggestion.confidence) || 0;
    let transferRequested = false;
    let billingAttention = false;
    let note = suggestion.reason || null;

    if (suggestion.suggested_action === 'mark_decline') {
      note = suggestion.reason || 'Kunde möchte aktuell nicht verlängern';
    } else if (suggestion.suggested_action === 'mark_accept') {
      note = suggestion.reason || 'Kunde signalisiert Verlängerungswunsch';
    } else if (suggestion.suggested_action === 'flag_transfer') {
      transferRequested = true;
      note = suggestion.reason || 'Kunde wünscht Transfer statt Verlängerung';
    } else if (suggestion.suggested_action === 'review_billing') {
      billingAttention = true;
      note = suggestion.reason || 'Kunde hat Rückfrage zu Rechnung oder Zahlung';
    }

    await pool.query(
      `UPDATE tour_manager.tours
       SET customer_intent = $2,
           customer_intent_source = 'approved_suggestion',
           customer_intent_note = $3,
           customer_intent_confidence = $4,
           customer_intent_updated_at = NOW(),
           customer_transfer_requested = $5,
           customer_billing_attention = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        suggestion.tour_id,
        intent,
        note,
        confidence,
        transferRequested,
        billingAttention,
      ]
    );
    await logAction(suggestion.tour_id, 'admin', reviewerRef, 'APPROVE_AI_SUGGESTION', {
      type: 'email_intent',
      action: suggestion.suggested_action,
      local_only: true,
      intent,
    });
  }

  await pool.query(
    `UPDATE tour_manager.ai_suggestions
     SET status = 'applied',
         reviewed_by = $2,
         gold_tour_id = COALESCE(gold_tour_id, tour_id),
         gold_intent = COALESCE(gold_intent, $3),
         gold_action = COALESCE(gold_action, $4),
         review_reason = COALESCE(review_reason, $5),
         review_source = COALESCE(review_source, 'admin_ui'),
         prompt_version = COALESCE(prompt_version, $6),
         pipeline_version = COALESCE(pipeline_version, $7),
         reviewed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      reviewerRef || null,
      approvedIntent,
      approvedAction,
      'Freigegeben im Admin',
      MAIL_PROMPT_VERSION,
      MAIL_PIPELINE_VERSION,
    ]
  );
  if (suggestion.source_email_id) {
    await pool.query(
      `UPDATE tour_manager.incoming_emails
       SET processing_status = 'reviewed', updated_at = NOW()
       WHERE id = $1`,
      [suggestion.source_email_id]
    );
  }
}

async function rejectSuggestion(id, reviewerRef, note = null, reviewSource = 'admin_ui') {
  await ensureSchema();
  const result = await pool.query('SELECT * FROM tour_manager.ai_suggestions WHERE id = $1 LIMIT 1', [id]);
  if (!result.rows[0]) throw new Error('Vorschlag nicht gefunden');
  const suggestion = result.rows[0];
  const details = suggestion.details_json || {};
  await pool.query(
    `UPDATE tour_manager.ai_suggestions
     SET status = 'rejected',
         reviewed_by = $2,
         reviewed_note = $3,
         gold_tour_id = NULL,
         gold_intent = COALESCE(gold_intent, CASE WHEN $4 <> '' THEN 'unclear' ELSE details_json->>'intent' END),
         gold_action = COALESCE(gold_action, 'review_manual'),
         review_reason = COALESCE($4, review_reason, reviewed_note, 'Abgelehnt im Admin'),
         review_source = COALESCE($5, review_source, 'admin_ui'),
         prompt_version = COALESCE(prompt_version, $6),
         pipeline_version = COALESCE(pipeline_version, $7),
         reviewed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      reviewerRef || null,
      note,
      note || details.assignment_diagnostics?.reason || 'Abgelehnt im Admin',
      reviewSource || 'admin_ui',
      MAIL_PROMPT_VERSION,
      MAIL_PIPELINE_VERSION,
    ]
  );
  if (suggestion.source_email_id) {
    await pool.query(
      `UPDATE tour_manager.incoming_emails
       SET processing_status = 'ignored', updated_at = NOW()
       WHERE id = $1`,
      [suggestion.source_email_id]
    );
  }
}

module.exports = {
  approveSuggestion,
  buildTrainingDataset,
  ensureSchema,
  getCustomerLinkSuggestionsForTour,
  getSuggestionById,
  getSimilarReviewedSuggestions,
  getSuggestionStats,
  getInvoiceLinkSuggestionsForTour,
  listSuggestions,
  rejectSuggestion,
  resolveEmailCandidateDecision,
  syncInvoiceSuggestions,
  syncMailboxSuggestions,
  syncSentMailboxAnchors,
};
