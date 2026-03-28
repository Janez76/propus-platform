const crypto = require('crypto');

// Best-effort in-memory dedupe with TTL (seconds).
// Wichtig: pro Prozess, nicht cluster-weit; ersetzt keine persistente DB-Idempotenz.
const cache = new Map();
const DEFAULT_TTL = 30; // seconds

function _now() { return Math.floor(Date.now() / 1000); }

function shouldSend(key, ttl = DEFAULT_TTL) {
  if (!key) return true;
  const now = _now();
  const entry = cache.get(key);
  if (entry && (now - entry) < ttl) {
    return false;
  }
  cache.set(key, now);
  // cleanup occasionally
  if (cache.size > 10000) {
    const cutoff = now - ttl - 5;
    for (const [k, v] of cache.entries()) {
      if (v < cutoff) cache.delete(k);
    }
  }
  return true;
}

function keyFor(to, subject, body) {
  const h = crypto.createHash('sha256');
  h.update(String(subject || '') + '|' + String(to || '') + '|' + String(body || ''));
  return h.digest('hex');
}

module.exports = { shouldSend, keyFor };

