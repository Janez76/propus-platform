import { tokenizeForMatch } from "@/lib/assistant/memory-store";

export type FewShot = {
  id: string;
  user: string;
  assistantToolPlan: string;
  assistantFinal: string;
  tags: string[];
};

/**
 * Kuratierte Muster (kein exakter Chat-Export) — Stil, Tool-Reihenfolge, Ton.
 *
 * Ab Migration 059 dient diese Liste als **Default-Seed** für die DB-Tabelle
 * `tour_manager.assistant_few_shots`. Im Live-Betrieb mischt
 * `selectFewShotsAsync()` (siehe `few-shot-loader.ts`) DB-Einträge **vor** diese
 * Code-Defaults ein, damit die Trainer-UI ohne Deploy neue Beispiele aktivieren
 * kann.
 */
export const FEW_SHOTS: FewShot[] = [
  {
    id: "typo-search",
    user: "Hat poleti noch offene Rechnungen?",
    assistantToolPlan:
      "Mehrere Suchvarianten: Kunde mit Tippfehler (poleti → polletti) via search_customers, dann search_invoices.",
    assistantFinal:
      "Kurz: Treffer nennen, Betrag/Status — ohne Tool-Namen in der Antwort.",
    tags: ["tippfehler", "rechnung", "suche"],
  },
  {
    id: "multi-tool",
    user: "Was ist der Status von Tour 42 und wie heisst der Kunde?",
    assistantToolPlan: "get_tour_detail oder get_tour_status für Tour 42; ggf. get_customer_detail wenn ID aus Tour.",
    assistantFinal: "Status und Kundenname aus den Tool-Ergebnissen, kompakt.",
    tags: ["tour", "kunde", "kombination"],
  },
  {
    id: "no-regreet",
    user: "Und der nächste Termin?",
    assistantToolPlan:
      "Keine Begrüssung — direkt get_today_schedule / get_open_orders je nach Kontext.",
    assistantFinal: "Nur die Antwort auf die Frage, ohne Hallo/Guten Morgen.",
    tags: ["dialog", "kein hallo"],
  },
  {
    id: "email-direct",
    user: "Schreib an info@firma.ch wegen Tour-Verlängerung",
    assistantToolPlan: "send_email mit Entwurf — keine Rückfrage nach Hilfsangebot.",
    assistantFinal: "E-Mail-Entwurf zur Bestätigung, sachlich.",
    tags: ["email", "direkt"],
  },
  {
    id: "order-slotfill",
    user: "Neuer Auftrag für Müller AG, Adresse Bahnhofstrasse 1 Zürich, nur Fotografie",
    assistantToolPlan:
      "search_customers (Müller), list_available_services, validate_booking_order — fehlende Slots nachfragen.",
    assistantFinal: "Nächste fehlende Information oder Zusammenfassung zur Bestätigung.",
    tags: ["auftrag", "booking"],
  },
  {
    id: "weather-honest-ch",
    user: "Wie wird das Wetter morgen in Bern?",
    assistantToolPlan:
      "get_weather_forecast mit zip (3011 oder andere Bern-PLZ) oder Koordinaten — nur Zahlen/Wetterart aus der Tool-Antwort; für Warnungen kurz meteoschweiz.admin.ch erwähnen.",
    assistantFinal:
      "Konkrete Min/Max und Beschreibung aus dem Tool-Ergebnis für Bern — keine erfundenen Werte. Für amtliche Unwetterwarnungen: https://www.meteoschweiz.admin.ch.",
    tags: ["wetter", "schweiz"],
  },
  {
    id: "routing-honest-ch",
    user: "Wie weit ist es von der Albisstrasse Zürich nach Mettmenstetten?",
    assistantToolPlan:
      "get_route oder get_distance_matrix mit origin/destination — Distanz und Dauer aus Tool-Ergebnis; nur bei Tool-Fehler Schätzung aus Prompt-Referenzband plus Karten-App.",
    assistantFinal:
      "Distanz und Fahrzeit aus dem Routing-Tool wiedergeben. Schlägt das Tool fehl: grob ca. 25–30 km / ~35–40 Min von der Albisstrasse Richtung Mettmenstetten (8932) als Schätzung; genaue Route: Maps.",
    tags: ["routing", "distanz", "fahrtzeit", "km", "auto", "zürich", "mettmenstetten"],
  },
  {
    id: "smalltalk-no-tools",
    user: "Danke, das reicht mir!",
    assistantToolPlan: "Keine Tools nötig.",
    assistantFinal: "Kurze höfliche Antwort, kein Tool.",
    tags: ["smalltalk", "ohne tools"],
  },
  {
    id: "correction",
    user: "Nein, ich meinte Tour 43, nicht 42.",
    assistantToolPlan: "Auf Korrektur beziehen, erneut passendes Tour-Tool mit 43.",
    assistantFinal: "Bestätigt die Korrektur und liefert Daten zu Tour 43.",
    tags: ["korrektur", "kontext"],
  },
  {
    id: "next-order-future-only",
    user: "Was ist mein nächster Auftrag?",
    assistantToolPlan:
      "get_open_orders mit days_ahead=30 (Default-Filter blendet vergangene Termine aus). Wenn count=0, einmal mit days_ahead=90 nachreichen bevor 'kein Auftrag' geantwortet wird.",
    assistantFinal:
      "Ersten zukünftigen Auftrag aus dem Tool-Ergebnis nennen (Datum, Adresse, Kunde). Vergangene/überfällige Termine NICHT als 'nächster' bezeichnen — wenn der User explizit 'überfällig' fragt, separates Tool-Call mit include_overdue_days.",
    tags: ["auftrag", "nächster", "zukunft", "open"],
  },
  {
    id: "overdue-orders",
    user: "Welche Aufträge sind überfällig?",
    assistantToolPlan:
      "get_open_orders mit include_overdue_days=14 und days_ahead=0 — zeigt alle Aufträge mit Termin in den letzten 14 Tagen die noch nicht abgeschlossen sind.",
    assistantFinal:
      "Liste der überfälligen Aufträge mit Anzahl Tage Rückstand pro Eintrag.",
    tags: ["auftrag", "überfällig", "rückstand", "open"],
  },
  {
    id: "weather-future-order",
    user: "Wetter am 12. Mai für den Auftrag in Oberrohrdorf?",
    assistantToolPlan:
      "Erst get_weather_for_order (nutzt Auftragsadresse + Termin). Falls 'kein Wert' wegen Horizont (>15 Tage), zurückfallen auf get_weather_forecast mit der PLZ und days passend zur Distanz zum Termin (z.B. days=5 wenn Termin in 4 Tagen).",
    assistantFinal:
      "Min/Max + Bewölkung + Niederschlag aus Tool-Result. Wenn beide Tools nichts liefern weil Termin >15 Tage entfernt, ehrlich sagen 'kommt näher zum Termin'.",
    tags: ["wetter", "auftrag", "termin", "vorhersage"],
  },
];

function fewShotMatchText(fs: FewShot): string {
  return [fs.user, ...fs.tags, fs.assistantToolPlan, fs.assistantFinal].join(" ");
}

/**
 * Wählt bis zu k Few-Shots aus einer Liste per Token-Overlap.
 * Exportiert für `few-shot-loader.ts`, der DB- und Code-Liste mischt.
 */
export function rankFewShots(pool: FewShot[], userMessage: string, k = 3): FewShot[] {
  const tokens = tokenizeForMatch(userMessage);
  const scored = pool.map((fs) => {
    const bodyTokens = tokenizeForMatch(fewShotMatchText(fs));
    let score = 0;
    for (const t of tokens) {
      if (bodyTokens.has(t)) score += 1;
    }
    return { fs, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.fs.id.localeCompare(b.fs.id);
  });
  const picked: FewShot[] = [];
  const seen = new Set<string>();
  for (const { fs } of scored) {
    if (seen.has(fs.id)) continue;
    picked.push(fs);
    seen.add(fs.id);
    if (picked.length >= k) break;
  }
  if (picked.length < k) {
    for (const fs of pool) {
      if (seen.has(fs.id)) continue;
      picked.push(fs);
      seen.add(fs.id);
      if (picked.length >= k) break;
    }
  }
  return picked.slice(0, k);
}

/**
 * Wählt bis zu k Few-Shots per Token-Overlap zur Nutzernachricht (wie Erinnerungs-Ranking).
 *
 * Sync-Variante über die Code-Defaults — wird vom Eval-Skript und Tests genutzt.
 * Im Server-Pfad bevorzugt `selectFewShotsAsync()` aus `few-shot-loader.ts`,
 * das die DB-Einträge mit einbezieht.
 */
export function selectFewShots(userMessage: string, k = 3): FewShot[] {
  const tokens = tokenizeForMatch(userMessage);
  const scored = FEW_SHOTS.map((fs) => {
    const bodyTokens = tokenizeForMatch(fewShotMatchText(fs));
    let score = 0;
    for (const t of tokens) {
      if (bodyTokens.has(t)) score += 1;
    }
    return { fs, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.fs.id.localeCompare(b.fs.id);
  });

  const picked: FewShot[] = [];
  const seen = new Set<string>();
  for (const { fs } of scored) {
    if (seen.has(fs.id)) continue;
    picked.push(fs);
    seen.add(fs.id);
    if (picked.length >= k) break;
  }

  if (picked.length < k) {
    for (const fs of FEW_SHOTS) {
      if (seen.has(fs.id)) continue;
      picked.push(fs);
      seen.add(fs.id);
      if (picked.length >= k) break;
    }
  }

  return picked.slice(0, k);
}
