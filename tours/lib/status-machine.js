/**
 * Statusmaschine für Tour-Lifecycle.
 * Regeln: Pro Periode nur eine Verlängerungsrechnung.
 * Keine Doppelrechnungen, saubere Übergänge.
 */

const VALID_STATUSES = [
  'ACTIVE',
  'EXPIRING_SOON',
  'AWAITING_CUSTOMER_DECISION',
  'CUSTOMER_ACCEPTED_AWAITING_PAYMENT',
  'CUSTOMER_DECLINED',
  'EXPIRED_PENDING_ARCHIVE',
  'ARCHIVED',
  'SUSPENDED_NONPAYMENT',
];

function isValid(status) {
  return VALID_STATUSES.includes(status);
}

function canSendRenewalEmail(status) {
  return ['ACTIVE', 'EXPIRING_SOON'].includes(status);
}

function canAcceptCustomerYes(status) {
  return ['AWAITING_CUSTOMER_DECISION'].includes(status);
}

function canAcceptCustomerNo(status) {
  return ['AWAITING_CUSTOMER_DECISION'].includes(status);
}

function canMarkPaid(status) {
  return ['CUSTOMER_ACCEPTED_AWAITING_PAYMENT'].includes(status);
}

function canArchive(status) {
  return ['EXPIRED_PENDING_ARCHIVE', 'CUSTOMER_DECLINED'].includes(status);
}

function canDecline(status) {
  return ['ACTIVE', 'EXPIRING_SOON', 'AWAITING_CUSTOMER_DECISION'].includes(status);
}

module.exports = {
  VALID_STATUSES,
  isValid,
  canSendRenewalEmail,
  canAcceptCustomerYes,
  canAcceptCustomerNo,
  canMarkPaid,
  canArchive,
  canDecline,
};
