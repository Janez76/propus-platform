"use strict";

const rbac = require("./access-rbac");
const db = require("./db");

function trimText(v) {
  return String(v == null ? "" : v).trim();
}

function coalesceField(keepVal, mergeVal) {
  if (trimText(keepVal) !== "") return keepVal;
  return mergeVal == null ? keepVal : mergeVal;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} keepId
 * @param {number} mergeId
 */
async function mergeCustomerRecords(client, keepId, mergeId) {
  if (keepId === mergeId) {
    const e = new Error("SAME_ID");
    e.code = "SAME_ID";
    throw e;
  }

  const { rows } = await client.query(`SELECT * FROM customers WHERE id = ANY($1::int[])`, [[keepId, mergeId]]);
  if (rows.length !== 2) {
    const e = new Error("NOT_FOUND");
    e.code = "NOT_FOUND";
    throw e;
  }
  const keep = rows.find((r) => Number(r.id) === keepId);
  const merge = rows.find((r) => Number(r.id) === mergeId);
  if (!keep || !merge) {
    const e = new Error("NOT_FOUND");
    e.code = "NOT_FOUND";
    throw e;
  }

  try {
    await client.query(
      `UPDATE tour_manager.portal_users SET core_customer_id = $1 WHERE core_customer_id = $2`,
      [keepId, mergeId],
    );
  } catch (err) {
    const msg = String(err?.message || "");
    if (err?.code !== "42P01" && !/relation .* does not exist/i.test(msg)) throw err;
  }

  await client.query(`UPDATE orders SET customer_id = $1 WHERE customer_id = $2`, [keepId, mergeId]);
  await client.query(`UPDATE customer_contacts SET customer_id = $1 WHERE customer_id = $2`, [keepId, mergeId]);

  await client.query(
    `UPDATE permission_groups SET scope_customer_id = $1, updated_at = NOW() WHERE scope_customer_id = $2`,
    [keepId, mergeId],
  );

  await client.query(`UPDATE subject_permission_overrides SET scope_customer_id = $1 WHERE scope_customer_id = $2`, [
    keepId,
    mergeId,
  ]);

  await client.query(`DELETE FROM access_subjects WHERE customer_id = $1`, [mergeId]);

  await client.query(`DELETE FROM customer_sessions WHERE customer_id = $1`, [mergeId]);
  await client.query(`DELETE FROM customer_email_verifications WHERE customer_id = $1`, [mergeId]);
  await client.query(`DELETE FROM customer_password_resets WHERE customer_id = $1`, [mergeId]);

  const mergeEmail = trimText(merge.email).toLowerCase();
  const keepEmail = trimText(keep.email).toLowerCase();
  let noteBlock = `\n\n--- Zusammengeführt (aufgelöster Kunde ID ${mergeId}) ---`;
  if (mergeEmail && mergeEmail !== keepEmail) {
    noteBlock += `\nE-Mail des aufgelösten Kunden: ${mergeEmail}`;
  }
  if (trimText(merge.notes)) {
    noteBlock += `\n${trimText(merge.notes)}`;
  }

  const kSub = trimText(keep.auth_sub);
  const mSub = trimText(merge.auth_sub);
  if (kSub && mSub && kSub !== mSub) {
    noteBlock += `\nSSO-Subject Zweitkonto (nicht übernommen): ${mSub}`;
  }

  const nextNotes = trimText(keep.notes) ? `${trimText(keep.notes)}${noteBlock}` : `Kunde ${keepId}${noteBlock}`;

  const nextEmail = keepEmail || mergeEmail || "";
  const nextAuthSub = kSub || mSub || null;
  const nextPassword = keep.password_hash || merge.password_hash || null;
  const nextIsAdmin = Boolean(keep.is_admin) || Boolean(merge.is_admin);
  const nextBlocked = Boolean(keep.blocked) || Boolean(merge.blocked);
  const nextEmailVerified = Boolean(keep.email_verified) || Boolean(merge.email_verified);

  // E-Mail-Aliases: Aliase beider Kunden vereinigen.
  // Die frühere Haupt-E-Mail des aufgelösten Kunden wird als Alias übernommen,
  // damit zukünftige Lookups (Touren, Bestellungen, Portal-Login) unter beiden
  // Domains funktionieren.
  const keepAliases = Array.isArray(keep.email_aliases) ? keep.email_aliases : [];
  const mergeAliases = Array.isArray(merge.email_aliases) ? merge.email_aliases : [];
  const aliasSet = new Set(
    [...keepAliases, ...mergeAliases, mergeEmail]
      .map((e) => trimText(e).toLowerCase())
      .filter((e) => e && e !== nextEmail)
  );
  const nextEmailAliases = Array.from(aliasSet);

  const merged = {
    email: nextEmail,
    name: coalesceField(keep.name, merge.name),
    company: coalesceField(keep.company, merge.company),
    phone: coalesceField(keep.phone, merge.phone),
    onsite_name: coalesceField(keep.onsite_name, merge.onsite_name),
    onsite_phone: coalesceField(keep.onsite_phone, merge.onsite_phone),
    street: coalesceField(keep.street, merge.street),
    zipcity: coalesceField(keep.zipcity, merge.zipcity),
    salutation: coalesceField(keep.salutation, merge.salutation),
    first_name: coalesceField(keep.first_name, merge.first_name),
    address_addon_1: coalesceField(keep.address_addon_1, merge.address_addon_1),
    address_addon_2: coalesceField(keep.address_addon_2, merge.address_addon_2),
    address_addon_3: coalesceField(keep.address_addon_3, merge.address_addon_3),
    po_box: coalesceField(keep.po_box, merge.po_box),
    zip: coalesceField(keep.zip, merge.zip),
    city: coalesceField(keep.city, merge.city),
    country: coalesceField(keep.country, merge.country),
    phone_2: coalesceField(keep.phone_2, merge.phone_2),
    phone_mobile: coalesceField(keep.phone_mobile, merge.phone_mobile),
    phone_fax: coalesceField(keep.phone_fax, merge.phone_fax),
    website: coalesceField(keep.website, merge.website),
    exxas_customer_id: coalesceField(keep.exxas_customer_id, merge.exxas_customer_id),
    exxas_address_id: coalesceField(keep.exxas_address_id, merge.exxas_address_id),
    exxas_contact_id: coalesceField(keep.exxas_contact_id, merge.exxas_contact_id),
    nas_customer_folder_base: coalesceField(keep.nas_customer_folder_base, merge.nas_customer_folder_base),
    nas_raw_folder_base: coalesceField(keep.nas_raw_folder_base, merge.nas_raw_folder_base),
    password_hash: nextPassword,
    auth_sub: nextAuthSub,
    notes: nextNotes,
    is_admin: nextIsAdmin,
    blocked: nextBlocked,
    email_verified: nextEmailVerified,
    email_aliases: nextEmailAliases,
  };

  const cols = Object.keys(merged);
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((c) => merged[c]);
  await client.query(`UPDATE customers SET ${sets}, updated_at = NOW() WHERE id = $${values.length + 1}`, [
    ...values,
    keepId,
  ]);

  await client.query(`DELETE FROM customers WHERE id = $1`, [mergeId]);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} keepId – verbleibender Kunde
 * @param {number} mergeId – wird aufgelöst
 */
async function mergeCustomers(pool, keepId, mergeId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await mergeCustomerRecords(client, keepId, mergeId);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  try {
    let em = "";
    const pool = db.getPool && db.getPool();
    if (pool) {
      const { rows } = await pool.query("SELECT email FROM customers WHERE id = $1", [keepId]);
      em = String(rows[0]?.email || "");
    }
    await rbac.syncCustomerRolesFromDb(keepId, em);
  } catch (_e) {
    /* RBAC optional */
  }
}

module.exports = { mergeCustomers, mergeCustomerRecords };
