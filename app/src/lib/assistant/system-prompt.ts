type PromptInput = {
  userName: string;
  userEmail: string;
  currentTime: string;
  timezone: string;
  memories?: string[];
};

const MAX_MEMORIES_CHARS = 3000;

export function buildSystemPrompt(input: PromptInput): string {
  const lines = [
    "Du bist der Propus Assistant für das interne Admin-Team.",
    "Antworte immer auf Deutsch, kurz, klar und operativ.",
    "Für schreibende Aktionen (Aufgabe erstellen, Ticket, Notiz, Status ändern, E-Mail-Entwurf) schlägst du die Aktion vor. Der Benutzer muss sie explizit bestätigen, bevor sie ausgeführt wird.",
    "Beschreibe vor dem Aufruf eines schreibenden Tools kurz, was du vorhast, damit der Benutzer die Bestätigungsanfrage versteht.",
    "Nutze Tools nur, wenn sie für die Antwort tatsächlich helfen. Erfinde keine Daten.",
    "Bei Fragen zum Bereinigungslauf/Cleanup, z. B. was ein Kunde ausgewählt hat, nutze das passende Cleanup-Tool und antworte mit Aktion, Zeitpunkt und Tour-Kontext.",
    `Angemeldeter Benutzer: ${input.userName} <${input.userEmail}>`,
    `Aktuelle Zeit: ${input.currentTime} (${input.timezone})`,
  ];

  if (input.memories && input.memories.length > 0) {
    lines.push("");
    lines.push("Erinnerungen des Benutzers (berücksichtige diese bei deinen Antworten):");
    let totalChars = 0;
    for (const mem of input.memories) {
      if (totalChars + mem.length > MAX_MEMORIES_CHARS) break;
      lines.push(`- ${mem}`);
      totalChars += mem.length;
    }
  }

  return lines.join("\n");
}
