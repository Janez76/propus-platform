#!/usr/bin/env node
/**
 * VPS → propus-platform Datenmigration
 *
 * Migriert Daten aus zwei separaten Quell-DBs in die vereinheitlichte propus-DB:
 *   - Buchungstool (public.*) → core.* + booking.*
 *   - Tour-Manager (tour_manager.*) → core.* (dedupliziert) + tour_manager.*
 *
 * Voraussetzungen:
 *   - Ziel-DB hat bereits alle Schemas + Tabellen (via core/migrate.js)
 *   - Quell-DBs sind erreichbar (z.B. SSH-Tunnel zum VPS)
 *
 * Umgebungsvariablen:
 *   SOURCE_BOOKING_URL  – postgres://user:pass@host:port/buchungstool
 *   SOURCE_TOURS_URL    – postgres://user:pass@host:port/propus (Tour-Manager)
 *   TARGET_URL          – postgres://user:pass@host:port/propus (lokal)
 *   DRY_RUN             – "true" für Simulation ohne Schreiben
 *
 * Nutzung:
 *   node core/migrate-from-vps.js
 */

const { Pool } = require('pg');

const SOURCE_BOOKING_URL = process.env.SOURCE_BOOKING_URL;
const SOURCE_TOURS_URL = process.env.SOURCE_TOURS_URL;
const TARGET_URL = process.env.TARGET_URL;
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!SOURCE_BOOKING_URL || !SOURCE_TOURS_URL || !TARGET_URL) {
  console.error('[migrate] Fehlende Umgebungsvariablen:');
  if (!SOURCE_BOOKING_URL) console.error('  SOURCE_BOOKING_URL');
  if (!SOURCE_TOURS_URL) console.error('  SOURCE_TOURS_URL');
  if (!TARGET_URL) console.error('  TARGET_URL');
  process.exit(1);
}

const srcBooking = new Pool({ connectionString: SOURCE_BOOKING_URL, max: 2, statement_timeout: 30000 });
const srcTours = new Pool({ connectionString: SOURCE_TOURS_URL, max: 2, statement_timeout: 30000 });
const target = new Pool({ connectionString: TARGET_URL, max: 3, statement_timeout: 60000 });

const stats = { inserted: {}, skipped: {}, errors: [] };

function inc(table, type) {
  if (!stats[type][table]) stats[type][table] = 0;
  stats[type][table]++;
}

async function clearTargetTables(client) {
  console.log('[migrate] Ziel-Tabellen leeren …');
  const tables = [
    'tour_manager.bank_import_transactions',
    'tour_manager.bank_import_runs',
    'tour_manager.ai_suggestions',
    'tour_manager.outgoing_emails',
    'tour_manager.incoming_emails',
    'tour_manager.portal_tour_assignees',
    'tour_manager.portal_team_exclusions',
    'tour_manager.portal_team_members',
    'tour_manager.portal_password_reset_tokens',
    'tour_manager.portal_users',
    'tour_manager.admin_remember_tokens',
    'tour_manager.admin_invites',
    'tour_manager.admin_users',
    'tour_manager.settings',
    'tour_manager.user_profile_settings',
    'tour_manager.actions_log',
    'tour_manager.renewal_invoices',
    'tour_manager.exxas_invoices',
    'tour_manager.tours',
    'booking.subject_permission_overrides',
    'booking.permission_group_members',
    'booking.permission_group_permissions',
    'booking.permission_groups',
    'booking.access_subject_system_roles',
    'booking.access_subjects',
    'booking.system_role_permissions',
    'booking.system_roles',
    'booking.permission_definitions',
    'booking.upload_batch_files',
    'booking.upload_batches',
    'booking.order_folder_links',
    'booking.auth_audit_log',
    'booking.admin_users',
    'booking.admin_sessions',
    'booking.photographer_password_resets',
    'booking.order_chat_messages',
    'booking.order_messages',
    'booking.bug_reports',
    'booking.discount_code_usages',
    'booking.orders',
    'booking.discount_codes',
    'booking.app_settings',
    'booking.pricing_rules',
    'booking.products',
    'booking.service_categories',
    'booking.photographer_settings',
    'booking.photographers',
    'core.customer_password_resets',
    'core.customer_email_verifications',
    'core.customer_sessions',
    'core.company_invitations',
    'core.company_members',
    'core.companies',
    'core.customer_contacts',
    'core.customers',
  ];

  for (const t of tables) {
    try {
      await client.query(`DELETE FROM ${t}`);
    } catch (err) {
      console.warn(`  [warn] ${t}: ${err.message}`);
    }
  }
  console.log('[migrate] Tabellen geleert.');
}

async function migrateGeneric(srcPool, srcQuery, targetTable, columns, client, opts = {}) {
  const { transform, onConflict } = opts;
  const srcRows = await srcPool.query(srcQuery);
  const rows = srcRows.rows;
  if (!rows.length) {
    console.log(`  [skip] ${targetTable}: 0 Zeilen in Quelle`);
    return rows;
  }

  const firstErrors = [];

  for (const row of rows) {
    const data = transform ? transform(row) : row;
    if (!data) { inc(targetTable, 'skipped'); continue; }

    const vals = columns.map((c) => data[c] !== undefined ? data[c] : null);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const colStr = columns.map((c) => `"${c}"`).join(', ');
    const conflict = onConflict || 'DO NOTHING';
    const sql = `INSERT INTO ${targetTable} (${colStr}) VALUES (${placeholders}) ON CONFLICT ${conflict}`;

    try {
      if (!DRY_RUN) {
        await client.query('SAVEPOINT sp_row');
        await client.query(sql, vals);
        await client.query('RELEASE SAVEPOINT sp_row');
      }
      inc(targetTable, 'inserted');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT sp_row').catch(() => {});
      stats.errors.push({ table: targetTable, row: data, error: err.message });
      if (firstErrors.length < 2) firstErrors.push(err.message);
      inc(targetTable, 'skipped');
    }
  }

  const inserted = stats.inserted[targetTable] || 0;
  const skipped = stats.skipped[targetTable] || 0;
  if (firstErrors.length && inserted === 0) {
    console.log(`  [warn] ${targetTable}: ${inserted} eingefügt, ${skipped} übersprungen – Fehler: ${firstErrors[0]}`);
  } else {
    console.log(`  [ok]   ${targetTable}: ${inserted} eingefügt, ${skipped} übersprungen`);
  }
  return rows;
}

async function resetSequences(client) {
  console.log('[migrate] Sequences synchronisieren …');
  // Nur Tabellen mit integer id-Spalte auflisten
  const seqPairs = [
    ['core.customers', 'core.customers_id_seq'],
    ['core.customer_contacts', 'core.customer_contacts_id_seq'],
    ['core.companies', 'core.companies_id_seq'],
    ['core.company_members', 'core.company_members_id_seq'],
    ['core.company_invitations', 'core.company_invitations_id_seq'],
    ['booking.orders', 'booking.orders_id_seq'],
    ['booking.photographers', 'booking.photographers_id_seq'],
    ['booking.products', 'booking.products_id_seq'],
    ['booking.pricing_rules', 'booking.pricing_rules_id_seq'],
    ['booking.discount_codes', 'booking.discount_codes_id_seq'],
    ['booking.order_messages', 'booking.order_messages_id_seq'],
    ['booking.order_chat_messages', 'booking.order_chat_messages_id_seq'],
    ['booking.admin_users', 'booking.admin_users_id_seq'],
    ['tour_manager.tours', 'tour_manager.tours_id_seq'],
    ['tour_manager.admin_users', 'tour_manager.admin_users_id_seq'],
  ];

  for (const [table, seq] of seqPairs) {
    try {
      await client.query('SAVEPOINT sp_seq');
      const maxRes = await client.query(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table}`);
      const maxId = maxRes.rows[0].m;
      if (maxId > 0) {
        await client.query(`SELECT setval('${seq}', ${maxId})`);
      }
      await client.query('RELEASE SAVEPOINT sp_seq');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT sp_seq').catch(() => {});
      console.warn(`  [warn] Sequence ${seq}: ${err.message}`);
    }
  }
  console.log('[migrate] Sequences synchronisiert.');
}

async function migrateCustomersDeduplicated(client) {
  console.log('\n══════ Phase 1: Core Customers (dedupliziert) ══════');

  const bookingCustomers = await srcBooking.query(
    `SELECT id, email, COALESCE(name,'') as name, COALESCE(company,'') as company,
            COALESCE(phone,'') as phone, COALESCE(onsite_name,'') as onsite_name,
            COALESCE(onsite_phone,'') as onsite_phone, COALESCE(street,'') as street,
            COALESCE(zipcity,'') as zipcity, password_hash, exxas_contact_id,
            keycloak_sub, COALESCE(blocked,false) as blocked, COALESCE(notes,'') as notes,
            COALESCE(email_verified,false) as email_verified,
            COALESCE(is_admin,false) as is_admin, created_at, updated_at
     FROM customers ORDER BY id`
  );

  console.log(`  Buchungstool: ${bookingCustomers.rows.length} Kunden`);
  const emailMap = new Map();

  for (const c of bookingCustomers.rows) {
    if (DRY_RUN) { inc('core.customers', 'inserted'); continue; }
    await client.query(
      `INSERT INTO core.customers (id, email, name, company, phone, onsite_name, onsite_phone,
        street, zipcity, password_hash, exxas_contact_id, keycloak_sub, blocked, notes,
        email_verified, is_admin, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT ((LOWER(email))) DO NOTHING`,
      [c.id, c.email, c.name, c.company, c.phone, c.onsite_name, c.onsite_phone,
       c.street, c.zipcity, c.password_hash, c.exxas_contact_id, c.keycloak_sub,
       c.blocked, c.notes, c.email_verified, c.is_admin, c.created_at, c.updated_at]
    );
    emailMap.set(c.email.toLowerCase(), c.id);
    inc('core.customers', 'inserted');
  }

  const tourEmails = await srcTours.query(
    `SELECT DISTINCT LOWER(customer_email) AS email, customer_name
     FROM tour_manager.tours
     WHERE customer_email IS NOT NULL AND customer_email <> ''
     ORDER BY email`
  );

  let newFromTours = 0;
  for (const te of tourEmails.rows) {
    if (emailMap.has(te.email)) continue;
    if (DRY_RUN) { newFromTours++; continue; }

    const res = await client.query(
      `INSERT INTO core.customers (email, name) VALUES ($1, $2)
       ON CONFLICT ((LOWER(email))) DO NOTHING RETURNING id`,
      [te.email, te.customer_name || '']
    );
    if (res.rows.length) {
      emailMap.set(te.email, res.rows[0].id);
      newFromTours++;
    }
  }

  console.log(`  Neue Kunden aus Tour-Manager: ${newFromTours}`);
  console.log(`  Gesamt in core.customers: ${emailMap.size}`);
  return emailMap;
}

async function run() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Propus Platform – VPS Data Migration           ║');
  console.log('╚══════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('⚠️  DRY RUN – Keine Daten werden geschrieben\n');

  const client = await target.connect();
  try {
    await client.query('BEGIN');
    await clearTargetTables(client);

    // ─── Phase 1: Kunden-Deduplizierung ──────────────────────────
    const emailMap = await migrateCustomersDeduplicated(client);

    // ─── Phase 2: Core-Tabellen (Booking-Quell-DB) ──────────────
    console.log('\n══════ Phase 2: Core (Kontakte, Companies, Members) ══════');

    await migrateGeneric(srcBooking,
      `SELECT * FROM customer_contacts ORDER BY id`,
      'core.customer_contacts',
      ['id', 'customer_id', 'name', 'role', 'phone', 'email', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM companies ORDER BY id`,
      'core.companies',
      ['id', 'name', 'slug', 'billing_customer_id', 'standort', 'created_at', 'updated_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT id, company_id, COALESCE(keycloak_subject,'') as keycloak_subject,
              customer_id, role, COALESCE(email,'') as email,
              COALESCE(status,'active') as status,
              COALESCE(is_primary_contact,false) as is_primary_contact,
              created_at, updated_at
       FROM company_members ORDER BY id`,
      'core.company_members',
      ['id', 'company_id', 'keycloak_subject', 'customer_id', 'role', 'email', 'status', 'is_primary_contact', 'created_at', 'updated_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM company_invitations ORDER BY id`,
      'core.company_invitations',
      ['id', 'company_id', 'email', 'role', 'invited_by', 'invite_token', 'expires_at', 'accepted_at', 'created_at'],
      client
    );

    // ─── Phase 3: Booking-Tabellen ──────────────────────────────
    console.log('\n══════ Phase 3: Booking ══════');

    await migrateGeneric(srcBooking,
      `SELECT id, key, name, email, phone, COALESCE(phone_mobile,'') as phone_mobile,
              COALESCE(whatsapp,'') as whatsapp, COALESCE(initials,'') as initials,
              COALESCE(is_admin,false) as is_admin, created_at
       FROM photographers ORDER BY id`,
      'booking.photographers',
      ['id', 'key', 'name', 'email', 'phone', 'phone_mobile', 'whatsapp', 'initials', 'is_admin', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT photographer_key, COALESCE(home_address,'') as home_address, home_lat, home_lon,
              max_radius_km, skills, blocked_dates, depart_times, work_start, work_end,
              workdays, work_hours_by_day, buffer_minutes, slot_minutes,
              COALESCE(national_holidays,true) as national_holidays,
              languages, native_language, event_color, password_hash, created_at, updated_at
       FROM photographer_settings ORDER BY photographer_key`,
      'booking.photographer_settings',
      ['photographer_key', 'home_address', 'home_lat', 'home_lon', 'max_radius_km', 'skills',
       'blocked_dates', 'depart_times', 'work_start', 'work_end', 'workdays', 'work_hours_by_day',
       'buffer_minutes', 'slot_minutes', 'national_holidays', 'languages', 'native_language',
       'event_color', 'password_hash', 'created_at', 'updated_at'],
      client
    );

    // kind_scope 'service' → 'addon' (Ziel-Schema erlaubt nur 'package','addon','both')
    await migrateGeneric(srcBooking,
      `SELECT key, name, COALESCE(description,'') as description,
              CASE WHEN kind_scope IN ('package','addon','both') THEN kind_scope ELSE 'addon' END as kind_scope,
              sort_order, active, show_in_frontpanel, created_at
       FROM service_categories ORDER BY sort_order`,
      'booking.service_categories',
      ['key', 'name', 'description', 'kind_scope', 'sort_order', 'active', 'show_in_frontpanel', 'created_at'],
      client
    );

    // kind 'service'/'extra' → 'addon' (Ziel-Schema erlaubt nur 'package','addon')
    await migrateGeneric(srcBooking,
      `SELECT id, code, name,
              CASE WHEN kind IN ('package','addon') THEN kind ELSE 'addon' END as kind,
              COALESCE(group_key,'') as group_key, COALESCE(category_key,'') as category_key,
              COALESCE(description,'') as description,
              COALESCE(affects_travel,true) as affects_travel,
              COALESCE(affects_duration,false) as affects_duration,
              COALESCE(duration_minutes,0) as duration_minutes,
              COALESCE(skill_key,'') as skill_key, required_skills, active, sort_order, created_at
       FROM products ORDER BY id`,
      'booking.products',
      ['id', 'code', 'name', 'kind', 'group_key', 'category_key', 'description', 'affects_travel',
       'affects_duration', 'duration_minutes', 'skill_key', 'required_skills', 'active', 'sort_order', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT id, product_id, rule_type, config_json, priority, valid_from, valid_to, active, created_at
       FROM pricing_rules ORDER BY id`,
      'booking.pricing_rules',
      ['id', 'product_id', 'rule_type', 'config_json', 'priority', 'valid_from', 'valid_to', 'active', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT key, value_json, updated_at FROM app_settings`,
      'booking.app_settings',
      ['key', 'value_json', 'updated_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT id, code, type, amount, active, valid_from, valid_to, max_uses,
              uses_count, uses_per_customer, conditions_json, created_at
       FROM discount_codes ORDER BY id`,
      'booking.discount_codes',
      ['id', 'code', 'type', 'amount', 'active', 'valid_from', 'valid_to',
       'max_uses', 'uses_count', 'uses_per_customer', 'conditions_json', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT id, order_no, customer_id, status, address, object, services, photographer,
              schedule, billing, pricing, settings_snapshot, discount, key_pickup,
              ics_uid, photographer_event_id, office_event_id, exxas_order_id,
              COALESCE(exxas_status,'not_sent') as exxas_status, done_at, created_at, updated_at
       FROM orders ORDER BY id`,
      'booking.orders',
      ['id', 'order_no', 'customer_id', 'status', 'address', 'object', 'services', 'photographer',
       'schedule', 'billing', 'pricing', 'settings_snapshot', 'discount', 'key_pickup',
       'ics_uid', 'photographer_event_id', 'office_event_id', 'exxas_order_id',
       'exxas_status', 'done_at', 'created_at', 'updated_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT id, order_no, sender_role, sender_name, recipient_roles, message, created_at
       FROM order_messages ORDER BY id`,
      'booking.order_messages',
      ['id', 'order_no', 'sender_role', 'sender_name', 'recipient_roles', 'message', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT id, order_no, sender_role, sender_id, sender_name, message, read_at, created_at
       FROM order_chat_messages ORDER BY id`,
      'booking.order_chat_messages',
      ['id', 'order_no', 'sender_role', 'sender_id', 'sender_name', 'message', 'read_at', 'created_at'],
      client
    );

    try {
      await migrateGeneric(srcBooking,
        `SELECT order_no, folder_url, created_at FROM order_folder_links`,
        'booking.order_folder_links',
        ['order_no', 'folder_url', 'created_at'],
        client
      );
    } catch (e) { console.log(`  [skip] booking.order_folder_links: ${e.message}`); }

    await migrateGeneric(srcBooking,
      `SELECT id, username, email, name, role, password_hash, active, created_at
       FROM admin_users ORDER BY id`,
      'booking.admin_users',
      ['id', 'username', 'email', 'name', 'role', 'password_hash', 'active', 'created_at'],
      client
    );

    // ─── Phase 4: Tour-Manager-Tabellen ─────────────────────────
    console.log('\n══════ Phase 4: Tour Manager ══════');

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.tours ORDER BY id`,
      'tour_manager.tours',
      ['id', 'exxas_abo_id', 'matterport_space_id', 'tour_url', 'kunde_ref',
       'customer_name', 'customer_email', 'customer_contact', 'bezeichnung', 'object_label',
       'matterport_created_at', 'term_end_date', 'ablaufdatum', 'matterport_state',
       'matterport_is_own', 'customer_verified', 'customer_intent', 'customer_intent_source',
       'customer_intent_note', 'customer_intent_confidence', 'customer_intent_updated_at',
       'customer_transfer_requested', 'customer_billing_attention', 'status',
       'canonical_customer_name', 'canonical_object_label', 'canonical_matterport_space_id',
       'canonical_exxas_contract_id', 'canonical_term_end_date',
       'created_at', 'updated_at'],
      client
    );

    // renewal_invoices: source id ist UUID → weglassen, auto-increment nutzen
    await migrateGeneric(srcTours,
      `SELECT tour_id, invoice_number, invoice_status, invoice_kind, amount_chf, due_at,
              sent_at, paid_at, payment_method, payment_source, payment_note,
              recorded_by, recorded_at, subscription_start_at, subscription_end_at, created_at
       FROM tour_manager.renewal_invoices`,
      'tour_manager.renewal_invoices',
      ['tour_id', 'invoice_number', 'invoice_status', 'invoice_kind', 'amount_chf', 'due_at',
       'sent_at', 'paid_at', 'payment_method', 'payment_source', 'payment_note',
       'recorded_by', 'recorded_at', 'subscription_start_at', 'subscription_end_at', 'created_at'],
      client
    );

    // actions_log: source id ist UUID → weglassen
    await migrateGeneric(srcTours,
      `SELECT tour_id, actor_type, actor_ref, action, details_json, created_at
       FROM tour_manager.actions_log`,
      'tour_manager.actions_log',
      ['tour_id', 'actor_type', 'actor_ref', 'action', 'details_json', 'created_at'],
      client
    );

    // exxas_invoices: source hat kein created_at → wird via DEFAULT befüllt
    await migrateGeneric(srcTours,
      `SELECT exxas_document_id, nummer, kunde_name, bezeichnung, ref_kunde, ref_vertrag,
              exxas_status, sv_status, zahlungstermin, dok_datum, preis_brutto, tour_id, synced_at
       FROM tour_manager.exxas_invoices ORDER BY id`,
      'tour_manager.exxas_invoices',
      ['exxas_document_id', 'nummer', 'kunde_name', 'bezeichnung', 'ref_kunde', 'ref_vertrag',
       'exxas_status', 'sv_status', 'zahlungstermin', 'dok_datum', 'preis_brutto', 'tour_id', 'synced_at'],
      client
    );

    // admin_invites: source id ist UUID, target ist integer → id weglassen
    await migrateGeneric(srcTours,
      `SELECT email, token_hash, invited_by, created_at, expires_at, accepted_at, revoked_at
       FROM tour_manager.admin_invites`,
      'tour_manager.admin_invites',
      ['email', 'token_hash', 'invited_by', 'created_at', 'expires_at', 'accepted_at', 'revoked_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT email, full_name, password_hash, is_active, invited_by,
              created_at, updated_at, last_login_at
       FROM tour_manager.admin_users ORDER BY id`,
      'tour_manager.admin_users',
      ['email', 'full_name', 'password_hash', 'is_active', 'invited_by',
       'created_at', 'updated_at', 'last_login_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.portal_users ORDER BY email`,
      'tour_manager.portal_users',
      ['email', 'full_name', 'password_hash', 'is_active', 'last_login_at', 'created_at', 'updated_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT id, owner_email, member_email, display_name, role, status,
              invite_token_hash, expires_at, invited_by, created_at, accepted_at
       FROM tour_manager.portal_team_members ORDER BY id`,
      'tour_manager.portal_team_members',
      ['id', 'owner_email', 'member_email', 'display_name', 'role', 'status',
       'invite_token_hash', 'expires_at', 'invited_by', 'created_at', 'accepted_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT tour_id, assignee_email, workspace_owner_email, updated_by, updated_at
       FROM tour_manager.portal_tour_assignees`,
      'tour_manager.portal_tour_assignees',
      ['tour_id', 'assignee_email', 'workspace_owner_email', 'updated_by', 'updated_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT key, value, updated_at FROM tour_manager.settings ORDER BY key`,
      'tour_manager.settings',
      ['key', 'value', 'updated_at'],
      client
    );

    // Optionale Tabellen
    await migrateGeneric(srcTours,
      `SELECT id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
              subject, from_email, from_name, received_at, sent_at, body_preview, body_text,
              is_read, matched_tour_id, processing_status, created_at
       FROM tour_manager.incoming_emails ORDER BY id`,
      'tour_manager.incoming_emails',
      ['id', 'mailbox_upn', 'graph_message_id', 'internet_message_id', 'conversation_id',
       'subject', 'from_email', 'from_name', 'received_at', 'sent_at', 'body_preview', 'body_text',
       'is_read', 'matched_tour_id', 'processing_status', 'created_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT id, tour_id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
              recipient_email, subject, template_key, sent_at, details_json, created_at
       FROM tour_manager.outgoing_emails ORDER BY id`,
      'tour_manager.outgoing_emails',
      ['id', 'tour_id', 'mailbox_upn', 'graph_message_id', 'internet_message_id', 'conversation_id',
       'recipient_email', 'subject', 'template_key', 'sent_at', 'details_json', 'created_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT id, created_at, created_by, source_format, file_name,
              total_rows, exact_rows, review_rows, none_rows
       FROM tour_manager.bank_import_runs ORDER BY id`,
      'tour_manager.bank_import_runs',
      ['id', 'created_at', 'created_by', 'source_format', 'file_name',
       'total_rows', 'exact_rows', 'review_rows', 'none_rows'],
      client
    );

    // ─── Phase 5: Post-Migration ────────────────────────────────
    console.log('\n══════ Phase 5: Post-Migration ══════');

    // customer_id in tours befüllen
    console.log('  Verknüpfe tours.customer_id mit core.customers …');
    if (!DRY_RUN) {
      const linked = await client.query(`
        UPDATE tour_manager.tours t
        SET customer_id = c.id
        FROM core.customers c
        WHERE LOWER(t.customer_email) = LOWER(c.email)
          AND t.customer_id IS NULL
      `);
      console.log(`  → ${linked.rowCount} Touren mit customer_id verknüpft`);
    }

    // Sequences synchronisieren
    await resetSequences(client);

    if (DRY_RUN) {
      console.log('\n[migrate] DRY RUN – Rollback.');
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
      console.log('\n[migrate] COMMIT – Migration abgeschlossen.');
    }

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n[migrate] FEHLER – Rollback:', err.message);
    throw err;
  } finally {
    client.release();
  }

  // ─── Statistik ────────────────────────────────────────────────
  console.log('\n══════ Statistik ══════');
  const allTables = new Set([...Object.keys(stats.inserted), ...Object.keys(stats.skipped)]);
  for (const t of [...allTables].sort()) {
    console.log(`  ${t}: ${stats.inserted[t] || 0} eingefügt, ${stats.skipped[t] || 0} übersprungen`);
  }
  if (stats.errors.length) {
    console.log(`\n  Fehler: ${stats.errors.length}`);
    for (const e of stats.errors.slice(0, 10)) {
      console.log(`    ${e.table}: ${e.error}`);
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] Fatal:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await srcBooking.end().catch(() => {});
    await srcTours.end().catch(() => {});
    await target.end().catch(() => {});
  });
