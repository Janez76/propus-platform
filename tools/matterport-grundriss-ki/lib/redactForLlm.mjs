/**
 * Bug-Hunt MEDIUM M06: Privacy-Redaktion fuer Anthropic-Payloads.
 *
 * Vor diesem Helper schickte classifyRooms / validateRooms `adresse` und
 * `beschreibung` aus dem Matterport-Modell direkt mit. Adressen sind PII
 * (Kunden-Standort) und gehen damit an einen US-LLM-Provider, ohne dass
 * der Endkunde das in der Datenschutzerklaerung sieht.
 *
 * Strategie: hartes Drop von `adresse`. `beschreibung` wird auf
 * maximale Laenge gekuerzt UND auf semantisch nuetzliche Patterns
 * gefiltert (Anzahl Zimmer, Flaeche, "mit Buero/Balkon/Garten/..."),
 * sodass der Klassifikator-Hint erhalten bleibt aber Strassen / PLZ /
 * Hausnummern nicht durchsickern.
 *
 * Bewusste Trade-offs:
 *   - Wenn das Modell weder rooms noch eine Beschreibung hat, faellt der
 *     Hint weg — selten genug, dass das ok ist (Validator hat dann
 *     Naming-Map als Vorschlag und faellt auf graceful fallback zurueck).
 *   - Falls jemand eine Strasse als Teil der Modell-Beschreibung haben
 *     will, muss er das explizit im UI-Workflow setzen.
 */

const KEEP_PATTERNS = [
  // "3.5-Zimmer", "5 Zimmer", "3,5 Zimmer-Wohnung"
  /\b\d+(?:[.,]\d+)?\s*-?\s*Zimmer(?:-Wohnung|-Haus)?\b/gi,
  // "122 m²", "120m2" — kein trailing \b weil "²" als Non-Word-Char keinen
  // Boundary zur End-Of-String produziert.
  /\b\d+(?:[.,]\d+)?\s*m[²2](?![A-Za-z0-9])/gi,
  // "mit Büro", "und Balkon", "sowie Garten", ... — Listen-Konnektoren mit
  // einem der gelisteten Features. Strassennamen passen nicht ins Pattern,
  // weil "mit Bahnhofstrasse" semantisch absurd ist.
  /\b(?:mit|und|sowie)\s+(?:B[üu]ro|Balkon|Terrasse|Garten|Patio|Loggia|Keller|Estrich|Cheminee|Kamin|Sauna|Pool|Carport|Garage|Reduit|WIC|Wintergarten)\b/gi,
  // "Maisonette", "Loft", "Studio"
  /\b(?:Maisonette|Loft|Studio|Attika|Penthouse|Duplex|Triplex|Souterrain|Hochparterre)\b/gi,
];

/**
 * Extrahiert nur die fuer die Raumklassifikation nuetzlichen Strukturhints
 * aus einer freitextlichen Beschreibung — Strassennamen / Hausnummern / PLZ
 * / Ortsnamen / E-Mails / Telefonnummern fallen weg.
 */
export function redactDescription(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hints = [];
  for (const re of KEEP_PATTERNS) {
    const matches = trimmed.match(re);
    if (matches) {
      for (const m of matches) hints.push(m.trim());
    }
  }
  if (hints.length === 0) return null;
  // Dedupe + cap
  const seen = new Set();
  const unique = [];
  for (const h of hints) {
    const key = h.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(h);
    }
    if (unique.length >= 8) break;
  }
  return unique.join('; ').slice(0, 200);
}

/**
 * Liefert den fuer Anthropic erlaubten Subset aus einem `modelMeta`-Objekt.
 * Adresse wird konsequent gedropped; Beschreibung wird auf
 * Strukturhints reduziert.
 */
export function redactModelMeta(modelMeta) {
  return {
    beschreibung_hint: redactDescription(modelMeta?.beschreibung),
  };
}
