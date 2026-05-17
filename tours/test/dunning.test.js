'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { getCurrentDunningStage, processDueDunningStages, DUNNING_STAGES } = require('../lib/dunning');

test('getCurrentDunningStage: unter 7 Tagen → null', () => {
  assert.equal(getCurrentDunningStage(0), null);
  assert.equal(getCurrentDunningStage(6), null);
  assert.equal(getCurrentDunningStage(6.9), null);
});

test('getCurrentDunningStage: 7-20 Tage → Stufe 1, keine Gebuehr', () => {
  const s = getCurrentDunningStage(7);
  assert.equal(s.stage, 1);
  assert.equal(s.feeChf, 0);
  assert.equal(getCurrentDunningStage(20).stage, 1);
});

test('getCurrentDunningStage: 21-44 Tage → Stufe 2, CHF 10', () => {
  const s = getCurrentDunningStage(21);
  assert.equal(s.stage, 2);
  assert.equal(s.feeChf, 10);
  assert.equal(getCurrentDunningStage(44).stage, 2);
});

test('getCurrentDunningStage: 45-59 Tage → Stufe 3, CHF 30', () => {
  const s = getCurrentDunningStage(45);
  assert.equal(s.stage, 3);
  assert.equal(s.feeChf, 30);
  assert.equal(getCurrentDunningStage(59).stage, 3);
});

test('getCurrentDunningStage: 60+ Tage → Stufe 4 Inkasso, keine Mail', () => {
  const s = getCurrentDunningStage(60);
  assert.equal(s.stage, 4);
  assert.equal(s.templateKey, null);
  assert.equal(getCurrentDunningStage(365).stage, 4);
});

test('getCurrentDunningStage: ungueltige Eingabe → null', () => {
  assert.equal(getCurrentDunningStage(NaN), null);
  assert.equal(getCurrentDunningStage(-5), null);
  assert.equal(getCurrentDunningStage('abc'), null);
});

test('DUNNING_STAGES ist frozen + 4 Stufen, monoton steigend', () => {
  assert.equal(DUNNING_STAGES.length, 4);
  assert.equal(Object.isFrozen(DUNNING_STAGES), true);
  for (let i = 1; i < DUNNING_STAGES.length; i++) {
    assert.ok(DUNNING_STAGES[i].daysOverdueMin > DUNNING_STAGES[i - 1].daysOverdueMin);
  }
});

/**
 * Integration-ish Test mit Mock-Pool. Wir simulieren 4 Kandidaten in
 * verschiedenen Verzugs-Stufen + 1 bereits-versendet-Skip-Case und pruefen
 * dass processDueDunningStages die richtige Anzahl Mails verschickt und
 * dunning_history korrekt befuellt.
 */
test('processDueDunningStages: verteilt Stufen korrekt, skippt already_sent', async () => {
  const now = new Date('2026-05-17T10:00:00Z');
  // Rohe Tage Verzug ableiten: due_at = now - days
  const due = (days) => new Date(now.getTime() - days * 86400 * 1000).toISOString();

  const candidates = [
    // sollten Stufe 1 bekommen
    { invoice_id: 101, tour_id: 1, amount_chf: 59, due_at: due(8),  invoice_status: 'sent', paid_at: null, tour_status: 'ACTIVE', customer_email: 'a@x.ch', days_overdue_float: 8 },
    // sollte Stufe 2 bekommen
    { invoice_id: 102, tour_id: 2, amount_chf: 59, due_at: due(22), invoice_status: 'sent', paid_at: null, tour_status: 'ACTIVE', customer_email: 'b@x.ch', days_overdue_float: 22 },
    // bereits Stufe 2 versendet → skip
    { invoice_id: 103, tour_id: 3, amount_chf: 59, due_at: due(25), invoice_status: 'overdue', paid_at: null, tour_status: 'ACTIVE', customer_email: 'c@x.ch', days_overdue_float: 25 },
    // sollte Inkasso-Flag bekommen, keine Mail
    { invoice_id: 104, tour_id: 4, amount_chf: 59, due_at: due(61), invoice_status: 'overdue', paid_at: null, tour_status: 'ACTIVE', customer_email: 'd@x.ch', days_overdue_float: 61 },
  ];

  const inserted = [];
  const mailCalls = [];

  const fakePool = {
    query: async (sql, params) => {
      // CREATE TABLE / CREATE INDEX no-op
      if (/CREATE TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(sql)) return { rows: [] };
      // Kandidaten-SELECT
      if (/FROM tour_manager\.renewal_invoices ri/i.test(sql)) {
        return { rows: candidates };
      }
      // Already-sent Pruefung
      if (/SELECT 1 FROM tour_manager\.dunning_history/i.test(sql)) {
        const [invoiceId, stage] = params;
        if (invoiceId === 103 && stage === 2) return { rows: [{}] }; // schon versendet
        return { rows: [] };
      }
      // INSERT INTO dunning_history
      if (/INSERT INTO tour_manager\.dunning_history/i.test(sql)) {
        inserted.push({ invoice_id: params[0], tour_id: params[1], stage: params[2], fee: params[3] });
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const fakeMail = async (tourId, invoiceId) => {
    mailCalls.push({ tourId, invoiceId });
    return { success: true };
  };

  const result = await processDueDunningStages({
    now,
    dbPool: fakePool,
    sendInvoiceOverdueReminderEmail: fakeMail,
    batchLimit: 100,
  });

  assert.equal(result.processed, 4);
  assert.equal(result.sent, 2);            // 101 + 102
  assert.equal(result.inkassoFlagged, 1);  // 104
  assert.equal(result.skipped, 1);         // 103
  assert.equal(result.errors, 0);

  assert.equal(mailCalls.length, 2);
  assert.deepEqual(mailCalls.map((c) => c.invoiceId).sort(), [101, 102]);

  // dunning_history: 3 Inserts (101 Stufe 1, 102 Stufe 2, 104 Inkasso). 103 nicht.
  assert.equal(inserted.length, 3);
  const byInvoice = Object.fromEntries(inserted.map((i) => [i.invoice_id, i]));
  assert.equal(byInvoice[101].stage, 1);
  assert.equal(byInvoice[101].fee, 0);
  assert.equal(byInvoice[102].stage, 2);
  assert.equal(byInvoice[102].fee, 10);
  assert.equal(byInvoice[104].stage, 4);
});

test('processDueDunningStages: dryRun verhindert Mail- und DB-Writes', async () => {
  const now = new Date('2026-05-17T10:00:00Z');
  const candidates = [
    { invoice_id: 201, tour_id: 10, amount_chf: 59, due_at: new Date(now.getTime() - 25 * 86400 * 1000).toISOString(), invoice_status: 'sent', paid_at: null, tour_status: 'ACTIVE', customer_email: 'a@x.ch', days_overdue_float: 25 },
  ];
  const inserted = [];
  const mailCalls = [];
  const fakePool = {
    query: async (sql, params) => {
      if (/CREATE TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(sql)) return { rows: [] };
      if (/FROM tour_manager\.renewal_invoices ri/i.test(sql)) return { rows: candidates };
      if (/SELECT 1 FROM tour_manager\.dunning_history/i.test(sql)) return { rows: [] };
      if (/INSERT INTO tour_manager\.dunning_history/i.test(sql)) {
        inserted.push(params);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const fakeMail = async () => { mailCalls.push(1); return { success: true }; };
  const result = await processDueDunningStages({
    now, dbPool: fakePool, sendInvoiceOverdueReminderEmail: fakeMail, dryRun: true,
  });
  assert.equal(result.dryRun, true);
  assert.equal(mailCalls.length, 0);
  assert.equal(inserted.length, 0);
  assert.equal(result.processed, 1);
  assert.equal(result.sent, 0);
});
