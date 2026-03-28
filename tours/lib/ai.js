const { getAiPromptSettings } = require('./settings');

function getAiConfig() {
  const legacyModel = process.env.OPENAI_MODEL || '';
  const explicitPrefilterModel = process.env.OPENAI_PREFILTER_MODEL || '';
  // Abwaertskompatibilitaet: alter Wert gpt-4.1-mini war frueher das Hauptmodell.
  // Heute bleibt das Hauptmodell gpt-5.4, waehrend der Vorfilter standardmaessig gpt-5-mini ist.
  const usesLegacyMiniOnly = legacyModel === 'gpt-4.1-mini' && !explicitPrefilterModel;

  return {
    apiKey: process.env.OPENAI_API_KEY || null,
    // Vorfilter: schnell und guenstig fuer einfache Faelle. Hauptmodell: gpt-5.4 fuer komplexe Entscheidungen.
    prefilterModel: explicitPrefilterModel || 'gpt-5-mini',
    model: usesLegacyMiniOnly ? 'gpt-5.4' : (legacyModel || 'gpt-5.4'),
  };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

async function buildSystemPrompt(baseParts) {
  const promptSettings = await getAiPromptSettings();
  const customPrompt = String(promptSettings?.mailSystemPrompt || '').trim();
  return customPrompt
    ? [...baseParts, `Zusaetzliche Fachanweisung: ${customPrompt}`].join(' ')
    : baseParts.join(' ');
}

async function classifyEmailIntentWithAi(payload) {
  const { apiKey, model } = getAiConfig();
  if (!apiKey) {
    return { result: null, error: 'OPENAI_API_KEY fehlt' };
  }

  const systemPrompt = await buildSystemPrompt([
    'Du bist ein Klassifizierer fuer E-Mail-Antworten rund um Tour-Verlaengerungen.',
    'Nutze die Kandidaten, Match-Prioritaeten und eventuelle rule_hint-Informationen als Kontext, aber entscheide eigenstaendig.',
    'Antworte nur als JSON-Objekt.',
    'Erlaubte Werte fuer "intent": renew_yes, renew_no, transfer_requested, billing_question, unclear.',
    'Erlaubte Werte fuer "action": mark_accept, mark_decline, flag_transfer, review_billing, review_manual.',
    'confidence ist eine Zahl zwischen 0 und 1.',
    'reason ist ein kurzer deutscher Satz.',
  ]);

  const userPrompt = JSON.stringify(payload, null, 2);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        result: null,
        error: data?.error?.message || `OpenAI HTTP ${response.status}`,
      };
    }
    const raw = data?.choices?.[0]?.message?.content || '';
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { result: null, error: 'OpenAI lieferte kein parsebares JSON' };
    }
    return { result: parsed, error: null };
  } catch (err) {
    return { result: null, error: err.message };
  }
}

async function prefilterEmailIntentWithAi(payload) {
  const { apiKey, prefilterModel } = getAiConfig();
  if (!apiKey) {
    return { result: null, error: 'OPENAI_API_KEY fehlt' };
  }

  const systemPrompt = await buildSystemPrompt([
    'Du bist ein schneller Vorfilter fuer eingehende Kunden-E-Mails rund um Tour-Verlaengerungen.',
    'Nutze Kandidaten, Match-Prioritaeten und eventuelle rule_hint-Informationen als Kontext, aber triff die Vorentscheidung eigenstaendig.',
    'Antworte nur als JSON-Objekt.',
    'Erlaubte Werte fuer "route": direct_accept, direct_decline, direct_transfer, direct_billing, full_review.',
    'should_escalate ist true, wenn die Mail unklar, gemischt, laenger oder risikoreich ist und ein staerkeres Modell noetig ist.',
    'intent ist einer von renew_yes, renew_no, transfer_requested, billing_question, unclear.',
    'action ist einer von mark_accept, mark_decline, flag_transfer, review_billing, review_manual.',
    'confidence ist eine Zahl zwischen 0 und 1.',
    'reason ist ein kurzer deutscher Satz.',
    'Waehle full_review bzw. should_escalate=true bei Mehrdeutigkeit, mehreren Anliegen, unklarem Bezug oder wenn eine sichere Einordnung fehlt.',
  ]);

  const userPrompt = JSON.stringify(payload, null, 2);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: prefilterModel,
        temperature: 0.0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        result: null,
        error: data?.error?.message || `OpenAI HTTP ${response.status}`,
      };
    }
    const raw = data?.choices?.[0]?.message?.content || '';
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { result: null, error: 'OpenAI lieferte kein parsebares JSON' };
    }
    return { result: parsed, error: null };
  } catch (err) {
    return { result: null, error: err.message };
  }
}

/**
 * Freier KI-Chat fuer Vorschlag-Detail-Seite.
 * Beantwortet beliebige Nutzerfragen im Kontext eines E-Mail-Vorschlags.
 * Nutzt das konfigurierte Hauptmodell (Standard: gpt-5.4).
 * Der Aufrufer kann model explizit ueberschreiben.
 */
async function chatWithAi({ systemContext, history, userMessage, model: overrideModel } = {}) {
  const config = getAiConfig();
  if (!config.apiKey) {
    return { answer: null, error: 'OPENAI_API_KEY fehlt' };
  }

  const chosenModel = overrideModel || config.model;
  const systemPrompt = await buildSystemPrompt([
    'Du bist ein intelligenter Assistent fuer den Propus Tour Manager.',
    'Du beantwortest Fragen zu eingehenden Kunden-E-Mails, Tour-Verlaengerungen, Exxas-Rechnungen und Matterport-Touren.',
    'Antworte praegnant und auf Deutsch. Wenn du etwas nicht weisst, sage es klar.',
    'Wenn du Fakten aus Datenquellen nennst, trenne sie mit klaren Quellenlabeln wie "Quelle: lokaler Sync", "Quelle: Exxas live", "Quelle: Matterport live" oder "Quelle: Exchange live".',
    systemContext ? `Kontext: ${systemContext}` : '',
  ].filter(Boolean));

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(history) ? history : []),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: chosenModel,
        temperature: 0.3,
        messages,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { answer: null, error: data?.error?.message || `OpenAI HTTP ${response.status}` };
    }
    const answer = data?.choices?.[0]?.message?.content || '';
    return { answer, error: null };
  } catch (err) {
    return { answer: null, error: err.message };
  }
}

module.exports = {
  classifyEmailIntentWithAi,
  prefilterEmailIntentWithAi,
  getAiConfig,
  chatWithAi,
};
