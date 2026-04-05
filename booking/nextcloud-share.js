/**
 * Nextcloud OCS Share API Helper
 *
 * Erstellt und verwaltet öffentliche Freigabelinks für Kundenordner.
 * Voraussetzung: NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASS sind gesetzt.
 *
 * Nextcloud OCS Share API:
 * POST /ocs/v2.php/apps/files_sharing/api/v1/shares
 * DELETE /ocs/v2.php/apps/files_sharing/api/v1/shares/:id
 */

const NC_URL = (process.env.NEXTCLOUD_URL || "").replace(/\/$/, "");
const NC_USER = process.env.NEXTCLOUD_USER || "";
const NC_PASS = process.env.NEXTCLOUD_PASS || "";

/**
 * Gibt true zurück wenn Nextcloud-Integration konfiguriert ist.
 */
function isNextcloudConfigured() {
  return Boolean(NC_URL && NC_USER && NC_PASS);
}

/**
 * Erstellt einen öffentlichen Freigabelink (nur lesen) für einen Nextcloud-Pfad.
 *
 * @param {string} ncPath - Pfad innerhalb von Nextcloud (z.B. "/Immobilien Fotografie Propusimmo/Kunden/Firma/...")
 * @returns {Promise<{ shareId: number, shareUrl: string }>}
 */
async function createNextcloudShare(ncPath) {
  if (!isNextcloudConfigured()) {
    throw new Error("Nextcloud nicht konfiguriert (NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASS fehlen)");
  }

  const endpoint = `${NC_URL}/ocs/v2.php/apps/files_sharing/api/v1/shares`;
  const body = new URLSearchParams({
    path: ncPath,
    shareType: "3",    // 3 = öffentlicher Link
    permissions: "1",  // 1 = nur lesen
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

  if (!response.ok || json?.ocs?.meta?.statuscode !== 100) {
    const msg = json?.ocs?.meta?.message || `HTTP ${response.status}`;
    throw new Error(`Nextcloud Share konnte nicht erstellt werden: ${msg}`);
  }

  const shareData = json.ocs.data;
  return {
    shareId: shareData.id,
    shareUrl: shareData.url,
  };
}

/**
 * Löscht eine Nextcloud-Freigabe anhand der Share-ID.
 *
 * @param {number|string} shareId
 * @returns {Promise<void>}
 */
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

/**
 * Berechnet den Nextcloud-Pfad aus einem relativen Buchungs-Ordnerpfad.
 * NEXTCLOUD_CUSTOMER_FOLDER_PATH definiert den Basispfad in Nextcloud,
 * der dem BOOKING_UPLOAD_CUSTOMER_ROOT entspricht.
 *
 * @param {string} relativePath - relativer Pfad ab Customer-Root (z.B. "CSL Immobilien AG/8001 Zürich, Str 1 #100")
 * @returns {string} vollständiger Nextcloud-Pfad
 */
function buildNextcloudPath(relativePath) {
  const base = (process.env.NEXTCLOUD_CUSTOMER_FOLDER_PATH || "").replace(/\/$/, "");
  const rel = relativePath.replace(/\\/g, "/").replace(/^\//, "");
  return base ? `${base}/${rel}` : `/${rel}`;
}

module.exports = {
  isNextcloudConfigured,
  createNextcloudShare,
  deleteNextcloudShare,
  buildNextcloudPath,
};
