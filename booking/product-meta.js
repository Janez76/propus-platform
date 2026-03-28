/**
 * Produkt-Meta aus der ersten aktiven Regel (Priorität aufsteigend).
 */

function getFirstActiveRuleConfig(product) {
  const rules = Array.isArray(product?.rules) ? product.rules : [];
  const sorted = rules
    .filter((r) => r?.active !== false)
    .sort((a, b) => (Number(a.priority || 0) - Number(b.priority || 0)));
  const rule = sorted[0];
  return rule?.config_json && typeof rule.config_json === "object" ? rule.config_json : {};
}

function getAssignmentRefSqmFromProduct(product) {
  if (!product) return null;
  const cfg = getFirstActiveRuleConfig(product);
  const meta = cfg.meta && typeof cfg.meta === "object" ? cfg.meta : {};
  const n = Number(meta.assignment_ref_sqm);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Effektive Fläche für Pricing/Vergabe: Objektfläche, sonst max. Referenz-Fläche aus gebuchten Produkten (meta.assignment_ref_sqm).
 * @param {number|null|undefined} parsedArea  – bereits geparste m² (>0) oder null
 * @param {object} services
 * @param {Map<string, object>} productsByCode
 * @returns {number|null}
 */
function resolveEffectiveSqm(parsedArea, services, productsByCode) {
  if (parsedArea != null && Number.isFinite(Number(parsedArea)) && Number(parsedArea) > 0) {
    return Number(parsedArea);
  }
  const refs = [];
  const pkg = services?.package;
  const pkgKey = pkg && typeof pkg === "object" ? String(pkg.key || "").trim() : String(pkg || "").trim();
  if (pkgKey) {
    const r = getAssignmentRefSqmFromProduct(productsByCode.get(pkgKey));
    if (r) refs.push(r);
  }
  const addons = Array.isArray(services?.addons) ? services.addons : [];
  for (const ad of addons) {
    const code = String(ad?.id || "").trim();
    if (!code) continue;
    const r = getAssignmentRefSqmFromProduct(productsByCode.get(code));
    if (r) refs.push(r);
  }
  if (!refs.length) return null;
  return Math.max(...refs);
}

module.exports = {
  getFirstActiveRuleConfig,
  getAssignmentRefSqmFromProduct,
  resolveEffectiveSqm,
};
