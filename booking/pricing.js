const { calculateDiscount } = require("./discount-codes.js");
const db = require("./db");
const { getSetting } = require("./settings-resolver");

function roundCHF(n, step = 0.05){
  const val = Number(n);
  const roundingStep = Number(step);
  if (!Number.isFinite(val)) return 0;
  if (!Number.isFinite(roundingStep) || roundingStep <= 0) return val;
  // Floating-point-safe: toFixed(10) eliminiert binäre Darstellungsfehler
  return parseFloat((Math.round(val / roundingStep) * roundingStep).toFixed(10));
}

function computeTourPrice(area, config){
  const n = parseFloat(area);
  if (Number.isNaN(n) || n <= 0) return null;
  const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
  for (const tier of tiers) {
    const maxArea = Number(tier?.maxArea);
    const price = Number(tier?.price);
    if (Number.isFinite(maxArea) && Number.isFinite(price) && n <= maxArea) return price;
  }
  const basePrice = Number(config?.basePrice || 0);
  const incrementArea = Math.max(1, Number(config?.incrementArea || 100));
  const incrementPrice = Number(config?.incrementPrice || 0);
  if (basePrice <= 0) return null;
  if (incrementPrice <= 0) return basePrice;
  const maxTierArea = tiers
    .map((t) => Number(t?.maxArea))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b)
    .pop() || 0;
  if (n <= maxTierArea) return basePrice;
  const extra = Math.ceil((n - maxTierArea) / incrementArea);
  return basePrice + extra * incrementPrice;
}

/** Dauer (Min) aus area_tier-Regel: Staffel mit durationMinutes oder Überlauf baseDuration/incrementDuration. */
function computeTourDuration(area, config) {
  const n = parseFloat(area);
  if (Number.isNaN(n) || n <= 0) return null;
  const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
  for (const tier of tiers) {
    const maxArea = Number(tier?.maxArea);
    const dm = tier?.durationMinutes;
    if (!Number.isFinite(maxArea) || n > maxArea) continue;
    if (dm != null && Number.isFinite(Number(dm))) return Number(dm);
    return null;
  }
  const baseDuration = Number(config?.baseDuration);
  const incrementArea = Math.max(1, Number(config?.incrementArea || 100));
  const incrementDuration = Number(config?.incrementDuration || 0);
  if (!Number.isFinite(baseDuration) || baseDuration <= 0) return null;
  if (!Number.isFinite(incrementDuration) || incrementDuration <= 0) return baseDuration;
  const maxTierArea = tiers
    .map((t) => Number(t?.maxArea))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b)
    .pop() || 0;
  if (n <= maxTierArea) return baseDuration;
  const extra = Math.ceil((n - maxTierArea) / incrementArea);
  return baseDuration + extra * incrementDuration;
}

function extractQty(label){
  const normalized = String(label || "")
    .split("")
    .map((ch) => (ch.charCodeAt(0) === 215 ? "x" : ch))
    .join("");
  const m = normalized.match(/x\s*(\d+)/i);
  const qty = m ? Number(m[1]) : 1;
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function calcRulePrice(rule, ctx){
  const type = String(rule?.rule_type || "");
  const cfg = rule?.config_json || {};
  if (type === "fixed") {
    return Number(cfg.price || 0);
  }
  if (type === "per_floor") {
    return Number(cfg.unitPrice || 0) * ctx.floors;
  }
  if (type === "per_room") {
    return Number(cfg.unitPrice || 0) * ctx.qty;
  }
  if (type === "area_tier") {
    return computeTourPrice(ctx.area, cfg) || 0;
  }
  if (type === "conditional") {
    const requireAnyPackageCodes = Array.isArray(cfg.requireAnyPackageCodes) ? cfg.requireAnyPackageCodes : [];
    const requireAnyGroupKeys = Array.isArray(cfg.requireAnyGroupKeys) ? cfg.requireAnyGroupKeys : [];
    const requireAnyAddonCodes = Array.isArray(cfg.requireAnyAddonCodes) ? cfg.requireAnyAddonCodes : [];
    const packageOk = !requireAnyPackageCodes.length || requireAnyPackageCodes.includes(ctx.packageCode);
    const groupOk = !requireAnyGroupKeys.length || ctx.addonGroups.some((g) => requireAnyGroupKeys.includes(g));
    const addonOk = !requireAnyAddonCodes.length || ctx.addonCodes.some((c) => requireAnyAddonCodes.includes(c));
    return packageOk && groupOk && addonOk ? Number(cfg.price || 0) : 0;
  }
  return 0;
}

function isRuleWithinDate(rule, now = new Date()) {
  const validFrom = rule?.valid_from ? new Date(`${String(rule.valid_from).slice(0, 10)}T00:00:00.000Z`) : null;
  const validTo = rule?.valid_to ? new Date(`${String(rule.valid_to).slice(0, 10)}T23:59:59.999Z`) : null;
  if (validFrom && now < validFrom) return false;
  if (validTo && now > validTo) return false;
  return true;
}

async function computePricing({ services, object, discountCode, customerEmail, context = {} }){
  const vatRateResolved = await getSetting("pricing.vatRate", context);
  const roundingStepResolved = await getSetting("pricing.chfRoundingStep", context);
  const roundingModeResolved = await getSetting("pricing.roundingMode", context);
  const vatRate = Number(vatRateResolved.value ?? 0.081);
  const roundingStep = Number(roundingStepResolved.value ?? 0.05);
  const roundingMode = String(roundingModeResolved.value || "each_step");

  await db.ensureProductCatalogSeeded();
  const products = await db.listProductsWithRules({ includeInactive: false });
  const byCode = new Map(products.map((p) => [String(p.code), p]));

  const packageKey = services?.package?.key || "";
  const packageLabel = services?.package?.label || packageKey;

  const floors = Math.max(1, parseInt(object?.floors || "1", 10));
  const area = object?.area || "";
  const addons = Array.isArray(services?.addons) ? services.addons : [];

  let subtotal = 0;
  const withPrice = [];
  const noPrice = [];
  const appliedRules = [];

  const selectedPackage = packageKey ? byCode.get(packageKey) : null;
  if (selectedPackage) {
    const packageRule = (selectedPackage.rules || [])
      .filter((r) => r?.active !== false && isRuleWithinDate(r))
      .sort((ra, rb) => (ra.priority || 0) - (rb.priority || 0))[0];
    const packageBase = calcRulePrice(packageRule, {
      floors,
      area,
      qty: 1,
      packageCode: packageKey,
      addonGroups: addons.map((a) => a?.group).filter(Boolean),
      addonCodes: addons.map((a) => a?.id).filter(Boolean),
    });
    const price = roundCHF(packageBase, roundingStep);
    subtotal += price;
    if (packageRule) {
      appliedRules.push({
        productCode: selectedPackage.code,
        productKind: selectedPackage.kind,
        ruleId: packageRule.id || null,
        ruleType: packageRule.rule_type || "fixed",
        price,
      });
    }
    withPrice.push(`${selectedPackage.name || packageLabel} - ${price} CHF`);
    noPrice.push(selectedPackage.name || packageLabel);
  } else if (services?.package?.price) {
    const price = roundCHF(Number(services.package.price || 0), roundingStep);
    subtotal += price;
    withPrice.push(`${packageLabel} - ${price} CHF`);
    noPrice.push(packageLabel);
  }

  addons.forEach((a) => {
    const id = String(a.id || "");
    const product = byCode.get(id);
    const label = (product?.name || a.label || a.labelKey || id || "Service");
    let price = 0;

    if (product) {
      const qty = Number(a.qty || 0) > 0 ? Number(a.qty) : extractQty(a.label || "");
      const addonGroups = addons.map((x) => x?.group).filter(Boolean);
      const addonCodes = addons.map((x) => x?.id).filter(Boolean);
      for (const rule of (product.rules || []).filter((r) => r?.active !== false && isRuleWithinDate(r)).sort((ra, rb) => (ra.priority || 0) - (rb.priority || 0))) {
        const candidatePrice = roundCHF(calcRulePrice(rule, { floors, area, qty, packageCode: packageKey, addonGroups, addonCodes }), roundingStep);
        price = candidatePrice;
        if (price > 0) break;
      }
      if (price > 0) {
        const matchedRule = (product.rules || [])
          .filter((r) => r?.active !== false && isRuleWithinDate(r))
          .sort((ra, rb) => (ra.priority || 0) - (rb.priority || 0))
          .find((rule) => roundCHF(calcRulePrice(rule, { floors, area, qty, packageCode: packageKey, addonGroups, addonCodes }), roundingStep) > 0);
        if (matchedRule) {
          appliedRules.push({
            productCode: product.code,
            productKind: product.kind,
            ruleId: matchedRule.id || null,
            ruleType: matchedRule.rule_type || "fixed",
            price,
          });
        }
      }
    } else if (Number(a.price || 0) > 0) {
      price = roundCHF(Number(a.price || 0), roundingStep);
    }

    if (price > 0) {
      subtotal += price;
      withPrice.push(`${label} - ${price} CHF`);
      noPrice.push(label);
    }
  });

  const discount = await calculateDiscount(discountCode || "", subtotal, { customerEmail, packageCode: packageKey, addonCodes: addons.map((x) => x?.id).filter(Boolean) });
  const discountAmount = discount ? roundCHF(discount.amount, roundingStep) : 0;
  const safeSubtotal = roundCHF(subtotal, roundingStep);
  const afterDiscount = Math.max(0, safeSubtotal - discountAmount);
  const vatRaw = afterDiscount * vatRate;
  const vat = roundCHF(vatRaw, roundingStep);
  const total = roundCHF(afterDiscount + vat, roundingStep);
  const totalFinal = roundingMode === "final_only"
    ? roundCHF(afterDiscount + vatRaw, roundingStep)
    : total;

  return {
    pricing: {
      subtotal: safeSubtotal,
      discountAmount,
      vat,
      total: totalFinal
    },
    appliedSettings: {
      vatRate,
      chfRoundingStep: roundingStep,
      roundingMode
    },
    discount: discount ? {
      code: discount.code,
      type: discount.type,
      percent: discount.percent,
      amount: roundCHF(discount.amount, roundingStep),
    } : null,
    reasonCodes: {
      discountApplied: !!discount,
      discountReason: discountCode ? (discount?.reason || "invalid_or_not_applicable") : "none",
    },
    _debug: {
      vatRate,
      chfRoundingStep: roundingStep,
      roundingMode,
      appliedRules,
      discountReason: discountCode ? (discount?.reason || "invalid_or_not_applicable") : "none",
    },
    serviceListWithPrice: withPrice.join("\n") || "-",
    serviceListNoPrice: noPrice.join("\n") || "-"
  };
}

module.exports = {
  computePricing,
  roundCHF,
  isRuleWithinDate,
  computeTourPrice,
  computeTourDuration,
};
