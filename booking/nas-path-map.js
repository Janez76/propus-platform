/**
 * Mappt VPS-Container-Pfade (wie in DB/order_folder_links) auf lokale NAS-Pfade
 * und baut rsync-Quellargumente für Pull vom VPS-Staging.
 */
const path = require("path");

/** Einheitliche Slash-Notation für Präfix-Vergleiche (Windows + Linux). */
function toPosixSlashes(p) {
  return String(p || "").replace(/\\/g, "/");
}

/**
 * @param {string} containerPath z. B. /booking_upload_raw/8266 ...
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
function mapBookingContainerPathToNas(containerPath, env = process.env) {
  const p = toPosixSlashes(path.normalize(String(containerPath || "")));
  const rawNas = String(env.NAS_BOOKING_UPLOAD_RAW_ROOT || "").trim();
  const custNas = String(env.NAS_BOOKING_UPLOAD_CUSTOMER_ROOT || "").trim();
  const rawPrefix = "/booking_upload_raw";
  const custPrefix = "/booking_upload_customer";

  if (!rawNas || !custNas) {
    throw new Error(
      "NAS_BOOKING_UPLOAD_RAW_ROOT und NAS_BOOKING_UPLOAD_CUSTOMER_ROOT müssen gesetzt sein (NAS-Pull-Worker)"
    );
  }

  if (p === rawPrefix || p.startsWith(`${rawPrefix}/`)) {
    const rest = p.slice(rawPrefix.length).replace(/^\/+/, "");
    return rest ? path.join(rawNas, ...rest.split("/")) : rawNas;
  }
  if (p === custPrefix || p.startsWith(`${custPrefix}/`)) {
    const rest = p.slice(custPrefix.length).replace(/^\/+/, "");
    return rest ? path.join(custNas, ...rest.split("/")) : custNas;
  }
  throw new Error(`Unbekannter Container-Pfad (nicht gemappt): ${containerPath}`);
}

/**
 * Staging-Pfad im Container (/upload_staging/...) → Host-Pfad auf dem VPS für rsync über SSH.
 * @param {string} stagingPath z. B. /upload_staging/upl_.../file.bin
 * @param {Record<string, string | undefined>} env
 */
function mapContainerStagingToVpsHostPath(stagingPath, env = process.env) {
  const hostRoot = String(env.NAS_VPS_STAGING_HOST_PATH || "/opt/propus-upload-staging").trim();
  const containerRoot = toPosixSlashes(path.normalize(String(env.BOOKING_UPLOAD_STAGING_ROOT || "/upload_staging").trim()));
  const p = toPosixSlashes(path.normalize(String(stagingPath || "")));
  if (p === containerRoot || p.startsWith(`${containerRoot}/`)) {
    const rest = p.slice(containerRoot.length).replace(/^\/+/, "");
    return rest ? path.join(hostRoot, ...rest.split("/")) : hostRoot;
  }
  throw new Error(`Staging-Pfad liegt nicht unter ${containerRoot}: ${stagingPath}`);
}

/**
 * rsync remote source spec: user@host:/abs/path
 * @param {string} host user@host oder Hostalias
 * @param {string} hostAbsPath absolut auf dem VPS-Host
 */
function buildRsyncRemoteSource(host, hostAbsPath) {
  const h = String(host || "").trim();
  const abs = toPosixSlashes(path.normalize(String(hostAbsPath || "")));
  if (!h) throw new Error("NAS_VPS_SSH_HOST fehlt");
  return `${h}:${abs}`;
}

/**
 * Inverse zu mapBookingContainerPathToNas — für DB-Felder wie target_absolute_path (VPS-Notation).
 */
function mapNasLocalPathToContainer(nasPath, env = process.env) {
  const p = toPosixSlashes(path.normalize(String(nasPath || "")));
  const rawNas = toPosixSlashes(path.normalize(String(env.NAS_BOOKING_UPLOAD_RAW_ROOT || "").trim()));
  const custNas = toPosixSlashes(path.normalize(String(env.NAS_BOOKING_UPLOAD_CUSTOMER_ROOT || "").trim()));
  if (!rawNas || !custNas) {
    throw new Error("NAS_BOOKING_UPLOAD_RAW_ROOT und NAS_BOOKING_UPLOAD_CUSTOMER_ROOT müssen gesetzt sein");
  }
  if (p === rawNas || p.startsWith(`${rawNas}/`)) {
    const rest = p.slice(rawNas.length).replace(/^\/+/, "");
    return rest ? `/booking_upload_raw/${rest}` : "/booking_upload_raw";
  }
  if (p === custNas || p.startsWith(`${custNas}/`)) {
    const rest = p.slice(custNas.length).replace(/^\/+/, "");
    return rest ? `/booking_upload_customer/${rest}` : "/booking_upload_customer";
  }
  throw new Error(`NAS-Pfad nicht unter RAW/CUSTOMER-Root: ${nasPath}`);
}

module.exports = {
  mapBookingContainerPathToNas,
  mapContainerStagingToVpsHostPath,
  buildRsyncRemoteSource,
  mapNasLocalPathToContainer,
};
