/**
 * IP-Normalisierung fuer Rate-Limit-Bucketing.
 *
 * Ohne Normalisierung kann ein Angreifer mit einem delegierten IPv6-Range
 * (typischerweise /48 oder /56 vom ISP, intern oft /64 pro Interface)
 * Limits umgehen, indem er innerhalb seines Pools die Source-Adresse
 * rotiert. Wir bucketn IPv6 daher auf das /64-Subnetz — das ist die
 * kleinste sinnvolle Einheit fuer Endgeraete-Identitaet.
 *
 * Hintergrund: Codex P1 #258 (compressed `::`-Form), CodeRabbit Major #258
 * (Validierung gegen malformed Input).
 */

'use strict';

const net = require('net');

/**
 * @param {string|undefined|null} ip
 * @returns {string} Stabiler Bucket-Schluessel oder `'unknown'` bei
 *   ungueltiger/leerer Eingabe.
 */
function normalizeIpKey(ip) {
  const raw = String(ip || '').trim();
  if (!raw) return 'unknown';

  // Zone-ID abschneiden ("fe80::1%eth0")
  const noZone = raw.split('%')[0];

  // IPv4-mapped IPv6 (z. B. "::ffff:1.2.3.4") -> als IPv4 behandeln,
  // aber nur wenn die eingebettete v4 wirklich gueltig ist.
  const v4Mapped = noZone.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4Mapped) {
    return net.isIPv4(v4Mapped[1]) ? v4Mapped[1] : 'unknown';
  }

  // Strikte Validierung: net.isIP gibt 0 fuer ungueltig, 4 fuer IPv4,
  // 6 fuer IPv6 zurueck.
  const kind = net.isIP(noZone);
  if (kind === 0) return 'unknown';
  if (kind === 4) return noZone;

  // IPv6 mit eingebettetem IPv4 (RFC 4291 §2.2, z. B.
  // "2001:db8::192.0.2.1" oder "64:ff9b::1.2.3.4") ist gueltig — net.isIP
  // klassifiziert das als IPv6, aber unsere Hextet-Pruefung lehnt
  // dezimale Oktette ab. Wir konvertieren die eingebettete v4 deshalb
  // zuerst in zwei Hex-Hextets, damit der Standard-Pfad weiterlaeuft
  // und unterschiedliche Schreibweisen denselben Bucket-Key liefern
  // (Codex P2 #258).
  let work = noZone.toLowerCase();
  const v4Tail = work.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Tail) {
    if (!net.isIPv4(v4Tail[1])) return 'unknown';
    const [a, b, c, d] = v4Tail[1].split('.').map(Number);
    const h1 = ((a << 8) | b).toString(16);
    const h2 = ((c << 8) | d).toString(16);
    work = work.slice(0, -v4Tail[1].length) + h1 + ':' + h2;
  }

  // IPv6: `::` -> 8 Hextets expandieren
  const dblIdx = work.indexOf('::');
  let hextets;
  if (dblIdx >= 0) {
    // Mehr als ein `::` ist ungueltig (net.isIP fangt das eigentlich
    // schon ab; defensiv trotzdem pruefen).
    if (work.indexOf('::', dblIdx + 1) >= 0) return 'unknown';
    const leftStr = work.slice(0, dblIdx);
    const rightStr = work.slice(dblIdx + 2);
    const left = leftStr ? leftStr.split(':') : [];
    const right = rightStr ? rightStr.split(':') : [];
    const fillCount = Math.max(0, 8 - left.length - right.length);
    hextets = [...left, ...Array(fillCount).fill('0'), ...right];
  } else {
    hextets = work.split(':');
  }

  // Defensive Post-Validierung: nach der Expansion muessen es genau 8
  // Hextets sein, jeder im Hex-Bereich.
  if (hextets.length !== 8) return 'unknown';
  if (!hextets.every((h) => /^[0-9a-f]{1,4}$/.test(h))) return 'unknown';

  // Erste 4 Hextets = /64-Bucket; ohne fuehrende Nullen normieren,
  // damit "2001:0db8::" und "2001:db8::" denselben Key liefern.
  const bucket = hextets.slice(0, 4).map((h) => h.replace(/^0+(?=.)/, ''));
  return bucket.join(':') + '::/64';
}

module.exports = { normalizeIpKey };
