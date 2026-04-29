/**
 * Auto-Trigger Engine für Posteingang — erzeugt Tasks aus Geschäftsereignissen.
 *
 * Trigger:
 *   1. Tour läuft in 30/14/7 Tagen ab → Task "Verlängerung anbieten"
 *   2. Rechnung 14+ Tage überfällig → Task "Mahnung senden"
 *   3. Neue Konversation ohne Kunde → Tag "Neukunde?"
 */
'use strict';

const { pool } = require('./db');
const store = require('./posteingang-store');

const TRIGGER_PREFIX = 'auto:';

async function taskExistsForTrigger(triggerKey) {
  const { rows } = await pool.query(
    `SELECT 1 FROM tour_manager.posteingang_tasks
     WHERE title LIKE $1 AND status IN ('open', 'in_progress')
     LIMIT 1`,
    [`${TRIGGER_PREFIX}${triggerKey}%`],
  );
  return rows.length > 0;
}

async function createTriggerTask({
  triggerKey,
  title,
  description,
  priority = 'medium',
  dueAt = null,
  customerId = null,
  tourId = null,
  conversationId = null,
}) {
  const exists = await taskExistsForTrigger(triggerKey);
  if (exists) return { created: false, reason: 'exists' };

  const task = await store.createTask(
    {
      title: `${TRIGGER_PREFIX}${triggerKey} ${title}`,
      description,
      priority,
      due_at: dueAt,
      customer_id: customerId,
      tour_id: tourId,
      conversation_id: conversationId,
    },
    'system',
  );
  return { created: true, task };
}

/**
 * Trigger 1: Touren die in 30/14/7 Tagen ablaufen → Aufgabe "Verlängerung anbieten"
 */
async function triggerExpiringTours() {
  const { rows: tours } = await pool.query(`
    SELECT t.id, t.bezeichnung, t.customer_id, t.subscription_end_date,
           EXTRACT(DAY FROM (t.subscription_end_date::date - CURRENT_DATE)) AS days_left
    FROM tour_manager.tours t
    WHERE t.status IN ('ACTIVE', 'EXPIRING_SOON')
      AND t.subscription_end_date IS NOT NULL
      AND t.subscription_end_date::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
    ORDER BY t.subscription_end_date
  `);

  const results = [];
  for (const tour of tours) {
    const days = Math.round(tour.days_left);
    if (![30, 14, 7].some((d) => days <= d && days > d - 3)) continue;

    const triggerKey = `tour-expiring:${tour.id}:${days}d`;
    const label = tour.bezeichnung || `Tour #${tour.id}`;
    const result = await createTriggerTask({
      triggerKey,
      title: `Verlängerung anbieten: ${label}`,
      description: `Tour läuft in ${days} Tagen ab (${tour.subscription_end_date?.toISOString?.()?.slice(0, 10) || '?'}).`,
      priority: days <= 7 ? 'high' : 'medium',
      dueAt: new Date(),
      customerId: tour.customer_id,
      tourId: tour.id,
    });
    results.push({ tourId: tour.id, days, ...result });
  }
  return { trigger: 'expiring_tours', results, count: results.filter((r) => r.created).length };
}

/**
 * Trigger 2: Rechnungen (Verlängerung) mit Status 'sent' und due_at < NOW() - 14 Tage → "Mahnung"
 */
async function triggerOverdueInvoices() {
  const { rows: invoices } = await pool.query(`
    SELECT ri.id, ri.invoice_number, ri.tour_id, ri.amount_chf, ri.due_at,
           t.customer_id, t.bezeichnung
    FROM tour_manager.renewal_invoices ri
    JOIN tour_manager.tours t ON t.id = ri.tour_id
    WHERE ri.invoice_status = 'sent'
      AND ri.due_at IS NOT NULL
      AND ri.due_at < (NOW() - INTERVAL '14 days')
    ORDER BY ri.due_at
    LIMIT 50
  `);

  const results = [];
  for (const inv of invoices) {
    const triggerKey = `invoice-overdue:${inv.id}`;
    const label = inv.invoice_number || `RI-${inv.id}`;
    const result = await createTriggerTask({
      triggerKey,
      title: `Mahnung: ${label}`,
      description: `Rechnung ${label} für "${inv.bezeichnung || 'Tour'}" (${inv.amount_chf} CHF) ist seit ${inv.due_at?.toISOString?.()?.slice(0, 10) || '?'} fällig.`,
      priority: 'high',
      dueAt: new Date(),
      customerId: inv.customer_id,
      tourId: inv.tour_id,
    });
    results.push({ invoiceId: inv.id, ...result });
  }
  return { trigger: 'overdue_invoices', results, count: results.filter((r) => r.created).length };
}

/**
 * Trigger 3: Konversationen ohne Kunde → Tag "Neukunde?"
 */
async function triggerUnknownSenderTag() {
  const { rows: convs } = await pool.query(`
    SELECT c.id
    FROM tour_manager.posteingang_conversations c
    WHERE c.customer_id IS NULL
      AND c.channel = 'email'
      AND c.created_at > (NOW() - INTERVAL '7 days')
      AND NOT EXISTS (
        SELECT 1 FROM tour_manager.posteingang_tags pt
        WHERE pt.conversation_id = c.id AND pt.name = 'Neukunde?'
      )
    LIMIT 100
  `);

  let tagged = 0;
  for (const conv of convs) {
    await store.addTag(conv.id, 'Neukunde?');
    tagged += 1;
  }
  return { trigger: 'unknown_sender_tag', tagged };
}

/**
 * Alle Trigger ausführen (für Cron).
 */
async function runAllTriggers() {
  const expiring = await triggerExpiringTours();
  const overdue = await triggerOverdueInvoices();
  const unknown = await triggerUnknownSenderTag();
  return {
    ok: true,
    triggers: [expiring, overdue, unknown],
    tasksCreated: (expiring.count || 0) + (overdue.count || 0),
    tagged: unknown.tagged || 0,
  };
}

module.exports = {
  triggerExpiringTours,
  triggerOverdueInvoices,
  triggerUnknownSenderTag,
  runAllTriggers,
};
