/** Gleiche Logik wie backend/pricing.js (area_tier). */

export function computeTourPrice(area: number, config: Record<string, unknown>): number | null {
  const n = Number(area);
  if (!Number.isFinite(n) || n <= 0) return null;
  const tiers = Array.isArray(config?.tiers) ? (config.tiers as Record<string, unknown>[]) : [];
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
  const maxTierArea =
    tiers
      .map((t) => Number(t?.maxArea))
      .filter((x) => Number.isFinite(x))
      .sort((a, b) => a - b)
      .pop() || 0;
  if (n <= maxTierArea) return basePrice;
  const extra = Math.ceil((n - maxTierArea) / incrementArea);
  return basePrice + extra * incrementPrice;
}

export function computeTourDuration(area: number, config: Record<string, unknown>): number | null {
  const n = Number(area);
  if (!Number.isFinite(n) || n <= 0) return null;
  const tiers = Array.isArray(config?.tiers) ? (config.tiers as Record<string, unknown>[]) : [];
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
  const maxTierArea =
    tiers
      .map((t) => Number(t?.maxArea))
      .filter((x) => Number.isFinite(x))
      .sort((a, b) => a - b)
      .pop() || 0;
  if (n <= maxTierArea) return baseDuration;
  const extra = Math.ceil((n - maxTierArea) / incrementArea);
  return baseDuration + extra * incrementDuration;
}

export function findTierIndexForArea(area: number, tiers: Array<{ maxArea?: unknown }>): number {
  const n = Number(area);
  if (!Number.isFinite(n) || n <= 0) return -1;
  const list = Array.isArray(tiers) ? tiers : [];
  for (let i = 0; i < list.length; i++) {
    const maxArea = Number(list[i]?.maxArea);
    if (Number.isFinite(maxArea) && n <= maxArea) return i;
  }
  return -1;
}

export function setPriceForTierAtArea(
  config: Record<string, unknown>,
  area: number,
  price: number,
): Record<string, unknown> {
  const tiers = [...(Array.isArray(config.tiers) ? (config.tiers as Record<string, unknown>[]) : [])];
  const idx = findTierIndexForArea(area, tiers);
  if (idx < 0) return config;
  const next = tiers.map((t, i) => (i === idx ? { ...t, price } : t));
  return { ...config, tiers: next };
}

export function setDurationForTierAtArea(
  config: Record<string, unknown>,
  area: number,
  durationMinutes: number | null,
): Record<string, unknown> {
  const tiers = [...(Array.isArray(config.tiers) ? (config.tiers as Record<string, unknown>[]) : [])];
  const idx = findTierIndexForArea(area, tiers);
  if (idx < 0) return config;
  const next = tiers.map((t, i) => {
    if (i !== idx) return t;
    if (durationMinutes == null || !Number.isFinite(durationMinutes)) {
      const { durationMinutes: _d, ...rest } = t;
      return rest;
    }
    return { ...t, durationMinutes };
  });
  return { ...config, tiers: next };
}
