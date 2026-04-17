import { describe, it, expect } from "vitest";
import { calculatePricing, KEY_PICKUP_PRICE, VAT_RATE } from "./pricing";

describe("calculatePricing", () => {
  it("returns zeros for an empty input", () => {
    const result = calculatePricing({
      packagePrice: 0,
      addons: [],
      travelZonePrice: 0,
      keyPickupActive: false,
      discount: 0,
    });
    expect(result).toEqual({ subtotal: 0, discount: 0, vat: 0, total: 0 });
  });

  it("handles a package price alone", () => {
    const result = calculatePricing({
      packagePrice: 500,
      addons: [],
      travelZonePrice: 0,
      keyPickupActive: false,
      discount: 0,
    });
    expect(result.subtotal).toBe(500);
    expect(result.vat).toBe(40.5);
    expect(result.total).toBe(540.5);
  });

  it("sums package + addons", () => {
    const result = calculatePricing({
      packagePrice: 300,
      addons: [{ price: 100 }, { price: 50 }],
      travelZonePrice: 0,
      keyPickupActive: false,
      discount: 0,
    });
    expect(result.subtotal).toBe(450);
    expect(result.total).toBe(486.45);
  });

  it("applies a discount before VAT", () => {
    const result = calculatePricing({
      packagePrice: 1000,
      addons: [],
      travelZonePrice: 0,
      keyPickupActive: false,
      discount: 100,
    });
    expect(result.subtotal).toBe(1000);
    expect(result.discount).toBe(100);
    expect(result.vat).toBe(72.9);
    expect(result.total).toBe(972.9);
  });

  it("adds the key-pickup fee when active", () => {
    const result = calculatePricing({
      packagePrice: 200,
      addons: [],
      travelZonePrice: 0,
      keyPickupActive: true,
      discount: 0,
    });
    expect(result.subtotal).toBe(200 + KEY_PICKUP_PRICE);
    expect(result.vat).toBe(Math.round(result.subtotal * VAT_RATE * 100) / 100);
  });

  it("adds a travel-zone surcharge to the subtotal", () => {
    const result = calculatePricing({
      packagePrice: 400,
      addons: [],
      travelZonePrice: 80,
      keyPickupActive: false,
      discount: 0,
    });
    expect(result.subtotal).toBe(480);
    expect(result.total).toBe(518.88);
  });

  it("multiplies addon price by qty when qty > 1", () => {
    const result = calculatePricing({
      packagePrice: 0,
      addons: [{ price: 100, qty: 3 }, { price: 20, qty: 1 }, { price: 10 }],
      travelZonePrice: 0,
      keyPickupActive: false,
      discount: 0,
    });
    expect(result.subtotal).toBe(330);
  });

  it("never produces a negative total if discount exceeds subtotal", () => {
    const result = calculatePricing({
      packagePrice: 100,
      addons: [],
      travelZonePrice: 0,
      keyPickupActive: false,
      discount: 500,
    });
    expect(result.vat).toBe(0);
    expect(result.total).toBe(0);
  });

  it("clamps negative inputs to zero", () => {
    const result = calculatePricing({
      packagePrice: -50,
      addons: [{ price: -10 }],
      travelZonePrice: -5,
      keyPickupActive: false,
      discount: -20,
    });
    expect(result.subtotal).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(0);
  });

  it("combines package, addons, travel zone, key pickup and discount", () => {
    const result = calculatePricing({
      packagePrice: 600,
      addons: [{ price: 150 }, { price: 100, qty: 2 }],
      travelZonePrice: 40,
      keyPickupActive: true,
      discount: 50,
    });
    const expectedSubtotal = 600 + 150 + 200 + 40 + KEY_PICKUP_PRICE;
    expect(result.subtotal).toBe(expectedSubtotal);
    const afterDiscount = expectedSubtotal - 50;
    expect(result.vat).toBe(Math.round(afterDiscount * VAT_RATE * 100) / 100);
    expect(result.total).toBe(
      Math.round((afterDiscount + result.vat) * 100) / 100,
    );
  });
});
