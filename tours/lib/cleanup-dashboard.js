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
  return { ok: true, customerEmail: session.customer_email, sessionId: session.id };
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
  const email = String(customerEmail).trim().toLowerCase();
  const validActions = ['weiterfuehren', 'archivieren', 'uebertragen', 'loeschen'];
  if (!validActions.includes(action)) throw new Error('Ungültige Aktion');

  const r = await pool.query(
    `SELECT * FROM tour_manager.tours
     WHERE id = $1
       AND LOWER(TRIM(customer_email)) = $2
       ${getDashboardEligibilityClause()}`,
    [tourId, email]
  );
  const tour = normalizeTourRow(r.rows[0]);
  if (!tour) throw new Error('Tour nicht gefunden oder gehört nicht zu dieser E-Mail');

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
          `Kunde hat über das Cleanup-Dashboard "Weiterführen" gewählt. Tour war kürzlich archiviert (< 6 Monate). Preis bitte manuell klären.\n\nKunde: ${email}\nObjekt: ${tour.canonical_object_label || tour.bezeichnung}`,
          email,
        ]
      );
      await logAction(tour.id, 'customer', email, 'CLEANUP_DASHBOARD_WEITERFUEHREN_REVIEW', { needsManualReview: true });
      return { action: 'weiterfuehren_review', message: 'Ihr Wunsch wurde registriert. Wir klären den Preis und melden uns bei Ihnen.' };
    }

    if (rule.needsInvoice) {
      await pool.query(
        `UPDATE tour_manager.tours SET cleanup_action = 'weiterfuehren_pending_payment', cleanup_action_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [tour.id]
      );
      await logAction(tour.id, 'customer', email, 'CLEANUP_DASHBOARD_WEITERFUEHREN_PENDING_PAYMENT', { invoiceAmount: rule.invoiceAmount });
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
    await logAction(tour.id, 'customer', email, 'CLEANUP_DASHBOARD_WEITERFUEHREN', {});
    return { action: 'weiterfuehren', message: 'Ihre Tour wird wie gewohnt weitergeführt.' };
  }

  if (action === 'archivieren') {
    await pool.query(
      `UPDATE tour_manager.tours SET status = 'ARCHIVED', archived_at = COALESCE(archived_at, NOW()), cleanup_action = 'archivieren', cleanup_action_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [tour.id]
    );
    await logAction(tour.id, 'customer', email, 'CLEANUP_DASHBOARD_ARCHIVIEREN', {});
    try {
      const mp = require('./matterport');
      const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
      if (spaceId) await mp.archiveSpace(spaceId);
    } catch (_) { /* best-effort */ }
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
        `Kunde möchte Tour über Cleanup-Dashboard übertragen.\n\nObjekt: ${tour.canonical_object_label || tour.bezeichnung}\nKunde: ${email}`,
        email,
      ]
    );
    await logAction(tour.id, 'customer', email, 'CLEANUP_DASHBOARD_UEBERTRAGEN', {});
    return { action: 'uebertragen', message: 'Übertragungsanfrage registriert. Wir melden uns bei Ihnen.' };
  }

  if (action === 'loeschen') {
    await logAction(tour.id, 'customer', email, 'CLEANUP_DASHBOARD_LOESCHEN', {});
    try {
      const mp = require('./matterport');
      const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
      if (spaceId) await mp.deleteSpace(spaceId);
    } catch (_) { /* best-effort */ }
    await pool.query(`DELETE FROM tour_manager.tours WHERE id = $1`, [tour.id]);
    return { action: 'loeschen', message: 'Tour und Matterport-Space wurden dauerhaft gelöscht.' };
  }

  throw new Error('Unbekannte Aktion');
}

// ─── Zahlungsart wählen (nach weiterfuehren_pending_payment) ─────────────────

async function executeDashboardPaymentChoice(customerEmail, tourId, paymentMethod) {
  await ensureSessionSchema();
  const email = String(customerEmail).trim().toLowerCase();
  if (!['online', 'qr'].includes(paymentMethod)) throw new Error('Ungültige Zahlungsart');

  const r = await pool.query(
    `SELECT * FROM tour_manager.tours
     WHERE id = $1
       AND LOWER(TRIM(customer_email)) = $2
       ${getDashboardEligibilityClause()}`,
    [tourId, email]
  );
  const tour = normalizeTourRow(r.rows[0]);
  if (!tour) throw new Error('Tour nicht gefunden');

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
    await logAction(tour.id, 'customer', email, 'CLEANUP_DASHBOARD_ONLINE_CHECKOUT', { amount });
    return { checkoutUrl };
  }

  // QR-Rechnung
  const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;

  if (spaceId) {
    try {
      const mp = require('./matterport');
      await mp.unarchiveSpace(spaceId);
    } catch (_) { /* best-effort */ }
  }
  await pool.query(`UPDATE tour_manager.tours SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`, [tour.id]);

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
  await logAction(tour.id, 'customer', email, 'CLEANUP_DASHBOARD_QR_INVOICE', { amount });
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

module.exports = {
  ensureSessionSchema,
  getCleanupCandidatesGrouped,
  createDashboardSession,
  validateDashboardSession,
  getDashboardTours,
  executeDashboardAction,
  executeDashboardPaymentChoice,
  sendDashboardInvite,
  sendDashboardBatch,
};
