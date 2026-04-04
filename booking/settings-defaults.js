const DEFAULT_APP_SETTINGS = {
  "pricing.vatRate": 0.081,
  "pricing.chfRoundingStep": 0.05,
  "pricing.roundingMode": "each_step",
  "pricing.keyPickupPrice": 50,
  "scheduling.slotMinutes": 15,
  "scheduling.bufferMinutes": 30,
  "scheduling.lookaheadDays": 365,
  "scheduling.minAdvanceHours": 24,
  "scheduling.workStart": "08:00",
  "scheduling.workEnd": "18:00",
  "scheduling.workdays": ["mon", "tue", "wed", "thu", "fri"],
  "scheduling.holidays": [],
  "scheduling.nationalHolidaysEnabled": true,
  "scheduling.workHoursByDay": {
    mon: { enabled: true, start: "08:00", end: "18:00" },
    tue: { enabled: true, start: "08:00", end: "18:00" },
    wed: { enabled: true, start: "08:00", end: "18:00" },
    thu: { enabled: true, start: "08:00", end: "18:00" },
    fri: { enabled: true, start: "08:00", end: "18:00" },
    sat: { enabled: false, start: "08:00", end: "18:00" },
    sun: { enabled: false, start: "08:00", end: "18:00" },
  },
  "scheduling.busyShowAs": ["busy", "oof", "tentative"],
  "assignment.requiredSkillLevels": {
    foto: 5,
    matterport: 5,
    drohne: 5,
    drohne_foto: 5,
    drohne_video: 5,
    video: 5,
  },
  "assignment.matterportLargeSqmThreshold": 300,
  "assignment.matterportLargeSqmMinLevel": 7,
  "assignment.matterportSmallSqmReduction": 2,
  "assignment.fallbackPolicy": "radius_expand_then_no_auto_assign",
  "assignment.allowSkillRelaxation": false,
  "assignment.absoluteSkillMinimums": {
    foto: 4,
    matterport: 4,
    drohne: 4,
    drohne_foto: 4,
    drohne_video: 4,
    video: 4,
  },
  // Legacy: wird im Resolver nicht mehr für Radius-Logik verwendet (nur Bestandskompatibilität).
  "assignment.radiusExpandSteps": [
    { radius: 10, skillReduction: 0 },
    { radius: 25, skillReduction: 0 },
    { radius: null, skillReduction: 0 },
  ],
  "routing.provider": "google",
  "routing.googleApiKey": "",
  "routing.trafficModel": "pessimistic",
  "routing.trafficModelDisplay": "best_guess",
  "routing.cacheHours": 6,
  "routing.timeoutMs": 2000,
  "routing.osrmBaseUrl": "https://router.project-osrm.org",
  "routing.nominatimBaseUrl": "https://nominatim.openstreetmap.org",
  "routing.cacheTtlMinutes": 1440,
  "scheduling.minBufferMinutes": 30,
  // Shadow-Mode Feature Flags — OFF by default, sicher für Produktion
  "feature.pricingShadow": false,
  "feature.assignmentShadow": false,
  // Dezente DB-Feldhinweise in Admin- und Frontpanel anzeigen
  "feature.dbFieldHints": false,

  // ─── Workflow v2 Feature Flags (alle OFF = Phase-1-Fundament ohne Side Effects) ───
  // Provisorische Buchungen aktivieren (Statusübergang pending→provisional)
  "feature.provisionalBooking": false,
  // Kalender-Side-Effects bei Statusübergängen (Phase 2)
  "feature.calendarOnStatusChange": false,
  // E-Mail-Side-Effects über Templates-System (Phase 3)
  "feature.emailTemplatesOnStatusChange": false,
  // Hintergrund-Jobs (Provisorium-Reminder + Expiry, Review-Anfragen)
  "feature.backgroundJobs": false,
  // Review-Anfrage automatisch nach 'done' verschicken
  "feature.autoReviewRequest": false,
  // Wartezeit (Stunden) nach 'done' bevor Review-Mail gesendet wird
  "workflow.reviewRequestDelayHours": 120,
  // Google-Bewertungs-Link (in Review-E-Mails und Admin-Panel angezeigt)
  "google.reviewLink": "https://g.page/r/CSQ5RnWmJOumEAE/review",
  // EXXAS Feldmapping fuer Integrationen
  "integration.exxas.fieldMappings": {},
  "integration.exxas.fieldCatalog": [],
  /** Volle EXXAS-UI-Konfiguration (Zugangsdaten + Mapping); null = nur Defaults / localStorage */
  "integration.exxas.config": null,
};

const LEGACY_DISCOUNT_FALLBACK = {
  code: "PROPUS10",
  type: "percent",
  amount: 10,
  active: true,
  validFrom: null,
  validTo: "2026-02-28",
  maxUses: null,
  usesPerCustomer: 1,
  conditions: {},
};

function getDefaultSetting(key, fallback = null) {
  if (!key) return fallback;
  if (Object.prototype.hasOwnProperty.call(DEFAULT_APP_SETTINGS, key)) {
    return DEFAULT_APP_SETTINGS[key];
  }
  return fallback;
}

module.exports = {
  DEFAULT_APP_SETTINGS,
  LEGACY_DISCOUNT_FALLBACK,
  getDefaultSetting,
};
