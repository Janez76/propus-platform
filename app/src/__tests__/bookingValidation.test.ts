import { describe, it, expect } from "vitest";
import { validateStep4, type Step4State } from "../lib/bookingValidation";

function makeStep4(overrides: Partial<Step4State["billing"]> = {}, altBilling = false, agbAccepted = true): Step4State {
  return {
    billing: {
      company: "Acme AG",
      name: "Muster",
      email: "muster@example.com",
      phone: "0791234567",
      phone_mobile: "",
      street: "Albisstrasse 1",
      zip: "8050",
      city: "Zürich",
      ...overrides,
    },
    altBilling,
    agbAccepted,
  };
}

describe("validateStep4 — billing mode awareness (regression for PR #113)", () => {
  it("private mode: empty company does NOT trigger companyRequired", () => {
    const s = makeStep4({ company: "", structured: { mode: "private" } });
    const fields = validateStep4(s).map((e) => e.field);
    expect(fields).not.toContain("company");
  });

  it("company mode: empty company DOES trigger companyRequired", () => {
    const s = makeStep4({ company: "", structured: { mode: "company" } });
    const fields = validateStep4(s).map((e) => e.field);
    expect(fields).toContain("company");
  });

  it("legacy call without structured slot: defaults to company mode", () => {
    const s = makeStep4({ company: "" });
    const fields = validateStep4(s).map((e) => e.field);
    expect(fields).toContain("company");
  });

  it("altBilling: missing alt_name does NOT trigger an error (V2 removed the rule)", () => {
    const s = makeStep4(
      {
        alt_company: "Alt GmbH",
        alt_street: "Limmatstr. 5",
        alt_zip: "8005",
        alt_city: "Zürich",
      },
      true,
    );
    const fields = validateStep4(s).map((e) => e.field);
    expect(fields).not.toContain("alt_name");
  });

  it("altBilling: missing alt_company / alt_street / alt_zip still trigger errors", () => {
    const s = makeStep4({}, true);
    const fields = validateStep4(s).map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["alt_company", "alt_street", "alt_zipCity"]));
  });
});
