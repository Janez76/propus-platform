/**
 * Utility-Funktionen für das Finanz- & Dokumenten-Modul.
 * - generateDokumentNummer: Erzeugt fortlaufende Dokumentnummern
 * - checkPermission: Prüft Berechtigungen gegen Finanz-Einstellungen
 */

import { query, queryOne, withTransaction } from "./db";
import type { NummernkreisTyp, BerechtigungKey } from "../types/finanzEinstellungen";

/**
 * Erzeugt eine neue Dokumentnummer im Format PREFIX-JAHR-NNN
 * und inkrementiert den Zähler atomar.
 *
 * Beispiel: generateDokumentNummer("rechnung") → "RE-2026-042"
 */
export async function generateDokumentNummer(typ: NummernkreisTyp): Promise<string> {
  return withTransaction(async (client) => {
    // Row-Lock um Race-Conditions zu vermeiden
    const res = await client.query(
      "SELECT id, nummernkreise FROM core.finanz_einstellungen LIMIT 1 FOR UPDATE",
    );
    const row = res.rows[0];
    if (!row) throw new Error("Keine Finanz-Einstellungen gefunden");

    const nk = (row.nummernkreise as Record<string, { prefix: string; naechste: number }>)[typ];
    if (!nk) throw new Error(`Nummernkreis für "${typ}" nicht konfiguriert`);

    const jahr = new Date().getFullYear();
    const nummer = `${nk.prefix}-${jahr}-${String(nk.naechste).padStart(3, "0")}`;

    // Zähler inkrementieren
    const updated = {
      ...row.nummernkreise,
      [typ]: { ...nk, naechste: nk.naechste + 1 },
    };

    await client.query("UPDATE core.finanz_einstellungen SET nummernkreise = $1 WHERE id = $2", [
      JSON.stringify(updated),
      row.id,
    ]);

    return nummer;
  });
}

/**
 * Prüft ob eine Rolle eine bestimmte Aktion ausführen darf.
 * Super Admin ist immer berechtigt.
 */
export async function checkPermission(
  rolle: "super_admin" | "admin" | "fotograf",
  aktion: BerechtigungKey,
): Promise<boolean> {
  if (rolle === "super_admin") return true;

  const row = await queryOne<{ berechtigungen: Record<string, Record<string, boolean>> }>(
    "SELECT berechtigungen FROM core.finanz_einstellungen LIMIT 1",
  );
  if (!row) return false;

  return row.berechtigungen[aktion]?.[rolle] ?? false;
}

/**
 * Lädt die Finanz-Einstellungen als flaches Objekt.
 * Hilfsfunktion für serverseitige Logik (nicht für API-Responses).
 */
export async function getFinanzSettings(): Promise<Record<string, unknown> | null> {
  return queryOne("SELECT * FROM core.finanz_einstellungen LIMIT 1");
}
