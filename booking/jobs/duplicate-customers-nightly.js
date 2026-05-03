/**
 * Naechtlich: Dubletten-Report, Kandidaten in booking.customer_duplicate_candidates
 * (ON CONFLICT idempotent), optionale Benachrichtigung.
 *
 * Nutzt scheduleSafeCronJob (Distributed-Lock + Skip-on-overlap + Tick-Boundary).
 */
"use strict";

const path = require("path");
const { scheduleSafeCronJob } = require("../../core/lib/safe-cron-job");
const {
  runDuplicateReport,
  suggestKeepId,
  toRowsFromJson,
} = require(path.join(__dirname, "../../scripts/lib/duplicate-customers-report.js"));

/**
 * @param {object} deps
 * @param {import('../db.js')} deps.db
 * @param {function} deps.getSetting
 * @param {function} [deps.sendMail]
 * @param {string} [deps.OFFICE_EMAIL]
 */
function scheduleDuplicateCandidatesNightly(deps) {
  const { db, getSetting, sendMail, OFFICE_EMAIL } = deps;
  const pool = db && typeof db.getPool === "function" ? db.getPool() : null;
  const mailTo = String(
    process.env.DUPLICATE_CANDIDATES_REPORT_EMAIL || OFFICE_EMAIL || "office@propus.ch"
  );

  return scheduleSafeCronJob({
    name: "duplicate-customers-nightly",
    cron: "15 2 * * *",
    pool,
    timezone: "Europe/Zurich",
    run: async (ctx) => {
      const fr = await getSetting("feature.backgroundJobs");
      if (!fr || !fr.value) return;
      if (!pool) { ctx.warn("DB fehlt"); return; }

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
          ctx.warn("mail:", e && e.message);
        }
      }
      if (inserted > 0) ctx.log("neue Kandidat-Datensaetze:", inserted);
    },
  });
}

module.exports = { scheduleDuplicateCandidatesNightly };
