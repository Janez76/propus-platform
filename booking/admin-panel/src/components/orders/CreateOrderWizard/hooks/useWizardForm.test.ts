import { describe, it, expect } from "vitest";
import type { Product, PricingRule } from "../../../../api/products";
import {
  INITIAL_STATE,
  estimatePrice,
  selectPricing,
  type WizardFormState,
} from "./useWizardForm";

function makeProduct(overrides: Partial<Product> & { code: string; rules?: PricingRule[] }): Product {
  return {
    id: 1,
    name: overrides.code,
    kind: "package",
    group_key: "default",
    active: true,
    sort_order: 0,
    rules: overrides.rules ?? [],
    ...overrides,
  } as Product;
}

function makeState(overrides: Partial<WizardFormState> = {}): WizardFormState {
  return { ...INITIAL_STATE, ...overrides };
}

describe("estimatePrice", () => {
  it("returns 0 when the product has no rules", () => {
    const product = makeProduct({ code: "pkg", rules: [] });
    expect(estimatePrice(product, "1", "0")).toBe(0);
  });

  it("fixed rule returns the configured price", () => {
    const product = makeProduct({
      code: "pkg",
      rules: [{ rule_type: "fixed", config_json: { price: 199 } }],
    });
    expect(estimatePrice(product, "1", "100")).toBe(199);
  });

  it("per_floor multiplies unitPrice by number of floors (min 1)", () => {
    const product = makeProduct({
      code: "pkg",
      rules: [{ rule_type: "per_floor", config_json: { unitPrice: 50 } }],
    });
    expect(estimatePrice(product, "3", "0")).toBe(150);
    expect(estimatePrice(product, "0", "0")).toBe(50);
    expect(estimatePrice(product, "", "0")).toBe(50);
  });

  it("per_room returns unitPrice (no multiplication)", () => {
    const product = makeProduct({
      code: "pkg",
      rules: [{ rule_type: "per_room", config_json: { unitPrice: 30 } }],
    });
    expect(estimatePrice(product, "1", "0")).toBe(30);
  });

  it("area_tier picks the first tier the area fits into", () => {
    const product = makeProduct({
      code: "pkg",
      rules: [
        {
          rule_type: "area_tier",
          config_json: {
            tiers: [
              { maxArea: 50, price: 100 },
              { maxArea: 100, price: 180 },
              { maxArea: 200, price: 260 },
            ],
          },
        },
      ],
    });
    expect(estimatePrice(product, "1", "40")).toBe(100);
    expect(estimatePrice(product, "1", "80")).toBe(180);
    expect(estimatePrice(product, "1", "150")).toBe(260);
  });

  it("area_tier falls back to last tier when area exceeds all maxima", () => {
    const product = makeProduct({
      code: "pkg",
      rules: [
        {
          rule_type: "area_tier",
          config_json: {
            tiers: [
              { maxArea: 50, price: 100 },
              { maxArea: 100, price: 180 },
            ],
          },
        },
      ],
    });
    expect(estimatePrice(product, "1", "500")).toBe(180);
  });

  it("area_tier with area=0 returns last tier (no tier matches)", () => {
    const product = makeProduct({
      code: "pkg",
      rules: [
        {
          rule_type: "area_tier",
          config_json: {
            tiers: [
              { maxArea: 50, price: 100 },
              { maxArea: 100, price: 180 },
            ],
          },
        },
      ],
    });
    expect(estimatePrice(product, "1", "0")).toBe(180);
  });

  it("conditional rule returns the configured price", () => {
    const product = makeProduct({
      code: "pkg",
      rules: [{ rule_type: "conditional", config_json: { price: 75 } }],
    });
    expect(estimatePrice(product, "1", "100")).toBe(75);
  });
});

describe("selectPricing", () => {
  const pkg = makeProduct({
    code: "pkg-basic",
    kind: "package",
    rules: [{ rule_type: "fixed", config_json: { price: 300 } }],
  });
  const addonA = makeProduct({
    code: "addon-a",
    kind: "addon",
    rules: [{ rule_type: "fixed", config_json: { price: 40 } }],
  });
  const addonB = makeProduct({
    code: "addon-b",
    kind: "addon",
    rules: [{ rule_type: "fixed", config_json: { price: 60 } }],
  });
  const catalog = [pkg, addonA, addonB];

  it("returns zero pricing for an empty state", () => {
    const result = selectPricing(makeState(), []);
    expect(result.subtotal).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.vat).toBe(0);
    expect(result.total).toBe(0);
    expect(result.packagePrice).toBe(0);
    expect(result.addonLines).toEqual([]);
    expect(result.keyPickupCharged).toBe(false);
  });

  it("computes subtotal, VAT (8.1%) and total for a package-only selection", () => {
    const state = makeState({ selectedPackageCode: "pkg-basic" });
    const result = selectPricing(state, catalog);
    expect(result.packagePrice).toBe(300);
    expect(result.subtotal).toBe(300);
    expect(result.vat).toBe(24.3);
    expect(result.total).toBe(324.3);
  });

  it("includes selected addons in subtotal and returns addonLines", () => {
    const state = makeState({
      selectedPackageCode: "pkg-basic",
      selectedAddonCodes: ["addon-a", "addon-b"],
    });
    const result = selectPricing(state, catalog);
    expect(result.packagePrice).toBe(300);
    expect(result.addonLines).toHaveLength(2);
    expect(result.addonLines.map((l) => l.code).sort()).toEqual(["addon-a", "addon-b"]);
    expect(result.subtotal).toBe(400);
    expect(result.vat).toBe(32.4);
    expect(result.total).toBe(432.4);
  });

  it("adds travel zone price to subtotal", () => {
    const state = makeState({
      selectedPackageCode: "pkg-basic",
      travelZonePrice: 50,
    });
    const result = selectPricing(state, catalog);
    expect(result.subtotal).toBe(350);
  });

  it("adds CHF 50 key pickup when active and address is set", () => {
    const state = makeState({
      selectedPackageCode: "pkg-basic",
      keyPickupActive: true,
      keyPickupAddress: "Some Street 1",
    });
    const result = selectPricing(state, catalog);
    expect(result.keyPickupCharged).toBe(true);
    expect(result.subtotal).toBe(350);
  });

  it("does not charge key pickup when address is empty", () => {
    const state = makeState({
      selectedPackageCode: "pkg-basic",
      keyPickupActive: true,
      keyPickupAddress: "   ",
    });
    const result = selectPricing(state, catalog);
    expect(result.keyPickupCharged).toBe(false);
    expect(result.subtotal).toBe(300);
  });

  it("applies discount to the VAT base", () => {
    const state = makeState({
      selectedPackageCode: "pkg-basic",
      discount: "100",
    });
    const result = selectPricing(state, catalog);
    expect(result.subtotal).toBe(300);
    expect(result.discount).toBe(100);
    expect(result.vat).toBe(16.2);
    expect(result.total).toBe(216.2);
  });

  it("honours a manualSubtotal override and recomputes VAT/total", () => {
    const state = makeState({
      selectedPackageCode: "pkg-basic",
      manualSubtotal: "500",
      discount: "0",
    });
    const result = selectPricing(state, catalog);
    expect(result.subtotal).toBe(500);
    expect(result.vat).toBe(40.5);
    expect(result.total).toBe(540.5);
  });

  it("ignores manualSubtotal when it is an empty string", () => {
    const state = makeState({
      selectedPackageCode: "pkg-basic",
      manualSubtotal: "",
    });
    const result = selectPricing(state, catalog);
    expect(result.subtotal).toBe(300);
  });

  it("falls back to packagePrice string when catalog entry is missing", () => {
    const state = makeState({
      selectedPackageCode: "unknown-code",
      packagePrice: "250",
    });
    const result = selectPricing(state, []);
    expect(result.packagePrice).toBe(250);
    expect(result.subtotal).toBe(250);
  });
});
