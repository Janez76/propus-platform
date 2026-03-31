/**
 * PDF-Stream für interne Verlängerungsrechnung (wie admin.js GET .../pdf).
 */

const { pool } = require('./db');
const matterport = require('./matterport');
const { normalizeTourRow } = require('./normalize');
const {
  EXTENSION_PRICE_CHF,
  REACTIVATION_PRICE_CHF,
} = require('./subscriptions');
const qrBill = require('./qr-bill');

async function streamRenewalInvoicePdf(res, tourId, invoiceId) {
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [tourId]);
  const tourRaw = tourResult.rows[0];
  if (!tourRaw) {
    res.status(404).send('Tour nicht gefunden.');
    return;
  }
  const tour = normalizeTourRow(tourRaw);
  if (tour.canonical_matterport_space_id) {
    const { model } = await matterport.getModel(tour.canonical_matterport_space_id).catch(() => ({ model: null }));
    if (model?.publication?.url && !tour.tour_url) tour.tour_url = model.publication.url;
    if (model?.publication?.address) tour.object_address = model.publication.address;
  }

  const invResult = await pool.query(
    'SELECT * FROM tour_manager.renewal_invoices WHERE id = $1 AND tour_id = $2 LIMIT 1',
    [invoiceId, tourId]
  );
  const invoice = invResult.rows[0];
  if (!invoice) {
    res.status(404).send('Rechnung nicht gefunden.');
    return;
  }

  let amount = Number(invoice.amount_chf || invoice.betrag || invoice.preis_brutto || 0);
  if (!amount || Number.isNaN(amount)) {
    amount = invoice.invoice_kind === 'portal_reactivation' ? REACTIVATION_PRICE_CHF : EXTENSION_PRICE_CHF;
  }
  const amountStr = Number(amount).toFixed(2);
  const invLabel = invoice.invoice_number || `Rechnung #${invoice.id}`;
  const invoiceDate = invoice.sent_at || invoice.invoice_date || invoice.created_at
    ? new Date(invoice.sent_at || invoice.invoice_date || invoice.created_at).toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' })
    : '-';
  const statusLabels = { paid: 'Bezahlt', sent: 'Ausstehend', overdue: 'Überfällig', draft: 'Entwurf', cancelled: 'Storniert' };
  const statusLabel = statusLabels[invoice.invoice_status] || invoice.invoice_status || '-';
  const periodStart = invoice.subscription_start_at ? new Date(invoice.subscription_start_at) : null;
  const periodEnd = invoice.subscription_end_at ? new Date(invoice.subscription_end_at) : null;
  const billingPeriodLabel = periodStart && periodEnd
    ? `${periodStart.toLocaleDateString('de-CH')} bis ${periodEnd.toLocaleDateString('de-CH')}`
    : periodEnd
      ? `Bis ${periodEnd.toLocaleDateString('de-CH')}`
      : '-';

  const paymentContext = qrBill.buildInvoicePaymentContext({ ...invoice, amount_chf: amount }, tour);
  const ctx = {
    ...paymentContext,
    invLabel,
    invoiceDate,
    statusLabel,
    amount: amountStr,
    customerName: [tour.customer_name, tour.customer_contact].filter(Boolean).join(' – ') || tour.customer_contact || '-',
    customerEmail: tour.customer_email || '',
    bezeichnung: invoice.invoice_kind === 'portal_extension'
      ? 'Virtueller Rundgang – Verlängerung (6 Monate)'
      : invoice.invoice_kind === 'portal_reactivation'
        ? 'Virtueller Rundgang – Reaktivierung (6 Monate)'
        : 'Virtueller Rundgang – Hosting / Verlängerung',
    tourLabel: tour.canonical_object_label || tour.object_label || tour.bezeichnung || `Tour #${tour.id}`,
    tourLink: tour.tour_url || null,
    tourAddress: tour.object_address || null,
    billingPeriodLabel,
  };

  const PDFDocument = require('pdfkit');
  const { SwissQRBill } = require('swissqrbill/pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Rechnung-${ctx.invLabel.replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf"`);
  doc.pipe(res);

  let y = 50;
  doc.fontSize(18).fillColor('#111').text(ctx.creditor.name, 50, y);
  y += 24;
  doc.fontSize(10).fillColor('#666').text(`${ctx.creditor.email} · ${ctx.creditor.website}`, 50, y);
  y += 30;
  doc.fontSize(14).fillColor('#111').text('Rechnung', 50, y);
  y += 22;
  doc.fontSize(10).fillColor('#666').text(`${ctx.invLabel} · ${ctx.invoiceDate} · ${ctx.statusLabel}`, 50, y);
  y += 24;
  doc.fontSize(10).fillColor('#111').text('Rechnungsempfänger:', 50, y);
  y += 16;
  doc.text(ctx.customerName || '-', 50, y);
  y += 16;
  if (ctx.customerEmail) {
    doc.text(ctx.customerEmail, 50, y);
    y += 20;
  } else {
    y += 10;
  }
  doc.fontSize(10).fillColor('#111').text('Tour / Objekt:', 50, y);
  y += 14;
  doc.fontSize(9).fillColor('#333').text(ctx.tourLabel || '-', 50, y);
  y += 14;
  if (ctx.tourAddress) {
    doc.text(`Adresse: ${ctx.tourAddress}`, 50, y);
    y += 14;
  }
  if (ctx.tourLink) {
    doc.fillColor('#0b6aa2').text(`Link: ${ctx.tourLink}`, 50, y, { link: ctx.tourLink, underline: true });
    y += 16;
  }
  doc.fillColor('#333').text(`Periode: ${ctx.billingPeriodLabel}`, 50, y);
  y += 12;
  const tableTop = y + 5;
  doc.fontSize(10).fillColor('#111').text('Pos.', 50, tableTop);
  doc.text('Beschreibung', 120, tableTop);
  doc.text('Betrag (CHF)', 450, tableTop, { width: 80, align: 'right' });
  doc.moveTo(50, tableTop + 18).lineTo(530, tableTop + 18).stroke();
  doc.text('1', 50, tableTop + 25);
  doc.text(ctx.bezeichnung, 120, tableTop + 25, { width: 320 });
  doc.text(ctx.amount, 450, tableTop + 25, { width: 80, align: 'right' });
  y = tableTop + 55;
  doc.fontSize(11).fillColor('#111').text(`Total: CHF ${ctx.amount}`, 50, y);
  y += 25;
  doc.fontSize(9).fillColor('#666').text(`Vielen Dank für Ihr Vertrauen. Bei Fragen: ${ctx.creditor.email}`, 50, y);
  y += 16;
  doc.text(`Freundliche Grüsse, ${ctx.creditor.name}`, 50, y);
  try {
    const bill = new SwissQRBill(ctx.qrBillPayload, {
      language: 'DE',
      separate: false,
      scissors: true,
      fontName: 'Helvetica',
    });
    bill.attachTo(doc);
  } catch (err) {
    y += 24;
    doc.fontSize(9).fillColor('#111').text(`Zahlbar an: ${ctx.creditor.name}`, 50, y);
    y += 14;
    doc.text(`IBAN: ${qrBill.formatIban(ctx.creditor.account)}`, 50, y);
    y += 14;
    doc.text(`Referenz: ${ctx.qrReferenceFormatted}`, 50, y);
  }
  doc.end();
}

module.exports = { streamRenewalInvoicePdf };
