/**
 * Zentrale PDF-Erzeugung für interne Rechnungen (renewal_invoices).
 * Wird von admin-api.js, admin.js, portal.js und tour-actions.js genutzt.
 */

const { pool } = require('./db');
const matterport = require('./matterport');
const { normalizeTourRow } = require('./normalize');
const {
  EXTENSION_PRICE_CHF,
  REACTIVATION_PRICE_CHF,
} = require('./subscriptions');
const qrBill = require('./qr-bill');
const payrexx = require('./payrexx');
const { appendPayrexxOnlineSection } = require('./invoice-pdf-payrexx-hint');

const PROPUS_DARK = '#1C1C1C';
const PROPUS_GOLD = '#B68E20';
const PROPUS_LIGHT_GRAY = '#F0EFED';
const PROPUS_MID_GRAY = '#6B7280';
const PROPUS_TEXT = '#111111';

// ─── Data loading ───────────────────────────────────────────────────────────

async function loadInvoiceAndTour(tourId, invoiceId) {
  let tour = null;
  if (tourId) {
    const tourResult = await pool.query(
      'SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [tourId],
    );
    const tourRaw = tourResult.rows[0];
    if (!tourRaw) return { error: 'Tour nicht gefunden.' };
    tour = normalizeTourRow(tourRaw);
    if (tour.canonical_matterport_space_id) {
      const { model } = await matterport.getModel(tour.canonical_matterport_space_id).catch(() => ({ model: null }));
      if (model?.publication?.url && !tour.tour_url) tour.tour_url = model.publication.url;
      if (model?.publication?.address) tour.object_address = model.publication.address;
    }
  }

  const invQuery = tourId
    ? 'SELECT * FROM tour_manager.renewal_invoices WHERE id = $1 AND tour_id = $2 LIMIT 1'
    : 'SELECT * FROM tour_manager.renewal_invoices WHERE id = $1 LIMIT 1';
  const invParams = tourId ? [invoiceId, tourId] : [invoiceId];
  const invResult = await pool.query(invQuery, invParams);
  const invoice = invResult.rows[0];
  if (!invoice) return { error: 'Rechnung nicht gefunden.' };

  if (!tour && invoice.tour_id) {
    const tourResult = await pool.query(
      'SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [invoice.tour_id],
    );
    if (tourResult.rows[0]) {
      tour = normalizeTourRow(tourResult.rows[0]);
      if (tour.canonical_matterport_space_id) {
        const { model } = await matterport.getModel(tour.canonical_matterport_space_id).catch(() => ({ model: null }));
        if (model?.publication?.url && !tour.tour_url) tour.tour_url = model.publication.url;
        if (model?.publication?.address) tour.object_address = model.publication.address;
      }
    }
  }

  return { invoice, tour };
}

function buildInvoiceContext(invoice, tour, paymentContext) {
  let amount = Number(invoice.amount_chf || invoice.betrag || invoice.preis_brutto || 0);
  if (!amount || Number.isNaN(amount)) {
    amount = invoice.invoice_kind === 'portal_reactivation' ? REACTIVATION_PRICE_CHF : EXTENSION_PRICE_CHF;
  }
  const amountStr = Number(amount).toFixed(2);
  const invLabel = invoice.invoice_number || `Rechnung #${invoice.id}`;
  const invoiceDate = invoice.sent_at || invoice.invoice_date || invoice.created_at
    ? new Date(invoice.sent_at || invoice.invoice_date || invoice.created_at)
        .toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' })
    : '-';
  const statusLabels = { paid: 'Bezahlt', sent: 'Ausstehend', overdue: 'Überfällig', draft: 'Entwurf', cancelled: 'Storniert' };
  const statusLabel = statusLabels[invoice.invoice_status] || invoice.invoice_status || '-';

  const periodStart = invoice.subscription_start_at ? new Date(invoice.subscription_start_at) : null;
  const periodEnd = invoice.subscription_end_at ? new Date(invoice.subscription_end_at) : null;
  const fmtDate = (d) => d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const billingPeriodLabel = periodStart && periodEnd
    ? `${fmtDate(periodStart)} bis ${fmtDate(periodEnd)}`
    : periodEnd ? `Bis ${fmtDate(periodEnd)}` : null;

  const dueAt = invoice.due_at
    ? new Date(invoice.due_at).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  const paidAtDate = invoice.paid_at_date || invoice.paid_at
    ? new Date(invoice.paid_at_date || invoice.paid_at)
        .toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  let bezeichnung;
  let amountNet = null;
  let amountVat = null;
  let vatPercent = null;

  if (invoice.invoice_kind === 'freeform') {
    bezeichnung = invoice.description || 'Dienstleistung';
  } else if (invoice.invoice_kind === 'portal_extension') {
    bezeichnung = 'Virtueller Rundgang – Verlängerung (6 Monate)';
  } else if (invoice.invoice_kind === 'portal_reactivation') {
    bezeichnung = 'Virtueller Rundgang – Reaktivierung (6 Monate)';
  } else if (invoice.invoice_kind === 'floorplan_order') {
    const note = invoice.payment_note || '';
    const etagenMatch = note.match(/Etagen:\s*(\d+)/);
    const preisMatch = note.match(/Preis pro Etage:\s*CHF\s*([\d.]+)/);
    const vatMatch = note.match(/inkl\.\s*([\d.]+)%\s*MwSt/);
    const floorCount = etagenMatch ? parseInt(etagenMatch[1], 10) : null;
    const unitPriceVal = preisMatch ? parseFloat(preisMatch[1]) : null;
    vatPercent = vatMatch ? parseFloat(vatMatch[1]) : null;
    if (floorCount && unitPriceVal) {
      bezeichnung = `2D Grundriss von Tour (${floorCount} Etage${floorCount !== 1 ? 'n' : ''} × CHF ${Number(unitPriceVal).toFixed(2)})`;
    } else {
      bezeichnung = '2D Grundriss von Tour';
    }
    if (vatPercent !== null && amount > 0) {
      const vatRate = vatPercent / 100;
      amountNet = Math.round(amount / (1 + vatRate) * 100) / 100;
      amountVat = Math.round((amount - amountNet) * 100) / 100;
    }
  } else {
    bezeichnung = invoice.description || 'Virtueller Rundgang – Hosting / Verlängerung';
  }

  const skontoChf = invoice.skonto_chf ? Number(invoice.skonto_chf) : null;
  const paymentChannel = invoice.payment_channel || null;
  const writeoff = invoice.writeoff || false;

  const customerName = tour
    ? ([tour.customer_name, tour.customer_contact].filter(Boolean).join(' – ') || tour.customer_contact || '-')
    : (invoice.customer_name || '-');
  const customerEmail = tour ? (tour.customer_email || '') : (invoice.customer_email || '');
  const customerAddress = !tour ? (invoice.customer_address || '') : '';

  const tourLabel = tour
    ? (tour.canonical_object_label || tour.object_label || tour.bezeichnung || `Tour #${tour.id}`)
    : null;
  const tourLink = tour ? (tour.tour_url || null) : null;
  const tourAddress = tour ? (tour.object_address || null) : null;

  return {
    ...paymentContext,
    invLabel,
    invoiceDate,
    statusLabel,
    amount: amountStr,
    amountNum: amount,
    amountNet,
    amountVat,
    vatPercent,
    customerName,
    customerEmail,
    customerAddress,
    bezeichnung,
    tourLabel,
    tourLink,
    tourAddress,
    billingPeriodLabel,
    dueAt,
    paidAtDate,
    skontoChf,
    paymentChannel,
    writeoff,
    hasTour: !!tour,
  };
}

// ─── PDF rendering ──────────────────────────────────────────────────────────

function drawHeader(doc, ctx) {
  const pageWidth = doc.page.width;
  const margin = doc.page.margins.left;
  const contentWidth = pageWidth - margin * 2;

  doc.save();
  doc.rect(margin, margin, contentWidth, 56).fill(PROPUS_DARK);

  doc.fontSize(15).fillColor(PROPUS_GOLD).font('Helvetica-Bold')
    .text(ctx.creditor.name, margin + 16, margin + 10, { width: 300 });
  doc.fontSize(8).fillColor('#9CA3AF').font('Helvetica')
    .text(`${ctx.creditor.email} · ${ctx.creditor.website}`, margin + 16, margin + 28, { width: 300 });

  const badgeText = 'RECHNUNG';
  const badgeW = doc.widthOfString(badgeText) + 20;
  const badgeX = margin + contentWidth - badgeW - 16;
  const badgeY = margin + 16;
  doc.lineWidth(1.2).strokeColor(PROPUS_GOLD)
    .rect(badgeX, badgeY, badgeW, 22).stroke();
  doc.fontSize(7.5).fillColor(PROPUS_GOLD).font('Helvetica-Bold')
    .text(badgeText, badgeX, badgeY + 6, { width: badgeW, align: 'center' });

  doc.restore();
  return margin + 56 + 16;
}

function drawInvoiceMeta(doc, ctx, y) {
  const margin = doc.page.margins.left;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(PROPUS_DARK)
    .text('Rechnung', margin, y);
  y += 22;
  doc.font('Helvetica').fontSize(9).fillColor(PROPUS_MID_GRAY)
    .text(`${ctx.invLabel} · ${ctx.invoiceDate}`, margin, y);

  const statusX = margin + doc.widthOfString(`${ctx.invLabel} · ${ctx.invoiceDate}`) + 10;
  const statusColors = {
    Bezahlt: '#047857', Ausstehend: '#92400E', Überfällig: '#B91C1C',
    Entwurf: '#6B7280', Storniert: '#991B1B',
  };
  const statusBg = {
    Bezahlt: '#ECFDF5', Ausstehend: '#FFFBEB', Überfällig: '#FEF2F2',
    Entwurf: '#F3F4F6', Storniert: '#FEE2E2',
  };
  const sColor = statusColors[ctx.statusLabel] || '#6B7280';
  const sBg = statusBg[ctx.statusLabel] || '#F3F4F6';
  const sw = doc.widthOfString(ctx.statusLabel) + 12;
  doc.save();
  doc.roundedRect(statusX, y - 2, sw, 14, 2).fill(sBg);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(sColor)
    .text(ctx.statusLabel.toUpperCase(), statusX + 6, y + 1);
  doc.restore();

  y += 20;
  doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).lineWidth(0.5).strokeColor(PROPUS_LIGHT_GRAY).stroke();
  return y + 10;
}

function drawParties(doc, ctx, y) {
  const margin = doc.page.margins.left;
  const midX = doc.page.width / 2;

  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(PROPUS_GOLD)
    .text('RECHNUNGSEMPFÄNGER', margin, y);
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(PROPUS_GOLD)
    .text('ABSENDER', midX + 10, y);
  y += 14;

  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(PROPUS_DARK)
    .text(ctx.customerName, margin, y, { width: midX - margin - 10 });
  y += 14;
  if (ctx.customerEmail) {
    doc.font('Helvetica').fontSize(8.5).fillColor('#4B5563')
      .text(ctx.customerEmail, margin, y, { width: midX - margin - 10 });
    y += 12;
  }
  if (ctx.customerAddress) {
    doc.font('Helvetica').fontSize(8.5).fillColor('#4B5563')
      .text(ctx.customerAddress, margin, y, { width: midX - margin - 10 });
    y += 12;
  }

  let ry = y - (ctx.customerEmail ? 26 : 14);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(PROPUS_DARK)
    .text(ctx.creditor.name, midX + 10, ry, { width: midX - margin - 10 });
  ry += 14;
  doc.font('Helvetica').fontSize(8.5).fillColor('#4B5563')
    .text(`${ctx.creditor.address} ${ctx.creditor.buildingNumber}`, midX + 10, ry, { width: 200 });
  ry += 12;
  doc.text(`${ctx.creditor.zip} ${ctx.creditor.city}`, midX + 10, ry, { width: 200 });
  ry += 12;
  doc.text(`${ctx.creditor.email} | ${ctx.creditor.website}`, midX + 10, ry, { width: 200 });
  ry += 12;
  if (ctx.creditor.vatId) {
    doc.fontSize(7.5).fillColor('#9CA3AF')
      .text(`MwSt: ${ctx.creditor.vatId}`, midX + 10, ry, { width: 200 });
    ry += 11;
  }

  y = Math.max(y, ry) + 6;
  doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).lineWidth(0.5).strokeColor(PROPUS_LIGHT_GRAY).stroke();
  return y + 8;
}

function drawTourInfo(doc, ctx, y) {
  if (!ctx.hasTour) return y;
  const margin = doc.page.margins.left;

  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(PROPUS_GOLD)
    .text('TOUR / OBJEKT', margin, y);
  y += 14;
  doc.font('Helvetica').fontSize(9).fillColor(PROPUS_DARK)
    .text(ctx.tourLabel || '-', margin, y);
  y += 13;
  if (ctx.tourAddress) {
    doc.fontSize(8.5).fillColor('#4B5563').text(ctx.tourAddress, margin, y);
    y += 12;
  }
  if (ctx.tourLink) {
    doc.fontSize(8).fillColor('#0b6aa2').text(ctx.tourLink, margin, y, { link: ctx.tourLink, underline: true });
    y += 13;
  }
  if (ctx.billingPeriodLabel) {
    doc.fontSize(8.5).fillColor('#4B5563').text(`Periode: ${ctx.billingPeriodLabel}`, margin, y);
    y += 13;
  }

  y += 4;
  doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).lineWidth(0.5).strokeColor(PROPUS_LIGHT_GRAY).stroke();
  return y + 6;
}

function drawPositionsTable(doc, ctx, y) {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  const colPos = margin;
  const colDesc = margin + 50;
  const colAmount = margin + contentWidth - 90;

  doc.save();
  doc.rect(margin, y, contentWidth, 22).fill(PROPUS_DARK);
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#9CA3AF')
    .text('POS.', colPos + 10, y + 7)
    .text('BESCHREIBUNG', colDesc, y + 7)
    .text('BETRAG (CHF)', colAmount, y + 7, { width: 80, align: 'right' });
  doc.restore();
  y += 22;

  doc.font('Helvetica').fontSize(8.5).fillColor('#9CA3AF')
    .text('1', colPos + 10, y + 10);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(PROPUS_DARK)
    .text(ctx.bezeichnung, colDesc, y + 8, { width: colAmount - colDesc - 10 });

  const posAmount = ctx.amountNet !== null ? Number(ctx.amountNet).toFixed(2) : ctx.amount;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(PROPUS_DARK)
    .text(posAmount, colAmount, y + 8, { width: 80, align: 'right' });

  y += 32;
  doc.moveTo(margin, y).lineTo(margin + contentWidth, y).lineWidth(0.5).strokeColor(PROPUS_LIGHT_GRAY).stroke();
  return y + 6;
}

function drawTotals(doc, ctx, y) {
  const rightEdge = doc.page.width - doc.page.margins.right;
  const labelX = rightEdge - 200;
  const valX = rightEdge - 80;

  if (ctx.amountNet !== null && ctx.amountVat !== null && ctx.vatPercent !== null) {
    doc.font('Helvetica').fontSize(8.5).fillColor('#4B5563')
      .text('Zwischensumme', labelX, y, { width: 110, align: 'right' })
      .text(`CHF ${Number(ctx.amountNet).toFixed(2)}`, valX, y, { width: 80, align: 'right' });
    y += 14;
    doc.text(`MwSt ${ctx.vatPercent}%`, labelX, y, { width: 110, align: 'right' })
      .text(`CHF ${Number(ctx.amountVat).toFixed(2)}`, valX, y, { width: 80, align: 'right' });
    y += 14;
  }

  if (ctx.skontoChf && ctx.skontoChf > 0) {
    const pct = ctx.amountNum > 0 ? ((ctx.skontoChf / ctx.amountNum) * 100).toFixed(1) : '0.0';
    doc.font('Helvetica').fontSize(8.5).fillColor('#4B5563')
      .text(`Skonto (${pct}%)`, labelX, y, { width: 110, align: 'right' })
      .text(`- CHF ${Number(ctx.skontoChf).toFixed(2)}`, valX, y, { width: 80, align: 'right' });
    y += 14;
  }

  doc.moveTo(labelX, y).lineTo(rightEdge, y).lineWidth(1.5).strokeColor(PROPUS_DARK).stroke();
  y += 6;

  const totalAmount = ctx.skontoChf && ctx.skontoChf > 0
    ? (ctx.amountNum - ctx.skontoChf).toFixed(2)
    : ctx.amount;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(PROPUS_GOLD)
    .text('Total', labelX, y, { width: 110, align: 'right' })
    .text(`CHF ${totalAmount}`, valX, y, { width: 80, align: 'right' });
  y += 20;

  return y;
}

function drawPaymentInfo(doc, ctx, y) {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  const boxX = margin;
  const boxW = contentWidth;

  doc.save();
  doc.roundedRect(boxX, y, boxW, 76, 3).fill('#FAFAF9');
  doc.roundedRect(boxX, y, boxW, 76, 3).lineWidth(0.5).strokeColor(PROPUS_LIGHT_GRAY).stroke();
  doc.restore();

  const labelW = 100;
  const valX = boxX + labelW + 16;
  let iy = y + 10;

  const rows = [];
  if (ctx.dueAt) rows.push(['ZAHLUNGSFRIST', ctx.dueAt]);
  rows.push(['IBAN', ctx.creditorIbanFormatted]);
  rows.push(['QR-REFERENZ', ctx.qrReferenceFormatted]);
  rows.push(['ZAHLBAR AN', ctx.creditorLines.slice(0, 3).join(', ')]);
  if (ctx.paymentChannel) rows.push(['ZAHLUNGSKANAL', ctx.paymentChannel]);
  if (ctx.paidAtDate) rows.push(['BEZAHLT AM', ctx.paidAtDate]);

  const neededH = rows.length * 13 + 16;
  if (neededH > 76) {
    doc.save();
    doc.roundedRect(boxX, y, boxW, neededH, 3).fill('#FAFAF9');
    doc.roundedRect(boxX, y, boxW, neededH, 3).lineWidth(0.5).strokeColor(PROPUS_LIGHT_GRAY).stroke();
    doc.restore();
  }

  for (const [label, value] of rows) {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#9CA3AF')
      .text(label, boxX + 14, iy, { width: labelW });
    doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
      .text(value, valX, iy - 1, { width: boxW - labelW - 30 });
    iy += 13;
  }

  return y + Math.max(76, neededH) + 10;
}

function drawWriteoffWarning(doc, ctx, y) {
  if (!ctx.writeoff) return y;
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;

  doc.save();
  doc.roundedRect(margin, y, contentWidth, 20, 2).fill('#FEF2F2');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#B91C1C')
    .text('Betreibung eingeleitet', margin + 10, y + 5, { width: contentWidth - 20 });
  doc.restore();
  return y + 28;
}

function drawFooter(doc, ctx, y) {
  const margin = doc.page.margins.left;

  doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).lineWidth(0.5).strokeColor(PROPUS_LIGHT_GRAY).stroke();
  y += 10;

  const footerNote = ctx.creditor.footerNote || `Vielen Dank für Ihr Vertrauen. Bei Fragen: ${ctx.creditor.email}`;
  doc.font('Helvetica').fontSize(8).fillColor(PROPUS_MID_GRAY)
    .text(footerNote, margin, y, { width: doc.page.width - margin * 2 });
  y += 14;
  doc.text(`Freundliche Grüsse, ${ctx.creditor.name}`, margin, y);
  y += 16;
  return y;
}

// ─── Public API ─────────────────────────────────────────────────────────────

async function streamRenewalInvoicePdf(res, tourId, invoiceId) {
  const result = await loadInvoiceAndTour(tourId, invoiceId);
  if (result.error) {
    res.status(404).send(result.error);
    return;
  }
  const { invoice, tour } = result;

  const paymentContext = await qrBill.buildInvoicePaymentContext(
    { ...invoice, amount_chf: Number(invoice.amount_chf || 0) },
    tour || {},
  );

  let payrexxUrl = null;
  if (tour) {
    try {
      payrexxUrl = await payrexx.ensureRenewalInvoiceCheckoutUrl(pool, invoice, tour);
    } catch (e) {
      console.warn('ensureRenewalInvoiceCheckoutUrl:', e.message);
    }
  }

  const ctx = buildInvoiceContext(invoice, tour, paymentContext);

  const PDFDocument = require('pdfkit');
  const { SwissQRBill } = require('swissqrbill/pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Rechnung-${ctx.invLabel.replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf"`);
  doc.pipe(res);

  let y = drawHeader(doc, ctx);
  y = drawInvoiceMeta(doc, ctx, y);
  y = drawParties(doc, ctx, y);
  y = drawTourInfo(doc, ctx, y);
  y = drawPositionsTable(doc, ctx, y);
  y = drawTotals(doc, ctx, y);
  y = drawWriteoffWarning(doc, ctx, y);
  y = drawPaymentInfo(doc, ctx, y);
  y = appendPayrexxOnlineSection(doc, y, { payrexxUrl, invLabel: ctx.invLabel });
  y = drawFooter(doc, ctx, y);

  try {
    const bill = new SwissQRBill(ctx.qrBillPayload, {
      language: 'DE', separate: false, scissors: true, fontName: 'Helvetica',
    });
    bill.attachTo(doc);
  } catch (err) {
    y += 10;
    doc.font('Helvetica').fontSize(9).fillColor(PROPUS_TEXT)
      .text(`Zahlbar an: ${ctx.creditor.name}`, 50, y);
    y += 14;
    doc.text(`IBAN: ${qrBill.formatIban(ctx.creditor.account)}`, 50, y);
    y += 14;
    doc.text(`Referenz: ${ctx.qrReferenceFormatted}`, 50, y);
  }

  doc.end();
}

async function generateInvoicePdfBuffer(invoice, tour) {
  const paymentContext = await qrBill.buildInvoicePaymentContext(
    { ...invoice, amount_chf: Number(invoice.amount_chf || 0) },
    tour || {},
  );

  let payrexxUrl = null;
  if (tour) {
    try {
      payrexxUrl = await payrexx.ensureRenewalInvoiceCheckoutUrl(pool, invoice, tour);
    } catch (e) {
      console.warn('ensureRenewalInvoiceCheckoutUrl (buffer):', e.message);
    }
  }

  const ctx = buildInvoiceContext(invoice, tour, paymentContext);

  const PDFDocument = require('pdfkit');
  const { SwissQRBill } = require('swissqrbill/pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  let y = drawHeader(doc, ctx);
  y = drawInvoiceMeta(doc, ctx, y);
  y = drawParties(doc, ctx, y);
  y = drawTourInfo(doc, ctx, y);
  y = drawPositionsTable(doc, ctx, y);
  y = drawTotals(doc, ctx, y);
  y = drawWriteoffWarning(doc, ctx, y);
  y = drawPaymentInfo(doc, ctx, y);
  y = appendPayrexxOnlineSection(doc, y, { payrexxUrl, invLabel: ctx.invLabel });
  y = drawFooter(doc, ctx, y);

  try {
    const bill = new SwissQRBill(ctx.qrBillPayload, {
      language: 'DE', separate: false, scissors: true, fontName: 'Helvetica',
    });
    bill.attachTo(doc);
  } catch {
    y += 10;
    doc.font('Helvetica').fontSize(9).fillColor(PROPUS_TEXT)
      .text(`Zahlbar an: ${ctx.creditor.name}`, 50, y);
    y += 14;
    doc.text(`IBAN: ${qrBill.formatIban(ctx.creditor.account)}`, 50, y);
    y += 14;
    doc.text(`Referenz: ${ctx.qrReferenceFormatted}`, 50, y);
  }

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = { streamRenewalInvoicePdf, generateInvoicePdfBuffer };
