/**
 * gbp-client.js
 * Google Business Profile API – OAuth 2.0 Client
 *
 * Kapselt:
 *   - OAuth-Flow (Auth-URL, Code-Exchange, Token-Refresh)
 *   - Reviews laden (alle, nicht nur 5 wie Places API)
 *   - Auf Reviews antworten / Antwort loeschen
 *
 * Token-Verwaltung:
 *   - Refresh Token wird in gbp_oauth_tokens (DB) gespeichert
 *   - Access Token wird im Speicher gecacht bis expires_at
 *   - Kein Access Token gelangt ans Frontend
 */

"use strict";

const GBP_BASE = "https://mybusiness.googleapis.com/v4";
const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1";
const GBP_V4_BASE = "https://mybusiness.googleapis.com/v4";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/business.manage";
const REVIEWS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 Minuten

// In-Memory-Cache fuer Access Token
let _accessTokenCache = null; // { token: string, expiresAt: number }

// In-Memory-Cache fuer Reviews
let _reviewsCache = null;
let _reviewsCacheAt = 0;

function getClientId() {
  return String(process.env.GBP_CLIENT_ID || "").trim();
}

function getClientSecret() {
  return String(process.env.GBP_CLIENT_SECRET || "").trim();
}

function getRedirectUri() {
  return String(process.env.GBP_REDIRECT_URI || "").trim();
}

function isConfigured() {
  return !!(getClientId() && getClientSecret() && getRedirectUri());
}

/**
 * OAuth Consent URL bauen.
 * @returns {string}
 */
function getAuthUrl() {
  if (!isConfigured()) throw new Error("GBP OAuth nicht konfiguriert (GBP_CLIENT_ID/SECRET/REDIRECT_URI fehlen)");
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
}

/**
 * Authorization Code gegen Tokens tauschen und in DB speichern.
 * Ermittelt automatisch Account ID und Location ID.
 * @param {object} pool - pg Pool
 * @param {string} code
 */
async function exchangeCode(pool, code) {
  if (!isConfigured()) throw new Error("GBP OAuth nicht konfiguriert");

  const body = new URLSearchParams({
    code,
    client_id: getClientId(),
    client_secret: getClientSecret(),
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  });

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });

  const j = await r.json();
  if (!j.access_token || !j.refresh_token) {
    throw new Error("Token-Exchange fehlgeschlagen: " + (j.error_description || j.error || JSON.stringify(j)));
  }

  const expiresAt = new Date(Date.now() + (j.expires_in || 3600) * 1000);

  // Access Token cachen
  _accessTokenCache = { token: j.access_token, expiresAt: expiresAt.getTime() };

  // Account + Location automatisch ermitteln
  let accountId = null;
  let locationId = null;
  try {
    ({ accountId, locationId } = await _resolveAccountAndLocation(j.access_token));
  } catch (err) {
    console.warn("[gbp] Account/Location konnte nicht automatisch ermittelt werden:", err.message);
  }

  // In DB speichern (singleton id=1)
  await pool.query(
    `INSERT INTO gbp_oauth_tokens (id, access_token, refresh_token, expires_at, account_id, location_id, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, NOW())
     ON CONFLICT (id) DO UPDATE SET
       access_token  = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at    = EXCLUDED.expires_at,
       account_id    = COALESCE(EXCLUDED.account_id, gbp_oauth_tokens.account_id),
       location_id   = COALESCE(EXCLUDED.location_id, gbp_oauth_tokens.location_id),
       updated_at    = NOW()`,
    [j.access_token, j.refresh_token, expiresAt.toISOString(), accountId, locationId]
  );

  // Reviews-Cache leeren
  _reviewsCache = null;

  return { accountId, locationId };
}

/**
 * Gueltig-Pruefung: Token vorhanden und nicht abgelaufen (5 Min Puffer).
 */
function _isTokenFresh(expiresAt) {
  return Date.now() < (new Date(expiresAt).getTime() - 5 * 60 * 1000);
}

/**
 * Access Token liefern (aus Cache oder per Refresh).
 * @param {object} pool
 * @returns {Promise<string>}
 */
async function getAccessToken(pool) {
  // In-Memory-Cache nutzen wenn frisch
  if (_accessTokenCache && Date.now() < _accessTokenCache.expiresAt - 5 * 60 * 1000) {
    return _accessTokenCache.token;
  }

  // Aus DB laden
  const { rows } = await pool.query("SELECT * FROM gbp_oauth_tokens WHERE id = 1");
  if (!rows[0]) throw new Error("GBP nicht verbunden – bitte zuerst mit Google verbinden");
  const row = rows[0];

  // Wenn Access Token noch frisch, direkt nutzen
  if (_isTokenFresh(row.expires_at)) {
    _accessTokenCache = { token: row.access_token, expiresAt: new Date(row.expires_at).getTime() };
    return row.access_token;
  }

  // Refresh Token nutzen
  if (!row.refresh_token) throw new Error("Kein Refresh Token vorhanden – bitte neu verbinden");

  const body = new URLSearchParams({
    refresh_token: row.refresh_token,
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "refresh_token",
  });

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });

  const j = await r.json();
  if (!j.access_token) {
    throw new Error("Token-Refresh fehlgeschlagen: " + (j.error_description || j.error || JSON.stringify(j)));
  }

  const expiresAt = new Date(Date.now() + (j.expires_in || 3600) * 1000);

  // DB und Cache aktualisieren
  await pool.query(
    `UPDATE gbp_oauth_tokens SET
       access_token = $1,
       expires_at   = $2,
       updated_at   = NOW()
     WHERE id = 1`,
    [j.access_token, expiresAt.toISOString()]
  );

  _accessTokenCache = { token: j.access_token, expiresAt: expiresAt.getTime() };
  return j.access_token;
}

/**
 * Account ID und erste Location ID automatisch ermitteln.
 * Versucht mehrere API-Endpunkte als Fallback.
 * @param {string} accessToken
 * @returns {Promise<{accountId: string|null, locationId: string|null, error: string|null}>}
 */
async function _resolveAccountAndLocation(accessToken) {
  const headers = { Authorization: "Bearer " + accessToken };

  // Accounts laden – zuerst v4 API (kein separates Quota), dann Account Management API als Fallback
  let accountName = null;
  let accountsError = null;

  // Versuch 1: mybusiness.googleapis.com/v4/accounts
  try {
    const accR = await fetch(GBP_V4_BASE + "/accounts", {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    const accJ = await accR.json();
    if (accR.ok && Array.isArray(accJ.accounts) && accJ.accounts.length) {
      accountName = accJ.accounts[0].name;
    } else if (!accR.ok) {
      accountsError = (accJ.error && accJ.error.message) || JSON.stringify(accJ);
    }
  } catch (e) {
    accountsError = e.message;
  }

  // Versuch 2: Account Management API (separates Quota, kann 0 sein)
  if (!accountName) {
    try {
      const accR2 = await fetch(ACCOUNT_MGMT_BASE + "/accounts", {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      const accJ2 = await accR2.json();
      if (accR2.ok && Array.isArray(accJ2.accounts) && accJ2.accounts.length) {
        accountName = accJ2.accounts[0].name;
      } else if (!accR2.ok) {
        accountsError = (accJ2.error && accJ2.error.message) || JSON.stringify(accJ2);
      }
    } catch (e) {
      accountsError = e.message;
    }
  }

  if (!accountName) {
    throw new Error(
      "Kein Google Business Profile Account gefunden." +
      (accountsError ? " Detail: " + accountsError : "") +
      " Stelle sicher, dass der angemeldete Google-Account ein Business Profile hat."
    );
  }

  // Locations laden – versuche zuerst mybusinessbusinessinformation, dann mybusiness v4
  let locationName = null;
  let locError = null;

  try {
    const locR = await fetch(
      "https://mybusinessbusinessinformation.googleapis.com/v1/" + accountName + "/locations?readMask=name",
      { headers, signal: AbortSignal.timeout(8000) }
    );
    const locJ = await locR.json();
    if (locR.ok) {
      const locations = Array.isArray(locJ.locations) ? locJ.locations : [];
      locationName = locations.length ? locations[0].name : null;
    } else {
      locError = (locJ.error && locJ.error.message) || JSON.stringify(locJ);
    }
  } catch (e) {
    locError = e.message;
  }

  // Fallback: mybusiness v4
  if (!locationName) {
    try {
      const locR2 = await fetch(
        GBP_BASE + "/" + accountName + "/locations?pageSize=1",
        { headers, signal: AbortSignal.timeout(8000) }
      );
      const locJ2 = await locR2.json();
      if (locR2.ok) {
        const locs2 = Array.isArray(locJ2.locations) ? locJ2.locations : [];
        if (locs2.length) {
          // v4 gibt "accounts/x/locations/y" zurück – für Reviews benötigen wir dieses Format
          locationName = locs2[0].name || null;
        }
      }
    } catch (_) {
      // Fallback ebenfalls fehlgeschlagen
    }
  }

  if (!locationName && locError) {
    console.warn("[gbp] Location konnte nicht ermittelt werden:", locError);
  }

  return { accountId: accountName, locationId: locationName, locError: locationName ? null : locError };
}

/**
 * Account + Location neu auflösen und in DB speichern (nach fehlgeschlagenem Callback).
 * @param {object} pool
 * @returns {Promise<{accountId: string|null, locationId: string|null}>}
 */
async function resolveAndSave(pool) {
  const accessToken = await getAccessToken(pool);
  const { accountId, locationId, locError } = await _resolveAccountAndLocation(accessToken);

  if (!accountId) throw new Error("Kein Google Business Profile Account gefunden.");

  await pool.query(
    `UPDATE gbp_oauth_tokens SET
       account_id  = COALESCE($1, account_id),
       location_id = COALESCE($2, location_id),
       updated_at  = NOW()
     WHERE id = 1`,
    [accountId, locationId]
  );

  _reviewsCache = null;

  if (!locationId) {
    throw new Error(
      "Account (" + accountId + ") gespeichert, aber keine Location gefunden." +
      (locError ? " Detail: " + locError : "") +
      " Bitte aktiviere die 'My Business Business Information API' in der Google Cloud Console."
    );
  }

  return { accountId, locationId };
}

/**
 * Verbindungsstatus pruefen.
 * @param {object} pool
 * @returns {Promise<{connected: boolean, accountId: string|null, locationId: string|null, expiresAt: string|null}>}
 */
async function getStatus(pool) {
  try {
    const { rows } = await pool.query("SELECT id, account_id, location_id, expires_at, updated_at FROM gbp_oauth_tokens WHERE id = 1");
    if (!rows[0]) return { connected: false, accountId: null, locationId: null, expiresAt: null };
    const row = rows[0];
    return {
      connected: true,
      accountId: row.account_id || null,
      locationId: row.location_id || null,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      configured: isConfigured(),
    };
  } catch (_) {
    return { connected: false, accountId: null, locationId: null, expiresAt: null };
  }
}

/**
 * Alle Reviews fuer die konfigurierte Location laden (gecacht 15 Min).
 * @param {object} pool
 * @param {number} [pageSize=50]
 * @returns {Promise<{reviews: Array, averageRating: number|null, totalReviewCount: number|null}>}
 */
async function listReviews(pool, pageSize) {
  const now = Date.now();
  if (_reviewsCache && now - _reviewsCacheAt < REVIEWS_CACHE_TTL_MS) {
    return _reviewsCache;
  }

  const { rows } = await pool.query("SELECT account_id, location_id FROM gbp_oauth_tokens WHERE id = 1");
  if (!rows[0] || !rows[0].location_id) {
    throw new Error("Location ID nicht gesetzt – bitte neu verbinden");
  }

  // places_fallback = noch kein GBP-Zugriff, Error damit server.js den Places-Fallback nutzt
  let locationName = rows[0].location_id;
  if (locationName === "places_fallback") {
    throw new Error("__PLACES_FALLBACK__");
  }
  if (/^\d+$/.test(locationName)) {
    // Nur numerische ID – Account ID aus DB verwenden
    const accountId = rows[0].account_id;
    if (!accountId) {
      throw new Error("Location ID ist nur eine Zahl, aber Account ID fehlt. Bitte vollständigen Pfad eingeben (accounts/ACCOUNT_ID/locations/LOCATION_ID).");
    }
    locationName = accountId + "/locations/" + locationName;
  }
  const accessToken = await getAccessToken(pool);

  const size = Math.min(Number(pageSize || 50), 50);
  const url = GBP_BASE + "/" + locationName + "/reviews"
    + "?pageSize=" + size
    + "&orderBy=updateTime+desc";

  const r = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken },
    signal: AbortSignal.timeout(10000),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => r.status);
    throw new Error("GBP Reviews laden fehlgeschlagen: " + errText);
  }

  const j = await r.json();

  const result = {
    reviews: (Array.isArray(j.reviews) ? j.reviews : []).map(_mapReview),
    averageRating: j.averageRating != null ? Number(j.averageRating) : null,
    totalReviewCount: j.totalReviewCount != null ? Number(j.totalReviewCount) : null,
    nextPageToken: j.nextPageToken || null,
  };

  _reviewsCache = result;
  _reviewsCacheAt = now;

  return result;
}

/**
 * Google-Review-Objekt in ein einheitliches Format umwandeln.
 */
function _mapReview(rv) {
  const starMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return {
    name: rv.name || "",
    reviewId: rv.reviewId || "",
    author: (rv.reviewer && rv.reviewer.displayName) || "Anonym",
    profilePhoto: (rv.reviewer && rv.reviewer.profilePhotoUrl) || null,
    isAnonymous: !!(rv.reviewer && rv.reviewer.isAnonymous),
    rating: starMap[rv.starRating] || 0,
    comment: rv.comment || "",
    createTime: rv.createTime || null,
    updateTime: rv.updateTime || null,
    reply: rv.reviewReply ? {
      comment: rv.reviewReply.comment || "",
      updateTime: rv.reviewReply.updateTime || null,
    } : null,
  };
}

/**
 * Auf ein Review antworten (erstellt Antwort oder aktualisiert bestehende).
 * @param {object} pool
 * @param {string} reviewName - Ressourcenname z.B. "accounts/.../locations/.../reviews/..."
 * @param {string} comment
 */
async function replyToReview(pool, reviewName, comment) {
  if (!reviewName) throw new Error("reviewName fehlt");
  if (!comment || !String(comment).trim()) throw new Error("Antwort-Text fehlt");

  const accessToken = await getAccessToken(pool);

  const r = await fetch(GBP_BASE + "/" + reviewName + "/reply", {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment: String(comment).trim() }),
    signal: AbortSignal.timeout(10000),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => String(r.status));
    throw new Error("Antwort senden fehlgeschlagen: " + errText);
  }

  // Cache leeren damit Antwort direkt sichtbar ist
  _reviewsCache = null;

  return await r.json();
}

/**
 * Antwort auf ein Review loeschen.
 * @param {object} pool
 * @param {string} reviewName
 */
async function deleteReply(pool, reviewName) {
  if (!reviewName) throw new Error("reviewName fehlt");

  const accessToken = await getAccessToken(pool);

  const r = await fetch(GBP_BASE + "/" + reviewName + "/reply", {
    method: "DELETE",
    headers: { Authorization: "Bearer " + accessToken },
    signal: AbortSignal.timeout(10000),
  });

  if (!r.ok && r.status !== 404) {
    const errText = await r.text().catch(() => String(r.status));
    throw new Error("Antwort loeschen fehlgeschlagen: " + errText);
  }

  _reviewsCache = null;
  return { ok: true };
}

/**
 * Verbindung trennen (Token aus DB und Cache loeschen).
 * @param {object} pool
 */
async function disconnect(pool) {
  await pool.query("DELETE FROM gbp_oauth_tokens WHERE id = 1");
  _accessTokenCache = null;
  _reviewsCache = null;
}

/**
 * Reviews-Cache manuell leeren (z.B. nach Antwort).
 */
function invalidateReviewsCache() {
  _reviewsCache = null;
}

module.exports = {
  isConfigured,
  getAuthUrl,
  exchangeCode,
  getAccessToken,
  getStatus,
  listReviews,
  replyToReview,
  deleteReply,
  disconnect,
  resolveAndSave,
  invalidateReviewsCache,
};
