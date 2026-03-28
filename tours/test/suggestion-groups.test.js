const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSuggestionGroups } = require('../lib/suggestion-groups');

function suggestion(overrides = {}) {
  return {
    id: overrides.id || 's1',
    status: overrides.status || 'open',
    suggested_action: overrides.suggested_action || 'mark_accept',
    suggestion_type: overrides.suggestion_type || 'email_intent',
    confidence: overrides.confidence ?? 0.91,
    tour_id: Object.prototype.hasOwnProperty.call(overrides, 'tour_id') ? overrides.tour_id : 10,
    customer_name: overrides.customer_name || 'Kunde AG',
    object_label: overrides.object_label || 'Objekt A',
    created_at: overrides.created_at || '2026-03-10T10:00:00.000Z',
    received_at: overrides.received_at || null,
    body_text: Object.prototype.hasOwnProperty.call(overrides, 'body_text') ? overrides.body_text : 'Mailtext vorhanden',
    body_preview: Object.prototype.hasOwnProperty.call(overrides, 'body_preview') ? overrides.body_preview : 'Vorschau vorhanden',
    details_json: overrides.details_json || {
      intent: 'renew_yes',
      source: 'ai',
      candidate: {
        id: overrides.candidateId ?? 10,
        match_priority: { rank: overrides.rank ?? 500, label: 'Rechnungsnummer' },
      },
    },
  };
}

test('buildSuggestionGroups gruppiert starke Treffer pro Tour', () => {
  const result = buildSuggestionGroups([
    suggestion({ id: 'a', tour_id: 10, candidateId: 10, object_label: 'Objekt A' }),
    suggestion({ id: 'b', tour_id: 10, candidateId: 10, object_label: 'Objekt A', status: 'applied' }),
  ]);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].tourId, 10);
  assert.equal(result.groups[0].items.length, 2);
  assert.equal(result.groups[0].openCount, 1);
});

test('buildSuggestionGroups zieht mehrdeutige Fälle aus Gruppen heraus', () => {
  const result = buildSuggestionGroups([
    suggestion({
      id: 'amb',
      tour_id: 10,
      candidateId: 22,
      confidence: 0.52,
      details_json: {
        intent: 'unclear',
        source: 'rules',
        assignment_diagnostics: { ambiguous: true, reason: 'Mehrdeutig' },
        candidate: {
          id: 22,
          match_priority: { rank: 220, label: 'Kundenname' },
        },
      },
    }),
  ]);
  assert.equal(result.groups.length, 0);
  assert.equal(result.conflictItems.length, 1);
});

test('buildSuggestionGroups behandelt unclear trotz starkem Match als ambiguous', () => {
  const result = buildSuggestionGroups([
    suggestion({
      id: 'unclear-strong',
      tour_id: 10,
      candidateId: 10,
      confidence: 0.99,
      details_json: {
        intent: 'unclear',
        source: 'ai',
        candidate: {
          id: 10,
          match_priority: { rank: 900, label: 'Rechnungsnummer' },
        },
      },
    }),
  ]);
  assert.equal(result.groups.length, 0);
  assert.equal(result.ambiguousItems.length, 1);
});

test('buildSuggestionGroups behandelt review_manual ohne Tour als ambiguous', () => {
  const result = buildSuggestionGroups([
    suggestion({
      id: 'none',
      suggested_action: 'review_manual',
      tour_id: null,
      candidateId: null,
      details_json: { intent: 'unclear', source: 'rules' },
    }),
  ]);
  assert.equal(result.ambiguousItems.length, 1);
  assert.equal(result.noTourItems.length, 0);
  assert.equal(result.groups.length, 0);
});

test('buildSuggestionGroups zieht billing-Fälle in eigenen Bucket', () => {
  const result = buildSuggestionGroups([
    suggestion({
      id: 'billing',
      suggested_action: 'review_billing',
      details_json: {
        intent: 'billing_question',
        source: 'ai',
        candidate: {
          id: 10,
          match_priority: { rank: 800, label: 'Rechnungsnummer' },
        },
      },
    }),
  ]);
  assert.equal(result.billingItems.length, 1);
  assert.equal(result.groups.length, 0);
});

test('buildSuggestionGroups zieht fehlenden Mailtext in eigenen Bucket', () => {
  const result = buildSuggestionGroups([
    suggestion({
      id: 'missing-body',
      suggested_action: 'mark_accept',
      details_json: {
        intent: 'renew_yes',
        source: 'ai',
        email: {},
        candidate: {
          id: 10,
          match_priority: { rank: 900, label: 'Rechnungsnummer' },
        },
      },
      body_text: '',
      body_preview: '',
    }),
  ]);
  assert.equal(result.missingContentItems.length, 1);
  assert.equal(result.groups.length, 0);
});

test('buildSuggestionGroups zieht schwache Kontakt-Treffer aus Gruppen heraus', () => {
  const result = buildSuggestionGroups([
    suggestion({
      id: 'weak-contact',
      confidence: 0.95,
      details_json: {
        intent: 'renew_yes',
        source: 'ai',
        candidate: {
          id: 10,
          match_priority: { rank: 220, label: 'Rechnungsadresse / Kontakt' },
        },
      },
    }),
  ]);
  assert.equal(result.manualReviewItems.length, 1);
  assert.equal(result.groups.length, 0);
});
