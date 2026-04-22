/**
 * Gemeinsame Leselogik für Dubletten-Reports (CLI + nächtlicher Job).
 * @module
 */
const DB_SEARCH_PATH = process.env.DB_SEARCH_PATH || "booking,core,public";

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function emailBase(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e || !e.includes("@")) return "";
  const [local, dom] = e.split("@", 2);
  const i = local.indexOf("+");
  const localCore = i >= 0 ? local.slice(0, i) : local;
  return `${localCore}@${dom}`;
}

/**
 * Vorschlag: ID mit den meisten Orders behalten; bei Gleichstand niedrigere ID.
 * @param {{id:number,n?:number}[]} rows
 */
function suggestKeepId(rows) {
  const withN = rows
    .map((r) => ({ id: Number(r.id), n: Number(r.n) || 0 }))
    .filter((r) => Number.isFinite(r.id));
  if (withN.length === 0) return null;
  withN.sort((a, b) => b.n - a.n || a.id - b.id);
  return withN[0].id;
}

function toRowsFromJson(j) {
  if (Array.isArray(j)) return j;
  if (j && typeof j === "string") {
    try {
      const p = JSON.parse(j);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(j) ? j : [];
}

function countUniqueIds(report) {
  const s = new Set();
  for (const g of report.byExactEmail) (g.ids || []).forEach((id) => s.add(Number(id)));
  for (const g of report.byCompanyName) (g.ids || []).forEach((id) => s.add(Number(id)));
  for (const g of report.byCompanyAndAddress) (g.ids || []).forEach((id) => s.add(Number(id)));
  for (const g of report.byCompanyAndEmailBase) (g.ids || []).forEach((id) => s.add(Number(id)));
  return s.size;
}

/**
 * Führt die Analyse aus (nur lesen). Schliesst die Verbindung nicht.
 * @param {import("pg").Pool} pool
 */
async function runDuplicateReport(pool) {
  const orderCountSub = `(
    SELECT COUNT(*)::int
    FROM orders o
    WHERE o.customer_id = c.id
      OR (
        TRIM(COALESCE(c.email, '')) <> ''
        AND (
          LOWER(TRIM(COALESCE(o.billing->>'email', ''))) = LOWER(TRIM(c.email))
          OR LOWER(TRIM(COALESCE(o.object->>'email', ''))) = LOWER(TRIM(c.email))
        )
      )
  )`;

  const base = `
    SELECT
      c.id,
      c.email,
      c.company,
      c.street,
      c.zip,
      c.city,
      c.zipcity,
      ${orderCountSub} AS n
    FROM customers c
  `;

  const dupEmail = await pool.query(`
    WITH t AS (
      ${base}
    )
    SELECT LOWER(TRIM(t.email)) AS key_email, array_agg(t.id ORDER BY t.id) AS ids,
           json_agg(json_build_object('id', t.id, 'company', t.company, 'n', t.n) ORDER BY t.id) AS rows
    FROM t
    WHERE TRIM(t.email) <> ''
    GROUP BY 1
    HAVING COUNT(*) > 1
    ORDER BY key_email
  `);

  const dupCompany = await pool.query(`
    WITH t AS (
      ${base}
    ),
    n AS (
      SELECT t.*, lower(regexp_replace(trim(t.company), '\\s+', ' ', 'g')) AS comp_key
      FROM t
    )
    SELECT comp_key, array_agg(id ORDER BY id) AS ids, COUNT(*)::int AS cnt,
           json_agg(json_build_object('id', id, 'email', email, 'company', company, 'street', street, 'zip', zip, 'city', city, 'zipcity', zipcity, 'n', n) ORDER BY id) AS rows
    FROM n
    WHERE TRIM(comp_key) <> ''
    GROUP BY comp_key
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC, comp_key
  `);

  const dupCompanyAddr = await pool.query(`
    WITH t AS (
      ${base}
    ),
    n AS (
      SELECT
        t.*,
        lower(regexp_replace(trim(t.company), '\\s+', ' ', 'g')) AS comp_key,
        lower(regexp_replace(
          trim(concat_ws(' ', nullif(trim(t.street), ''), nullif(trim(t.zip), ''), nullif(trim(t.city), ''), nullif(trim(t.zipcity), ''))),
          '\\s+', ' ', 'g'
        )) AS addr_key
      FROM t
    )
    SELECT comp_key, addr_key, array_agg(id ORDER BY id) AS ids, COUNT(*)::int AS cnt,
           json_agg(json_build_object('id', id, 'email', email, 'company', company, 'addr', street || ' | ' || NULLIF(zip,'') || ' | ' || NULLIF(city,'') || ' | ' || NULLIF(zipcity,''), 'n', n) ORDER BY id) AS rows
    FROM n
    WHERE TRIM(comp_key) <> '' AND length(TRIM(addr_key)) >= 3
    GROUP BY comp_key, addr_key
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC, comp_key
  `);

  const { rows: allForSoft } = await pool.query(`
    SELECT
      c.id, c.email, c.company, c.street, c.zip, c.city, c.zipcity,
      ${orderCountSub} AS n
    FROM customers c
  `);

  const byComp = new Map();
  for (const r of allForSoft) {
    const ck = normName(r.company);
    if (!ck) continue;
    if (!byComp.has(ck)) byComp.set(ck, []);
    byComp.get(ck).push(r);
  }
  const softEmailDupes = [];
  for (const [compKey, list] of byComp) {
    if (list.length < 2) continue;
    const byEmail = new Map();
    for (const r of list) {
      const b = emailBase(r.email);
      if (!b) continue;
      if (!byEmail.has(b)) byEmail.set(b, []);
      byEmail.get(b).push(r);
    }
    for (const [eb, g] of byEmail) {
      if (g.length < 2) continue;
      const ids = g.map((x) => x.id).sort((a, b) => a - b);
      softEmailDupes.push({ compKey, emailBase: eb, ids, rows: g });
    }
  }
  softEmailDupes.sort((a, b) => b.ids.length - a.ids.length);

  return {
    generatedAt: new Date().toISOString(),
    byExactEmail: dupEmail.rows,
    byCompanyName: dupCompany.rows,
    byCompanyAndAddress: dupCompanyAddr.rows,
    byCompanyAndEmailBase: softEmailDupes,
  };
}

module.exports = {
  runDuplicateReport,
  suggestKeepId,
  toRowsFromJson,
  countUniqueIds,
  emailBase,
  normName,
  DB_SEARCH_PATH,
};
