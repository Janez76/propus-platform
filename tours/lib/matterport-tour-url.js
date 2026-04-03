'use strict';

/** Öffentliche Showcase-/Show-Hosts (keine API-Hosts wie api.matterport.com). */
const MP_SHOW_HOST =
  /^([a-z0-9-]+\.)*matterport\.com$/i;

const BLOCKED_HOSTS = new Set(['api.matterport.com', 'static.matterport.com']);

/**
 * Matterport-Modell-ID aus gängigen öffentlichen URLs (Showcase SDK / Browser).
 * @see https://api.matterport.com/model/docs/reference (Model-ID im Show-Link)
 */
function extractSpaceIdFromTourUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const q = url.match(/[?&]m=([a-zA-Z0-9_-]+)/);
  if (q) return q[1];
  const models = url.match(/\/models\/([a-zA-Z0-9_-]+)/i);
  if (models) return models[1];
  return null;
}

function isMatterportShowHost(hostname) {
  if (!hostname) return false;
  return MP_SHOW_HOST.test(String(hostname).toLowerCase());
}

/**
 * @returns {{ ok: true, tour_url: string | null } | { ok: false, error: string }}
 */
function validatePropusMatterportTourUrl(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: true, tour_url: null };

  let u;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Ungültige URL (Syntax).' };
  }

  if (u.protocol !== 'https:') {
    return { ok: false, error: 'Nur HTTPS-URLs sind erlaubt.' };
  }

  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    return {
      ok: false,
      error: 'Diese Matterport-Adresse ist eine API-/Statik-Domain, kein Show-Link.',
    };
  }

  if (!isMatterportShowHost(host)) {
    return {
      ok: false,
      error:
        'Host muss eine Matterport-Domain sein (z. B. my.matterport.com oder matterport.com).',
    };
  }

  const spaceId = extractSpaceIdFromTourUrl(trimmed);
  if (!spaceId) {
    return {
      ok: false,
      error:
        'Keine Modell-ID erkannt — im Link muss ?m=… vorkommen oder der Pfad …/models/{id}.',
    };
  }

  return { ok: true, tour_url: u.toString() };
}

module.exports = {
  extractSpaceIdFromTourUrl,
  isMatterportShowHost,
  validatePropusMatterportTourUrl,
};
