import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "../../../lib/db";
import { getTokenFromRequest } from "../../../lib/auth";
import { FINANZ_DEFAULTS } from "../../../types/finanzEinstellungen";
import type { FinanzEinstellungenData } from "../../../types/finanzEinstellungen";

function mapRow(row: Record<string, unknown>): FinanzEinstellungenData {
  return {
    id: String(row.id ?? ""),
    firmenname: String(row.firmenname ?? ""),
    uid: row.uid as string | null,
    strasse: row.strasse as string | null,
    plzOrt: row.plz_ort as string | null,
    iban: row.iban as string | null,
    bankname: row.bankname as string | null,
    emailAbsender: row.email_absender as string | null,
    telefon: row.telefon as string | null,
    mwstSatz: Number(row.mwst_satz ?? 8.1),
    zahlungsfristTage: Number(row.zahlungsfrist_tage ?? 30),
    waehrung: (row.waehrung as "CHF" | "EUR") ?? "CHF",
    sprache: (row.sprache as "de_CH" | "en") ?? "de_CH",
    standardNotiz: row.standard_notiz as string | null,
    standardFussnote: row.standard_fussnote as string | null,
    nummernkreise: (row.nummernkreise as FinanzEinstellungenData["nummernkreise"]) ?? FINANZ_DEFAULTS.nummernkreise,
    aktiveTypen: (row.aktive_typen as FinanzEinstellungenData["aktiveTypen"]) ?? FINANZ_DEFAULTS.aktiveTypen,
    berechtigungen: (row.berechtigungen as FinanzEinstellungenData["berechtigungen"]) ?? FINANZ_DEFAULTS.berechtigungen,
    logoUrl: row.logo_url as string | null,
    akzentfarbe: String(row.akzentfarbe ?? "#B68E20"),
    qrCodeAktiv: row.qr_code_aktiv !== false,
    unterschriftsfeld: row.unterschriftsfeld !== false,
    fotografAufDokument: row.fotograf_auf_dokument === true,
    payrexxAktiv: row.payrexx_aktiv === true,
    payrexxTwint: row.payrexx_twint !== false,
    payrexxKarte: row.payrexx_karte !== false,
    payrexxPostfinance: row.payrexx_postfinance !== false,
    payrexxPaypal: row.payrexx_paypal === true,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    updatedBy: row.updated_by as string | null,
  };
}

export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const row = await queryOne("SELECT * FROM core.finanz_einstellungen LIMIT 1");
    const data = row ? mapRow(row) : FINANZ_DEFAULTS;
    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Check if row exists
    const existing = await queryOne<{ id: string }>("SELECT id FROM core.finanz_einstellungen LIMIT 1");

    if (existing) {
      await query(
        `UPDATE core.finanz_einstellungen SET
          firmenname = $1,
          uid = $2,
          strasse = $3,
          plz_ort = $4,
          iban = $5,
          bankname = $6,
          email_absender = $7,
          telefon = $8,
          mwst_satz = $9,
          zahlungsfrist_tage = $10,
          waehrung = $11,
          sprache = $12,
          standard_notiz = $13,
          standard_fussnote = $14,
          nummernkreise = $15,
          aktive_typen = $16,
          berechtigungen = $17,
          logo_url = $18,
          akzentfarbe = $19,
          qr_code_aktiv = $20,
          unterschriftsfeld = $21,
          fotograf_auf_dokument = $22,
          payrexx_aktiv = $23,
          payrexx_twint = $24,
          payrexx_karte = $25,
          payrexx_postfinance = $26,
          payrexx_paypal = $27,
          updated_at = now()
        WHERE id = $28`,
        [
          body.firmenname ?? "",
          body.uid ?? null,
          body.strasse ?? null,
          body.plzOrt ?? null,
          body.iban ?? null,
          body.bankname ?? null,
          body.emailAbsender ?? null,
          body.telefon ?? null,
          body.mwstSatz ?? 8.1,
          body.zahlungsfristTage ?? 30,
          body.waehrung ?? "CHF",
          body.sprache ?? "de_CH",
          body.standardNotiz ?? null,
          body.standardFussnote ?? null,
          JSON.stringify(body.nummernkreise ?? FINANZ_DEFAULTS.nummernkreise),
          JSON.stringify(body.aktiveTypen ?? FINANZ_DEFAULTS.aktiveTypen),
          JSON.stringify(body.berechtigungen ?? FINANZ_DEFAULTS.berechtigungen),
          body.logoUrl ?? null,
          body.akzentfarbe ?? "#B68E20",
          body.qrCodeAktiv !== false,
          body.unterschriftsfeld !== false,
          body.fotografAufDokument === true,
          body.payrexxAktiv === true,
          body.payrexxTwint !== false,
          body.payrexxKarte !== false,
          body.payrexxPostfinance !== false,
          body.payrexxPaypal === true,
          existing.id,
        ],
      );
    } else {
      await query(
        `INSERT INTO core.finanz_einstellungen (
          firmenname, uid, strasse, plz_ort, iban, bankname,
          email_absender, telefon, mwst_satz, zahlungsfrist_tage,
          waehrung, sprache, standard_notiz, standard_fussnote,
          nummernkreise, aktive_typen, berechtigungen,
          logo_url, akzentfarbe, qr_code_aktiv, unterschriftsfeld,
          fotograf_auf_dokument, payrexx_aktiv, payrexx_twint,
          payrexx_karte, payrexx_postfinance, payrexx_paypal
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
        [
          body.firmenname ?? "",
          body.uid ?? null,
          body.strasse ?? null,
          body.plzOrt ?? null,
          body.iban ?? null,
          body.bankname ?? null,
          body.emailAbsender ?? null,
          body.telefon ?? null,
          body.mwstSatz ?? 8.1,
          body.zahlungsfristTage ?? 30,
          body.waehrung ?? "CHF",
          body.sprache ?? "de_CH",
          body.standardNotiz ?? null,
          body.standardFussnote ?? null,
          JSON.stringify(body.nummernkreise ?? FINANZ_DEFAULTS.nummernkreise),
          JSON.stringify(body.aktiveTypen ?? FINANZ_DEFAULTS.aktiveTypen),
          JSON.stringify(body.berechtigungen ?? FINANZ_DEFAULTS.berechtigungen),
          body.logoUrl ?? null,
          body.akzentfarbe ?? "#B68E20",
          body.qrCodeAktiv !== false,
          body.unterschriftsfeld !== false,
          body.fotografAufDokument === true,
          body.payrexxAktiv === true,
          body.payrexxTwint !== false,
          body.payrexxKarte !== false,
          body.payrexxPostfinance !== false,
          body.payrexxPaypal === true,
        ],
      );
    }

    const row = await queryOne("SELECT * FROM core.finanz_einstellungen LIMIT 1");
    const data = row ? mapRow(row) : FINANZ_DEFAULTS;
    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
