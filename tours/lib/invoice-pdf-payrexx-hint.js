/**
 * Optionaler Payrexx-Abschnitt auf der PDF-Rechnung (neben Swiss-QR).
 * @returns {number} neue Y-Position unterhalb des Blocks
 */
function appendPayrexxOnlineSection(doc, y, { payrexxUrl, invLabel }) {
  if (!payrexxUrl || typeof payrexxUrl !== 'string') return y;
  y += 20;
  doc.fontSize(10).fillColor('#111').text('Online bezahlen (Payrexx)', 50, y);
  y += 16;
  const hintText = `Alternativ zum QR-Einzahlungsschein: gleicher Betrag und Bezug auf ${invLabel} — Karte, TWINT und weitere Anbieter.`;
  doc.fontSize(9).fillColor('#444');
  const hintH = doc.heightOfString(hintText, { width: 500 });
  doc.text(hintText, 50, y, { width: 500 });
  y += hintH + 8;
  doc.fontSize(9).fillColor('#0b6aa2').text(payrexxUrl, 50, y, { link: payrexxUrl, underline: true });
  y += 22;
  return y;
}

module.exports = { appendPayrexxOnlineSection };
