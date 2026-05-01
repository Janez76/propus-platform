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
    assistantToolPlan: "Keine Wetter-API — ehrlich auf Unsicherheit/Live-Daten hinweisen.",
    assistantFinal:
      "Kein Live-Wetter im Chat; für Bern und die Schweiz: Wetter bitte auf https://www.meteoschweiz.admin.ch prüfen (offizielle Vorhersage und Warnungen). Keine erfundenen Zahlen.",
    tags: ["wetter", "schweiz"],
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
];

function fewShotMatchText(fs: FewShot): string {
  return [fs.user, ...fs.tags, fs.assistantToolPlan, fs.assistantFinal].join(" ");
}

/**
 * Wählt bis zu k Few-Shots per Token-Overlap zur Nutzernachricht (wie Erinnerungs-Ranking).
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
