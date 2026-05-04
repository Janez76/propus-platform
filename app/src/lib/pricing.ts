/**
 * VAT-Historie für Schweiz:
 * - Bis 2023-12-31: 7.7 %
 * - Ab  2024-01-01: 8.1 %
 *
 * Wichtig fuer Re-Berechnungen alter Bestellungen, Stornorechnungen,
 * Korrekturbuchungen — sonst kommt die heutige Rate auf alte Daten.
 *
 * Reihenfolge der Eintraege ist egal: vatRateFor() sucht den Eintrag
 * mit dem groessten `effectiveFrom <= target` (CodeRabbit Major #257).
 */
const VAT_RATE_HISTORY: ReadonlyArray<{ effectiveFrom: string; rate: number }> = [
  { effectiveFrom: "1970-01-01", rate: 0.077 },
  { effectiveFrom: "2024-01-01", rate: 0.081 },
];

/** Aktueller Standard-Satz (Heute). Bewahrt Kompat mit altem Import. */
export const VAT_RATE = 0.081;
export const KEY_PICKUP_PRICE = 50;

/**
 * Liefert den korrekten MwSt-Satz für ein bestimmtes Datum. Wenn `date`
 * fehlt oder ungueltig ist, wird der aktuelle Satz zurueckgegeben.
 *
 * @example
 *   vatRateFor(new Date("2023-06-01"))  // 0.077
 *   vatRateFor(new Date("2024-06-01"))  // 0.081
 *   vatRateFor()                        // 0.081 (heute)
 */
function dateToLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function vatRateFor(date?: Date | string | null): number {
  // Vergleich erfolgt auf YYYY-MM-DD-Strings ohne Timezone-Roundtrip:
  //  - Strings die mit YYYY-MM-DD anfangen werden direkt benutzt
  //    (verhindert dass `new Date("2024-01-01")` als UTC geparsed +
  //    in Tz west of UTC zu lokal 2023-12-31 wird → Codex P1).
  //  - Date-Objekte und andere String-Formate werden auf LOKALES
  //    YYYY-MM-DD gemappt (verhindert UTC-Shift in Tz east of UTC).
  let iso: string;
  if (typeof date === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(date.trim());
    if (m) {
      iso = m[1];
    } else {
      const t = new Date(date);
      if (Number.isNaN(t.getTime())) return VAT_RATE;
      iso = dateToLocalISO(t);
    }
  } else if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) return VAT_RATE;
    iso = dateToLocalISO(date);
  } else {
    iso = dateToLocalISO(new Date());
  }
  // Eintrag mit groesstem effectiveFrom <= iso. Reihenfolge im Array egal.
  let best: (typeof VAT_RATE_HISTORY)[number] | null = null;
  for (const entry of VAT_RATE_HISTORY) {
    if (iso < entry.effectiveFrom) continue;
    if (!best || entry.effectiveFrom > best.effectiveFrom) best = entry;
  }
  return best ? best.rate : VAT_RATE;
}

export type PricingAddon = { price: number; qty?: number };

export type PricingInput = {
  packagePrice: number;
  addons: PricingAddon[];
  travelZonePrice: number;
  keyPickupActive: boolean;
  discount: number;
  /**
   * Optional: Datum der Bestellung/Rechnung. Steuert welcher MwSt-Satz
   * angewendet wird (siehe vatRateFor). Wenn weggelassen, gilt
   * der aktuelle Satz.
   */
  effectiveDate?: Date | string | null;
};

export type PricingResult = {
  subtotal: number;
  discount: number;
  vat: number;
  vatRate: number;
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

  const vatRate = vatRateFor(input.effectiveDate);
  const subtotal = round2(packagePrice + addonTotal + travelZonePrice + keyPickup);
  const afterDiscount = Math.max(0, subtotal - discount);
  const vat = round2(afterDiscount * vatRate);
  const total = round2(afterDiscount + vat);

  return { subtotal, discount: round2(discount), vat, vatRate, total };
}
