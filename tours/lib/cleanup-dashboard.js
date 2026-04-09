/**
 * Cleanup-Dashboard – Kundenseitige Übersichtsseite
 *
 * Statt pro Tour eine separate Mail zu senden, erhält jeder Kunde
 * EINE Mail mit einem Magic-Link zu einer Dashboard-Seite, auf der
 * alle seine Touren aufgelistet sind. Pro Tour kann er dort die
 * gewünschte Aktion wählen – erledigte Touren verschwinden aus der Liste.
 *
 * DB-Tabelle: tour_manager.cleanup_sessions
 *   - Ein Token pro Kunde (customer_email), nicht pro Tour
 *   - Token ist bcrypt-gehasht gespeichert
 *   - 30 Tage gültig (länger als die alten 14 Tage, da Sammel-Dashboard)
 */

'use strict';

const crypto = require('crypto');
const { pool } = require('./db');
const { generateToken } = require('./tokens');
const { normalizeTourRow } = require('./normalize');
const { logAction } = require('./actions');
const { computeCleanupRule, ensureCleanupSchema } = require('./cleanup-mailer');
const tourActions = require('./tour-actions');
const { sendGraphMailToCustomer, ensureOutgoingEmailSchema } = tourActions;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const SESSION_VALIDITY_DAYS = 30;

// ─── Schema ──────────────────────────────────────────────────────────────────

let sessionSchemaEnsured = false;
async function ensureSessionSchema() {
  if (sessionSchemaEnsured) return;
  await ensureCleanupSchema();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.cleanup_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cleanup_sessions_email ON tour_manager.cleanup_sessions(customer_email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cleanup_sessions_token ON tour_manager.cleanup_sessions(token_hash)`);
  sessionSchemaEnsured = true;
}

// ─── Kunden gruppieren ───────────────────────────────────────────────────────

async function getCleanupCandidatesGrouped({ maxAgeMonths = 6 } = {}) {
  await ensureSessionSchema();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - maxAgeMonths);

  const r = await pool.query(
    `SELECT * FROM tour_manager.tours
     WHERE (
       (status != 'ARCHIVED' AND created_at >= $1)
       OR
       (status = 'ARCHIVED' AND (archived_at >= $1 OR created_at >= $1))
     )
       AND (customer_email IS NOT NULL AND TRIM(customer_email) != '')
       AND status NOT IN ('DELETED', 'TRANSFERRED')
     ORDER BY
       COALESCE(customer_id::TEXT, ''),
       LOWER(COALESCE(customer_name, '')),
       LOWER(customer_email),
       COALESCE(archived_at, created_at) DESC`,
    [cutoff.toISOString()]
  );

  const tours = r.rows.map(normalizeTourRow);

  // Gruppierungsschlüssel: customer_id > customer_name (normalisiert) > customer_email
  function getGroupKey(tour) {
    if (tour.customer_id) return `id:${tour.customer_id}`;
    const name = String(tour.customer_name || '').trim().toLowerCase();
    if (name) return `name:${name}`;
    return `email:${String(tour.customer_email || '').trim().toLowerCase()}`;
  }

  const grouped = new Map();
  for (const tour of tours) {
    const email = String(tour.customer_email || '').trim().toLowerCase();
    if (!email) continue;
    const key = getGroupKey(tour);

    if (!grouped.has(key)) {
      grouped.set(key, {
        groupKey: key,
        customerNameCounts: new Map(), // name -> Anzahl Touren
        customerEmail: email,
        customerEmails: [],
        tours: [],
        allSent: true,
        someWithoutAction: false,
      });
    }
    const group = grouped.get(key);
    group.tours.push(tour);
    if (!group.customerEmails.includes(email)) group.customerEmails.push(email);
    if (!tour.cleanup_sent_at) group.allSent = false;
    if (!tour.cleanup_action) group.someWithoutAction = true;
    // Häufigkeit der Namen zählen (GmbH-Namen bevorzugen)
    const rawName = String(tour.customer_name || tour.customer_contact || '').trim();
    if (rawName) {
      group.customerNameCounts.set(rawName, (group.customerNameCounts.get(rawName) || 0) + 1);
    }
  }

  return [...grouped.values()].map((g) => {
    // Besten Namen wählen: höchste Häufigkeit; bei Gleichstand: GmbH/AG/Firma bevorzugen, dann alphabetisch
    let bestName = null;
    if (g.customerNameCounts.size > 0) {
      const entries = [...g.customerNameCounts.entries()];
      entries.sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]; // häufigster zuerst
        // Bei Gleichstand: Firmennamen (GmbH, AG, SA, Ltd) bevorzugen
        const aIsFirm = /\b(gmbh|ag|sa|ltd|llc|inc|kg|ohg|gmbh & co|immobilien|holding)\b/i.test(a[0]);
        const bIsFirm = /\b(gmbh|ag|sa|ltd|llc|inc|kg|ohg|gmbh & co|immobilien|holding)\b/i.test(b[0]);
        if (aIsFirm !== bIsFirm) return bIsFirm ? 1 : -1;
        return a[0].localeCompare(b[0], 'de');
      });
      bestName = entries[0][0];
    }

    return {
      groupKey: g.groupKey,
      customerEmail: g.customerEmail,
      customerEmails: g.customerEmails,
      customerName: bestName,
      tours: g.tours,
      allSent: g.allSent,
      tourCount: g.tours.length,
      pendingCount: g.tours.filter((t) => !t.cleanup_action).length,
      doneCount: g.tours.filter((t) => !!t.cleanup_action).length,
    };
  });
}

// ─── Session erstellen (Token für einen Kunden) ──────────────────────────────

async function createDashboardSession(customerEmail) {
  await ensureSessionSchema();
  const email = String(customerEmail).trim().toLowerCase();
  if (!email) throw new Error('Keine E-Mail-Adresse');

  const rawToken = generateToken();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO tour_manager.cleanup_sessions (customer_email, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [email, tokenHash, expiresAt.toISOString()]
  );

  return { token: rawToken, expiresAt };
}

// ─── Session validieren ──────────────────────────────────────────────────────

async function validateDashboardSession(rawToken) {
  await ensureSessionSchema();
  if (!rawToken) return { ok: false, error: 'Token fehlt' };

  const tokenHash = sha256(rawToken);
  const r = await pool.query(
    `SELECT * FROM tour_manager.cleanup_sessions
     WHERE token_hash = $1 AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  if (r.rows.length === 0) {
    return { ok: false, error: 'Token ungültig oder abgelaufen' };
  }

  const session = r.rows[0];
  const primaryEmail = session.customer_email;

  // Alle E-Mails der Firma auflösen — damit Hauptkontakte alle Touren sehen
  const allEmails = await resolveCustomerEmails(primaryEmail);

  // Besten customer_name für diese E-Mail-Gruppe ermitteln
  let customerName = null;
  try {
    const nameRes = await pool.query(
      `SELECT customer_name FROM tour_manager.tours
       WHERE LOWER(TRIM(customer_email)) = ANY($1::text[])
         AND customer_name IS NOT NULL AND TRIM(customer_name) != ''
       GROUP BY customer_name ORDER BY COUNT(*) DESC LIMIT 1`,
      [allEmails]
    );
    customerName = nameRes.rows[0]?.customer_name || null;
  } catch (_) { /* best-effort */ }

  return {
    ok: true,
    customerEmail: primaryEmail,
    customerEmails: allEmails,
    customerName,
    sessionId: session.id,
  };
}

// ─── Alle E-Mails einer Firma auflösen ───────────────────────────────────────
// Schaut in core.customers (Hauptkontakt + email_aliases) und in tour_manager.tours
// nach allen E-Mails die zur selben customer_id gehören.

async function resolveCustomerEmails(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return [normalizedEmail];

  try {
    // 1. customer_id aus tours ermitteln (schnell, immer vorhanden)
    const tourResult = await pool.query(
      `SELECT DISTINCT customer_id FROM tour_manager.tours
       WHERE LOWER(TRIM(customer_email)) = $1 AND customer_id IS NOT NULL
       LIMIT 1`,
      [normalizedEmail]
    );

    if (tourResult.rows.length > 0) {
      const customerId = tourResult.rows[0].customer_id;
      // Alle E-Mails dieser customer_id aus tours sammeln
      const emailResult = await pool.query(
        `SELECT DISTINCT LOWER(TRIM(customer_email)) AS email
         FROM tour_manager.tours
         WHERE customer_id = $1 AND customer_email IS NOT NULL AND TRIM(customer_email) != ''`,
        [customerId]
      );
      const emails = emailResult.rows.map((r) => r.email).filter(Boolean);
      if (emails.length > 0) return emails;
    }

    // 2. Fallback: core.customers prüfen ob E-Mail dort als Haupt-Mail oder Alias vorkommt
    try {
      const custResult = await pool.query(
        `SELECT email, email_aliases FROM core.customers
         WHERE LOWER(TRIM(email)) = $1
            OR email_aliases::text ILIKE $2
         LIMIT 1`,
        [normalizedEmail, `%${normalizedEmail}%`]
      );
      if (custResult.rows.length > 0) {
        const row = custResult.rows[0];
        const aliases = Array.isArray(row.email_aliases) ? row.email_aliases : [];
        const allEmails = [row.email, ...aliases]
          .map((e) => String(e || '').trim().toLowerCase())
          .filter(Boolean);
        const unique = [...new Set(allEmails)];
        if (unique.length > 0) return unique;
      }
    } catch {
      // core schema nicht verfügbar — ignorieren
    }
  } catch (err) {
    console.warn('[cleanup-dashboard] resolveCustomerEmails Fehler:', err.message);
  }

  // Fallback: nur die eigene E-Mail
  return [normalizedEmail];
}

function getDashboardEligibilityClause({ forSend = false } = {}) {
  // forSend=true: beim Mail-Versand alle relevanten Touren laden (noch kein cleanup_sent_at gesetzt)
  // forSend=false (default, Kunden-Dashboard): nur Touren zeigen die bereits zugeschickt wurden
  //   oder wo eine Aktion gesetzt ist — Sicherheit damit Kunden nicht willkürlich fremde Touren sehen
  if (forSend) {
    return `AND status NOT IN ('DELETED', 'TRANSFERRED')`;
  }
  return `AND (
    cleanup_sent_at IS NOT NULL
    OR cleanup_action IS NOT NULL
  )`;
}

const DELETE_DELAY_DAYS = 30;

function getDeleteDelayDate() {
  return new Date(Date.now() + DELETE_DELAY_DAYS * 24 * 60 * 60 * 1000);
}

async function activateTourAndSpace(tourId, spaceId) {
  if (!spaceId) {
    await pool.query(
      `UPDATE tour_manager.tours
       SET status = 'ACTIVE',
           matterport_state = 'active',
           updated_at = NOW()
       WHERE id = $1`,
      [tourId]
    );
    return { spaceActivated: false };
  }

  const mp = require('./matterport');
  const result = await mp.unarchiveSpace(spaceId);
  if (!result?.success) {
    throw new Error(result?.error || 'Matterport-Space konnte nicht reaktiviert werden');
  }

  const live = await mp.getModel(spaceId);
  const liveState = String(live?.model?.state || '').toLowerCase();
  if (liveState !== 'active') {
    throw new Error(`Matterport-Space ist nach Reaktivierung nicht aktiv (${liveState || 'unbekannt'})`);
  }

  await pool.query(
    `UPDATE tour_manager.tours
     SET status = 'ACTIVE',
         matterport_state = 'active',
         updated_at = NOW()
     WHERE id = $1`,
    [tourId]
  );

  return { spaceActivated: true };
}

async function scheduleTourDeletion({
  tourId,
  actorType,
  actorRef,
  reason,
  via,
  deleteMatterport = true,
}) {
  await ensureCleanupSchema();

  const tourRes = await pool.query(
    `SELECT id, canonical_matterport_space_id, matterport_space_id
     FROM tour_manager.tours
     WHERE id = $1`,
    [tourId]
  );
  const tour = normalizeTourRow(tourRes.rows[0]);
  if (!tour) throw new Error('Tour nicht gefunden');

  const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id || null;
  const executeAfter = getDeleteDelayDate();

  await pool.query(
    `INSERT INTO tour_manager.pending_deletions
       (tour_id, matterport_space_id, delete_matterport, requested_by_type, requested_by_ref, requested_via, reason, execute_after, details_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (tour_id) WHERE tour_id IS NOT NULL AND executed_at IS NULL AND cancelled_at IS NULL
     DO UPDATE SET
       matterport_space_id = EXCLUDED.matterport_space_id,
       delete_matterport = EXCLUDED.delete_matterport,
       requested_by_type = EXCLUDED.requested_by_type,
       requested_by_ref = EXCLUDED.requested_by_ref,
       requested_via = EXCLUDED.requested_via,
       reason = EXCLUDED.reason,
       requested_at = NOW(),
       execute_after = EXCLUDED.execute_after,
       details_json = EXCLUDED.details_json,
       last_error = NULL`,
    [
      tour.id,
      spaceId,
      !!deleteMatterport,
      actorType,
      actorRef || null,
      via || null,
      reason || null,
      executeAfter.toISOString(),
      JSON.stringify({
        reason: reason || null,
        requested_via: via || null,
        delete_matterport: !!deleteMatterport,
      }),
    ]
  );

  await pool.query(
    `UPDATE tour_manager.tours
     SET cleanup_action = 'loeschen',
         cleanup_action_at = NOW(),
         delete_requested_at = NOW(),
         delete_after_at = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [tour.id, executeAfter.toISOString()]
  );

  return { tourId: tour.id, spaceId, executeAfter };
}

async function processPendingDeletions({ limit = 100, actorRef = 'cron' } = {}) {
  await ensureCleanupSchema();
  const res = await pool.query(
    `SELECT id, tour_id, matterport_space_id, delete_matterport
     FROM tour_manager.pending_deletions
     WHERE executed_at IS NULL
       AND cancelled_at IS NULL
       AND execute_after <= NOW()
     ORDER BY execute_after ASC
     LIMIT $1`,
    [limit]
  );

  const processed = [];
  const failed = [];

  for (const row of res.rows) {
    try {
      if (row.delete_matterport && row.matterport_space_id) {
        const mp = require('./matterport');
        const result = await mp.deleteSpace(row.matterport_space_id);
        if (!result?.success) {
          throw new Error(result?.error || 'Matterport-Löschung fehlgeschlagen');
        }
      }

      if (row.tour_id) {
        await logAction(row.tour_id, 'system', actorRef, 'DELETE_TOUR_EXECUTED', {
          source: 'pending_deletion',
          matterport_space_id: row.matterport_space_id || null,
        });
        await pool.query(`DELETE FROM tour_manager.tours WHERE id = $1`, [row.tour_id]);
      }

      await pool.query(
        `UPDATE tour_manager.pending_deletions
         SET executed_at = NOW(), last_error = NULL
         WHERE id = $1`,
        [row.id]
      );
      processed.push({ id: row.id, tourId: row.tour_id });
    } catch (err) {
      await pool.query(
        `UPDATE tour_manager.pending_deletions
         SET last_error = $2
         WHERE id = $1`,
        [row.id, err.message]
      );
      failed.push({ id: row.id, error: err.message });
    }
  }

  return {
    ok: failed.length === 0,
    processedCount: processed.length,
    failedCount: failed.length,
    processed,
    failed,
  };
}

// ─── Dashboard-Daten laden ───────────────────────────────────────────────────

async function getDashboardTours(customerEmail, options = {}) {
  await ensureSessionSchema();
  const { forSend = false } = options;
  // customerEmail kann ein String oder Array von Strings sein
  const emails = Array.isArray(customerEmail)
    ? customerEmail.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    : [String(customerEmail).trim().toLowerCase()];

  const r = await pool.query(
    `SELECT * FROM tour_manager.tours
     WHERE LOWER(TRIM(customer_email)) = ANY($1::text[])
       AND status NOT IN ('DELETED', 'TRANSFERRED')
       ${getDashboardEligibilityClause({ forSend })}
     ORDER BY
       CASE WHEN cleanup_action IS NULL THEN 0 ELSE 1 END,
       CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END,
       COALESCE(archived_at, created_at) DESC`,
    [emails]
  );

  return r.rows.map(normalizeTourRow).map((tour) => {
    const rule = computeCleanupRule(tour);
    return {
      id: tour.id,
      objectLabel: tour.object_label || tour.bezeichnung || tour.canonical_object_label || `Tour ${tour.id}`,
      tourUrl: tour.tour_url || (tour.matterport_space_id ? `https://my.matterport.com/show/?m=${tour.matterport_space_id}` : null),
      status: tour.status,
      statusLabel: rule.statusLabel,
      matterportState: tour.matterport_state,
      createdAt: tour.created_at,
      termEndDate: tour.canonical_term_end_date || tour.term_end_date || tour.ablaufdatum,
      archivedAt: tour.archived_at,
      cleanupAction: tour.cleanup_action || null,
      cleanupActionAt: tour.cleanup_action_at || null,
      rule: {
        statusLabel: rule.statusLabel,
        weiterfuehrenHint: rule.weiterfuehrenHint,
        needsInvoice: rule.needsInvoice,
        invoiceAmount: rule.invoiceAmount,
        needsManualReview: rule.needsManualReview,
      },
    };
  });
}

// ─── Aktion vom Dashboard ausführen ──────────────────────────────────────────

async function executeDashboardAction(customerEmail, tourId, action) {
  await ensureSessionSchema();
  // customerEmail kann String oder Array sein (bei Firmenzugang alle E-Mails der Firma)
  const emails = Array.isArray(customerEmail)
    ? customerEmail.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    : [String(customerEmail).trim().toLowerCase()];
  const validActions = ['weiterfuehren', 'archivieren', 'uebertragen', 'loeschen'];
  if (!validActions.includes(action)) throw new Error('Ungültige Aktion');

  const r = await pool.query(
    `SELECT * FROM tour_manager.tours
     WHERE id = $1
       AND LOWER(TRIM(customer_email)) = ANY($2::text[])
       ${getDashboardEligibilityClause()}`,
    [tourId, emails]
  );
  const tour = normalizeTourRow(r.rows[0]);
  if (!tour) throw new Error('Tour nicht gefunden oder gehört nicht zu dieser E-Mail');
  const actorEmail = emails[0] || String(tour.customer_email || '').trim().toLowerCase() || 'unknown';

  if (tour.cleanup_action) {
    throw new Error(`Für diese Tour wurde bereits die Aktion "${tour.cleanup_action}" gewählt`);
  }

  const rule = computeCleanupRule(tour);

  if (action === 'weiterfuehren') {
    if (rule.needsManualReview) {
      await pool.query(
        `UPDATE tour_manager.tours SET cleanup_action = 'weiterfuehren_review', cleanup_action_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [tour.id]
      );
      await pool.query(
        `INSERT INTO tour_manager.tickets (module, reference_id, reference_type, category, subject, description, priority, created_by, created_by_role, status)
         VALUES ('tours',$1,'tour','sonstiges',$2,$3,'normal',$4,'customer','open')`,
        [
          String(tour.id),
          'Bereinigungslauf: Weiterführen-Wunsch (manueller Review)',
          `Kunde hat über das Cleanup-Dashboard "Weiterführen" gewählt. Tour war kürzlich archiviert (< 6 Monate). Preis bitte manuell klären.\n\nKunde: ${actorEmail}\nObjekt: ${tour.canonical_object_label || tour.bezeichnung}`,
          actorEmail,
        ]
      );
      await logAction(tour.id, 'customer', actorEmail, 'CLEANUP_DASHBOARD_WEITERFUEHREN_REVIEW', { needsManualReview: true });
      return { action: 'weiterfuehren_review', message: 'Ihr Wunsch wurde registriert. Wir klären den Preis und melden uns bei Ihnen.' };
    }

    if (rule.needsInvoice) {
      await pool.query(
        `UPDATE tour_manager.tours SET cleanup_action = 'weiterfuehren_pending_payment', cleanup_action_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [tour.id]
      );
      await logAction(tour.id, 'customer', actorEmail, 'CLEANUP_DASHBOARD_WEITERFUEHREN_PENDING_PAYMENT', { invoiceAmount: rule.invoiceAmount });
      return {
        action: 'weiterfuehren_pending_payment',
        needsPayment: true,
        invoiceAmount: rule.invoiceAmount,
        message: `Um Ihre Tour zu reaktivieren, wird eine Rechnung über CHF ${rule.invoiceAmount}.– erstellt. Bitte wählen Sie eine Zahlungsart.`,
      };
    }

    await pool.query(
      `UPDATE tour_manager.tours SET cleanup_action = 'weiterfuehren', cleanup_action_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [tour.id]
    );
    await activateTourAndSpace(tour.id, tour.canonical_matterport_space_id || tour.matterport_space_id || null);
    await logAction(tour.id, 'customer', actorEmail, 'CLEANUP_DASHBOARD_WEITERFUEHREN', {});
    return { action: 'weiterfuehren', message: 'Ihre Tour wird wie gewohnt weitergeführt.' };
  }

  if (action === 'archivieren') {
    const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
    if (spaceId) {
      const mp = require('./matterport');
      const result = await mp.archiveSpace(spaceId);
      if (!result?.success) {
        throw new Error(result?.error || 'Matterport-Space konnte nicht archiviert werden');
      }
    }
    await pool.query(
      `UPDATE tour_manager.tours
       SET status = 'ARCHIVED',
           archived_at = COALESCE(archived_at, NOW()),
           matterport_state = CASE WHEN COALESCE($2::text, '') <> '' THEN 'inactive' ELSE matterport_state END,
           cleanup_action = 'archivieren',
           cleanup_action_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [tour.id, spaceId || null]
    );
    await logAction(tour.id, 'customer', actorEmail, 'CLEANUP_DASHBOARD_ARCHIVIEREN', { matterport_space_id: spaceId || null });
    return { action: 'archivieren', message: 'Ihre Tour wurde archiviert.' };
  }

  if (action === 'uebertragen') {
    await pool.query(
      `UPDATE tour_manager.tours SET cleanup_action = 'uebertragen', cleanup_action_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [tour.id]
    );
    await pool.query(
      `INSERT INTO tour_manager.tickets (module, reference_id, reference_type, category, subject, description, priority, created_by, created_by_role, status)
       VALUES ('tours',$1,'tour','sonstiges',$2,$3,'normal',$4,'customer','open')`,
      [
        String(tour.id),
        'Bereinigungslauf: Übertragung gewünscht',
        `Kunde möchte Tour über Cleanup-Dashboard übertragen.\n\nObjekt: ${tour.canonical_object_label || tour.bezeichnung}\nKunde: ${actorEmail}`,
        actorEmail,
      ]
    );
    await logAction(tour.id, 'customer', actorEmail, 'CLEANUP_DASHBOARD_UEBERTRAGEN', {});
    return { action: 'uebertragen', message: 'Übertragungsanfrage registriert. Wir melden uns bei Ihnen.' };
  }

  if (action === 'loeschen') {
    const scheduled = await scheduleTourDeletion({
      tourId: tour.id,
      actorType: 'customer',
      actorRef: actorEmail,
      reason: 'cleanup dashboard delete request',
      via: 'cleanup_dashboard',
      deleteMatterport: true,
    });
    await logAction(tour.id, 'customer', actorEmail, 'CLEANUP_DASHBOARD_LOESCHEN', {
      execute_after: scheduled.executeAfter.toISOString(),
      matterport_space_id: scheduled.spaceId || null,
    });
    return { action: 'loeschen', message: 'Die Löschung wurde vorgemerkt und wird in 30 Tagen ausgeführt.' };
  }

  throw new Error('Unbekannte Aktion');
}

// ─── Zahlungsart wählen (nach weiterfuehren_pending_payment) ─────────────────

async function executeDashboardPaymentChoice(customerEmail, tourId, paymentMethod) {
  await ensureSessionSchema();
  const emails = Array.isArray(customerEmail)
    ? customerEmail.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    : [String(customerEmail).trim().toLowerCase()];
  if (!['online', 'qr'].includes(paymentMethod)) throw new Error('Ungültige Zahlungsart');

  const r = await pool.query(
    `SELECT * FROM tour_manager.tours
     WHERE id = $1
       AND LOWER(TRIM(customer_email)) = ANY($2::text[])
       ${getDashboardEligibilityClause()}`,
    [tourId, emails]
  );
  const tour = normalizeTourRow(r.rows[0]);
  if (!tour) throw new Error('Tour nicht gefunden');
  const actorEmail = emails[0] || String(tour.customer_email || '').trim().toLowerCase() || 'unknown';

  const rule = computeCleanupRule(tour);
  const { EXTENSION_PRICE_CHF, getSubscriptionWindowFromStart } = require('./subscriptions');
  const amount = rule.invoiceAmount || EXTENSION_PRICE_CHF;
  const invoiceKind = tour.status === 'ARCHIVED' ? 'portal_reactivation' : 'portal_extension';
  const subscriptionWindow = getSubscriptionWindowFromStart(new Date());

  if (paymentMethod === 'online') {
    const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const dbInv = await pool.query(
      `INSERT INTO tour_manager.renewal_invoices
         (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source, subscription_start_at, subscription_end_at)
       VALUES ($1, 'pending', NOW(), $2, $3, $4, 'payrexx_pending', $5, $6) RETURNING id`,
      [tour.id, amount, dueAt, invoiceKind, subscriptionWindow.startIso, subscriptionWindow.endIso]
    );
    const invoice = { id: dbInv.rows[0]?.id, invoice_status: 'pending', amount_chf: amount, invoice_kind: invoiceKind };
    const payrexx = require('./payrexx');
    const checkoutUrl = await payrexx.ensureRenewalInvoiceCheckoutUrl(pool, invoice, tour);
    if (!checkoutUrl) throw new Error('Payrexx-Checkout konnte nicht erstellt werden');

    await pool.query(
      `UPDATE tour_manager.tours SET cleanup_action = 'weiterfuehren_online', cleanup_action_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [tour.id]
    );
    await logAction(tour.id, 'customer', actorEmail, 'CLEANUP_DASHBOARD_ONLINE_CHECKOUT', { amount });
    return { checkoutUrl };
  }

  // QR-Rechnung
  const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;

  await activateTourAndSpace(tour.id, spaceId);

  const dbInv = await pool.query(
    `INSERT INTO tour_manager.renewal_invoices
       (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source, subscription_start_at, subscription_end_at)
     VALUES ($1, 'sent', NOW(), $2, $3, $4, 'qr_pending', $5, $6) RETURNING id`,
    [tour.id, amount, dueAt, invoiceKind, subscriptionWindow.startIso, subscriptionWindow.endIso]
  );
  const internalInvId = dbInv.rows[0]?.id;

  const { sendInvoiceWithQrEmail } = require('./tour-actions');
  sendInvoiceWithQrEmail(String(tour.id), internalInvId).catch((err) => {
    console.error('[cleanup-dashboard] sendInvoiceWithQrEmail failed:', tour.id, err.message);
  });

  await pool.query(
    `UPDATE tour_manager.tours SET cleanup_action = 'weiterfuehren_qr', cleanup_action_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [tour.id]
  );
  await logAction(tour.id, 'customer', actorEmail, 'CLEANUP_DASHBOARD_QR_INVOICE', { amount });
  return { message: `QR-Rechnung (CHF ${amount}.–) wurde per E-Mail verschickt.` };
}

// ─── Dashboard-Mail senden (1 Mail pro Kunde) ───────────────────────────────

async function sendDashboardInvite(customerEmail, options = {}) {
  await ensureSessionSchema();
  await ensureOutgoingEmailSchema();
  const { actorType = 'admin', actorRef = null } = options;

  // customerEmail kann ein String oder Array sein (bei firmenweiser Gruppierung)
  const emailList = Array.isArray(customerEmail)
    ? customerEmail.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    : [String(customerEmail).trim().toLowerCase()];
  const primaryEmail = emailList[0];
  if (!primaryEmail) throw new Error('Keine E-Mail-Adresse');

  const tours = await getDashboardTours(emailList, { forSend: true });
  const pendingTours = tours.filter((t) => !t.cleanupAction);
  if (pendingTours.length === 0) throw new Error('Keine offenen Touren für diesen Kunden');

  // Session pro E-Mail erstellen (jede E-Mail bekommt eigenen Token)
  const sessions = await Promise.all(emailList.map((e) => createDashboardSession(e)));
  const { token } = sessions[0]; // primärer Token für primäre E-Mail

  const baseUrl = (process.env.PORTAL_BASE_URL || process.env.CUSTOMER_BASE_URL || 'https://portal.propus.ch').replace(/\/$/, '');
  const dashboardUrl = `${baseUrl}/cleanup/dashboard?token=${encodeURIComponent(token)}`;

  const customerName = pendingTours[0]?.objectLabel ? null : null;
  const firstTour = pendingTours[0];
  const greeting = firstTour ? (tours[0]?.customerContact || 'Guten Tag') : 'Guten Tag';

  const tourListHtml = pendingTours.map((t) => {
    const statusColor = t.status === 'ARCHIVED' ? '#d97706' : t.status === 'ACTIVE' ? '#059669' : '#6b7280';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0ebe0;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(t.objectLabel)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0ebe0;font-size:13px;"><span style="color:${statusColor};font-weight:600;">${escapeHtml(t.statusLabel)}</span></td>
    </tr>`;
  }).join('');

  const { buildEmailFrame, buildSummaryCard, buildInfoCallout, buildActionButtons } = require('./settings');

  const subject = pendingTours.length === 1
    ? `Handlungsbedarf: Bitte prüfen Sie Ihre Tour – ${pendingTours[0].objectLabel}`
    : `Handlungsbedarf: ${pendingTours.length} Touren benötigen Ihre Entscheidung`;

  const html = buildEmailFrame({
    preheader: `${pendingTours.length} Tour${pendingTours.length > 1 ? 'en' : ''} benötig${pendingTours.length > 1 ? 'en' : 't'} Ihre Entscheidung`,
    title: pendingTours.length === 1
      ? 'Bitte prüfen Sie Ihre Tour'
      : `${pendingTours.length} Touren benötigen Ihre Entscheidung`,
    introHtml: `<p style="margin:0 0 14px;">Guten Tag,</p>
      <p style="margin:0 0 14px;">Im Zuge einer Neuorganisation unserer Touren bitten wir Sie, ${pendingTours.length === 1 ? 'die folgende Tour' : `Ihre ${pendingTours.length} Touren`} zu prüfen und jeweils eine Aktion zu wählen.</p>`,
    summaryHtml: `
      <div style="background:linear-gradient(180deg,#fffdf9 0%,#fffaf2 100%);border:1px solid #ece5d7;border-radius:24px;padding:18px 20px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.72);">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#8e7440;margin-bottom:10px;">Ihre Touren</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
          <tr style="border-bottom:2px solid #ece5d7;">
            <td style="padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8a7550;">Objekt</td>
            <td style="padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8a7550;">Status</td>
          </tr>
          ${tourListHtml}
        </table>
      </div>`,
    bodyHtml: `<p style="margin:18px 0 0;font-size:15px;line-height:1.7;color:#4b5563;">Auf der folgenden Seite können Sie für jede Tour einzeln entscheiden, was passieren soll:</p>`,
    ctaHtml: buildActionButtons([
      { href: dashboardUrl, label: `Touren prüfen${pendingTours.length > 1 ? ` (${pendingTours.length})` : ''}`, primary: true, icon: '→' },
    ]),
    noteHtml: buildInfoCallout(
      '&#9993;',
      'Direktnachricht ans Propus Team',
      'Haben Sie Fragen oder Anmerkungen? Antworten Sie direkt auf diese E-Mail – wir melden uns so bald wie möglich.'
    ),
  });

  const text = `Guten Tag,

Im Zuge einer Neuorganisation unserer Touren bitten wir Sie, ${pendingTours.length === 1 ? 'die folgende Tour' : `Ihre ${pendingTours.length} Touren`} zu prüfen.

${pendingTours.map((t) => `• ${t.objectLabel} (${t.statusLabel})`).join('\n')}

Bitte besuchen Sie die folgende Seite, um für jede Tour eine Aktion zu wählen:
${dashboardUrl}

Optionen pro Tour:
✓ Weiterführen
📁 Archivieren
↗ Übertragen
✕ Löschen

Bei Fragen antworten Sie direkt auf diese E-Mail.

Freundliche Grüsse
Ihr Propus Team`;

  // An alle E-Mails der Gruppe senden (jede bekommt ihren eigenen Token/Link)
  const mailResults = [];
  for (let i = 0; i < emailList.length; i++) {
    const recipientEmail = emailList[i];
    const recipientToken = sessions[i].token;
    const recipientDashboardUrl = `${baseUrl}/cleanup/dashboard?token=${encodeURIComponent(recipientToken)}`;

    // Bei mehreren E-Mails: HTML/CTA-Link anpassen
    const recipientHtml = i === 0 ? html : html.replace(
      encodeURIComponent(token),
      encodeURIComponent(recipientToken)
    );
    const recipientText = text.replace(dashboardUrl, recipientDashboardUrl);

    const fakeTour = { customer_email: recipientEmail, id: pendingTours[0]?.id };
    const mailResult = await sendGraphMailToCustomer(fakeTour, { subject, html: recipientHtml, text: recipientText });
    mailResults.push({ email: recipientEmail, result: mailResult });

    if (mailResult.success) {
      await pool.query(
        `INSERT INTO tour_manager.outgoing_emails
           (tour_id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
            recipient_email, subject, template_key, sent_at, details_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'cleanup_dashboard_invite',NOW(),$8::jsonb)`,
        [
          pendingTours[0]?.id,
          mailResult.mailboxUpn || 'system',
          mailResult.graphMessageId || null,
          mailResult.internetMessageId || null,
          mailResult.conversationId || null,
          mailResult.recipientEmail || recipientEmail,
          subject,
          JSON.stringify({ tourCount: pendingTours.length, tourIds: pendingTours.map((t) => t.id), allRecipients: emailList }),
        ]
      );
    }
  }

  const anySuccess = mailResults.some((m) => m.result.success);
  if (!anySuccess) {
    throw new Error(mailResults[0]?.result?.error || 'Versand fehlgeschlagen');
  }

  for (const t of pendingTours) {
    await pool.query(
      `UPDATE tour_manager.tours SET cleanup_sent_at = COALESCE(cleanup_sent_at, NOW()), updated_at = NOW() WHERE id = $1`,
      [t.id]
    );
  }

  for (const t of pendingTours) {
    await logAction(t.id, actorType, actorRef, 'CLEANUP_DASHBOARD_INVITE_SENT', {
      recipientEmails: emailList,
      dashboardUrl,
      tourCount: pendingTours.length,
    });
  }

  return {
    success: true,
    recipientEmail: primaryEmail,
    recipientEmails: emailList,
    tourCount: pendingTours.length,
    tourIds: pendingTours.map((t) => t.id),
    subject,
  };
}

// ─── Batch: Dashboard-Mails an alle Kunden senden ────────────────────────────

async function sendDashboardBatch({ dryRun = true, customerEmails = null, actorType = 'admin', actorRef = null } = {}) {
  const groups = await getCleanupCandidatesGrouped();

  let targets = groups.filter((g) => g.pendingCount > 0);
  // Filterung nach E-Mail (eine aus der Gruppe reicht zur Identifikation)
  if (customerEmails && Array.isArray(customerEmails) && customerEmails.length > 0) {
    const normalized = customerEmails.map((e) => String(e).trim().toLowerCase());
    targets = targets.filter((g) =>
      g.customerEmails.some((e) => normalized.includes(e))
    );
  }

  const results = [];

  for (const group of targets) {
    const alreadySent = group.allSent;

    if (alreadySent) {
      results.push({
        groupKey: group.groupKey,
        customerEmail: group.customerEmail,
        customerEmails: group.customerEmails,
        customerName: group.customerName,
        tourCount: group.tourCount,
        pendingCount: group.pendingCount,
        skipped: true,
        skipReason: 'Bereits versendet',
      });
      continue;
    }

    if (dryRun) {
      results.push({
        groupKey: group.groupKey,
        customerEmail: group.customerEmail,
        customerEmails: group.customerEmails,
        customerName: group.customerName,
        tourCount: group.tourCount,
        pendingCount: group.pendingCount,
        tours: group.tours.map((t) => ({
          id: t.id,
          objectLabel: t.object_label || t.bezeichnung || `Tour ${t.id}`,
          status: t.status,
          statusLabel: computeCleanupRule(t).statusLabel,
        })),
        skipped: false,
        dryRun: true,
      });
    } else {
      try {
        const r = await sendDashboardInvite(group.customerEmails, { actorType, actorRef });
        results.push({
          groupKey: group.groupKey,
          customerEmail: group.customerEmail,
          customerEmails: group.customerEmails,
          customerName: group.customerName,
          tourCount: r.tourCount,
          pendingCount: group.pendingCount,
          skipped: false,
          success: true,
        });
      } catch (err) {
        results.push({
          groupKey: group.groupKey,
          customerEmail: group.customerEmail,
          customerEmails: group.customerEmails,
          customerName: group.customerName,
          tourCount: group.tourCount,
          pendingCount: group.pendingCount,
          skipped: false,
          success: false,
          error: err.message,
        });
      }
    }
  }

  return {
    dryRun,
    totalCustomers: targets.length,
    totalTours: targets.reduce((s, g) => s + g.pendingCount, 0),
    sent: results.filter((r) => !r.skipped && !r.dryRun && r.success).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => !r.skipped && !r.dryRun && !r.success).length,
    results,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Cleanup-Gutschein: Prüfen ob alle Touren erledigt ───────────────────────

/**
 * Prüft ob alle cleanup-gesendeten Touren eines Kunden erledigt sind
 * und ob noch kein Gutschein für diese E-Mail-Gruppe gesendet wurde.
 * @returns {{ allDone: boolean, pendingCount: number, voucherAlreadySent: boolean }}
 */
async function checkAllToursCompleted(customerEmails) {
  const emails = Array.isArray(customerEmails)
    ? customerEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    : [String(customerEmails).trim().toLowerCase()];

  // Touren die eine Cleanup-Mail erhalten haben aber noch keine Aktion haben
  const pendingRes = await pool.query(
    `SELECT COUNT(*) AS cnt FROM tour_manager.tours
     WHERE LOWER(TRIM(customer_email)) = ANY($1::text[])
       AND cleanup_sent_at IS NOT NULL
       AND cleanup_action IS NULL
       AND status NOT IN ('DELETED', 'TRANSFERRED')`,
    [emails]
  );
  const pendingCount = parseInt(pendingRes.rows[0]?.cnt || '0', 10);

  // Prüfen ob bereits ein Gutschein für diese Emails erstellt wurde
  const voucherRes = await pool.query(
    `SELECT id FROM booking.discount_codes
     WHERE active = true
       AND conditions_json->>'source' = 'cleanup'
       AND conditions_json->'customerEmails' ?| $1::text[]
     LIMIT 1`,
    [emails]
  );
  const voucherAlreadySent = voucherRes.rows.length > 0;

  return { allDone: pendingCount === 0, pendingCount, voucherAlreadySent };
}

// ─── Cleanup-Gutschein: Code generieren und in DB speichern ──────────────────

function generateVoucherCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CLEANUP-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Erstellt einen einzigartigen 10%-Gutschein in booking.discount_codes
 * und sendet eine Dankes-Mail an alle E-Mails des Kunden.
 * @param {string[]} customerEmails  Alle E-Mails der Kunden-Gruppe
 * @param {string}   customerName    Anzeigename des Kunden
 * @returns {{ code: string, validTo: Date }}
 */
async function generateCleanupVoucher(customerEmails, customerName) {
  const emails = Array.isArray(customerEmails)
    ? customerEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    : [String(customerEmails).trim().toLowerCase()];

  // Einzigartigen Code generieren (max 5 Versuche bei Kollision)
  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateVoucherCode();
    const existing = await pool.query(
      `SELECT id FROM booking.discount_codes WHERE code = $1 LIMIT 1`,
      [candidate]
    );
    if (existing.rows.length === 0) { code = candidate; break; }
  }
  if (!code) throw new Error('Konnte keinen eindeutigen Gutschein-Code generieren');

  const validFrom = new Date();
  const validTo = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000); // ~6 Monate

  await pool.query(
    `INSERT INTO booking.discount_codes
       (code, type, amount, active, valid_from, valid_to, max_uses, uses_count, uses_per_customer, conditions_json)
     VALUES ($1, 'percent', 10, true, $2, $3, 1, 0, 1, $4::jsonb)`,
    [
      code,
      validFrom.toISOString().split('T')[0],
      validTo.toISOString().split('T')[0],
      JSON.stringify({ source: 'cleanup', customerEmails: emails, customerName: customerName || null }),
    ]
  );

  return { code, validTo };
}

/**
 * Dankes-Mail mit Gutscheincode an alle E-Mails der Kunden-Gruppe senden.
 */
async function sendCleanupThankYouMail(customerEmails, customerName, voucherCode, validTo) {
  await ensureOutgoingEmailSchema();
  const { buildEmailFrame, buildSummaryCard, buildInfoCallout } = require('./settings');

  const emails = Array.isArray(customerEmails)
    ? customerEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    : [String(customerEmails).trim().toLowerCase()];

  const greeting = customerName ? `Guten Tag${customerName ? `, ${customerName}` : ''}` : 'Guten Tag';
  const validToStr = validTo.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const subject = 'Vielen Dank – Ihr persönlicher Gutscheincode';

  const htmlBody = buildEmailFrame({
    preheader: 'Herzlichen Dank für Ihre Rückmeldung – hier ist Ihr persönlicher 10%-Gutschein',
    title: 'Vielen Dank für Ihre Rückmeldung!',
    introHtml: `<p style="margin:0 0 14px;">${escapeHtml(greeting)}</p><p style="margin:0;">herzlichen Dank, dass Sie sich die Zeit genommen haben, alle Ihre Touren zu prüfen und zu bearbeiten. Als kleines Dankeschön schenken wir Ihnen einen persönlichen Gutschein für Ihre nächste Buchung auf <a href="https://booking.propus.ch" style="color:#8a6c18;font-weight:700;">booking.propus.ch</a>.</p>`,
    summaryHtml: buildSummaryCard(
      [
        { label: 'Ihr Code', value: `<span style="font-family:monospace;font-size:22px;font-weight:700;letter-spacing:0.12em;color:#1a1a1a;background:#f5edde;padding:4px 12px;border-radius:8px;display:inline-block;">${escapeHtml(voucherCode)}</span>` },
        { label: 'Rabatt', value: '<strong>10 % auf Ihre nächste Buchung</strong>' },
        { label: 'Gültig bis', value: escapeHtml(validToStr) },
        { label: 'Einlösbar auf', value: '<a href="https://booking.propus.ch" style="color:#8a6c18;font-weight:700;">booking.propus.ch</a>' },
      ]
    ),
    bodyHtml: `<p style="margin:0 0 10px;">Geben Sie den Code beim Buchungsabschluss einfach im Feld <em>«Gutschein / Rabattcode»</em> ein — der Rabatt wird sofort abgezogen.</p>`,
    noteHtml: buildInfoCallout('ℹ️', 'Hinweis', `Der Code ist einmalig verwendbar und gültig bis ${escapeHtml(validToStr)}. Er gilt für eine Buchung auf booking.propus.ch.`),
  });

  const textBody = `${greeting}

herzlichen Dank, dass Sie sich die Zeit genommen haben, alle Ihre Touren zu prüfen. Als Dankeschön erhalten Sie einen persönlichen 10%-Gutschein:

Ihr Code: ${voucherCode}
Rabatt: 10 % auf Ihre nächste Buchung
Gültig bis: ${validToStr}
Einlösbar auf: https://booking.propus.ch

Geben Sie den Code beim Buchungsabschluss im Feld «Gutschein / Rabattcode» ein.

Freundliche Grüsse
Ihr Propus Team`;

  for (const email of emails) {
    try {
      const fakeTour = { customer_email: email, id: null };
      const mailResult = await sendGraphMailToCustomer(fakeTour, { subject, html: htmlBody, text: textBody });
      if (mailResult.success) {
        await pool.query(
          `INSERT INTO tour_manager.outgoing_emails
             (tour_id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
              recipient_email, subject, template_key, sent_at, details_json)
           VALUES (NULL,$1,$2,$3,$4,$5,$6,'cleanup_thankyou',NOW(),$7::jsonb)`,
          [
            mailResult.mailboxUpn || 'system',
            mailResult.graphMessageId || null,
            mailResult.internetMessageId || null,
            mailResult.conversationId || null,
            mailResult.recipientEmail || email,
            subject,
            JSON.stringify({ voucherCode, validTo: validTo.toISOString(), customerName: customerName || null }),
          ]
        );
      } else {
        console.warn(`[cleanup-voucher] Mail an ${email} fehlgeschlagen:`, mailResult.error);
      }
    } catch (err) {
      console.warn(`[cleanup-voucher] Mail an ${email} fehlgeschlagen:`, err.message);
    }
  }
}

/**
 * Prüft nach einer Aktion ob alle Touren erledigt sind und sendet ggf. Gutschein-Mail.
 * Wird von booking/server.js nach executeDashboardAction und executeDashboardPaymentChoice aufgerufen.
 */
async function maybeDispatchCleanupVoucher(customerEmails, customerName) {
  try {
    const { allDone, voucherAlreadySent } = await checkAllToursCompleted(customerEmails);
    if (!allDone || voucherAlreadySent) return { dispatched: false, reason: voucherAlreadySent ? 'already_sent' : 'tours_pending' };

    const { code, validTo } = await generateCleanupVoucher(customerEmails, customerName);
    await sendCleanupThankYouMail(customerEmails, customerName, code, validTo);
    console.log(`[cleanup-voucher] Gutschein ${code} an ${JSON.stringify(customerEmails)} gesendet`);
    return { dispatched: true, code };
  } catch (err) {
    console.warn('[cleanup-voucher] Fehler beim Gutschein-Versand:', err.message);
    return { dispatched: false, error: err.message };
  }
}

/**
 * Batch-Versand für bereits erledigte Kunden (Admin-Aktion).
 * Findet alle Gruppen bei denen alle Touren erledigt sind aber noch kein Gutschein gesendet wurde.
 */
async function sendVouchersBatch() {
  // Alle Kunden-Gruppen mit mind. einer cleanup-gesendeten Tour und ALLEN erledigt
  const res = await pool.query(
    `SELECT
       COALESCE(customer_id::TEXT, LOWER(COALESCE(customer_name, '')), LOWER(customer_email)) AS group_key,
       customer_id,
       customer_name,
       ARRAY_AGG(DISTINCT LOWER(TRIM(customer_email))) AS emails,
       COUNT(*) FILTER (WHERE cleanup_sent_at IS NOT NULL AND cleanup_action IS NULL) AS pending_count,
       COUNT(*) FILTER (WHERE cleanup_sent_at IS NOT NULL) AS sent_count
     FROM tour_manager.tours
     WHERE cleanup_sent_at IS NOT NULL
       AND status NOT IN ('DELETED', 'TRANSFERRED')
     GROUP BY COALESCE(customer_id::TEXT, LOWER(COALESCE(customer_name, '')), LOWER(customer_email)), customer_id, customer_name
     HAVING
       COUNT(*) FILTER (WHERE cleanup_sent_at IS NOT NULL AND cleanup_action IS NULL) = 0
       AND COUNT(*) FILTER (WHERE cleanup_sent_at IS NOT NULL) > 0`
  );

  const results = [];
  for (const row of res.rows) {
    const emails = row.emails || [];
    if (emails.length === 0) continue;

    // Bereits Gutschein vorhanden?
    const voucherCheck = await pool.query(
      `SELECT id FROM booking.discount_codes
       WHERE active = true
         AND conditions_json->>'source' = 'cleanup'
         AND conditions_json->'customerEmails' ?| $1::text[]
       LIMIT 1`,
      [emails]
    );
    if (voucherCheck.rows.length > 0) {
      results.push({ emails, skipped: true, reason: 'already_sent' });
      continue;
    }

    try {
      const { code, validTo } = await generateCleanupVoucher(emails, row.customer_name);
      await sendCleanupThankYouMail(emails, row.customer_name, code, validTo);
      results.push({ emails, skipped: false, success: true, code });
    } catch (err) {
      results.push({ emails, skipped: false, success: false, error: err.message });
    }
  }

  return {
    total: res.rows.length,
    sent: results.filter((r) => !r.skipped && r.success).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => !r.skipped && !r.success).length,
    results,
  };
}

module.exports = {
  ensureSessionSchema,
  getCleanupCandidatesGrouped,
  createDashboardSession,
  validateDashboardSession,
  activateTourAndSpace,
  getDashboardTours,
  executeDashboardAction,
  executeDashboardPaymentChoice,
  scheduleTourDeletion,
  processPendingDeletions,
  sendDashboardInvite,
  sendDashboardBatch,
  checkAllToursCompleted,
  generateCleanupVoucher,
  sendCleanupThankYouMail,
  maybeDispatchCleanupVoucher,
  sendVouchersBatch,
};
