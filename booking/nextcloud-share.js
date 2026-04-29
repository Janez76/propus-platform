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

async function createNextcloudShare(ncPath) {
  const { url, user, pass } = getNextcloudConfig();
  if (!isNextcloudConfigured()) {
    throw new Error(getNextcloudConfigError());
  }

  const endpoint = `${url}/ocs/v2.php/apps/files_sharing/api/v1/shares`;
  const body = new URLSearchParams({
    path: ncPath,
    shareType: "3",
    permissions: "1",
  });

  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "OCS-APIRequest": "true",
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

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
