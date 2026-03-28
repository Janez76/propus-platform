const ACTION_DEFINITIONS = {
  send_renewal_email: {
    actionName: 'send_renewal_email',
    label: 'Verlängerungsmail senden',
    category: 'customer_communication',
    riskLevel: 'high',
    needsConfirmation: true,
    allowedRoles: ['admin'],
    requiredFields: ['tourId'],
    validationNotes: [
      'Tour muss existieren',
      'Status muss Versand erlauben',
      'Empfängeradresse muss vorhanden sein',
    ],
    auditLogEnabled: true,
  },
  check_payment: {
    actionName: 'check_payment',
    label: 'Zahlung prüfen',
    category: 'billing',
    riskLevel: 'medium',
    needsConfirmation: true,
    allowedRoles: ['admin'],
    requiredFields: ['tourId'],
    validationNotes: [
      'Tour muss existieren',
      'Es müssen prüfbare Rechnungen vorhanden sein',
    ],
    auditLogEnabled: true,
  },
  decline_tour: {
    actionName: 'decline_tour',
    label: 'Tour als nicht verlängern markieren',
    category: 'tour_lifecycle',
    riskLevel: 'high',
    needsConfirmation: true,
    allowedRoles: ['admin'],
    requiredFields: ['tourId'],
    validationNotes: [
      'Tour muss existieren',
      'Status muss Ablehnung erlauben',
    ],
    auditLogEnabled: true,
  },
  archive_tour: {
    actionName: 'archive_tour',
    label: 'Tour archivieren',
    category: 'tour_lifecycle',
    riskLevel: 'high',
    needsConfirmation: true,
    allowedRoles: ['admin'],
    requiredFields: ['tourId'],
    validationNotes: [
      'Tour muss existieren',
      'Status muss Archivierung erlauben',
    ],
    auditLogEnabled: true,
  },
  unarchive_matterport: {
    actionName: 'unarchive_matterport',
    label: 'Matterport-Tour reaktivieren',
    category: 'matterport',
    riskLevel: 'high',
    needsConfirmation: true,
    allowedRoles: ['admin'],
    requiredFields: ['tourId'],
    validationNotes: [
      'Tour muss mit Matterport verknüpft sein',
      'Matterport-Reaktivierung muss erfolgreich sein',
    ],
    auditLogEnabled: true,
  },
  approve_suggestion: {
    actionName: 'approve_suggestion',
    label: 'Vorschlag übernehmen',
    category: 'review',
    riskLevel: 'medium',
    needsConfirmation: true,
    allowedRoles: ['admin'],
    requiredFields: ['suggestionId'],
    validationNotes: [
      'Vorschlag muss existieren',
      'Vorschlag muss offen sein',
    ],
    auditLogEnabled: true,
  },
  reject_suggestion: {
    actionName: 'reject_suggestion',
    label: 'Vorschlag ablehnen',
    category: 'review',
    riskLevel: 'medium',
    needsConfirmation: true,
    allowedRoles: ['admin'],
    requiredFields: ['suggestionId'],
    validationNotes: [
      'Vorschlag muss existieren',
      'Vorschlag muss offen sein',
    ],
    auditLogEnabled: true,
  },
  sync_mail_suggestions: {
    actionName: 'sync_mail_suggestions',
    label: 'Mail-Vorschläge synchronisieren',
    category: 'sync',
    riskLevel: 'low',
    needsConfirmation: true,
    allowedRoles: ['admin'],
    requiredFields: [],
    validationNotes: [
      'Exchange-Zugang muss verfügbar sein',
    ],
    auditLogEnabled: true,
  },
  sync_invoice_suggestions: {
    actionName: 'sync_invoice_suggestions',
    label: 'Rechnungsvorschläge neu berechnen',
    category: 'sync',
    riskLevel: 'low',
    needsConfirmation: true,
    allowedRoles: ['admin'],
    requiredFields: [],
    validationNotes: [
      'Exxas-Daten müssen verfügbar sein',
    ],
    auditLogEnabled: true,
  },
};

const RISK_LEVEL_DEFINITIONS = {
  low: {
    id: 'low',
    label: 'Niedrig',
    shortLabel: 'Risiko: niedrig',
    description: 'Unkritische, gut rückverfolgbare Aktionen mit geringer operativer Auswirkung.',
  },
  medium: {
    id: 'medium',
    label: 'Mittel',
    shortLabel: 'Risiko: mittel',
    description: 'Ändernde Aktionen mit Validierungspflicht und klaren Fachregeln.',
  },
  high: {
    id: 'high',
    label: 'Hoch',
    shortLabel: 'Risiko: hoch',
    description: 'Aktionen mit Seiteneffekt oder schwer rückgängig zu machenden Änderungen.',
  },
};

function getActionDefinition(actionType) {
  return ACTION_DEFINITIONS[actionType] || null;
}

function listActionDefinitions() {
  return Object.values(ACTION_DEFINITIONS);
}

function getRiskDefinition(riskLevel) {
  return RISK_LEVEL_DEFINITIONS[riskLevel] || null;
}

function listRiskDefinitions() {
  return Object.values(RISK_LEVEL_DEFINITIONS);
}

module.exports = {
  ACTION_DEFINITIONS,
  RISK_LEVEL_DEFINITIONS,
  getActionDefinition,
  listActionDefinitions,
  getRiskDefinition,
  listRiskDefinitions,
};
