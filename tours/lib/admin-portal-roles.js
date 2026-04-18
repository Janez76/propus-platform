/**
 * Portal-Rollen (intern/extern) — Daten und Helfer wie in routes/admin.js
 */

const { pool } = require('./db');
const portalTeam = require('./portal-team');

async function runExternPortalSync(_ownerEmail, _memberEmail) {
  // Logto entfernt – kein externer Sync mehr nötig
}

async function loadPortalRolesSnapshot(queryTab) {
  await portalTeam.ensurePortalTeamSchema();
  const tab = queryTab === 'extern' ? 'extern' : 'intern';
  const staffRows = await portalTeam.listPortalStaffRoles();

  let externRows = [];
  try {
    const r = await pool.query(`
      SELECT
        m.owner_email,
        m.member_email,
        m.display_name,
        m.role,
        m.status,
        m.accepted_at,
        m.created_at,
        COALESCE(m.customer_id, c_mail.id) AS customer_id,
        COALESCE(
          NULLIF(trim(c_cid.name),''),
          NULLIF(trim(c_cid.company),''),
          NULLIF(trim(c_mail.name),''),
          NULLIF(trim(c_mail.company),''),
          (
            SELECT trim(t.customer_name)
            FROM tour_manager.tours t
            WHERE LOWER(TRIM(t.customer_email)) = LOWER(TRIM(m.owner_email))
              AND trim(coalesce(t.customer_name, '')) <> ''
            ORDER BY t.customer_name
            LIMIT 1
          ),
          m.owner_email
        ) AS customer_name
      FROM tour_manager.portal_team_members m
      LEFT JOIN core.customers c_cid ON m.customer_id IS NOT NULL AND c_cid.id = m.customer_id
      LEFT JOIN core.customers c_mail ON m.customer_id IS NULL AND LOWER(c_mail.email) = LOWER(m.owner_email)
      WHERE m.role IN ('admin', 'inhaber')
        AND m.status = 'active'
      ORDER BY COALESCE(m.customer_id, c_mail.id) NULLS LAST, LOWER(m.owner_email), m.role DESC, LOWER(m.member_email)
    `);
    externRows = r.rows;
  } catch (_) {
    /* Tabelle fehlt */
  }

  let ownerList = [];
  try {
    const owR = await pool.query(`
      SELECT DISTINCT ON (LOWER(TRIM(t.customer_email)))
        LOWER(TRIM(t.customer_email)) AS owner_email,
        CASE
          WHEN trim(coalesce(c_ref.name,'')) <> '' THEN trim(c_ref.name)
          WHEN trim(coalesce(c_ref.company,'')) <> '' THEN trim(c_ref.company)
          WHEN trim(coalesce(c.name,'')) <> '' THEN trim(c.name)
          WHEN trim(coalesce(c.company,'')) <> '' THEN trim(c.company)
          WHEN trim(coalesce(c_cc.name,'')) <> '' THEN trim(c_cc.name)
          WHEN trim(coalesce(c_cc.company,'')) <> '' THEN trim(c_cc.company)
          WHEN trim(coalesce(t.customer_name,'')) <> '' THEN trim(t.customer_name)
          WHEN trim(coalesce(t.kunde_ref::text,'')) <> '' THEN trim(t.kunde_ref::text)
          ELSE LOWER(TRIM(t.customer_email))
        END AS customer_name,
        CASE
          WHEN trim(coalesce(c_ref.company,'')) <> '' THEN trim(c_ref.company)
          WHEN trim(coalesce(c_ref.name,'')) <> '' THEN trim(c_ref.name)
          WHEN trim(coalesce(c.company,'')) <> '' THEN trim(c.company)
          WHEN trim(coalesce(c.name,'')) <> '' THEN trim(c.name)
          WHEN trim(coalesce(c_cc.company,'')) <> '' THEN trim(c_cc.company)
          WHEN trim(coalesce(c_cc.name,'')) <> '' THEN trim(c_cc.name)
          WHEN trim(coalesce(t.customer_name,'')) <> '' THEN trim(t.customer_name)
          ELSE NULL
        END AS firma,
        COALESCE(c_ref.id, c.id, c_cc.id) AS customer_id
      FROM tour_manager.tours t
      LEFT JOIN core.customers c ON LOWER(c.email) = LOWER(t.customer_email)
      LEFT JOIN core.customers c_ref ON trim(c_ref.customer_number) = trim(CAST(t.kunde_ref AS text))
      LEFT JOIN core.customer_contacts cc_link ON LOWER(cc_link.email) = LOWER(t.customer_email)
      LEFT JOIN core.customers c_cc ON c_cc.id = cc_link.customer_id
        AND c.id IS NULL AND c_ref.id IS NULL
      WHERE t.customer_email IS NOT NULL AND trim(t.customer_email) <> ''
      ORDER BY LOWER(TRIM(t.customer_email)),
               CASE WHEN trim(coalesce(c_ref.name,''))
                      OR trim(coalesce(c_ref.company,''))
                      OR trim(coalesce(c.name,''))
                      OR trim(coalesce(c.company,''))
                      OR trim(coalesce(c_cc.name,''))
                      OR trim(coalesce(c_cc.company,''))
                      OR trim(coalesce(t.customer_name,''))
                    THEN 0 ELSE 1 END
      LIMIT 300
    `);
    const seen = new Map();
    for (const row of owR.rows) {
      const key = row.customer_id
        ? `cid:${row.customer_id}`
        : `name:${(row.customer_name || row.owner_email).toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, row);
      } else {
        const existing = seen.get(key);
        if (!existing.firma && row.firma) seen.set(key, row);
      }
    }
    ownerList = [...seen.values()].sort((a, b) => {
      const aHas = a.firma ? 0 : 1;
      const bHas = b.firma ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return (a.customer_name || '').localeCompare(b.customer_name || '', 'de');
    });
  } catch (err) {
    console.error('[portal-roles ownerList]', err.message);
  }

  return {
    tab,
    staffRows,
    externRows,
    ownerList,
    logtoPortalEnabled: false,
  };
}

function mergeContacts(base, additions) {
  const seen = new Set(base.map((c) => c.email));
  for (const c of additions) {
    if (c.email && !seen.has(c.email)) {
      seen.add(c.email);
      base.push(c);
    }
  }
  return base;
}

async function loadPortalMembers(ownerEmailNorm, customerIdOverride) {
  if (!ownerEmailNorm && !customerIdOverride) return [];
  try {
    const cid =
      customerIdOverride ||
      (await (async () => {
        const r = await pool.query(
          `SELECT id FROM core.customers
           WHERE core.customer_email_matches($1, email, email_aliases)
           LIMIT 1`,
          [ownerEmailNorm]
        );
        return r.rows[0]?.id ? Number(r.rows[0].id) : null;
      })());

    let pm;
    if (cid) {
      pm = await pool.query(
        `SELECT
           LOWER(TRIM(member_email)) AS email,
           COALESCE(NULLIF(TRIM(display_name),''), LOWER(TRIM(member_email))) AS name,
           CASE role
             WHEN 'admin'   THEN 'Kunden-Admin'
             WHEN 'inhaber' THEN 'Inhaber'
             ELSE 'Mitarbeiter'
           END AS position
         FROM tour_manager.portal_team_members
         WHERE customer_id = $1
           AND status = 'active'
           AND member_email IS NOT NULL AND TRIM(member_email) <> ''
         ORDER BY member_email`,
        [cid]
      );
    } else {
      pm = await pool.query(
        `SELECT
           LOWER(TRIM(member_email)) AS email,
           COALESCE(NULLIF(TRIM(display_name),''), LOWER(TRIM(member_email))) AS name,
           CASE role
             WHEN 'admin'   THEN 'Kunden-Admin'
             WHEN 'inhaber' THEN 'Inhaber'
             ELSE 'Mitarbeiter'
           END AS position
         FROM tour_manager.portal_team_members
         WHERE LOWER(TRIM(owner_email)) = $1
           AND status = 'active'
           AND member_email IS NOT NULL AND TRIM(member_email) <> ''
         ORDER BY member_email`,
        [ownerEmailNorm]
      );
    }
    return pm.rows
      .map((row) => ({
        email: String(row.email || '').trim().toLowerCase(),
        name: String(row.name || '').trim(),
        position: String(row.position || '').trim(),
      }))
      .filter((c) => c.email);
  } catch (_) {
    return [];
  }
}

async function getPortalExternContactsJson(ownerEmailRaw, customerIdRaw) {
  const ownerEmail = String(ownerEmailRaw || '').trim().toLowerCase();
  const customerId = Number.parseInt(String(customerIdRaw || ''), 10);
  if (!ownerEmail && !Number.isInteger(customerId)) return { ok: true, contacts: [] };

  try {
    let customer = null;
    if (Number.isInteger(customerId)) {
      const r = await pool.query(`SELECT id, name, company, email FROM core.customers WHERE id = $1`, [customerId]);
      customer = r.rows[0] || null;
    }
    if (!customer && ownerEmail) {
      const r = await pool.query(
        `SELECT id, name, company, email FROM core.customers
         WHERE core.customer_email_matches($1, email, email_aliases)
         LIMIT 1`,
        [ownerEmail]
      );
      customer = r.rows[0] || null;
    }

    if (!customer) {
      if (!ownerEmail) return { ok: true, contacts: [] };
      const base = [{ email: ownerEmail, name: ownerEmail, position: 'Workspace-Inhaber' }];
      try {
        const nameRow = await pool.query(
          `SELECT DISTINCT trim(t.customer_name) AS customer_name
           FROM tour_manager.tours t
           LEFT JOIN core.customers c ON LOWER(c.email) = LOWER(t.customer_email)
           WHERE LOWER(TRIM(t.customer_email)) = $1
             AND t.customer_name IS NOT NULL AND trim(t.customer_name) <> ''
             AND c.id IS NULL
           LIMIT 1`,
          [ownerEmail]
        );
        const firmName = nameRow.rows[0]?.customer_name || null;
        if (firmName) {
          const siblingsRow = await pool.query(
            `SELECT DISTINCT LOWER(TRIM(t.customer_email)) AS email
             FROM tour_manager.tours t
             LEFT JOIN core.customers c ON LOWER(c.email) = LOWER(t.customer_email)
             WHERE LOWER(trim(t.customer_name)) = LOWER($1)
               AND LOWER(TRIM(t.customer_email)) <> $2
               AND t.customer_email IS NOT NULL AND TRIM(t.customer_email) <> ''
               AND c.id IS NULL
             LIMIT 50`,
            [firmName, ownerEmail]
          );
          for (const row of siblingsRow.rows) {
            if (row.email && !base.some((b) => b.email === row.email)) {
              base.push({ email: row.email, name: row.email, position: 'Kontakt dieser Firma' });
            }
          }
        }
      } catch (_) {
        /* ignore */
      }
      const portalMembers = await loadPortalMembers(ownerEmail);
      return { ok: true, contacts: mergeContacts(base, portalMembers) };
    }

    const r = await pool.query(
      `SELECT cc.id, cc.name, cc.email, cc.role AS position
       FROM core.customer_contacts cc
       WHERE cc.customer_id = $1
         AND cc.email IS NOT NULL AND trim(cc.email) <> ''
       ORDER BY cc.name ASC`,
      [customer.id]
    );
    const contacts = r.rows
      .map((row) => ({
        email: String(row.email || '').trim().toLowerCase(),
        name: String(row.name || '').trim(),
        position: String(row.position || '').trim(),
      }))
      .filter((c) => c.email);

    const ownerEmailNorm = String(ownerEmail || customer.email || '').trim().toLowerCase();
    const ownerName = String(customer.name || customer.company || '').trim();
    if (ownerEmailNorm && !contacts.some((c) => c.email === ownerEmailNorm)) {
      contacts.unshift({
        email: ownerEmailNorm,
        name: ownerName || ownerEmailNorm,
        position: customer.company ? 'Hauptkontakt' : 'Workspace-Inhaber',
      });
    }

    const customerEmailNorm = String(customer.email || '').trim().toLowerCase();
    if (
      customerEmailNorm &&
      customerEmailNorm !== ownerEmailNorm &&
      !contacts.some((c) => c.email === customerEmailNorm)
    ) {
      contacts.push({
        email: customerEmailNorm,
        name: ownerName || customerEmailNorm,
        position: 'Hauptkontakt',
      });
    }

    const portalMembers = await loadPortalMembers(ownerEmailNorm || ownerEmail, customer.id);
    mergeContacts(contacts, portalMembers);

    return { ok: true, contacts };
  } catch (err) {
    return { ok: false, error: err.message, contacts: [] };
  }
}

module.exports = {
  runExternPortalSync,
  loadPortalRolesSnapshot,
  getPortalExternContactsJson,
};
