/**
 * Schritt 3: Räume klassifizieren (KI-Call).
 *
 * Klein, fokussiert, robust: Antwort ist ein einfaches JSON-Array
 * mit { id, name, kategorie }. Kein SVG, keine Layouts.
 *
 * Bug-Hunt MEDIUM M06: Adresse + Roh-Beschreibung gehen NICHT mehr an
 * Anthropic. Wir reduzieren modelMeta via redactModelMeta() auf die
 * fuer die Raumklassifikation noetigen Strukturhints (z. B.
 * "3.5-Zimmer; mit Buero; 122 m²"). Strassennamen / Hausnummern / PLZ
 * / Ortsnamen leaken damit nicht mehr an einen US-LLM-Provider.
 */
import { redactModelMeta } from './redactForLlm.mjs';

const SYSTEM = `Du bist ein Schweizer Immobilien-Spezialist. Du bekommst Räume aus einem Matterport-Scan
mit Maßen (in Metern) und vergibst pro Raum einen sinnvollen Funktionsnamen
(in Schweizer Hochdeutsch, in Versalien) plus eine Kategorie.

REGELN:
- Wohnzimmer / Wohnen-Essen / Wohnen-Essen-Küche → für die größten Räume mit vielen Panos.
- Schlafzimmer 1/2/3, Büro, Kinderzimmer → 12–22 m² mit 1–2 Panos.
- Küche → 6–14 m² mit Form ähnlich Rechteck und meistens an Wohnen angrenzend.
- Bad / Dusche → 3–9 m².
- WC / Gäste-WC → < 3 m² oder schmal.
- Reduit / WIC → sehr klein (< 3 m²) oder schmal/lang.
- Gang / Korridor → schmal-lang, weniger als 6 m breit, oft an Eingang.
- Eingang / Garderobe → kleiner Raum nahe Pano "0" oder am Rand der Etage.
- Terrasse / Balkon / Patio → nur wenn explizit aus Tags ableitbar; sonst NICHT erfinden.
- Bei Mehrfachen nummerieren ("SCHLAFZIMMER 1", "SCHLAFZIMMER 2").
- KEINE Phantasienamen. Keine "Bereich A".
- Wenn unsicher: kategorie="unbekannt", name="RAUM" + Nummer.

Antwort ausschließlich als JSON: { "rooms": [ { "id": "<id>", "name": "<NAME>", "kategorie": "<key>" } ] }
Keine Markdown-Codefences.`;

const KATEGORIE_KEYS = new Set([
  'wohnen',
  'essen',
  'kueche',
  'wohnen_essen_kueche',
  'schlafen',
  'kind',
  'buero',
  'bad',
  'wc',
  'reduit',
  'wic',
  'gang',
  'eingang',
  'terrasse',
  'balkon',
  'patio',
  'unbekannt',
]);

function safeParse(text) {
  if (!text) throw new Error('Leere Antwort');
  let s = String(text).trim();
  s = s.replace(/^```(?:json|JSON)?\s*/i, '').replace(/\s*```\s*$/, '');
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return JSON.parse(s);
}

export async function classifyRooms({ anthropic, model, modelMeta, rooms, mattertags }) {
  if (!rooms.length) return new Map();

  const payload = {
    // Bug-Hunt M06: nur strukturelle Klassifikations-Hints; keine PII.
    ...redactModelMeta(modelMeta),
    tags: (mattertags || []).slice(0, 30).map((t) => ({
      name: t.name,
      description: t.description?.slice(0, 200) || null,
      x: t.x,
      y: t.y,
    })),
    rooms: rooms.map((r) => ({
      id: r.id,
      flaeche_m2: r.flaeche_m2,
      breite_m: r.breite_m,
      tiefe_m: r.tiefe_m,
      hoehe_m: r.hoehe_m,
      panoCount: r.panoCount,
      panoLabels: r.panoLabels,
      x: r.centroid?.x ?? null,
      y: r.centroid?.y ?? null,
    })),
  };

  const message = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          'Klassifiziere die folgenden Räume und gib NUR das geforderte JSON zurück.\n\n' +
          JSON.stringify(payload, null, 2),
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  let parsed;
  try {
    parsed = safeParse(text);
  } catch (e) {
    console.warn('classifyRooms: JSON-Fehler', e.message, text.slice(0, 300));
    return new Map();
  }

  const map = new Map();
  for (const r of parsed.rooms || []) {
    const id = String(r.id || '').trim();
    const name = String(r.name || '').trim().toUpperCase();
    const kategorie = KATEGORIE_KEYS.has(String(r.kategorie || '').toLowerCase())
      ? String(r.kategorie).toLowerCase()
      : 'unbekannt';
    if (id && name) map.set(id, { name, kategorie });
  }
  return map;
}
