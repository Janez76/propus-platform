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

  for (const row of rows) {
    const data = transform ? transform(row) : row;
    if (!data) { inc(targetTable, 'skipped'); continue; }

    const vals = columns.map((c) => data[c] !== undefined ? data[c] : null);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const colStr = columns.map((c) => `"${c}"`).join(', ');
    const conflict = onConflict || 'DO NOTHING';
    const sql = `INSERT INTO ${targetTable} (${colStr}) VALUES (${placeholders}) ON CONFLICT ${conflict}`;

    try {
      if (!DRY_RUN) await client.query(sql, vals);
      inc(targetTable, 'inserted');
    } catch (err) {
      stats.errors.push({ table: targetTable, row: data, error: err.message });
      inc(targetTable, 'skipped');
    }
  }

  console.log(`  [ok]   ${targetTable}: ${stats.inserted[targetTable] || 0} eingefügt, ${stats.skipped[targetTable] || 0} übersprungen`);
  return rows;
}

async function resetSequences(client) {
  console.log('[migrate] Sequences synchronisieren …');
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
    ['booking.service_categories', 'booking.service_categories_id_seq'],
    ['booking.discount_codes', 'booking.discount_codes_id_seq'],
    ['booking.discount_code_usages', 'booking.discount_code_usages_id_seq'],
    ['booking.bug_reports', 'booking.bug_reports_id_seq'],
    ['booking.order_messages', 'booking.order_messages_id_seq'],
    ['booking.order_chat_messages', 'booking.order_chat_messages_id_seq'],
    ['booking.upload_batches', 'booking.upload_batches_id_seq'],
    ['booking.upload_batch_files', 'booking.upload_batch_files_id_seq'],
    ['booking.access_subjects', 'booking.access_subjects_id_seq'],
    ['booking.permission_definitions', 'booking.permission_definitions_id_seq'],
    ['booking.system_roles', 'booking.system_roles_id_seq'],
    ['booking.permission_groups', 'booking.permission_groups_id_seq'],
    ['tour_manager.tours', 'tour_manager.tours_id_seq'],
    ['tour_manager.actions_log', 'tour_manager.actions_log_id_seq'],
    ['tour_manager.exxas_invoices', 'tour_manager.exxas_invoices_id_seq'],
    ['tour_manager.renewal_invoices', 'tour_manager.renewal_invoices_id_seq'],
    ['tour_manager.admin_users', 'tour_manager.admin_users_id_seq'],
  ];

  for (const [table, seq] of seqPairs) {
    try {
      const maxRes = await client.query(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table}`);
      const maxId = maxRes.rows[0].m;
      if (maxId > 0) {
        await client.query(`SELECT setval('${seq}', ${maxId})`);
      }
    } catch (err) {
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
              customer_id, role, display_name, created_at, updated_at
       FROM company_members ORDER BY id`,
      'core.company_members',
      ['id', 'company_id', 'keycloak_subject', 'customer_id', 'role', 'display_name', 'created_at', 'updated_at'],
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
      `SELECT * FROM photographers ORDER BY id`,
      'booking.photographers',
      ['id', 'key', 'name', 'email', 'phone', 'phone_mobile', 'whatsapp', 'initials', 'is_admin', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM photographer_settings ORDER BY photographer_key`,
      'booking.photographer_settings',
      ['photographer_key', 'calendar_email', 'notify_on_new_order', 'notify_on_status_change',
       'notify_on_cancel', 'languages', 'native_language', 'event_color', 'password_hash'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM service_categories ORDER BY id`,
      'booking.service_categories',
      ['id', 'key', 'label', 'sort_order', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM products ORDER BY id`,
      'booking.products',
      ['id', 'key', 'label', 'category_id', 'min_duration', 'max_duration', 'default_duration',
       'base_price', 'is_active', 'sort_order', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM pricing_rules ORDER BY id`,
      'booking.pricing_rules',
      ['id', 'product_id', 'label', 'rule_type', 'config', 'priority', 'is_active', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM app_settings`,
      'booking.app_settings',
      ['key', 'value', 'updated_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM discount_codes ORDER BY id`,
      'booking.discount_codes',
      ['id', 'code', 'discount_type', 'discount_value', 'valid_from', 'valid_until',
       'max_uses', 'used_count', 'description', 'is_active', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM orders ORDER BY id`,
      'booking.orders',
      ['id', 'order_no', 'customer_id', 'status', 'date', 'time', 'duration',
       'address', 'products', 'price', 'notes', 'photographer', 'photographerEventId',
       'officeEventId', 'onsite_name', 'onsite_phone', 'icsUid',
       'cancellationReason', 'cancellationDate', 'price_details',
       'company_id', 'created_by_member_id', 'created_at', 'updated_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM discount_code_usages ORDER BY id`,
      'booking.discount_code_usages',
      ['id', 'discount_code_id', 'order_id', 'used_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM bug_reports ORDER BY id`,
      'booking.bug_reports',
      ['id', 'page', 'message', 'metadata', 'resolved', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM order_messages ORDER BY id`,
      'booking.order_messages',
      ['id', 'order_no', 'sender_role', 'sender_label', 'message', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM order_chat_messages ORDER BY id`,
      'booking.order_chat_messages',
      ['id', 'order_no', 'sender_role', 'sender_name', 'message', 'read_by_admin',
       'read_by_customer', 'read_by_photographer', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM order_folder_links WHERE 1=1`,
      'booking.order_folder_links',
      ['order_no', 'folder_url', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM upload_batches ORDER BY id`,
      'booking.upload_batches',
      ['id', 'order_no', 'photographer_key', 'status', 'created_at', 'updated_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM upload_batch_files ORDER BY id`,
      'booking.upload_batch_files',
      ['id', 'batch_id', 'original_name', 'stored_path', 'size_bytes', 'mime_type', 'status', 'created_at'],
      client
    );

    // RBAC-Tabellen
    await migrateGeneric(srcBooking,
      `SELECT * FROM permission_definitions ORDER BY id`,
      'booking.permission_definitions',
      ['id', 'key', 'label', 'description', 'category', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM system_roles ORDER BY id`,
      'booking.system_roles',
      ['id', 'key', 'label', 'description', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM system_role_permissions`,
      'booking.system_role_permissions',
      ['system_role_id', 'permission_id'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM access_subjects ORDER BY id`,
      'booking.access_subjects',
      ['id', 'subject_type', 'admin_user_id', 'photographer_key', 'customer_id',
       'customer_contact_id', 'company_member_id', 'label', 'is_active', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM access_subject_system_roles`,
      'booking.access_subject_system_roles',
      ['access_subject_id', 'system_role_id'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM permission_groups ORDER BY id`,
      'booking.permission_groups',
      ['id', 'name', 'description', 'scope_type', 'scope_company_id', 'scope_customer_id', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM permission_group_permissions`,
      'booking.permission_group_permissions',
      ['permission_group_id', 'permission_id'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM permission_group_members`,
      'booking.permission_group_members',
      ['permission_group_id', 'access_subject_id'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM subject_permission_overrides ORDER BY id`,
      'booking.subject_permission_overrides',
      ['id', 'access_subject_id', 'permission_id', 'effect', 'scope_type',
       'scope_company_id', 'scope_customer_id', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM admin_users ORDER BY id`,
      'booking.admin_users',
      ['id', 'email', 'password_hash', 'display_name', 'is_active', 'created_at'],
      client
    );

    await migrateGeneric(srcBooking,
      `SELECT * FROM auth_audit_log ORDER BY id`,
      'booking.auth_audit_log',
      ['id', 'event_type', 'actor_type', 'actor_id', 'actor_label', 'ip', 'user_agent',
       'details', 'created_at'],
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

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.exxas_invoices ORDER BY id`,
      'tour_manager.exxas_invoices',
      ['id', 'tour_id', 'exxas_invoice_id', 'invoice_number', 'invoice_date',
       'amount', 'currency', 'status', 'pdf_url', 'raw_json', 'fetched_at', 'created_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.renewal_invoices ORDER BY id`,
      'tour_manager.renewal_invoices',
      ['id', 'tour_id', 'period_start', 'period_end', 'amount', 'currency',
       'status', 'exxas_invoice_id', 'generated_at', 'created_at', 'updated_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.actions_log ORDER BY id`,
      'tour_manager.actions_log',
      ['id', 'tour_id', 'action', 'actor', 'details', 'created_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.admin_users ORDER BY id`,
      'tour_manager.admin_users',
      ['id', 'email', 'full_name', 'password_hash', 'is_active', 'invited_by',
       'created_at', 'updated_at', 'last_login_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.admin_invites ORDER BY id`,
      'tour_manager.admin_invites',
      ['id', 'email', 'full_name', 'token', 'invited_by', 'expires_at',
       'accepted_at', 'created_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.portal_users ORDER BY email`,
      'tour_manager.portal_users',
      ['email', 'full_name', 'password_hash', 'is_active', 'last_login_at', 'created_at', 'updated_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.portal_team_members ORDER BY id`,
      'tour_manager.portal_team_members',
      ['id', 'owner_email', 'member_email', 'member_name', 'relation', 'created_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.portal_tour_assignees ORDER BY id`,
      'tour_manager.portal_tour_assignees',
      ['id', 'tour_id', 'portal_email', 'assigned_at'],
      client
    );

    await migrateGeneric(srcTours,
      `SELECT * FROM tour_manager.settings ORDER BY key`,
      'tour_manager.settings',
      ['key', 'value', 'updated_at'],
      client
    );

    // Optional: Tabellen die evtl. noch nicht existieren in der Quelle
    try {
      await migrateGeneric(srcTours,
        `SELECT * FROM tour_manager.incoming_emails ORDER BY id`,
        'tour_manager.incoming_emails',
        ['id', 'message_id', 'from_email', 'from_name', 'to_email', 'subject',
         'body_text', 'body_html', 'matched_tour_id', 'processing_status',
         'received_at', 'created_at'],
        client
      );
    } catch (e) { console.log(`  [skip] tour_manager.incoming_emails: ${e.message}`); }

    try {
      await migrateGeneric(srcTours,
        `SELECT * FROM tour_manager.outgoing_emails ORDER BY id`,
        'tour_manager.outgoing_emails',
        ['id', 'tour_id', 'template_key', 'to_email', 'subject', 'body_html',
         'status', 'sent_at', 'created_at'],
        client
      );
    } catch (e) { console.log(`  [skip] tour_manager.outgoing_emails: ${e.message}`); }

    try {
      await migrateGeneric(srcTours,
        `SELECT * FROM tour_manager.bank_import_runs ORDER BY id`,
        'tour_manager.bank_import_runs',
        ['id', 'filename', 'imported_by', 'total_rows', 'matched_rows', 'created_at'],
        client
      );
    } catch (e) { console.log(`  [skip] tour_manager.bank_import_runs: ${e.message}`); }

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
