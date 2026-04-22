/**
 * Kunden-Deduplizierung: gleiche Logik serverseitig für Booking/Exxas/API.
 * Siehe findDuplicateCustomers (app/src/lib/duplicateDetection.ts) – Scoring
 * gespiegelt für "weak" / Fuzzy-Teil.
 */
"use strict";

/** Wie in PG-Migration: lower(btrim(regexp_replace(coalesce(company,''), '\s+', ' ', 'g'))) */
function computeCompanyKey(company) {
  return String(company || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "");
}

function emailDomain(email) {
  const s = String(email || "").toLowerCase().trim();
  const at = s.indexOf("@");
  if (at < 0 || at === s.length - 1) return "";
  return s.slice(at + 1);
}

function normalizeString(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function levenshteinDistance(a, b) {
  const aLen = a.length;
  const bLen = b.length;
  const matrix = Array(aLen + 1)
    .fill(null)
    .map(() => Array(bLen + 1).fill(0));
  for (let i = 0; i <= aLen; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= bLen; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= aLen; i += 1) {
    for (let j = 1; j <= bLen; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[aLen][bLen];
}

function calculateSimilarity(a, b) {
  const normA = normalizeString(a);
  const normB = normalizeString(b);
  if (!normA || !normB) return 0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(normA, normB) / maxLen;
}

const NAME_THRESHOLD = 0.75;
const EMAIL_THRESHOLD = 0.8;
const PHONE_THRESHOLD = 0.85;
const COMPANY_THRESHOLD = 0.85;
const MIN_COMBINED_SCORE = 0.75;

/**
 * Fuzzy-Score je bestehendem Kunden (Analog duplicateDetection.ts).
 * @returns {{ best: object|null, score: number, reason: string } | null }
 */
function bestFuzzyScore(input, rows) {
  const newC = {
    name: String(input.name || ""),
    email: String(input.email || "").toLowerCase().trim(),
    phone: String(input.phone || ""),
    company: String(input.company || ""),
  };
  let best = null;
  let bestMeta = { score: 0, reason: "fuzzy" };
  for (const existing of rows) {
    if (!existing || !existing.id) continue;
    const matchedFields = [];
    let combinedScore = 0;
    let fieldCount = 0;

    const nameSim = calculateSimilarity(newC.name, String(existing.name || ""));
    if (nameSim >= NAME_THRESHOLD) {
      matchedFields.push("name");
      combinedScore += nameSim;
      fieldCount += 1;
    }
    const emailSim = calculateSimilarity(newC.email, String((existing.email || "")).toLowerCase());
    if (emailSim >= EMAIL_THRESHOLD) {
      matchedFields.push("email");
      combinedScore += emailSim;
      fieldCount += 1;
    }
    if (newC.phone && String(existing.phone || "")) {
      const phoneSim = calculateSimilarity(newC.phone, String(existing.phone || ""));
      if (phoneSim >= PHONE_THRESHOLD) {
        matchedFields.push("phone");
        combinedScore += phoneSim;
        fieldCount += 1;
      }
    }
    if (newC.company && String(existing.company || "")) {
      const companySim = calculateSimilarity(newC.company, String(existing.company || ""));
      if (companySim >= COMPANY_THRESHOLD) {
        matchedFields.push("company");
        combinedScore += companySim;
        fieldCount += 1;
      }
    }

    if (fieldCount === 0) continue;
    const avg = combinedScore / fieldCount;
    if (
      (matchedFields.includes("name") && matchedFields.includes("email")) ||
      matchedFields.includes("company") ||
      avg >= MIN_COMBINED_SCORE
    ) {
      if (avg > bestMeta.score) {
        best = existing;
        bestMeta = {
          score: avg,
          reason: `fuzzy:${matchedFields.join("+")}`,
        };
      }
    }
  }
  if (!best) return null;
  return { best, score: bestMeta.score, reason: bestMeta.reason };
}

/**
 * @param {object} deps
 * @param {function} deps.query - (sql, params) => Promise<{rows: any[]}>
 * @param {object} input
 * @param {string} [input.email]
 * @param {string} [input.company]
 * @param {string} [input.name]
 * @param {string} [input.phone]
 * @param {string} [input.street]
 * @param {string} [input.zipcity]
 * @returns {Promise<{
 *   match: 'exact'|'strong'|'weak'|'none',
 *   customer?: object,
 *   reason?: string,
 *   score?: number
 * }>}
 */
async function findMatchingCustomer(deps, input) {
  const { query } = deps;
  const email = String((input && input.email) || "")
    .toLowerCase()
    .trim();
  const company = String((input && input.company) || "");
  const name = String((input && input.name) || "");
  const phone = String((input && input.phone) || "");
  const street = String((input && input.street) || "");
  const zipcity = String((input && input.zipcity) || "");

  if (!email) {
    return { match: "none" };
  }

  const { rows: exactRows } = await query(
    `SELECT * FROM customers WHERE lower(btrim(COALESCE(email, ''))) = $1 LIMIT 1`,
    [email]
  );
  if (exactRows && exactRows[0]) {
    return { match: "exact", customer: exactRows[0], reason: "email", score: 1.0 };
  }

  const ck = computeCompanyKey(company);
  const dom = emailDomain(email);
  if (ck && dom) {
    const { rows: strongRows } = await query(
      `SELECT * FROM customers
       WHERE btrim(COALESCE(company_key, '')) = $1
         AND btrim(COALESCE(company_key, '')) <> ''
         AND split_part(lower(btrim(COALESCE(email, ''))), '@', 2) = $2
         AND btrim($2) <> ''
       ORDER BY id ASC
       LIMIT 1`,
      [ck, dom]
    );
    if (strongRows && strongRows[0]) {
      return { match: "strong", customer: strongRows[0], reason: "company_key+domain", score: 0.95 };
    }
  }

  if (ck) {
    const { rows: sameCompany } = await query(
      `SELECT * FROM customers
       WHERE btrim(COALESCE(company_key, '')) = $1
         AND btrim(COALESCE(company_key, '')) <> ''
       ORDER BY id ASC`,
      [ck]
    );
    if (sameCompany && sameCompany.length) {
      const hasDom = Boolean(dom);
      for (const row of sameCompany) {
        const rowDom = emailDomain(row.email);
        if (hasDom && rowDom === dom) {
          /* sollte "strong" sein — Fallback */
          return { match: "strong", customer: row, reason: "company_key+domain_2", score: 0.95 };
        }
      }
      return {
        match: "weak",
        customer: sameCompany[0],
        reason: "company_key_mismatch_or_extra_rows",
        score: 0.5,
      };
    }
  }

  const { rows: recent } = await query(
    `SELECT * FROM customers
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT 500`
  );
  if (recent && recent.length) {
    const f = bestFuzzyScore(
      { name, email, phone, company },
      recent
    );
    if (f && f.best) {
      return { match: "weak", customer: f.best, reason: f.reason, score: f.score };
    }
  }

  return { match: "none" };
}

module.exports = {
  findMatchingCustomer,
  computeCompanyKey,
  emailDomain,
};
