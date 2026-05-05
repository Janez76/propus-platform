/**
 * Server-seitiger Few-Shot-Loader: mischt DB-Einträge (live, ohne Deploy
 * änderbar via Trainer-UI) mit Code-Defaults und rankt sie wie bisher.
 *
 * Falls die DB-Abfrage fehlschlägt (Tabelle existiert noch nicht, kurzer
 * Connection-Loss), fällt der Loader stillschweigend auf die Code-Defaults
 * zurück — der Assistant antwortet weiter, nur ohne Live-Beispiele.
 */
import { FEW_SHOTS, rankFewShots, type FewShot } from "@/lib/assistant/few-shot-examples";
import { ensureFewShotSeed, listActiveFewShotsFromDb } from "@/lib/assistant/training-store";

export async function selectFewShotsAsync(userMessage: string, k = 3): Promise<FewShot[]> {
  let dbShots: FewShot[] = [];
  try {
    // beim ersten Aufruf pro Prozess: Code-Defaults seeden falls Tabelle leer
    await ensureFewShotSeed(FEW_SHOTS);
    const rows = await listActiveFewShotsFromDb();
    dbShots = rows.map((r) => ({
      id: r.id,
      user: r.user,
      assistantToolPlan: r.assistantToolPlan,
      assistantFinal: r.assistantFinal,
      tags: r.tags ?? [],
    }));
  } catch (err) {
    console.warn("[few-shot-loader] DB-Read fehlgeschlagen, fallback auf Code-Defaults:", err);
  }

  // DB hat Vorrang: gleiche slug überschreibt Code-Default
  const seen = new Set<string>();
  const merged: FewShot[] = [];
  for (const s of dbShots) {
    if (seen.has(s.id)) continue;
    merged.push(s);
    seen.add(s.id);
  }
  for (const s of FEW_SHOTS) {
    if (seen.has(s.id)) continue;
    merged.push(s);
    seen.add(s.id);
  }

  return rankFewShots(merged, userMessage, k);
}
