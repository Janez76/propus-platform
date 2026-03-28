const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  listActionDefinitions,
  getActionDefinition,
  listRiskDefinitions,
} = require('../lib/admin-actions-schema');

test('alle bekannten Admin-Aktionen haben Metadaten', () => {
  const expected = [
    'send_renewal_email',
    'check_payment',
    'decline_tour',
    'archive_tour',
    'unarchive_matterport',
    'approve_suggestion',
    'reject_suggestion',
    'sync_mail_suggestions',
    'sync_invoice_suggestions',
  ];

  expected.forEach((actionName) => {
    const definition = getActionDefinition(actionName);
    assert.ok(definition, `fehlende Action-Definition für ${actionName}`);
    assert.equal(definition.actionName, actionName);
    assert.ok(definition.label);
    assert.ok(Array.isArray(definition.allowedRoles));
    assert.equal(typeof definition.needsConfirmation, 'boolean');
    assert.equal(typeof definition.auditLogEnabled, 'boolean');
  });
});

test('high-risk Aktionen verlangen immer Bestätigung', () => {
  const highRiskActions = listActionDefinitions().filter((action) => action.riskLevel === 'high');
  assert.ok(highRiskActions.length > 0);
  highRiskActions.forEach((action) => {
    assert.equal(action.needsConfirmation, true, `${action.actionName} sollte Bestätigung verlangen`);
  });
});

test('Risikostufen sind vollständig definiert', () => {
  const risks = listRiskDefinitions();
  assert.deepEqual(risks.map((risk) => risk.id).sort(), ['high', 'low', 'medium']);
  risks.forEach((risk) => {
    assert.ok(risk.label);
    assert.ok(risk.description);
  });
});

test('settings view enthält Modell- und Action-Doku-Blöcke', () => {
  const settingsPath = path.resolve(__dirname, '../views/admin/settings.ejs');
  const content = fs.readFileSync(settingsPath, 'utf8');
  assert.match(content, /KI-Modelle und Einsatzbereiche/);
  assert.match(content, /Action-Layer und Risikostufen/);
  assert.match(content, /Mail-Vorfilter/);
  assert.match(content, /Deterministische Fachabfragen/);
});
