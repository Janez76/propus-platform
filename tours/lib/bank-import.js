const { XMLParser } = require('fast-xml-parser');
const qrBill = require('./qr-bill');

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function toNumber(value) {
  if (value === undefined || value === null) return null;
  const num = Number.parseFloat(String(value).replace(',', '.').trim());
  return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function digitsOnly(value) {
  return String(value || '').replace(/\D+/g, '');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function parseAmountNode(amountNode) {
  if (amountNode === undefined || amountNode === null) return { amount: null, currency: null };
  if (typeof amountNode === 'number' || typeof amountNode === 'string') {
    return { amount: toNumber(amountNode), currency: null };
  }
  return {
    amount: toNumber(amountNode['#text'] ?? amountNode.text ?? amountNode.value),
    currency: normalizeText(amountNode['@_Ccy'] || amountNode.Ccy || ''),
  };
}

function collectReferenceFromTx(tx) {
  const refs = [];
  const strd = asArray(tx?.RmtInf?.Strd);
  for (const item of strd) {
    refs.push(
      normalizeText(item?.CdtrRefInf?.Ref),
      normalizeText(item?.CdtrRefInf?.Tp?.CdOrPrtry?.Cd),
      normalizeText(item?.CdtrRefInf?.Tp?.Issr)
    );
  }
  const ustrd = asArray(tx?.RmtInf?.Ustrd);
  for (const line of ustrd) refs.push(normalizeText(line));
  refs.push(
    normalizeText(tx?.Refs?.EndToEndId),
    normalizeText(tx?.Refs?.AcctSvcrRef),
    normalizeText(tx?.Refs?.PmtInfId),
    normalizeText(tx?.AddtlTxInf),
    normalizeText(tx?.BkTxCd?.Prtry?.Cd)
  );
  return refs.filter(Boolean).join(' | ');
}

function parseCamt054(xmlString) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    parseTagValue: false,
  });
  const parsed = parser.parse(xmlString);
  const root = parsed?.Document?.BkToCstmrDbtCdtNtfctn;
  if (!root) return [];

  const transactions = [];
  const notifications = asArray(root?.Ntfctn);
  for (const notification of notifications) {
    for (const entry of asArray(notification?.Ntry)) {
      const bookingDate = toIsoDate(entry?.BookgDt?.Dt || entry?.BookgDt?.DtTm);
      const valueDate = toIsoDate(entry?.ValDt?.Dt || entry?.ValDt?.DtTm);
      const entryAmount = parseAmountNode(entry?.Amt);
      const txDetails = asArray(entry?.NtryDtls).flatMap((detail) => asArray(detail?.TxDtls));
      if (!txDetails.length) {
        transactions.push({
          bookingDate,
          valueDate,
          amount: entryAmount.amount,
          currency: entryAmount.currency || 'CHF',
          referenceRaw: normalizeText(entry?.AddtlNtryInf),
          debtorName: '',
          purpose: normalizeText(entry?.AddtlNtryInf),
          raw: entry,
        });
        continue;
      }
      for (const tx of txDetails) {
        const txAmountNode = tx?.AmtDtls?.TxAmt?.Amt || tx?.Amt;
        const txAmount = parseAmountNode(txAmountNode);
        const amount = txAmount.amount ?? entryAmount.amount;
        const currency = txAmount.currency || entryAmount.currency || 'CHF';
        const referenceRaw = collectReferenceFromTx(tx) || normalizeText(entry?.AddtlNtryInf);
        const debtorName = normalizeText(tx?.RltdPties?.Dbtr?.Nm || tx?.RltdPties?.DbtrAcct?.Nm);
        const purpose = normalizeText(tx?.RmtInf?.Ustrd || tx?.AddtlTxInf || entry?.AddtlNtryInf);
        transactions.push({
          bookingDate,
          valueDate,
          amount,
          currency,
          referenceRaw,
          debtorName,
          purpose,
          raw: tx,
        });
      }
    }
  }
  return transactions;
}

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(separator).map((h) => h.trim().toLowerCase());
  const idx = (names) => {
    for (const name of names) {
      const i = headers.findIndex((h) => h === name);
      if (i >= 0) return i;
    }
    return -1;
  };
  const dateIdx = idx(['booking_date', 'date', 'datum', 'buchungsdatum']);
  const valueDateIdx = idx(['value_date', 'valuta', 'valutadatum']);
  const amountIdx = idx(['amount', 'betrag']);
  const currencyIdx = idx(['currency', 'waehrung', 'währung']);
  const refIdx = idx(['reference', 'referenz', 'qr_reference', 'mitteilung', 'purpose', 'verwendungszweck']);
  const debtorIdx = idx(['debtor', 'payer', 'zahler', 'name']);

  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(separator).map((c) => c.trim());
    const referenceRaw = refIdx >= 0 ? cells[refIdx] : '';
    rows.push({
      bookingDate: toIsoDate(dateIdx >= 0 ? cells[dateIdx] : null),
      valueDate: toIsoDate(valueDateIdx >= 0 ? cells[valueDateIdx] : null),
      amount: toNumber(amountIdx >= 0 ? cells[amountIdx] : null),
      currency: normalizeText(currencyIdx >= 0 ? cells[currencyIdx] : 'CHF') || 'CHF',
      referenceRaw: normalizeText(referenceRaw),
      debtorName: normalizeText(debtorIdx >= 0 ? cells[debtorIdx] : ''),
      purpose: normalizeText(referenceRaw),
      raw: { line },
    });
  }
  return rows;
}

function buildOpenInvoiceIndex(invoiceRows) {
  return invoiceRows.map((row) => {
    const source = normalizeText(row.source || 'renewal') || 'renewal';
    const invoiceNumber = normalizeText(source === 'exxas' ? row.nummer : row.invoice_number);
    const amount = toNumber(source === 'exxas' ? row.preis_brutto : row.amount_chf);
    const status = normalizeText(source === 'exxas' ? row.exxas_status : row.invoice_status);
    const qrReference = source === 'renewal' ? qrBill.buildQrReference(row) : '';
    const exxasDocumentId = normalizeText(row.exxas_document_id || '');
    const contractReference = normalizeText(row.ref_vertrag || '');
    return {
      source,
      id: String(row.id),
      tourId: row.tour_id,
      invoiceNumber,
      invoiceNumberDigits: digitsOnly(invoiceNumber),
      amount,
      status,
      qrReference,
      qrReferenceDigits: digitsOnly(qrReference),
      exxasDocumentId,
      exxasDocumentIdDigits: digitsOnly(exxasDocumentId),
      contractReference,
      contractReferenceDigits: digitsOnly(contractReference),
      requiresImport: source === 'exxas',
      subscriptionEndAt: row.subscription_end_at ? toIsoDate(row.subscription_end_at) : null,
    };
  });
}

function matchesAmount(inv, txAmount) {
  return txAmount !== null &&
    inv.amount !== null &&
    Math.abs(inv.amount - txAmount) < 0.01;
}

function matchesExxasReference(inv, txReferenceDigits) {
  if (!txReferenceDigits) return false;
  return inv.invoiceNumberDigits === txReferenceDigits ||
    inv.exxasDocumentIdDigits === txReferenceDigits ||
    inv.contractReferenceDigits === txReferenceDigits;
}

function matchTransaction(transaction, invoiceIndex) {
  const txReferenceDigits = digitsOnly(transaction.referenceRaw);
  const txAmount = toNumber(transaction.amount);
  const candidates = invoiceIndex.filter((inv) =>
    inv.source === 'exxas'
      ? inv.status !== 'bz'
      : ['sent', 'overdue', 'draft'].includes(inv.status)
  );
  const renewalCandidates = candidates.filter((inv) => inv.source === 'renewal');
  const exxasCandidates = candidates.filter((inv) => inv.source === 'exxas');

  const exactRenewal = renewalCandidates.filter((inv) =>
    txReferenceDigits &&
    inv.qrReferenceDigits === txReferenceDigits &&
    matchesAmount(inv, txAmount)
  );
  if (exactRenewal.length === 1) {
    return { matchStatus: 'exact', confidence: 100, invoice: exactRenewal[0], reason: 'QR-Referenz und Betrag stimmen' };
  }

  const exactExxas = exxasCandidates.filter((inv) =>
    matchesExxasReference(inv, txReferenceDigits) &&
    matchesAmount(inv, txAmount)
  );
  if (exactExxas.length === 1) {
    return {
      matchStatus: 'review',
      confidence: 90,
      invoice: exactExxas[0],
      reason: 'Exxas-Rechnung passt exakt, muss aber zuerst importiert werden',
    };
  }

  const refRenewal = renewalCandidates.filter((inv) =>
    txReferenceDigits &&
    (inv.qrReferenceDigits === txReferenceDigits || inv.invoiceNumberDigits === txReferenceDigits)
  );
  if (refRenewal.length === 1) {
    return { matchStatus: 'review', confidence: 80, invoice: refRenewal[0], reason: 'Referenz passt, Betrag prüfen' };
  }

  const refExxas = exxasCandidates.filter((inv) =>
    matchesExxasReference(inv, txReferenceDigits)
  );
  if (refExxas.length === 1) {
    return {
      matchStatus: 'review',
      confidence: 75,
      invoice: refExxas[0],
      reason: 'Exxas-Referenz passt, Import und Betrag prüfen',
    };
  }

  const amountRenewal = renewalCandidates.filter((inv) => matchesAmount(inv, txAmount));
  if (amountRenewal.length === 1) {
    return { matchStatus: 'review', confidence: 60, invoice: amountRenewal[0], reason: 'Betrag passt, Referenz unklar' };
  }

  const amountExxas = exxasCandidates.filter((inv) => matchesAmount(inv, txAmount));
  if (amountExxas.length === 1) {
    return {
      matchStatus: 'review',
      confidence: 55,
      invoice: amountExxas[0],
      reason: 'Exxas-Betrag passt, Import und Referenz prüfen',
    };
  }

  return { matchStatus: 'none', confidence: 0, invoice: null, reason: 'Kein eindeutiger Treffer' };
}

module.exports = {
  parseCamt054,
  parseCsv,
  buildOpenInvoiceIndex,
  matchTransaction,
  digitsOnly,
  toIsoDate,
};
