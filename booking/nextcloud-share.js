/**
 * Nextcloud OCS Share API Helper
 *
 * Erstellt und verwaltet öffentliche Freigabelinks für Kundenordner.
 * Voraussetzung: NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASS sind gesetzt.
 */

const NC_URL = (process.env.NEXTCLOUD_URL || "").replace(/\/$/, "");
const NC_USER = process.env.NEXTCLOUD_USER || "";
const NC_PASS = process.env.NEXTCLOUD_PASS || "";

function isNextcloudConfigured() {
  return Boolean(NC_URL && NC_USER && NC_PASS);
}

async function createNextcloudShare(ncPath) {
  if (!isNextcloudConfigured()) {
    throw new Error("Nextcloud nicht konfiguriert (NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASS fehlen)");
  }

  const endpoint = `${NC_URL}/ocs/v2.php/apps/files_sharing/api/v1/shares`;
  const body = new URLSearchParams({
    path: ncPath,
    shareType: "3",
    permissions: "1",
  });

  const auth = Buffer.from(`${NC_USER}:${NC_PASS}`).toString("base64");
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

  const endpoint = `${NC_URL}/ocs/v2.php/apps/files_sharing/api/v1/shares/${shareId}`;
  const auth = Buffer.from(`${NC_USER}:${NC_PASS}`).toString("base64");
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
  const base = (process.env.NEXTCLOUD_CUSTOMER_FOLDER_PATH || "").replace(/\/$/, "");
  const rel = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\//, "");
  return base ? `${base}/${rel}` : `/${rel}`;
}

module.exports = {
  isNextcloudConfigured,
  createNextcloudShare,
  deleteNextcloudShare,
  buildNextcloudPath,
};
