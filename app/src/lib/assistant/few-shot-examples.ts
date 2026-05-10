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

/**
 * Gepflegter Stichwort-Katalog zu den Code-Defaults (ID → Synonyme/Topics).
 * Dient Dokumentation, Seeds und Abgleich; die gleichen Stichwörter stehen in
 * jedem Shot unter `tags` und fliessen zusätzlich über `fewShotMatchText()` ins Ranking.
 *
 * typo-search · tippfehler, rechnung, suche
 * multi-tool · tour, kunde, kombination
 * no-regreet · dialog, kein hallo
 * email-direct · email, direkt
 * order-slotfill · auftrag, booking
 * weather-honest-ch · wetter, schweiz
 * routing-honest-ch · routing, distanz, fahrtzeit, km, auto, zürich, mettmenstetten
 * smalltalk-no-tools · smalltalk, ohne tools
 * correction · korrektur, kontext
 * next-order-future-only · auftrag, nächster, zukunft, open
 * overdue-orders · auftrag, überfällig, rückstand, open
 * weather-future-order · wetter, auftrag, termin, vorhersage
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
    id: "order-explicit-product-codes",
    user: "Auftrag CSL, Attenhoferstrasse 37 Jona, 100m², 20 Bodenfotos, 8 Luftaufnahmen, 360° Tour, 2D Grundriss von Tour, Schlüsselabholung am Empfang CSL, deadline 20.05.",
    assistantToolPlan:
      "search_customers, list_available_services → ALLE genannten Services dort suchen, auch Schlüsselabholung (Code `keypickup:main`). Codes: camera:foto20, dronePhoto:foto8, tour:main, floorplans:tour, keypickup:main. create_order mit service_items=[{code:'camera:foto20'},{code:'dronePhoto:foto8'},{code:'tour:main'},{code:'floorplans:tour'},{code:'keypickup:main'}], key_pickup={address:'Empfang CSL'}, area_sqm=100, floors=1, booking_kind='flexible', deadline_at='2026-05-20'. KEINE services-Booleans, KEINE Schluessel-Notiz im notes-Feld — Schluessel ist eigene Position MIT Preis und eigenem keyPickup-Block.",
    assistantFinal:
      "Zusammenfassung mit echten Positionen + berechnetem Total CHF aus dem Produktkatalog (Subtotal/MwSt/Total), Schluesselabholung als eigene Position mit Adresse, und Hinweis dass Office den Termin innerhalb des Zeitraums disponiert.",
    tags: ["auftrag", "booking", "service_items", "produktcode", "pricing", "schluessel", "keypickup"],
  },
  {
    id: "order-flex-deadline",
    user: "Auftrag für CSL, Termin offen, wir disponieren — bis spätestens 20. Mai",
    assistantToolPlan:
      "search_customers (CSL), Adresse + Services klären, dann create_order mit booking_kind='flexible', deadline_at='2026-05-20'. KEIN schedule_date setzen. Status startet auf 'disposition_offen'.",
    assistantFinal:
      "Zusammenfassung mit Buchungsart 'Flexibel mit Deadline 20.05.', Hinweis dass Office den Termin innerhalb des Zeitraums disponiert. Bestätigung einholen, dann create_order aufrufen.",
    tags: ["auftrag", "booking", "flexibel", "deadline", "disposition", "termin offen"],
  },
  {
    id: "order-flex-no-date-fallback",
    user: "lege Auftrag an, Termin haben wir noch nicht",
    assistantToolPlan:
      "Keinen Platzhalter-Datum erfinden. Stattdessen booking_kind='flexible' anbieten und nach Deadline (spätestes Datum) fragen. Optional flexible_earliest_at erfragen. Erst nach Bestätigung create_order aufrufen.",
    assistantFinal:
      "Frage: 'Bis wann muss die Aufnahme spätestens stattfinden? Ich lege den Auftrag dann als Flexibel mit Deadline an — Office disponiert den genauen Termin innerhalb des Zeitraums.'",
    tags: ["auftrag", "booking", "kein termin", "flexibel", "deadline"],
  },
  {
    id: "order-multiple-contacts-ask",
    user: "Auftrag für CSL Immobilien, Attenhoferstrasse 37 Jona, Bodenfotos + Tour",
    assistantToolPlan:
      "search_customers (CSL) → contactNames zeigt mehrere Eintraege. get_customer_contacts(customer_id) für Liste mit E-Mails. NICHT stillschweigend den primären Kontakt nehmen — explizit nachfragen welcher Kontakt der Auftraggeber ist. Den gewählten Kontakt im notes-Feld von create_order festhalten, damit Office im Detail nachvollziehen kann (Tool persistiert keine contact_id).",
    assistantFinal:
      "Frage: 'Bei CSL Immobilien sind mehrere Kontakte hinterlegt — Annette, Cvacho Jordan, Iemmello. Wer ist der Auftraggeber für diese Aufnahme?' Erst nach Antwort weiter mit Services + Buchungsart.",
    tags: ["auftrag", "booking", "kontaktperson", "kontakt", "ruckfrage"],
  },
  {
    id: "order-skip-customer-mail",
    user: "Auftrag CSL Attenhoferstrasse 37 anlegen, aber keine Mail an den Kunden",
    assistantToolPlan:
      "Normalflow (search_customers, list_available_services, Adresse + Buchungsart). Beim create_order zusaetzlich `skip_customer_email: true` setzen. Office-Mail bleibt automatisch, damit Office den Auftrag sieht.",
    assistantFinal:
      "Zusammenfassung mit Hinweis 'Kunde bekommt KEINE Bestaetigungsmail (auf deinen Wunsch)' und Bestaetigung einholen. Nach create_order: 'Auftrag #X angelegt, Office wurde informiert, Kunde bekam keine Mail.'",
    tags: ["auftrag", "booking", "skip mail", "kein versand", "test", "ohne kundenmail"],
  },
  {
    id: "order-unknown-service-ask",
    user: "Auftrag CSL, 20 Bodenfotos und ein Rendering 3 Bilder dazu",
    assistantToolPlan:
      "list_available_services prüfen → camera:foto20 ist da, 'Rendering' nicht. NICHT in notes verstecken, NICHT services-Booleans nutzen. Den Nutzer fragen welcher Preis fürs Rendering. Nach Preisangabe create_order mit service_items=[{code:'camera:foto20'}] UND custom_items=[{label:'Rendering 3 Bilder', price:<vom Nutzer>, qty:1}].",
    assistantFinal:
      "Frage: 'Rendering 3 Bilder finde ich nicht im Produktkatalog (camera:foto20 für die Fotos hab ich). Soll ich Rendering als manuelle Position aufnehmen — und zu welchem Preis pro Stück? Den nehme ich dann mit in die Auftrags-Position auf, damit Office den Total inkl. MwSt sieht.'",
    tags: ["auftrag", "booking", "custom_items", "manuelle position", "rendering", "ruckfrage", "pricing"],
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
  {
    id: "report-overdue-invoices",
    user: "Welche Rechnungen sind überfällig?",
    assistantToolPlan:
      "propus_report mit report=invoices_overdue_summary — oder bei Detailzugriff get_overdue_invoices / search_invoices nach Kontext.",
    assistantFinal:
      "Betrag und Liste nur aus Tool-Daten; keine erfundenen Zahlen.",
    tags: ["report", "propus_report", "rechnung", "überfällig"],
  },
  {
    id: "report-week-orders",
    user: "Welche Aufträge sind diese Woche geplant?",
    assistantToolPlan:
      "propus_report orders_week_calendar oder get_open_orders je nach gewünschter Tiefe.",
    assistantFinal:
      "Termine kompakt aus dem Tool-Ergebnis.",
    tags: ["report", "propus_report", "auftrag", "woche"],
  },
  {
    id: "report-no-query-database-shortcut",
    user: "Welche Benutzer haben Admin-Rechte?",
    assistantToolPlan:
      "propus_report admin_users_roles — nicht query_database für dieselbe Auswertung.",
    assistantFinal:
      "Nur bei Erfolg ausgeben; bei Berechtigungsfehler die Tool-Meldung ehrlich weitergeben.",
    tags: ["report", "admin", "rollen", "berechtigung"],
  },
  {
    id: "report-top-customers",
    user: "Wer sind unsere Umsatz-Top-Kunden?",
    assistantToolPlan: "propus_report customers_top_volume (limit aus Parameter oder Default).",
    assistantFinal: "Rangliste nur aus Tool-Zeilen.",
    tags: ["report", "kunden", "umsatz"],
  },
  {
    id: "report-platform-activity",
    user: "Was hat sich auf der Plattform in den letzten 24 Stunden geändert?",
    assistantToolPlan:
      "propus_report platform_activity_24h (Admin-Tier) oder get_recent_posteingang_messages wenn der Fokus Posteingang ist.",
    assistantFinal: "Zusammenfassung aus Tool-Daten, ohne zu raten.",
    tags: ["report", "aktivität", "audit"],
  },
  {
    id: "report-region-open-orders",
    user: "Zeig mir offene Aufträge im Kanton Zürich.",
    assistantToolPlan:
      "propus_report orders_region_search mit region=Zürich oder search_orders mit sinnvollem Filter.",
    assistantFinal: "Trefferliste aus Tools; wenn leer, klar kommunizieren.",
    tags: ["report", "region", "auftrag", "zürich"],
  },
];

/** Stichworte je Few-Shot-ID für Doku, Seeds, externe Tools — spiegelt `FEW_SHOTS[].tags`. */
export const FEW_SHOT_KNOWLEDGE_BY_ID: Record<string, readonly string[]> = Object.fromEntries(
  FEW_SHOTS.map((f) => [f.id, f.tags] as const),
);

/** Textbasis für Keyword-Overlap: inkl. Slug-Wörter (z. B. typo-search → „typo search“). */
function fewShotMatchText(fs: FewShot): string {
  const slugWords = fs.id.replace(/-/g, " ");
  return [fs.user, ...fs.tags, slugWords, fs.assistantToolPlan, fs.assistantFinal].join(" ");
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
