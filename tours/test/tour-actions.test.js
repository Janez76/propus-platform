const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRenewalEmailContent } = require('../lib/tour-actions');

test('buildRenewalEmailContent enthält Tourdaten und sichere Links', () => {
  const result = buildRenewalEmailContent({
    id: 7,
    object_label: 'Musterwohnung',
    customer_contact: 'Frau Keller',
    tour_url: 'https://my.matterport.com/show/?m=ABC123',
    matterport_created_at: '2026-01-10T00:00:00.000Z',
    price: 79,
  }, {
    yesUrl: 'https://touren.propus.ch/r/yes?token=abc',
    noUrl: 'https://touren.propus.ch/r/no?token=def',
  });

  assert.match(result.subject, /Musterwohnung/);
  assert.match(result.html, /Frau Keller/);
  assert.match(result.html, /https:\/\/touren\.propus\.ch\/r\/yes\?token=abc/);
  assert.match(result.html, /https:\/\/my\.matterport\.com\/show\/\?m=ABC123/);
  assert.match(result.html, /79\.00/);
});
