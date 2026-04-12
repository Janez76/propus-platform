/**
 * E-Mail-Template für Rechnungsversand.
 * Generiert HTML mit optionalem Payrexx-Zahlungsbutton und IBAN-Fallback.
 */

const PROPUS_GOLD = "#B68E20";
const PROPUS_DARK = "#0c0d10";

export interface RechnungsEmailParams {
  empfaengerName: string;
  rechnungsNummer: string;
  betrag: string; // formatiert, z.B. "CHF 590.00"
  faelligAm: string; // formatiert, z.B. "15. Februar 2026"
  iban: string;
  referenz: string; // = Rechnungsnummer
  absenderName?: string;
  absenderAdresse?: string;
  absenderEmail?: string;
  payrexxLink?: string; // falls Payrexx aktiviert
}

export function buildRechnungsEmail(params: RechnungsEmailParams): string {
  const {
    empfaengerName,
    rechnungsNummer,
    betrag,
    faelligAm,
    iban,
    referenz,
    absenderName = "Propus GmbH",
    absenderAdresse = "6300 Zug",
    absenderEmail = "rechnung@propus.ch",
    payrexxLink,
  } = params;

  const payrexxButton = payrexxLink
    ? `
    <tr><td style="padding: 0 32px 24px;">
      <a href="${payrexxLink}" style="display:block;background:${PROPUS_GOLD};color:#fff;text-decoration:none;text-align:center;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">
        Jetzt online bezahlen (Karte / TWINT / PostFinance)
      </a>
    </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rechnung ${rechnungsNummer}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e8e6e0;">

  <!-- Header -->
  <tr><td style="background:${PROPUS_DARK};padding:28px 32px;">
    <span style="color:${PROPUS_GOLD};font-size:22px;font-weight:600;letter-spacing:0.05em;">PROPUS</span>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 32px 8px;">
    <p style="font-size:14px;color:#666;line-height:1.6;margin:0 0 8px;">Guten Tag ${empfaengerName}</p>
    <p style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px;">Ihre Rechnung ${rechnungsNummer}</p>
    <p style="font-size:14px;color:#666;line-height:1.6;margin:0 0 24px;">Bitte begleichen Sie den folgenden Betrag bis zum ${faelligAm}.</p>
  </td></tr>

  <!-- Amount Box -->
  <tr><td style="padding:0 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f8f5;border:1px solid #e8e6e0;border-radius:8px;">
      <tr><td style="padding:20px 24px;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin:0;">Zu bezahlen</p>
        <p style="font-size:28px;font-weight:700;color:${PROPUS_DARK};margin:4px 0;">${betrag}</p>
        <p style="font-size:13px;color:#666;margin:0;">Fällig am ${faelligAm}</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- Payrexx Button -->
  ${payrexxButton}

  <!-- Divider -->
  <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #e8e6e0;margin:0 0 24px;" /></td></tr>

  <!-- IBAN Section -->
  <tr><td style="padding:0 32px 24px;">
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin:0 0 12px;">Banküberweisung</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
      <tr style="border-bottom:1px solid #f0ede6;">
        <td style="padding:8px 0;color:#999;width:140px;">IBAN</td>
        <td style="padding:8px 0;color:#1a1a1a;font-weight:500;font-family:monospace;">${iban}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0ede6;">
        <td style="padding:8px 0;color:#999;">Empfänger</td>
        <td style="padding:8px 0;color:#1a1a1a;font-weight:500;">${absenderName}, ${absenderAdresse}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0ede6;">
        <td style="padding:8px 0;color:#999;">Betrag</td>
        <td style="padding:8px 0;color:#1a1a1a;font-weight:500;">${betrag}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#999;">Verwendungszweck</td>
        <td style="padding:8px 0;color:#1a1a1a;font-weight:500;">${referenz}</td>
      </tr>
    </table>
  </td></tr>

  <!-- PDF Note -->
  <tr><td style="padding:0 32px 24px;">
    <p style="font-size:12px;color:#999;margin:0;">Die Rechnung liegt diesem E-Mail als PDF bei.</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9f8f5;padding:20px 32px;font-size:12px;color:#999;border-top:1px solid #e8e6e0;">
    ${absenderName} · ${absenderAdresse} · <a href="mailto:${absenderEmail}" style="color:${PROPUS_GOLD};">${absenderEmail}</a>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
