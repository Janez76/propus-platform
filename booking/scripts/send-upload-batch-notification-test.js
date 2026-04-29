#!/usr/bin/env node
/**
 * Sendet die Büro-Mail wie nach erfolgreichem NAS-Upload (Test, inkl. Nextcloud-Link).
 * Läuft mit gleicher ENV wie der Platform-Container (DATABASE_URL, MS_GRAPH_*, NEXTCLOUD_*).
 *
 * Usage: node scripts/send-upload-batch-notification-test.js <orderNo>
 */
const path = require("path");
const dotenv = require("dotenv");

[
  path.join(__dirname, "..", ".env.local"),
  path.join(__dirname, "..", "..", ".env.local"),
  path.join(__dirname, "..", "..", ".env"),
  path.join(__dirname, "..", "..", ".env.vps.secrets"),
  path.join(__dirname, "..", "..", ".env.vps"),
].forEach((p) => {
  try {
    dotenv.config({ path: p, override: true });
  } catch (_) {}
});

const { Client } = require("@microsoft/microsoft-graph-client");
const { ClientSecretCredential } = require("@azure/identity");
const mailDeduper = require("../mail_dedupe");
const db = require("../db");
const { buildNextcloudFolderFilesUrl } = require("../nextcloud-share");

const OFFICE_EMAIL = process.env.OFFICE_EMAIL || "office@propus.ch";
const MAIL_FROM = process.env.MAIL_FROM || "noreply@propus.ch";

const GRAPH_ENV_KEYS = ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET"];
const graphEnvMissing = GRAPH_ENV_KEYS.filter((k) => !process.env[k]);
let graphClient = null;
if (!graphEnvMissing.length) {
  const credential = new ClientSecretCredential(
    process.env.MS_GRAPH_TENANT_ID,
    process.env.MS_GRAPH_CLIENT_ID,
    process.env.MS_GRAPH_CLIENT_SECRET
  );
  graphClient = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken("https://graph.microsoft.com/.default");
        return token.token;
      },
    },
  });
}

async function sendMailViaGraph(to, subject, htmlBody, textBody) {
  if (!graphClient) {
    throw new Error(`MS Graph nicht konfiguriert – fehlt: ${graphEnvMissing.join(", ")}`);
  }
  const bodyText = String(htmlBody || textBody || "");
  const key = mailDeduper.keyFor(to, subject, bodyText);
  if (!mailDeduper.shouldSend(key)) {
    console.warn("[send-upload-batch-notification-test] Dedupe: gleiche Mail wurde kurz zuvor übersprungen.");
    return { sent: false, reason: "dedupe" };
  }
  await graphClient.api(`/users/${MAIL_FROM}/sendMail`).post({
    message: {
      subject,
      body: { contentType: "HTML", content: htmlBody },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  });
  return { sent: true };
}

function pathDisplay(batch) {
  return batch.targetRelativePath || batch.target_relative_path || "-";
}

async function main() {
  const orderNo = Number(process.argv[2]);
  if (!Number.isFinite(orderNo)) {
    console.error("Usage: node scripts/send-upload-batch-notification-test.js <orderNo>");
    process.exit(1);
  }

  const order = await db.getOrderByNo(orderNo);
  if (!order) {
    console.error(`Auftrag ${orderNo} nicht gefunden`);
    process.exit(1);
  }

  const syntheticBatch = {
    id: `cli_test_${Date.now()}`,
    category: "final_video",
    folder_type: "customer_folder",
    folderType: "customer_folder",
    target_relative_path: "Finale/Video",
    targetRelativePath: "Finale/Video",
    fileCount: 3,
  };

  const storedCount = 3;
  const skippedCount = 0;
  const invalidCount = 0;
  const effectiveBatch = syntheticBatch;

  const groupedUpload = false;
  const uploadGroupTotalParts = 1;
  const subject = groupedUpload
    ? `Sammel-Upload auf NAS abgeschlossen - Auftrag #${order.orderNo}`
    : `Upload auf NAS abgeschlossen - Auftrag #${order.orderNo}`;

  let nextcloudFolderUrl = null;
  try {
    const folderType = String(effectiveBatch.folderType || effectiveBatch.folder_type || "customer_folder");
    const batchRel = String(
      effectiveBatch.targetRelativePath || effectiveBatch.target_relative_path || "",
    )
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "");
    const linkRow = await db.getOrderFolderLink(Number(order.orderNo), folderType);
    if (linkRow?.relative_path) {
      const folderRel = String(linkRow.relative_path || "")
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "");
      const combinedRelPath = batchRel ? `${folderRel}/${batchRel}` : folderRel;
      nextcloudFolderUrl = buildNextcloudFolderFilesUrl(combinedRelPath);
    }
  } catch (ncErr) {
    console.warn("[upload-batch] Nextcloud-Link konnte nicht gebaut werden:", ncErr?.message || ncErr);
  }

  const ncLinkHtml = nextcloudFolderUrl
    ? `<p style="margin:18px 0"><a href="${String(nextcloudFolderUrl)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")}" style="display:inline-block;background:#7A5E10;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Ordner in Nextcloud öffnen</a></p>`
    : "";

  const html = `
    <p>${groupedUpload
      ? `Der Sammel-Upload fuer <strong>Auftrag #${order.orderNo}</strong> wurde vollstaendig auf die NAS uebertragen.`
      : `Der Upload fuer <strong>Auftrag #${order.orderNo}</strong> wurde auf die NAS uebertragen.`}</p>
    ${ncLinkHtml}
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#888">Adresse</td><td><strong>${order.address || "-"}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Kategorie</td><td>${effectiveBatch.category || "-"}</td></tr>
      ${groupedUpload ? `<tr><td style="padding:4px 12px 4px 0;color:#888">Teilpakete</td><td>${uploadGroupTotalParts}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#888">Dateien gesamt</td><td>${effectiveBatch.fileCount || storedCount + skippedCount + invalidCount}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Gespeichert</td><td>${storedCount}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Duplikate</td><td>${skippedCount}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Ungueltig</td><td>${invalidCount}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Zielpfad</td><td>${pathDisplay(effectiveBatch)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">${groupedUpload ? "Upload-Gruppe" : "Batch-ID"}</td><td>${effectiveBatch.id}</td></tr>
    </table>
  `;
  const text = [
    subject,
    groupedUpload
      ? `Der Sammel-Upload fuer Auftrag #${order.orderNo} wurde vollstaendig auf die NAS uebertragen.`
      : `Der Upload fuer Auftrag #${order.orderNo} wurde auf die NAS uebertragen.`,
    ...(nextcloudFolderUrl ? [`Nextcloud (Upload-Ordner): ${nextcloudFolderUrl}`] : []),
    `Adresse: ${order.address || "-"}`,
    `Kategorie: ${effectiveBatch.category || "-"}`,
    ...(groupedUpload ? [`Teilpakete: ${uploadGroupTotalParts}`] : []),
    `Dateien gesamt: ${effectiveBatch.fileCount || storedCount + skippedCount + invalidCount}`,
    `Gespeichert: ${storedCount}`,
    `Duplikate: ${skippedCount}`,
    `Ungueltig: ${invalidCount}`,
    `Zielpfad: ${pathDisplay(effectiveBatch)}`,
    `${groupedUpload ? "Upload-Gruppe" : "Batch-ID"}: ${effectiveBatch.id}`,
  ].join("\n");

  const result = await sendMailViaGraph(OFFICE_EMAIL, subject, html, text);
  if (result.sent === false && result.reason === "dedupe") {
    process.exit(0);
  }
  console.log("OK: Test-Mail gesendet an", OFFICE_EMAIL, "orderNo=", orderNo);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
