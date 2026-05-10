// Click-Antworten ("Suggestion Chips") fuer den Propi-Chat.
//
// Convention: der Bot haengt am Ende seiner Antwort einen Marker an, z. B.
//
//   Wer ist der Auftraggeber?
//   [[OPTIONS: Annette Doerfel | Bruno Iemmello | Cvacho Jordan]]
//
// Der Marker wird im UI ausgeblendet und stattdessen als Button-Reihe gerendert.
// Klick → Text wird als naechste User-Message gesendet.

const OPTIONS_MARKER = /\n*\[\[OPTIONS:\s*([^\]]+)\]\]\s*$/;

export type SuggestionExtraction = {
  /** Bot-Text ohne den Marker, fuer die Anzeige. */
  displayContent: string;
  /** Geparste Optionen, in Reihenfolge. Leeres Array wenn kein Marker. */
  suggestions: string[];
};

export function extractSuggestions(content: string): SuggestionExtraction {
  if (!content) return { displayContent: content, suggestions: [] };
  const match = content.match(OPTIONS_MARKER);
  if (!match) return { displayContent: content, suggestions: [] };
  const raw = match[1] || "";
  const suggestions = raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    // Caps gegen ueberlange/zu viele Chips, die das Layout sprengen wuerden.
    .slice(0, 8)
    .map((s) => (s.length > 80 ? s.slice(0, 77) + "..." : s));
  return {
    displayContent: content.replace(OPTIONS_MARKER, "").trimEnd(),
    suggestions,
  };
}
