/**
 * IP-Normalisierung fuer Rate-Limit-Bucketing.
 *
 * Ohne Normalisierung kann ein Angreifer mit einem delegierten IPv6-Range
 * (typischerweise /48 oder /56 vom ISP, intern oft /64 pro Interface)
 * Limits umgehen, indem er innerhalb seines Pools die Source-Adresse
 * rotiert. Wir bucketn IPv6 daher auf das /64-Subnetz — das ist die
 * kleinste sinnvolle Einheit fuer Endgeraete-Identitaet.
 *
 * Hintergrund: Codex P1 #258. Vorgaengerversion benutzte
 * `raw.split(':').filter(Boolean).slice(0, 4)` und brach an komprimierten
 * IPv6-Formen (`::` -> "" wird durch filter(Boolean) gestrippt) — siehe
 * Codex P1 Folgekommentar. Diese Implementierung expandiert `::` korrekt.
 */

'use strict';

/**
 * @param {string|undefined|null} ip
 * @returns {string} Stabiler Bucket-Schluessel fuer die uebergebene IP.
 */
function normalizeIpKey(ip) {
  const raw = String(ip || '').trim();
  if (!raw) return 'unknown';

  // Zone-ID abschneiden ("fe80::1%eth0")
  const noZone = raw.split('%')[0];

  // IPv4-mapped IPv6 (z. B. "::ffff:1.2.3.4") -> als IPv4 behandeln
  const v4Mapped = noZone.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4Mapped) return v4Mapped[1];

  // Plain IPv4 -> unveraendert
  if (!noZone.includes(':')) return noZone;

  // IPv6: `::` -> 8 Hextets expandieren
  const lower = noZone.toLowerCase();
  const dblIdx = lower.indexOf('::');
  let hextets;
  if (dblIdx >= 0) {
    const leftStr = lower.slice(0, dblIdx);
    const rightStr = lower.slice(dblIdx + 2);
    const left = leftStr ? leftStr.split(':') : [];
    const right = rightStr ? rightStr.split(':') : [];
    const fillCount = Math.max(0, 8 - left.length - right.length);
    hextets = [...left, ...Array(fillCount).fill('0'), ...right];
  } else {
    hextets = lower.split(':');
  }

  // Erste 4 Hextets = /64-Bucket; Hextets ohne fuehrende Nullen normieren,
  // damit "2001:0db8::" und "2001:db8::" denselben Key liefern.
  const bucket = hextets.slice(0, 4).map((h) => (h || '0').replace(/^0+(?=.)/, ''));
  return bucket.join(':') + '::/64';
}

module.exports = { normalizeIpKey };
