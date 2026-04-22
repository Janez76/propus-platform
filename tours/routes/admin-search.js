/**
 * Globale Admin-Suche — GET /api/tours/admin/search?q=...&limit=5
 *
 * Antwort-Shape:
 *   { ok: true, q, groups: [ { id, label, items: [ { id, title, subtitle, href, icon } ] } ] }
 *
 * Auth: requireAdmin ist bereits am Router-Mount (platform/server.js). Jede Gruppe
 * wird defensiv in einem eigenen try-Block ausgeführt; schlägt eine Gruppe fehl,
 * bleibt sie leer (z. B. fehlende Spalten auf älteren DB-Schemata).
 */

const express = require('express');
const { pool } = require('../lib/db');

const router = express.Router();

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

function clampLimit(raw) {
  const n = Number.parseInt(String(raw || ''), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, n));
}

function trimText(value, max = 140) {
  const s = String(value == null ? '' : value).trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

async function searchCustomers(needle, limit) {
  const { rows } = await pool.query(
    `SELECT id,
            COALESCE(name, '')        AS name,
            COALESCE(email, '')       AS email,
            COALESCE(company, '')     AS company,
            COALESCE(customer_number, '') AS customer_number,
            COALESCE(phone, '')       AS phone
       FROM core.customers
      WHERE LOWER(COALESCE(name, ''))            LIKE $1
         OR LOWER(COALESCE(email, ''))           LIKE $1
         OR LOWER(COALESCE(company, ''))         LIKE $1
         OR LOWER(COALESCE(customer_number, '')) LIKE $1
         OR LOWER(COALESCE(phone, ''))           LIKE $1
      ORDER BY (LOWER(COALESCE(name, '')) = $2) DESC,
               COALESCE(updated_at, created_at) DESC NULLS LAST
      LIMIT $3`,
    [`%${needle}%`, needle, limit],
  );
  return rows.map((r) => {
    const title = r.name || r.company || r.email || `Kunde #${r.id}`;
    const subtitleParts = [];
    if (r.company && r.company !== r.name) subtitleParts.push(r.company);
    if (r.email) subtitleParts.push(r.email);
    if (r.customer_number) subtitleParts.push(`Nr. ${r.customer_number}`);
    return {
      id: `customer-${r.id}`,
      title: trimText(title, 100),
      subtitle: trimText(subtitleParts.join(' · '), 140),
      href: '/customers',
      icon: 'users',
    };
  });
}

async function searchTours(needle, limit) {
  const { rows } = await pool.query(
    `SELECT id,
            COALESCE(canonical_object_label, object_label, bezeichnung, '') AS label,
            COALESCE(customer_name, '')     AS customer_name,
            COALESCE(matterport_space_id, '') AS matterport_space_id,
            COALESCE(status, '')             AS status
       FROM tour_manager.tours
      WHERE LOWER(COALESCE(canonical_object_label, '')) LIKE $1
         OR LOWER(COALESCE(object_label, ''))           LIKE $1
         OR LOWER(COALESCE(bezeichnung, ''))            LIKE $1
         OR LOWER(COALESCE(customer_name, ''))          LIKE $1
         OR LOWER(COALESCE(matterport_space_id, ''))    LIKE $1
         OR CAST(id AS TEXT) = $2
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT $3`,
    [`%${needle}%`, needle, limit],
  );
  return rows.map((r) => ({
    id: `tour-${r.id}`,
    title: trimText(r.label || `Tour #${r.id}`, 100),
    subtitle: trimText(
      [r.customer_name, r.status].filter(Boolean).join(' · ') || `ID ${r.id}`,
      140,
    ),
    href: `/admin/tours/${r.id}`,
    icon: 'home',
  }));
}

async function searchInvoices(needle, limit) {
  // Renewal- und Exxas-Rechnungen via UNION zusammenfassen.
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT 'renewal'::text AS source,
              r.id::text AS id,
              COALESCE(r.invoice_number, '') AS number,
              COALESCE(r.invoice_status, '') AS status,
              COALESCE(t.customer_name, '')  AS customer_name,
              COALESCE(t.canonical_object_label, t.object_label, t.bezeichnung, '') AS label,
              r.due_at AS due_at,
              r.created_at AS created_at
         FROM tour_manager.renewal_invoices r
         LEFT JOIN tour_manager.tours t ON t.id = r.tour_id
        WHERE LOWER(COALESCE(r.invoice_number, ''))     LIKE $1
           OR LOWER(COALESCE(t.customer_name, ''))      LIKE $1
           OR LOWER(COALESCE(t.object_label, ''))       LIKE $1
           OR LOWER(COALESCE(t.bezeichnung, ''))        LIKE $1

       UNION ALL

       SELECT 'exxas'::text AS source,
              e.id::text AS id,
              COALESCE(e.nummer, '')       AS number,
              COALESCE(e.exxas_status, '') AS status,
              COALESCE(e.kunde_name, '')   AS customer_name,
              COALESCE(e.bezeichnung, '')  AS label,
              e.zahlungstermin AS due_at,
              e.created_at AS created_at
         FROM tour_manager.exxas_invoices e
        WHERE LOWER(COALESCE(e.nummer, ''))       LIKE $1
           OR LOWER(COALESCE(e.kunde_name, ''))   LIKE $1
           OR LOWER(COALESCE(e.bezeichnung, ''))  LIKE $1
     ) u
     ORDER BY COALESCE(u.due_at, u.created_at) DESC NULLS LAST
     LIMIT $2`,
    [`%${needle}%`, limit],
  );
  return rows.map((r) => ({
    id: `invoice-${r.source}-${r.id}`,
    title: trimText(r.number || `Rechnung ${r.source} #${r.id}`, 100),
    subtitle: trimText(
      [r.customer_name, r.label, r.status].filter(Boolean).join(' · '),
      140,
    ),
    href: r.source === 'exxas' ? '/admin/finance/exxas-sync' : '/admin/finance/invoices',
    icon: 'receipt',
  }));
}

async function searchGalleries(needle, limit) {
  const { rows } = await pool.query(
    `SELECT id,
            COALESCE(slug, '')          AS slug,
            COALESCE(title, '')         AS title,
            COALESCE(address, '')       AS address,
            COALESCE(client_name, '')   AS client_name,
            COALESCE(client_email, '')  AS client_email,
            COALESCE(status, '')        AS status
       FROM tour_manager.galleries
      WHERE LOWER(COALESCE(title, ''))        LIKE $1
         OR LOWER(COALESCE(slug, ''))         LIKE $1
         OR LOWER(COALESCE(address, ''))      LIKE $1
         OR LOWER(COALESCE(client_name, ''))  LIKE $1
         OR LOWER(COALESCE(client_email, '')) LIKE $1
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT $2`,
    [`%${needle}%`, limit],
  );
  return rows.map((r) => ({
    id: `gallery-${r.id}`,
    title: trimText(r.title || r.slug || `Galerie #${r.id}`, 100),
    subtitle: trimText(
      [r.client_name || r.client_email, r.address, r.status].filter(Boolean).join(' · '),
      140,
    ),
    href: `/admin/listing/${r.slug || r.id}`,
    icon: 'images',
  }));
}

async function searchTickets(needle, limit) {
  const { rows } = await pool.query(
    `SELECT id,
            COALESCE(subject, '')     AS subject,
            COALESCE(description, '') AS description,
            COALESCE(status, '')      AS status,
            COALESCE(module, '')      AS module,
            COALESCE(reference_id, '') AS reference_id
       FROM tour_manager.tickets
      WHERE LOWER(COALESCE(subject, ''))     LIKE $1
         OR LOWER(COALESCE(description, '')) LIKE $1
         OR LOWER(COALESCE(reference_id, '')) LIKE $1
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT $2`,
    [`%${needle}%`, limit],
  );
  return rows.map((r) => ({
    id: `ticket-${r.id}`,
    title: trimText(r.subject || `Ticket #${r.id}`, 100),
    subtitle: trimText(
      [r.module, r.status, r.description].filter(Boolean).join(' · '),
      140,
    ),
    href: '/admin/tickets',
    icon: 'message',
  }));
}

router.get('/', async (req, res) => {
  try {
    const qRaw = String(req.query.q || '').trim();
    const limit = clampLimit(req.query.limit);
    if (qRaw.length < 2) {
      return res.json({ ok: true, q: qRaw, groups: [] });
    }
    const needle = qRaw.toLowerCase();

    const safeRun = async (fn, label) => {
      try {
        return await fn(needle, limit);
      } catch (err) {
        // Nicht-fatale Gruppen (z. B. alte Schemata) einfach ausblenden
        // und Detail in Log stellen.
        // eslint-disable-next-line no-console
        console.warn(`[admin-search] ${label} failed:`, err.message);
        return [];
      }
    };

    const [customers, tours, invoices, galleries, tickets] = await Promise.all([
      safeRun(searchCustomers, 'customers'),
      safeRun(searchTours, 'tours'),
      safeRun(searchInvoices, 'invoices'),
      safeRun(searchGalleries, 'galleries'),
      safeRun(searchTickets, 'tickets'),
    ]);

    const groups = [
      { id: 'customers', label: 'Kunden', items: customers },
      { id: 'tours', label: 'Touren', items: tours },
      { id: 'invoices', label: 'Rechnungen', items: invoices },
      { id: 'galleries', label: 'Galerien', items: galleries },
      { id: 'tickets', label: 'Tickets', items: tickets },
    ].filter((g) => g.items && g.items.length > 0);

    res.json({ ok: true, q: qRaw, groups });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[admin-search] error:', err);
    res.status(500).json({ ok: false, error: 'search_failed' });
  }
});

module.exports = router;
