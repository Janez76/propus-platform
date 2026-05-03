/**
 * Nextcloud OCS Share API Helper
 *
 * Erstellt und verwaltet öffentliche Freigabelinks für Kundenordner.
 * Voraussetzung: NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASS sind gesetzt.
 */

const NEXTCLOUD_CONFIG_ERROR = "Nextcloud nicht konfiguriert (NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASS fehlen)";

function readEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) return "";
  if (value === "-" || /^null$/i.test(value) || /^undefined$/i.test(value)) return "";
  return value;
}

function getNextcloudConfig() {
  return {
    url: readEnv("NEXTCLOUD_URL").replace(/\/$/, ""),
    user: readEnv("NEXTCLOUD_USER"),
    pass: readEnv("NEXTCLOUD_PASS"),
    customerFolderPath: readEnv("NEXTCLOUD_CUSTOMER_FOLDER_PATH").replace(/\/$/, ""),
  };
}

function isNextcloudConfigured() {
  const { url, user, pass } = getNextcloudConfig();
  return Boolean(url && user && pass);
}

function getNextcloudConfigError() {
  return NEXTCLOUD_CONFIG_ERROR;
}

/**
 * Sucht einen bestehenden Public-Link-Share (shareType=3) fuer den
 * gegebenen Pfad. Wird als Idempotency-Lookup vor und nach dem Create
 * benutzt, damit ein Timeout/Network-Fehler nicht zu Duplicate-Shares
 * fuehrt (CodeRabbit-Review #254: POST kann timeout NACHDEM der Server
 * den Share schon angelegt hat).
 *
 * Returnt das erste Public-Link-Share-Objekt aus den OCS-Daten oder null.
 */
async function findExistingPublicLinkShare(ncPath, { url, user, pass }) {
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const lookupUrl =
    `${url}/ocs/v2.php/apps/files_sharing/api/v1/shares?` +
    new URLSearchParams({ path: ncPath, reshares: "true" }).toString();
  let response;
  try {
    response = await fetch(lookupUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "OCS-APIRequest": "true",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null; // best-effort: bei Lookup-Fehler kein Pre-Check, normale POST-Logik laeuft weiter
  }
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  const data = json?.ocs?.data;
  const list = Array.isArray(data) ? data : (data ? [data] : []);
  const match = list.find((s) => Number(s?.share_type) === 3);
  if (!match) return null;
  return { shareId: match.id, shareUrl: match.url };
}

async function createNextcloudShare(ncPath) {
  const config = getNextcloudConfig();
  const { url, user, pass } = config;
  if (!isNextcloudConfigured()) {
    throw new Error(getNextcloudConfigError());
  }

  // Pre-Lookup: existiert schon ein Public-Link-Share fuer diesen Pfad?
  // Dann den wiederverwenden — schuetzt vor Duplicates wenn ein vorheriger
  // Aufruf nach POST-Timeout abgebrochen ist, der Server aber den Share
  // dennoch angelegt hat.
  const preExisting = await findExistingPublicLinkShare(ncPath, config);
  if (preExisting) return preExisting;

  const endpoint = `${url}/ocs/v2.php/apps/files_sharing/api/v1/shares`;
  const body = new URLSearchParams({
    path: ncPath,
    shareType: "3",
    permissions: "1",
  });

  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "OCS-APIRequest": "true",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      // Bug-Hunt T07: ohne Timeout haengt der Worker bei langsamem Nextcloud.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // Bei Timeout/Network-Fehler nochmal nachsehen — vielleicht hat der Server
    // den Share doch noch angelegt waehrend der Timeout abgebrochen hat.
    const postExisting = await findExistingPublicLinkShare(ncPath, config);
    if (postExisting) return postExisting;
    throw new Error(`Nextcloud Share POST fehlgeschlagen: ${err && err.message ? err.message : err}`);
  }

  const json = await response.json().catch(() => null);
  const meta = json?.ocs?.meta || null;
  const ok =
    response.ok &&
    meta &&
    (meta.status === "ok" || (Number(meta.statuscode || 0) >= 200 && Number(meta.statuscode || 0) < 300));

  if (!ok) {
    const msg = meta?.message || `HTTP ${response.status}`;
    throw new Error(`Nextcloud Share konnte nicht erstellt werden: ${msg}`);
  }

  const shareData = json.ocs.data;
  return {
    shareId: shareData.id,
    shareUrl: shareData.url,
  };
}

async function deleteNextcloudShare(shareId) {
  if (!isNextcloudConfigured()) return;
  const { url, user, pass } = getNextcloudConfig();

  const endpoint = `${url}/ocs/v2.php/apps/files_sharing/api/v1/shares/${shareId}`;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${auth}`,
      "OCS-APIRequest": "true",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const msg = json?.ocs?.meta?.message || `HTTP ${response.status}`;
    throw new Error(`Nextcloud Share konnte nicht gelöscht werden: ${msg}`);
  }
}

function buildNextcloudPath(relativePath) {
  const { customerFolderPath } = getNextcloudConfig();
  const rel = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\//, "");
  return customerFolderPath ? `${customerFolderPath}/${rel}` : `/${rel}`;
}

/**
 * Web-UI-Link zur Files-App im angegebenen Ordner (gleiches Pfad-Mapping wie API-Shares).
 * Benötigt nur NEXTCLOUD_URL (keine Nextcloud-Login-Daten).
 *
 * @param {string} relativePathUnderBookingCustomerRoot Relativpfad ab BOOKING-Kundenroot (wie bei buildNextcloudPath)
 * @returns {string|null}
 */
function buildNextcloudFolderFilesUrl(relativePathUnderBookingCustomerRoot) {
  const baseUrl = readEnv("NEXTCLOUD_URL").replace(/\/$/, "");
  if (!baseUrl) return null;
  const ncPath = buildNextcloudPath(relativePathUnderBookingCustomerRoot);
  let norm = String(ncPath || "")
    .replace(/\\/g, "/")
    .trim();
  if (!norm.startsWith("/")) norm = `/${norm.replace(/^\/+/, "")}`;
  return `${baseUrl}/apps/files/?dir=${encodeURIComponent(norm)}`;
}

module.exports = {
  getNextcloudConfig,
  getNextcloudConfigError,
  isNextcloudConfigured,
  createNextcloudShare,
  deleteNextcloudShare,
  buildNextcloudPath,
  buildNextcloudFolderFilesUrl,
};
