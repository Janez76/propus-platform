/**
 * Shared customer-lookup helpers used by booking/ and tours/.
 *
 * Pool injection: both packages maintain their own pg.Pool (different search_path,
 * different pool size). We accept the pool as an argument instead of importing pg
 * here, so this module has no external dependencies and can live in core/ without
 * its own node_modules.
 */

/**
 * Find a customer by email in core.customers, honoring email_aliases via
 * core.customer_email_matches(). Falls back to a plain lowercase match if the
 * SQL function is unavailable (e.g. older DB state).
 *
 * @param {import('pg').Pool} pool
 * @param {string} email
 * @returns {Promise<object|null>}
 */
async function getCustomerByEmail(pool, email) {
  if (!pool) throw new Error("getCustomerByEmail: pool is required");
  const norm = String(email || "").trim().toLowerCase();
  if (!norm) return null;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM core.customers
       WHERE core.customer_email_matches($1, email, email_aliases)
       LIMIT 1`,
      [norm]
    );
    return rows[0] || null;
  } catch (_aliasErr) {
    const { rows } = await pool.query(
      `SELECT * FROM core.customers WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
      [norm]
    );
    return rows[0] || null;
  }
}

module.exports = { getCustomerByEmail };
