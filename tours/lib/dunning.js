'use strict';

/**
 * Mahnstufen-Automation (PRO-8).
 *
 * Drei automatische Mahnstufen plus Inkasso-Flag fuer ueberfaellige
 * Verlaengerungsrechnungen (`tour_manager.renewal_invoices`):
 *
 *   Stufe 1  | +7  Tage Verzug | freundliche Zahlungserinnerung      | keine Gebuehr
 *   Stufe 2  | +21 Tage Verzug | formelle Mahnung mit Mahngebuehr    | CHF 10.00
 *   Stufe 3  | +45 Tage Verzug | letzte Aufforderung + Inkasso-Hinweis | CHF 30.00
 *   Inkasso  | +60 Tage Verzug | nur Flag, kein Mail-Versand         | manuelle Freigabe
 *
 * Historie pro Rechnung wird in `tour_manager.dunning_history` getrackt
 * (UNIQUE(invoice_id, stage)). Damit ist `processDueDunningStages()`
 * idempotent: ein erneuter Lauf des Cron-Jobs ueberspringt bereits
 * versendete Stufen pro Rechnung.
 *
 * Stop-Bedingungen:
 *   - Rechnung bezahlt (`invoice_status = 'paid'` oder `paid_at IS NOT NULL`)
 *   - Tour archiviert / vom Kunden abgelehnt
 *   - `feature.dunningEnabled` in `core.settings` false (Default)
 *
 * Geplante Erweiterungen (separate Issues / spaeter):
 *   - Eigene Mahnung-Templates `mahnung_stage_2` / `mahnung_stage_3`
 *     (aktuell wird `invoice_overdue_reminder` mit Stage-Kontext im
 *     `outgoing_emails.details_json` wiederverwendet)
 *   - PDF-Anhang fuer formelle Mahnungen (Stufe 2+3)
 *   - Per-Kunde Konfiguration (z.B. Beseder mit eigener Staffel)
 *   - Auto-Posting der Mahngebuehr in Bexio (heute manuell)
 */

const { pool } = require('./db');

/**
 * Stufen-Definition. `daysOverdueMin` ist inklusiv: Stage 1 greift ab Tag 7,
 * Stage 2 ab Tag 21. Wir nehmen pro Cron-Lauf die HOECHSTE Stufe, deren
 * Schwelle ueberschritten ist und die noch nicht versendet wurde — dadurch
 * faellt der Job nicht zurueck, wenn er ein paar Tage ausgesetzt hat.
 */
const DUNNING_STAGES = Object.freeze([
  { stage: 1, daysOverdueMin: 7,  feeChf: 0,  templateKey: 'invoice_overdue_reminder' },
  { stage: 2, daysOverdueMin: 21, feeChf: 10, templateKey: 'invoice_overdue_reminder' },
  { stage: 3, daysOverdueMin: 45, feeChf: 30, templateKey: 'invoice_overdue_reminder' },
  { stage: 4, daysOverdueMin: 60, feeChf: 0,  templateKey: null }, // Inkasso: nur Flag, kein Versand
]);

/**
 * Liefert die hoechste anwendbare Stufe fuer eine gegebene Verzugs-Dauer.
 * Returns null wenn noch keine Stufe faellig ist (Verzug < 7 Tage).
 */
function getCurrentDunningStage(daysOverdue) {
  if (!Number.isFinite(daysOverdue) || daysOverdue < 7) return null;
  let match = null;
  for (const cfg of DUNNING_STAGES) {
    if (daysOverdue >= cfg.daysOverdueMin) match = cfg;
  }
  return match;
}

let dunningSchemaEnsured = false;
async function ensureDunningHistorySchema(dbPool = pool) {
  if (dunningSchemaEnsured) return;
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.dunning_history (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES tour_manager.renewal_invoices(id) ON DELETE CASCADE,
      tour_id INTEGER NOT NULL REFERENCES tour_manager.tours(id) ON DELETE CASCADE,
      stage SMALLINT NOT NULL CHECK (stage BETWEEN 1 AND 4),
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fee_added_chf NUMERIC(10,2) NOT NULL DEFAULT 0,
      template_key TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_dunning_history_invoice_stage
      ON tour_manager.dunning_history(invoice_id, stage)
  `);
  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS idx_dunning_history_invoice
      ON tour_manager.dunning_history(invoice_id)
  `);
  dunningSchemaEnsured = true;
}

/**
 * Akkumulierte Mahngebuehren fuer eine Rechnung (Summe aller bisherigen
 * Stufen). Wird in Mail-Vars + Total-Berechnung verwendet.
 */
async function getAccumulatedFees(invoiceId, dbPool = pool) {
  const r = await dbPool.query(
    `SELECT COALESCE(SUM(fee_added_chf), 0)::numeric AS total_fee
     FROM tour_manager.dunning_history
     WHERE invoice_id = $1`,
    [invoiceId],
  );
  return Number(r.rows[0]?.total_fee ?? 0);
}

/**
 * Cron-Hauptfunktion.
 *
 * Optionen:
 *   - dryRun: keine Mails versenden, keine DB-Inserts (nur Auswahl loggen)
 *   - batchLimit: max Anzahl Rechnungen pro Lauf (Schutz vor Spam-Burst)
 *   - now: Date-Override fuer Tests
 *   - sendInvoiceOverdueReminderEmail: dep-injection fuer Tests
 *   - dbPool: Pool-override fuer Tests
 */
async function processDueDunningStages(options = {}) {
  const dryRun = !!options.dryRun;
  const batchLimit = Math.max(1, Number(options.batchLimit) || 100);
  const now = options.now instanceof Date ? options.now : new Date();
  const dbPool = options.dbPool || pool;
  const sendOverdueMail =
    options.sendInvoiceOverdueReminderEmail ||
    require('./tour-actions').sendInvoiceOverdueReminderEmail;

  await ensureDunningHistorySchema(dbPool);

  const candidates = await dbPool.query(
    `SELECT ri.id AS invoice_id,
            ri.tour_id,
            ri.amount_chf,
            ri.due_at,
            ri.invoice_status,
            ri.paid_at,
            t.status AS tour_status,
            t.customer_email,
            EXTRACT(EPOCH FROM ($1::timestamptz - ri.due_at)) / 86400 AS days_overdue_float
     FROM tour_manager.renewal_invoices ri
     JOIN tour_manager.tours t ON t.id = ri.tour_id
     WHERE ri.due_at IS NOT NULL
       AND ri.due_at < $1::timestamptz
       AND ri.paid_at IS NULL
       AND ri.invoice_status IN ('sent', 'overdue')
       AND t.status NOT IN ('ARCHIVED', 'CUSTOMER_DECLINED')
       AND COALESCE(t.customer_email, '') <> ''
     ORDER BY ri.due_at ASC
     LIMIT $2`,
    [now.toISOString(), batchLimit],
  );

  const results = [];
  let processed = 0;
  let sent = 0;
  let inkassoFlagged = 0;
  let errors = 0;
  let skipped = 0;

  for (const row of candidates.rows) {
    processed++;
    const daysOverdue = Math.floor(Number(row.days_overdue_float || 0));
    const tier = getCurrentDunningStage(daysOverdue);
    if (!tier) {
      skipped++;
      results.push({ invoiceId: row.invoice_id, skipped: true, reason: 'below_min_threshold', daysOverdue });
      continue;
    }

    // Bereits versendet? UNIQUE(invoice_id, stage) garantiert keine Doppel-Inserts,
    // aber wir skippen frueh um teure Mail-Calls zu vermeiden.
    const existing = await dbPool.query(
      `SELECT 1 FROM tour_manager.dunning_history WHERE invoice_id = $1 AND stage = $2 LIMIT 1`,
      [row.invoice_id, tier.stage],
    );
    if (existing.rows.length > 0) {
      skipped++;
      results.push({ invoiceId: row.invoice_id, skipped: true, reason: 'already_sent', stage: tier.stage });
      continue;
    }

    // Stufe 4 = Inkasso-Flag, kein Mail-Versand
    if (!tier.templateKey) {
      if (!dryRun) {
        await dbPool.query(
          `INSERT INTO tour_manager.dunning_history (invoice_id, tour_id, stage, fee_added_chf, template_key, notes)
           VALUES ($1, $2, $3, 0, NULL, $4)
           ON CONFLICT (invoice_id, stage) DO NOTHING`,
          [row.invoice_id, row.tour_id, tier.stage, `Inkasso-Flag gesetzt nach ${daysOverdue} Tagen Verzug`],
        );
      }
      inkassoFlagged++;
      results.push({ invoiceId: row.invoice_id, stage: tier.stage, inkasso: true, daysOverdue });
      continue;
    }

    if (dryRun) {
      results.push({ invoiceId: row.invoice_id, stage: tier.stage, daysOverdue, dryRun: true });
      continue;
    }

    try {
      const mailResult = await sendOverdueMail(String(row.tour_id), row.invoice_id);
      if (!mailResult || mailResult.success === false) {
        errors++;
        results.push({
          invoiceId: row.invoice_id,
          stage: tier.stage,
          error: mailResult?.error || 'mail_send_failed',
        });
        continue;
      }

      await dbPool.query(
        `INSERT INTO tour_manager.dunning_history (invoice_id, tour_id, stage, fee_added_chf, template_key, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (invoice_id, stage) DO NOTHING`,
        [
          row.invoice_id,
          row.tour_id,
          tier.stage,
          tier.feeChf,
          tier.templateKey,
          `Mahnung Stufe ${tier.stage} versendet nach ${daysOverdue} Tagen Verzug`,
        ],
      );
      sent++;
      results.push({
        invoiceId: row.invoice_id,
        stage: tier.stage,
        feeChf: tier.feeChf,
        daysOverdue,
        sent: true,
      });
    } catch (err) {
      errors++;
      results.push({ invoiceId: row.invoice_id, stage: tier.stage, error: err.message });
    }
  }

  return { processed, sent, inkassoFlagged, skipped, errors, dryRun, results };
}

module.exports = {
  DUNNING_STAGES,
  getCurrentDunningStage,
  ensureDunningHistorySchema,
  getAccumulatedFees,
  processDueDunningStages,
};
