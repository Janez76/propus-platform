'use strict';

/**
 * Mapping booking.orders.object.type -> deutsches Label.
 * Quelle: identisch zu OBJECT_TYPE_DE in booking/server.js. Hier zentral
 * gepflegt, damit der Tour-Manager (z. B. /link-matterport/booking-search)
 * dieselben Labels verwenden kann.
 */
const OBJECT_TYPE_DE = Object.freeze({
  apartment: 'Wohnung',
  single_house: 'Einfamilienhaus',
  multi_house: 'Mehrfamilienhaus',
  commercial: 'Gewerbe',
  land: 'Grundstück',
  house: 'Haus',
  other: 'Anderes',
});

function translateObjectType(type) {
  if (!type) return null;
  return OBJECT_TYPE_DE[String(type).trim().toLowerCase()] || null;
}

module.exports = { OBJECT_TYPE_DE, translateObjectType };
