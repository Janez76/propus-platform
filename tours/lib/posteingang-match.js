/**
 * Kunden-Matching für Posteingang: Domain-basiert (ohne neue DB-Spalte).
 * Nutzt primäre E-Mail, email_aliases und customer_contacts.
 * Öffentliche Freemail-Domains werden ignoriert (zu viele Dubletten).
 */
'use strict';

const { pool } = require('./db');

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.de',
  'icloud.com',
  'me.com',
  'gmx.ch',
  'gmx.de',
  'gmx.net',
  'gmx.at',
  'bluewin.ch',
  'protonmail.com',
  'proton.me',
  'web.de',
  'freenet.de',
  'tutanota.com',
  'aol.com',
  'mail.com',
]);

function extractDomain(email) {
  const s = String(email || '')
    .toLowerCase()
    .trim();
  const at = s.indexOf('@');
  if (at < 0 || at === s.length - 1) return '';
  return s.slice(at + 1);
}

function isPublicOrDisposableDomain(domain) {
  const d = String(domain || '').toLowerCase().trim();
  if (!d || d.length < 3) return true;
  return PUBLIC_EMAIL_DOMAINS.has(d);
}

/**
 * @returns {Promise<number|null>} Genau ein Kunde mit dieser Domain, sonst null.
 */
async function findCustomerIdByEmailDomain(emailAddress) {
  const domain = extractDomain(emailAddress);
  if (!domain || isPublicOrDisposableDomain(domain)) return null;

  const { rows } = await pool.query(
    `SELECT DISTINCT c.id
     FROM core.customers c
     LEFT JOIN core.customer_contacts cc ON cc.customer_id = c.id
     WHERE SPLIT_PART(LOWER(TRIM(COALESCE(c.email, ''))), '@', 2) = $1
        OR EXISTS (
             SELECT 1
             FROM unnest(COALESCE(c.email_aliases, '{}')) AS a
             WHERE NULLIF(TRIM(a), '') IS NOT NULL
               AND SPLIT_PART(LOWER(TRIM(a)), '@', 2) = $1
           )
        OR (
             NULLIF(TRIM(cc.email), '') IS NOT NULL
             AND SPLIT_PART(LOWER(TRIM(cc.email)), '@', 2) = $1
           )`,
    [domain],
  );

  if (rows.length === 1) return rows[0].id;
  return null;
}

/**
 * Versucht Domain-Match für die erste sinnvolle Adresse in der Liste.
 */
async function resolveCustomerIdByDomainFromAddresses(addresses) {
  const list = Array.isArray(addresses) ? addresses : [];
  for (const em of list) {
    if (!em) continue;
    // eslint-disable-next-line no-await-in-loop
    const id = await findCustomerIdByEmailDomain(em);
    if (id) return id;
  }
  return null;
}

module.exports = {
  extractDomain,
  isPublicOrDisposableDomain,
  findCustomerIdByEmailDomain,
  resolveCustomerIdByDomainFromAddresses,
};
