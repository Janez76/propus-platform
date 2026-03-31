export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function computeTourPrice(areaSqm: number): number {
  if (areaSqm <= 99) return 199;
  if (areaSqm <= 199) return 299;
  if (areaSqm <= 299) return 399;
  return 399 + Math.ceil((areaSqm - 299) / 100) * 79;
}

const AREA_DURATION_MAP: [number, number][] = [
  [99, 60],
  [299, 90],
  [Infinity, 120],
];

const PACKAGE_DURATION_BONUS: Record<string, number> = {
  cinematic: 30,
  fullview: 30,
  bestseller: 0,
};

export function computeShootDuration(
  areaSqm: number,
  packageKey: string | null,
  addonDurationBonuses: Record<string, number> = {},
): number {
  let base = 60;
  for (const [threshold, duration] of AREA_DURATION_MAP) {
    if (areaSqm <= threshold) {
      base = duration;
      break;
    }
  }
  const pkgBonus = packageKey ? (PACKAGE_DURATION_BONUS[packageKey] ?? 0) : 0;
  const addonBonus = Object.values(addonDurationBonuses).reduce((s, v) => s + v, 0);
  return base + pkgBonus + addonBonus;
}

export type PricingConfig = {
  vatRate: number;
  chfRoundingStep: number;
};

const DEFAULT_CONFIG: PricingConfig = { vatRate: 0.081, chfRoundingStep: 0.05 };

export function computePricing(
  subtotal: number,
  discountPercent: number,
  config: PricingConfig = DEFAULT_CONFIG,
) {
  const { vatRate, chfRoundingStep } = config;
  const discountAmount = roundToStep(subtotal * (discountPercent / 100), chfRoundingStep);
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const vat = roundToStep(afterDiscount * vatRate, chfRoundingStep);
  const total = roundToStep(afterDiscount + vat, chfRoundingStep);
  return { subtotal, discountAmount, vat, total };
}

export function formatCHF(value: number): string {
  return `CHF ${value.toFixed(2)}`;
}
