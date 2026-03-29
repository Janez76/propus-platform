/**
 * Gemeinsame Normalisierung – Tour-Manager + Booking
 */
const tourNormalize = require("../../tours/lib/normalize");
const { normalizeTextDeep, repairTextEncoding } = require("../../booking/text-normalization");

module.exports = {
  ...tourNormalize,
  normalizeTextDeep,
  repairTextEncoding,
};
