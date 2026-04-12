/**
 * Server-side Actions für Rechnungsversand mit Payrexx-Integration.
 *
 * - createPayrexxLinkForRechnung: Erstellt einen Payrexx Payment Gateway Link
 * - sendeRechnung: Versendet eine Rechnung per E-Mail (mit optionalem Payrexx-Button)
 *
 * Hinweis: Diese Funktionen setzen eine `dokumente`-Tabelle voraus.
 * Solange diese nicht existiert, können sie als Referenz-Implementierung dienen
 * und müssen an die tatsächliche Datenstruktur angepasst werden.
 */

import { query, queryOne } from "./db";
import { createPayrexxGateway, getActivePaymentMethods } from "./payrexx";
import { buildRechnungsEmail } from "./email-templates/rechnung-versand";
import type { NummernkreisTyp } from "../types/finanzEinstellungen";

interface RechnungRow {
  id: string;
  nummer: string;
  typ: string;
  total: string;
  bereits_bezahlt: string | null;
  waehrung: string;
  faellig_am: string | null;
  payrexx_gateway_id: number | null;
  payrexx_gateway_hash: string | null;
  payrexx_link: string | null;
  payrexx_status: string | null;
  kunde_name: string | null;
  kunde_email: string | null;
  firma_name: string | null;
}

interface FinanzRow {
  iban: string | null;
  email_absender: string | null;
  firmenname: string;
  strasse: string | null;
  plz_ort: string | null;
  payrexx_aktiv: boolean;
  payrexx_twint: boolean;
  payrexx_karte: boolean;
  payrexx_postfinance: boolean;
  payrexx_paypal: boolean;
}

/**
 * Erstellt einen Payrexx Payment-Link für eine Rechnung.
 * Gibt einen bestehenden aktiven Link zurück falls vorhanden.
 */
export async function createPayrexxLinkForRechnung(
  rechnungId: string,
): Promise<{ link: string; gatewayId: number; hash: string }> {
  const rechnung = await queryOne<RechnungRow>(
    `SELECT d.*, k.name as kunde_name, k.email as kunde_email, f.name as firma_name
     FROM dokumente d
     LEFT JOIN core.customers k ON k.id = d.customer_id
     LEFT JOIN core.companies f ON f.id = d.company_id
     WHERE d.id = $1`,
    [rechnungId],
  );

  if (!rechnung) throw new Error("Rechnung nicht gefunden");
  if (rechnung.typ !== "rechnung" && rechnung.typ !== "teilrechnung") {
    throw new Error("Nur Rechnungen können mit Payrexx verknüpft werden");
  }

  // Bestehenden Gateway wiederverwenden falls noch aktiv
  if (rechnung.payrexx_link && rechnung.payrexx_status === "waiting") {
    return {
      link: rechnung.payrexx_link,
      gatewayId: rechnung.payrexx_gateway_id!,
      hash: rechnung.payrexx_gateway_hash!,
    };
  }

  const settings = await queryOne<FinanzRow>("SELECT * FROM core.finanz_einstellungen LIMIT 1");
  if (!settings?.payrexx_aktiv) throw new Error("Payrexx ist nicht aktiviert");

  const offenBetrag = Number(rechnung.total) - Number(rechnung.bereits_bezahlt ?? 0);

  const gateway = await createPayrexxGateway({
    amount: offenBetrag,
    currency: rechnung.waehrung ?? "CHF",
    referenceId: rechnung.nummer,
    purposeText: `Propus Rechnung ${rechnung.nummer}`,
    expiresIn: 60 * 60 * 24 * 30, // 30 Tage
    email: rechnung.kunde_email ?? undefined,
    company: rechnung.firma_name ?? undefined,
    paymentMethods: getActivePaymentMethods(settings),
  });

  // Dokument updaten
  await query(
    `UPDATE dokumente SET
      payrexx_gateway_id = $1,
      payrexx_gateway_hash = $2,
      payrexx_link = $3,
      payrexx_status = 'waiting'
    WHERE id = $4`,
    [gateway.id, gateway.hash, gateway.link, rechnungId],
  );

  // Zahlungs-Log-Eintrag
  await query(
    `INSERT INTO core.zahlungen (dokument_id, payrexx_id, payrexx_hash, status, betrag, currency, referenz)
     VALUES ($1, $2, $3, 'waiting', $4, $5, $6)`,
    [rechnungId, gateway.id, gateway.hash, offenBetrag, rechnung.waehrung ?? "CHF", rechnung.nummer],
  );

  return gateway;
}

/**
 * Versendet eine Rechnung per E-Mail.
 * Erstellt automatisch einen Payrexx-Link falls aktiviert.
 */
export async function sendeRechnung(
  rechnungId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const rechnung = await queryOne<RechnungRow>(
      `SELECT d.*, k.name as kunde_name, k.email as kunde_email, f.name as firma_name
       FROM dokumente d
       LEFT JOIN core.customers k ON k.id = d.customer_id
       LEFT JOIN core.companies f ON f.id = d.company_id
       WHERE d.id = $1`,
      [rechnungId],
    );

    if (!rechnung) return { success: false, error: "Rechnung nicht gefunden" };
    if (!rechnung.kunde_email) return { success: false, error: "Keine E-Mail-Adresse vorhanden" };

    const settings = await queryOne<FinanzRow>("SELECT * FROM core.finanz_einstellungen LIMIT 1");
    if (!settings) return { success: false, error: "Finanz-Einstellungen nicht gefunden" };

    // Payrexx Link erstellen falls aktiviert
    let payrexxLink: string | undefined;
    if (settings.payrexx_aktiv) {
      try {
        const gw = await createPayrexxLinkForRechnung(rechnungId);
        payrexxLink = gw.link;
      } catch (e) {
        console.warn("Payrexx Link konnte nicht erstellt werden:", e);
        // E-Mail wird trotzdem gesendet, nur ohne Payrexx-Button
      }
    }

    const betragFormatiert = new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: rechnung.waehrung ?? "CHF",
    }).format(Number(rechnung.total));

    const faelligAm = rechnung.faellig_am
      ? new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "long", year: "numeric" }).format(
          new Date(rechnung.faellig_am),
        )
      : "30 Tage nach Rechnungsdatum";

    const _html = buildRechnungsEmail({
      empfaengerName: rechnung.firma_name ?? rechnung.kunde_name ?? "Kunde",
      rechnungsNummer: rechnung.nummer,
      betrag: betragFormatiert,
      faelligAm,
      iban: settings.iban ?? "",
      referenz: rechnung.nummer,
      absenderName: settings.firmenname,
      absenderAdresse: settings.plz_ort ?? "",
      absenderEmail: settings.email_absender ?? "rechnung@propus.ch",
      payrexxLink,
    });

    // E-Mail senden — hier den bestehenden Mailer einbinden.
    // Beispiel mit nodemailer (bereits als Dependency vorhanden):
    //
    // const transporter = nodemailer.createTransport({ ... });
    // await transporter.sendMail({
    //   from: settings.email_absender ?? "rechnung@propus.ch",
    //   to: rechnung.kunde_email,
    //   subject: `Rechnung ${rechnung.nummer} — ${betragFormatiert}`,
    //   html: _html,
    //   attachments: [{ filename: `${rechnung.nummer}.pdf`, content: pdfBuffer }],
    // });
    //
    // TODO: PDF-Generierung (pdfkit + swissqrbill sind bereits installiert)
    // TODO: E-Mail-Versand über bestehenden Mailer

    // Status updaten
    await query("UPDATE dokumente SET status = 'gesendet', updated_at = now() WHERE id = $1", [rechnungId]);

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("sendeRechnung:", err);
    return { success: false, error: message };
  }
}
