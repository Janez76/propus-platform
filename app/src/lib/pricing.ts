export const VAT_RATE = 0.081;
export const KEY_PICKUP_PRICE = 50;

export type PricingAddon = { price: number; qty?: number };

export type PricingInput = {
  packagePrice: number;
  addons: PricingAddon[];
  travelZonePrice: number;
  keyPickupActive: boolean;
  discount: number;
};

export type PricingResult = {
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function calculatePricing(input: PricingInput): PricingResult {
  const packagePrice = Math.max(0, toNumber(input.packagePrice));
  const travelZonePrice = Math.max(0, toNumber(input.travelZonePrice));
  const discount = Math.max(0, toNumber(input.discount));
  const keyPickup = input.keyPickupActive ? KEY_PICKUP_PRICE : 0;

  const addonTotal = (input.addons || []).reduce((sum, addon) => {
    const price = Math.max(0, toNumber(addon?.price));
    const qty = Math.max(1, toNumber(addon?.qty, 1));
    return sum + price * qty;
  }, 0);

  const subtotal = round2(packagePrice + addonTotal + travelZonePrice + keyPickup);
  const afterDiscount = Math.max(0, subtotal - discount);
  const vat = round2(afterDiscount * VAT_RATE);
  const total = round2(afterDiscount + vat);

  return { subtotal, discount: round2(discount), vat, total };
}
