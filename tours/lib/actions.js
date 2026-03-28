/**
 * Audit-Log: actions_log Einträge schreiben.
 */

const { pool } = require('./db');

async function logAction(tourId, actorType, actorRef, action, details = null) {
  await pool.query(
    `INSERT INTO tour_manager.actions_log (tour_id, actor_type, actor_ref, action, details_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [tourId, actorType, actorRef || null, action, details ? JSON.stringify(details) : null]
  );
}

module.exports = { logAction };
