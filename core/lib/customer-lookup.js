// Zentrale Kunden-Lookup-Funktionen auf core.customers.
//
// Ziel: Identische Semantik zwischen booking/db.js und
// tours/lib/customer-lookup.js, ohne Duplikat.
//
// `pg.Pool` wird injiziert, weil booking- und tours-Module je eigene Pools
// mit eigener Connection-Konfiguration halten — kein globaler Pool hier.

"use strict";

/**
 * Kunde per E-Mail suchen (inkl. Aliase aus core.customers.email_aliases).
 *
 * Nutzt die SQL-Funktion `core.customer_email_matches(needle, email, aliases)`.
 * Fällt bei Fehler (z. B. Funktion nicht vorhanden in Legacy-DB) auf reinen
 * LOWER(TRIM(email))-Vergleich zurück.
 *
 * @param {import("pg").Pool} pool - pg.Pool-Instanz (booking oder tours).
 * @param {string} email - Rohe E-Mail-Adresse.
 * @returns {Promise<object|null>} Kunden-Row oder null.
 */
async function getCustomerByEmail(pool, email) {
  if (!email) return null;
  const normEmail = String(email).toLowerCase().trim();
  if (!normEmail) return null;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM core.customers
       WHERE core.customer_email_matches($1, email, email_aliases)
       LIMIT 1`,
      [normEmail],
    );
    return rows[0] || null;
  } catch (_aliasErr) {
    // Fallback: alte DBs ohne `core.customer_email_matches`.
    const { rows } = await pool.query(
      `SELECT * FROM core.customers WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
      [normEmail],
    );
    return rows[0] || null;
  }
}

module.exports = { getCustomerByEmail };
