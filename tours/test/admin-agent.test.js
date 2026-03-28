const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyReadIntent,
  extractExplicitTargets,
  sourceLabel,
} = require('../lib/admin-agent');

test('extractExplicitTargets erkennt Tour, Kunde, Mail, Matterport und Rechnung', () => {
  const result = extractExplicitTargets('Bitte archiviere tour 123, exxas kunde 456, letzte mails von kunde@firma.ch, matterport ABC123 und rechnung R-2024-10');
  assert.equal(result.tourId, 123);
  assert.equal(result.exxasCustomerId, '456');
  assert.equal(result.email, 'kunde@firma.ch');
  assert.equal(result.matterportSpaceId, 'ABC123');
  assert.equal(result.invoiceNumber, 'R-2024-10');
});

test('classifyReadIntent erkennt Schreibaktion mit explizitem Ziel', () => {
  const result = classifyReadIntent('archiviere tour 321');
  assert.equal(result.mode, 'write');
  assert.equal(result.actionType, 'archive_tour');
  assert.equal(result.targets.tourId, 321);
});

test('classifyReadIntent erkennt direkte Leseabfrage', () => {
  const result = classifyReadIntent('zeige letzte mails von kunde@firma.ch');
  assert.equal(result.mode, 'read');
  assert.equal(result.targets.email, 'kunde@firma.ch');
  assert.equal(result.wantsExchange, true);
});

test('classifyReadIntent zieht Matterport und Exxas bei Verlängerungsfrage zur Tour mit', () => {
  const result = classifyReadIntent('wann muss tour 123 verlängert werden und ist noch etwas offen?', {
    effectiveTourId: 123,
  });
  assert.equal(result.mode, 'read');
  assert.equal(result.targets.tourId, 123);
  assert.equal(result.wantsMatterport, true);
  assert.equal(result.wantsExxas, true);
});

test('sourceLabel liefert erwartete Quellen', () => {
  assert.equal(sourceLabel('local'), 'Quelle: lokaler Sync');
  assert.equal(sourceLabel('exxas'), 'Quelle: Exxas live');
  assert.equal(sourceLabel('matterport'), 'Quelle: Matterport live');
  assert.equal(sourceLabel('exchange'), 'Quelle: Exchange live');
});
