/**
 * Naechtlich: Dubletten-Report, Kandidaten in booking.customer_duplicate_candidates
 * (ON CONFLICT idempotent), optionale Benachrichtigung.
 */
"use strict";

const path = require("path");
const cron = require("node-cron");
const {
  runDuplicateReport,
  suggestKeepId,
  toRowsFromJson,
} = require(path.join(__dirname, "../../scripts/lib/duplicate-customers-report.js"));

/**
 * @param {object} deps
 * @param {import('../db.js')} deps.db
 * @param {function} deps.getSetting
 * @param {function} [deps.sendMail] - (to, subject, html, text, ics, ics) => Promise
 * @param {string} [deps.OFFICE_EMAIL]
 */
function scheduleDuplicateCandidatesNightly(deps) {
  const { db, getSetting, sendMail, OFFICE_EMAIL } = deps;
  const mailTo = String(
    process.env.DUPLICATE_CANDIDATES_REPORT_EMAIL || OFFICE_EMAIL || "office@propus.ch"
  );

  async function runOnce() {
    const pool = db.getPool && db.getPool();
    if (!pool) {
      console.warn("[job:dup-cand] DB fehlt");
      return 0;
    }
    const report = await runDuplicateReport(pool);
    let inserted = 0;

    async function addPairs(groups, reasonTag) {
      const gr = Array.isArray(groups) ? groups : [];
      for (const g of gr) {
        if (!g) continue;
        const rlist = toRowsFromJson(g.rows);
        if (rlist.length < 2) continue;
        const keep = suggestKeepId(rlist.map((x) => ({ id: x.id, n: x.n })));
        if (keep == null) continue;
        for (const r of rlist) {
          const id = Number(r.id);
          if (!Number.isFinite(id) || id === keep) continue;
          const ins = await pool
            .query(
              `INSERT INTO booking.customer_duplicate_candidates (new_customer_id, suspected_keep_id, score, reason, status)
               VALUES ($1, $2, $3, $4, 'open')
               ON CONFLICT (new_customer_id, suspected_keep_id) DO NOTHING
               RETURNING id`,
              [id, keep, 0.25, `${reasonTag}_nightly`]
            )
            .catch((e) => {
              if (e && e.code === "42P01") return { rows: [] };
              throw e;
            });
          if (ins.rows && ins.rows.length) inserted += 1;
        }
      }
    }

    await addPairs(report.byCompanyAndAddress, "C");
    await addPairs(report.byExactEmail, "A");
    await addPairs(report.byCompanyName, "B");

    for (const g of report.byCompanyAndEmailBase || []) {
      const rlist = g && g.rows ? g.rows : [];
      if (rlist.length < 2) continue;
      const keep = suggestKeepId(rlist.map((x) => ({ id: x.id, n: x.n })));
      if (keep == null) continue;
      for (const r of rlist) {
        const id = Number(r.id);
        if (!Number.isFinite(id) || id === keep) continue;
        const ins = await pool
          .query(
            `INSERT INTO booking.customer_duplicate_candidates (new_customer_id, suspected_keep_id, score, reason, status)
             VALUES ($1, $2, $3, $4, 'open')
             ON CONFLICT (new_customer_id, suspected_keep_id) DO NOTHING
             RETURNING id`,
            [id, keep, 0.25, "D_nightly"]
          )
          .catch((e) => {
            if (e && e.code === "42P01") return { rows: [] };
            throw e;
          });
        if (ins.rows && ins.rows.length) inserted += 1;
      }
    }

    if (inserted > 0 && typeof sendMail === "function") {
      const subject = `[Propus] ${inserted} neue Dubletten-Kandidat(en) aus Nacht-Analyse`;
      const text = `Die nächtliche Dubletten-Analyse hat ${inserted} neue Einträge in der Review-Warteschlange erzeugt.
Bitte in Admin → Kunden die möglichen Dubletten prüfen.`;
      const html = `<p>${String(text).replace(/\n/g, "<br/>")}</p>`;
      try {
        await sendMail(mailTo, subject, html, text, null, null);
      } catch (e) {
        console.warn("[job:dup-cand] mail:", e && e.message);
      }
    }
    return inserted;
  }

  cron.schedule("15 2 * * *", async function scheduleDupCand() {
    try {
      const fr = await getSetting("feature.backgroundJobs");
      if (!fr || !fr.value) return;
      const n = await runOnce();
      if (n > 0) {
        console.log("[job:dup-cand] neue Kandidat-Datensätze:", n);
      }
    } catch (e) {
      console.error("[job:dup-cand]", e && e.message);
    }
  });
}

module.exports = { scheduleDuplicateCandidatesNightly };
