#!/usr/bin/env node
/**
 * Seed-Script: Füllt die lokale Entwicklungs-DB mit Testdaten.
 *
 * Umgebungsvariable:
 *   DATABASE_URL  – postgres://user:pass@host:port/db
 *
 * Nutzung:
 *   DATABASE_URL=postgres://propus:change_me_local@localhost:5432/propus node core/seed/seed-test-data.js
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[seed] DATABASE_URL nicht gesetzt');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

async function seed() {
  console.log('[seed] Starte Testdaten-Import …');

  // ─── Core: Kunden ─────────────────────────────────────────────
  const customers = [
    { email: 'max.muster@example.com', name: 'Max Muster', company: 'Muster AG', phone: '+41 44 123 45 67', street: 'Bahnhofstrasse 1', zipcity: '8001 Zürich' },
    { email: 'anna.beispiel@example.com', name: 'Anna Beispiel', company: 'Beispiel GmbH', phone: '+41 44 234 56 78', street: 'Seestrasse 100', zipcity: '8002 Zürich' },
    { email: 'peter.test@example.com', name: 'Peter Test', company: 'Test & Partner', phone: '+41 31 345 67 89', street: 'Bundesplatz 5', zipcity: '3011 Bern' },
    { email: 'sandra.demo@example.com', name: 'Sandra Demo', company: 'Demo Corp', phone: '+41 61 456 78 90', street: 'Marktplatz 12', zipcity: '4001 Basel' },
    { email: 'lukas.probe@example.com', name: 'Lukas Probe', company: 'Probe Systems', phone: '+41 71 567 89 01', street: 'Oberer Graben 3', zipcity: '9000 St. Gallen' },
  ];

  for (const c of customers) {
    await pool.query(
      `INSERT INTO core.customers (email, name, company, phone, street, zipcity)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ((LOWER(email))) DO NOTHING`,
      [c.email, c.name, c.company, c.phone, c.street, c.zipcity]
    );
  }
  console.log(`[seed] ${customers.length} Kunden eingefügt`);

  // ─── Core: Kontakte ───────────────────────────────────────────
  const custRes = await pool.query(`SELECT id, email FROM core.customers ORDER BY id LIMIT 5`);
  const custMap = {};
  for (const r of custRes.rows) custMap[r.email] = r.id;

  if (custMap['max.muster@example.com']) {
    await pool.query(
      `INSERT INTO core.customer_contacts (customer_id, name, role, phone, email)
       VALUES ($1, 'Lisa Muster', 'Sekretariat', '+41 44 123 45 68', 'lisa@muster-ag.ch'),
              ($1, 'Hans Meier', 'Projektleiter', '+41 44 123 45 69', 'hans@muster-ag.ch')
       ON CONFLICT DO NOTHING`,
      [custMap['max.muster@example.com']]
    );
  }
  if (custMap['anna.beispiel@example.com']) {
    await pool.query(
      `INSERT INTO core.customer_contacts (customer_id, name, role, phone, email)
       VALUES ($1, 'Thomas Beispiel', 'Geschäftsführer', '+41 44 234 56 79', 'thomas@beispiel.ch')
       ON CONFLICT DO NOTHING`,
      [custMap['anna.beispiel@example.com']]
    );
  }
  console.log('[seed] Kontaktpersonen eingefügt');

  // ─── Booking: Fotografen ──────────────────────────────────────
  const photographers = [
    { key: 'janez', name: 'Janez Svajcer', email: 'janez@propus.ch', phone: '+41 79 111 22 33', initials: 'JS' },
    { key: 'ivan', name: 'Ivan Demo', email: 'ivan@propus.ch', phone: '+41 79 222 33 44', initials: 'ID' },
  ];

  for (const p of photographers) {
    await pool.query(
      `INSERT INTO booking.photographers (key, name, email, phone, initials)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO NOTHING`,
      [p.key, p.name, p.email, p.phone, p.initials]
    );
  }
  console.log(`[seed] ${photographers.length} Fotografen eingefügt`);

  // ─── Tour Manager: Touren ─────────────────────────────────────
  const tourCustomers = [
    { email: 'max.muster@example.com', name: 'Muster AG', contact: 'Max Muster' },
    { email: 'anna.beispiel@example.com', name: 'Beispiel GmbH', contact: 'Anna Beispiel' },
    { email: 'peter.test@example.com', name: 'Test & Partner', contact: 'Peter Test' },
  ];

  for (let i = 0; i < tourCustomers.length; i++) {
    const tc = tourCustomers[i];
    const custId = custMap[tc.email] || null;
    const termEnd = new Date();
    termEnd.setMonth(termEnd.getMonth() + 6);
    await pool.query(
      `INSERT INTO tour_manager.tours (
        customer_id, customer_name, customer_email, customer_contact,
        bezeichnung, object_label, tour_url, status, term_end_date, ablaufdatum
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $8)
       ON CONFLICT DO NOTHING`,
      [
        custId,
        tc.name,
        tc.email,
        tc.contact,
        `Virtueller Rundgang ${tc.name}`,
        `Büro ${tc.name}`,
        `https://my.matterport.com/show/?m=demo${i + 1}`,
        termEnd.toISOString().slice(0, 10),
      ]
    );
  }
  console.log(`[seed] ${tourCustomers.length} Touren eingefügt`);

  // ─── Tour Manager: Admin-User ─────────────────────────────────
  const bcrypt = require('bcryptjs');
  const adminHash = await bcrypt.hash('admin', 10);
  await pool.query(
    `INSERT INTO tour_manager.admin_users (email, full_name, password_hash, is_active)
     VALUES ('admin@propus.ch', 'Admin', $1, TRUE)
     ON CONFLICT DO NOTHING`,
    [adminHash]
  );
  console.log('[seed] Admin-User angelegt (admin@propus.ch / admin)');

  // ─── Tour Manager: Portal-User ────────────────────────────────
  const portalHash = await bcrypt.hash('portal123', 10);
  await pool.query(
    `INSERT INTO tour_manager.portal_users (email, full_name, password_hash, is_active)
     VALUES ('max.muster@example.com', 'Max Muster', $1, TRUE)
     ON CONFLICT DO NOTHING`,
    [portalHash]
  );
  console.log('[seed] Portal-User angelegt (max.muster@example.com / portal123)');

  console.log('[seed] Fertig.');
  await pool.end();
}

seed().catch((err) => {
  console.error('[seed] Fehler:', err.message);
  process.exit(1);
});
