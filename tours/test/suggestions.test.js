const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveEmailCandidateDecision } = require('../lib/suggestions');

function candidate({ id, score, rank }) {
  return {
    tour: { id },
    score,
    reasons: [],
    matchPriority: {
      rank,
      label: `Rank ${rank}`,
      primaryReason: `Reason ${rank}`,
    },
  };
}

test('resolveEmailCandidateDecision akzeptiert starken eindeutigen Treffer', () => {
  const result = resolveEmailCandidateDecision([
    candidate({ id: 11, score: 210, rank: 500 }),
    candidate({ id: 22, score: 120, rank: 220 }),
  ]);
  assert.equal(result.ambiguous, false);
  assert.equal(result.selectedCandidate.tour.id, 11);
});

test('resolveEmailCandidateDecision markiert knappen Heuristik-Zweikampf als mehrdeutig', () => {
  const result = resolveEmailCandidateDecision([
    candidate({ id: 11, score: 118, rank: 220 }),
    candidate({ id: 22, score: 109, rank: 220 }),
  ]);
  assert.equal(result.ambiguous, true);
  assert.equal(result.selectedCandidate, null);
  assert.match(result.reason, /Mehrdeutig/);
});

test('resolveEmailCandidateDecision behandelt leere Kandidatenliste sauber', () => {
  const result = resolveEmailCandidateDecision([]);
  assert.equal(result.selectedCandidate, null);
  assert.equal(result.ambiguous, false);
});
