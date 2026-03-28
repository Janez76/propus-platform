const { ensureSchema } = require('../lib/suggestions');
const { pool } = require('../lib/db');

function pct(part, total) {
  if (!total) return '0.0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

async function main() {
  await ensureSchema();

  const reviewed = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE gold_tour_id IS NOT NULL AND gold_tour_id = tour_id)::int AS top1_tour_hits,
      COUNT(*) FILTER (WHERE gold_action IS NOT NULL AND gold_action = suggested_action)::int AS action_hits,
      COUNT(*) FILTER (WHERE gold_intent IS NOT NULL AND gold_intent = details_json->>'intent')::int AS intent_hits,
      COUNT(*) FILTER (WHERE COALESCE(details_json->'assignment_diagnostics'->>'ambiguous', 'false') = 'true')::int AS ambiguous_cases,
      COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_cases
    FROM tour_manager.ai_suggestions
    WHERE suggestion_type = 'email_intent'
      AND status IN ('approved', 'applied', 'rejected')
      AND (gold_action IS NOT NULL OR gold_intent IS NOT NULL OR gold_tour_id IS NOT NULL)
  `);

  const openScope = await pool.query(`
    SELECT
      COUNT(*)::int AS total_open,
      COUNT(*) FILTER (WHERE COALESCE(details_json->'assignment_diagnostics'->>'ambiguous', 'false') = 'true')::int AS ambiguous_open
    FROM tour_manager.ai_suggestions
    WHERE suggestion_type = 'email_intent'
      AND status = 'open'
  `);

  const row = reviewed.rows[0] || {};
  const openRow = openScope.rows[0] || {};
  const total = row.total || 0;

  console.log('Replay-Evals fuer Mail-Vorschlaege');
  console.log(`Bewertete Faelle: ${total}`);
  console.log(`Top-1 Tour-Match Accuracy: ${pct(row.top1_tour_hits || 0, total)} (${row.top1_tour_hits || 0}/${total})`);
  console.log(`Action Accuracy: ${pct(row.action_hits || 0, total)} (${row.action_hits || 0}/${total})`);
  console.log(`Intent Accuracy: ${pct(row.intent_hits || 0, total)} (${row.intent_hits || 0}/${total})`);
  console.log(`Ambiguous Rate reviewed: ${pct(row.ambiguous_cases || 0, total)} (${row.ambiguous_cases || 0}/${total})`);
  console.log(`Approval-to-Correction Proxy: ${pct(row.rejected_cases || 0, total)} (${row.rejected_cases || 0}/${total} abgelehnt)`);
  console.log(`Ambiguous Rate open: ${pct(openRow.ambiguous_open || 0, openRow.total_open || 0)} (${openRow.ambiguous_open || 0}/${openRow.total_open || 0})`);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
