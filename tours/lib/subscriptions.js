const SUBSCRIPTION_MONTHS = 6;
const EXTENSION_PRICE_CHF = 59;
const REACTIVATION_FEE_CHF = 15;
const REACTIVATION_PRICE_CHF = EXTENSION_PRICE_CHF + REACTIVATION_FEE_CHF;

function addMonths(baseDate, months = SUBSCRIPTION_MONTHS) {
  const date = baseDate ? new Date(baseDate) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getInitialTermEndDate(startDate = new Date()) {
  return addMonths(startDate, SUBSCRIPTION_MONTHS);
}

function getPortalPricingForTour(tour) {
  const isReactivation = String(tour?.status || '').toUpperCase() === 'ARCHIVED';
  return {
    months: SUBSCRIPTION_MONTHS,
    isReactivation,
    amountCHF: isReactivation ? REACTIVATION_PRICE_CHF : EXTENSION_PRICE_CHF,
    basePriceCHF: EXTENSION_PRICE_CHF,
    reactivationFeeCHF: isReactivation ? REACTIVATION_FEE_CHF : 0,
    actionLabel: isReactivation ? 'Reaktivierung' : 'Verlaengerung',
    invoiceKind: isReactivation ? 'portal_reactivation' : 'portal_extension',
  };
}

function getNextTermEndDate(currentEndDate, options = {}) {
  const { reactivation = false } = options;
  const now = new Date();
  let base = now;
  if (!reactivation && currentEndDate) {
    const endDate = new Date(currentEndDate);
    if (!Number.isNaN(endDate.getTime()) && endDate > now) {
      base = endDate;
    }
  }
  return addMonths(base, SUBSCRIPTION_MONTHS);
}

function getSubscriptionWindowFromStart(startDate, months = SUBSCRIPTION_MONTHS) {
  const start = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(start.getTime())) {
    return {
      startDate: null,
      endDate: null,
      startIso: null,
      endIso: null,
    };
  }
  const end = addMonths(start, months);
  return {
    startDate: start,
    endDate: end,
    startIso: toIsoDate(start),
    endIso: toIsoDate(end),
  };
}

module.exports = {
  SUBSCRIPTION_MONTHS,
  EXTENSION_PRICE_CHF,
  REACTIVATION_FEE_CHF,
  REACTIVATION_PRICE_CHF,
  addMonths,
  toIsoDate,
  getInitialTermEndDate,
  getPortalPricingForTour,
  getNextTermEndDate,
  getSubscriptionWindowFromStart,
};
