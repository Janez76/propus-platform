/**
 * Schritt 3b: Validator-Agent (zweite KI-Stufe).
 *
 * Nimmt das Resultat aus classifyRooms und prüft Plausibilität gegen die
 * Modell-Beschreibung und typische Schweizer Wohnungs-Schemata.
 *
 * Typische Probleme, die wir hier korrigieren:
 *   - "SCHLAFZIMMER 1/2/3", obwohl Beschreibung sagt "3.5-Zimmer mit Büro"
 *     → einer wird zu BÜRO.
 *   - "Schlafzimmer" für 18 m²-Raum direkt am Eingang → eher BÜRO/ARBEITEN.
 *   - "Bad" + "WC" sind getauscht (WC > Bad in Fläche).
 *   - Mehrere "Wohnen-Essen-Küche" → nur eines, Rest umbenennen.
 *
 * Output: gleiche Map<id, {name, kategorie}> wie classifyRooms.
 * Bei Fehlern: gibt die Eingabe-Map unverändert zurück (graceful fallback).
 *
 * Bug-Hunt MEDIUM M06: dieselbe Privacy-Redaktion wie classifyRooms —
 * Adresse + Roh-Beschreibung gehen nicht an Anthropic, nur die
 * strukturellen Klassifikations-Hints aus redactModelMeta().
 */
import { redactModelMeta } from './redactForLlm.mjs';

const SYSTEM = `Du bist ein erfahrener Schweizer Architekt und prüfst die Klassifikation
einer Wohnungs-Etage. Deine Aufgabe: Plausibilitäts-Check und Korrektur.

Du bekommst:
  - die Modell-Beschreibung (z.B. "3.5-Zimmer-Wohnung mit Büro, 122 m²")
  - eine Liste klassifizierter Räume mit Maßen und vorgeschlagenem Namen/Kategorie

Prüfe:
1) Stimmt die Anzahl der Schlafzimmer mit der Beschreibung überein?
   (Eine 3.5-Zimmer-Wohnung hat typisch 1 Wohnen-Essen-Küche + 2-3 Zimmer.
   "Mit Büro" → einer der "Schlafzimmer" ist BÜRO.)
2) Gibt es plausibel max. 1 BAD und max. 1 WC? Falls Fläche getauscht: korrigieren.
3) Gibt es genau 1 Wohnen / Wohnen-Essen-Küche?
4) Räume < 3 m² sind WC, REDUIT, GARDEROBE oder WIC — nicht "Schlafzimmer".

HARTE GRÖSSEN-REGELN (NIEMALS verletzen):
- EINGANG / GARDEROBE: nur Räume bis maximal 8 m². Ein 17 m²-Raum ist NIE ein Eingang,
  selbst wenn er Pano 0 enthält. Im Zweifel als WOHNEN, BÜRO oder SCHLAFZIMMER lassen.
- WC: nur Räume bis maximal 4 m².
- BAD: typisch 4–10 m².
- KÜCHE (separat): typisch 6–14 m².
- SCHLAFZIMMER: typisch 10–22 m².
- WOHNEN / WOHNEN-ESSEN / WOHNEN-ESSEN-KÜCHE: meist der größte Raum (> 25 m²).
- Pano 0 ist ein schwaches Indiz für Einstieg, NICHT für "großer Raum = Eingang".
  Pano 0 in einem 17 m²-Raum bedeutet eher: der Scan begann im Wohnzimmer.

REGELN für die Korrektur:
- Verändere NUR was eindeutig falsch ist. Bei Unsicherheit: lass es.
- Behalte die "id" aus der Eingabe (sonst kommt nichts an).
- Nutze Schweizer Hochdeutsch in VERSALIEN ("BÜRO", "BAD", "WC", "REDUIT").
- "kategorie" muss aus dieser Liste sein:
  wohnen, essen, kueche, wohnen_essen_kueche, schlafen, kind, buero,
  bad, wc, reduit, wic, gang, eingang, terrasse, balkon, patio, unbekannt.

ANTWORT: ausschließlich JSON, kein Markdown, keine Codefences:
{ "rooms": [ { "id": "<id>", "name": "<NAME>", "kategorie": "<key>", "begruendung": "<kurz>" } ] }
Liste alle Räume auf — auch unveränderte. "begruendung" kurz: "ok" oder z.B. "wegen Beschreibung 'mit Büro' umbenannt".`;

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

/**
 * @param {object} args
 * @param {*} args.anthropic        Anthropic-SDK-Instanz
 * @param {string} args.model       Modell-Slug
 * @param {object} args.modelMeta   { adresse, beschreibung, name, ... }
 * @param {Array} args.rooms        bereinigte Räume (cleaned)
 * @param {Map} args.naming         Map<id, {name, kategorie}> aus classifyRooms
 * @returns {Promise<{ map: Map, notes: string[] }>}
 */
export async function validateRooms({ anthropic, model, modelMeta, rooms, naming }) {
  if (!anthropic || !rooms?.length || !naming?.size) {
    return { map: naming || new Map(), notes: [] };
  }

  const enriched = rooms.map((r) => {
    const n = naming.get(r.id) || { name: 'RAUM', kategorie: 'unbekannt' };
    return {
      id: r.id,
      vorschlag_name: n.name,
      vorschlag_kategorie: n.kategorie,
      flaeche_m2: r.flaeche_m2,
      breite_m: r.breite_m,
      tiefe_m: r.tiefe_m,
      panoCount: r.panoCount,
      panoLabels: r.panoLabels,
    };
  });

  const payload = {
    // Bug-Hunt M06: nur strukturelle Klassifikations-Hints; keine PII.
    ...redactModelMeta(modelMeta),
    rooms: enriched,
  };

  let message;
  try {
    message = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content:
            'Prüfe und korrigiere die Klassifikation. Antworte NUR mit dem geforderten JSON.\n\n' +
            JSON.stringify(payload, null, 2),
        },
      ],
    });
  } catch (e) {
    return {
      map: naming,
      notes: [`Validator nicht erreichbar (${e.message}) — Erstklassifikation übernommen.`],
    };
  }

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  let parsed;
  try {
    parsed = safeParse(text);
  } catch (e) {
    return {
      map: naming,
      notes: [`Validator-Antwort nicht parsebar (${e.message}) — Erstklassifikation übernommen.`],
    };
  }

  const corrected = new Map(naming);
  const notes = [];
  let changed = 0;
  for (const r of parsed.rooms || []) {
    const id = String(r.id || '').trim();
    if (!id || !corrected.has(id)) continue;
    const name = String(r.name || '').trim().toUpperCase();
    const kategorie = KATEGORIE_KEYS.has(String(r.kategorie || '').toLowerCase())
      ? String(r.kategorie).toLowerCase()
      : null;
    if (!name || !kategorie) continue;
    const old = corrected.get(id);
    if (old.name !== name || old.kategorie !== kategorie) {
      changed += 1;
      const reason = String(r.begruendung || '').trim();
      notes.push(
        `${old.name} → ${name}${reason && reason.toLowerCase() !== 'ok' ? ` (${reason})` : ''}`
      );
    }
    corrected.set(id, { name, kategorie });
  }

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  for (const [id, val] of corrected.entries()) {
    const r = roomById.get(id);
    if (!r) continue;
    const area = r.flaeche_m2 || 0;
    let override = null;
    if (val.kategorie === 'eingang' && area > 8) {
      override = { name: 'RAUM', kategorie: 'unbekannt' };
      notes.push(`Hard-Override: ${val.name} (${area.toFixed(1)} m² > 8) ist kein Eingang.`);
    } else if (val.kategorie === 'wc' && area > 4) {
      override = { name: 'BAD', kategorie: 'bad' };
      notes.push(`Hard-Override: ${val.name} (${area.toFixed(1)} m² > 4) ist kein WC, eher Bad.`);
    }
    if (override) {
      corrected.set(id, override);
      changed += 1;
    }
  }

  if (changed === 0) notes.push('Validator: keine Änderungen.');
  return { map: corrected, notes };
}
