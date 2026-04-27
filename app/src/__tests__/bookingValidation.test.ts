import { describe, it, expect } from "vitest";
import { validateStep1, validateStep4, type Step1State, type Step4State } from "../lib/bookingValidation";

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

  it("main billing: 1-digit ZIP fails format check (Codex P2)", () => {
    const s = makeStep4({ zip: "8" });
    const fields = validateStep4(s).map((e) => e.field);
    expect(fields).toContain("zipCity");
  });

  it("main billing: 4-digit Swiss ZIP passes", () => {
    const s = makeStep4({ zip: "8050" });
    const fields = validateStep4(s).map((e) => e.field);
    expect(fields).not.toContain("zipCity");
  });

  it("altBilling: partial alt_zip fails format check", () => {
    const s = makeStep4(
      { alt_company: "Alt GmbH", alt_street: "Limmatstr. 5", alt_zip: "80", alt_city: "Zürich" },
      true,
    );
    const fields = validateStep4(s).map((e) => e.field);
    expect(fields).toContain("alt_zipCity");
  });
});

function makeStep1(zipOverride?: string): Step1State {
  return {
    address: "Albisstrasse 1, 8050 Zürich",
    parsedAddress: { street: "Albisstrasse", houseNumber: "1", zip: zipOverride ?? "8050", city: "Zürich" },
    object: {
      type: "apartment",
      area: "80",
      floors: 2,
      onsiteName: "Muster",
      onsitePhone: "0791234567",
    },
  };
}

describe("validateStep1 — ZIP format guard (regression for Codex P1 on #114)", () => {
  it("accepts 4-digit Swiss ZIP", () => {
    const fields = validateStep1(makeStep1("8050")).map((e) => e.field);
    expect(fields).not.toContain("address");
  });

  it("accepts 5-digit DE/AT ZIP", () => {
    const fields = validateStep1(makeStep1("10115")).map((e) => e.field);
    expect(fields).not.toContain("address");
  });

  it("rejects 1-digit partial ZIP (user stopped typing too early)", () => {
    const fields = validateStep1(makeStep1("8")).map((e) => e.field);
    expect(fields).toContain("address");
  });

  it("rejects 3-digit partial ZIP", () => {
    const fields = validateStep1(makeStep1("805")).map((e) => e.field);
    expect(fields).toContain("address");
  });

  it("still flags empty ZIP", () => {
    const fields = validateStep1(makeStep1("")).map((e) => e.field);
    expect(fields).toContain("address");
  });
});

describe("validateStep1 — house number can be entered manually", () => {
  it("accepts manual house number when canonical addressFields has it (parsedAddress.houseNumber empty)", () => {
    // Realistischer Buchungs-Flow: Nutzer waehlt Strasse aus Autocomplete
    // (parsedAddress wird gesetzt, HN bleibt leer), tippt dann Hausnummer
    // selbst ein (object.address.houseNumber gefuellt). Frueher = Blocker.
    const s = makeStep1();
    s.parsedAddress = { street: "Albisstrasse", houseNumber: "", zip: "5430", city: "Wettingen" };
    s.addressFields = { street: "Albisstrasse", houseNumber: "999", zip: "5430", city: "Wettingen" };
    s.address = "Albisstrasse 999, 5430 Wettingen";
    const fields = validateStep1(s).map((e) => e.field);
    expect(fields).not.toContain("address");
  });

  it("accepts when parsedAddress.houseNumber is set via dropdown selection", () => {
    const s = makeStep1();
    s.parsedAddress = { street: "Albisstrasse", houseNumber: "1", zip: "8050", city: "Zürich" };
    const fields = validateStep1(s).map((e) => e.field);
    expect(fields).not.toContain("address");
  });

  it("rejects when neither addressFields nor parsedAddress contains a house number", () => {
    const s = makeStep1();
    s.parsedAddress = { street: "Albisstrasse", houseNumber: "", zip: "5430", city: "Wettingen" };
    s.addressFields = { street: "Albisstrasse", houseNumber: "", zip: "5430", city: "Wettingen" };
    s.address = "Albisstrasse, 5430 Wettingen";
    const fields = validateStep1(s).map((e) => e.field);
    expect(fields).toContain("address");
  });

  it("rejects when parsedAddress is null and no addressFields supplied", () => {
    const s = makeStep1();
    s.parsedAddress = null;
    s.address = "Albisstrasse 1, 8050 Zürich";
    const fields = validateStep1(s).map((e) => e.field);
    expect(fields).toContain("address");
  });

  it("rejects whitespace-only house number", () => {
    const s = makeStep1();
    s.parsedAddress = { street: "Albisstrasse", houseNumber: "   ", zip: "8050", city: "Zürich" };
    s.addressFields = { street: "Albisstrasse", houseNumber: "   ", zip: "8050", city: "Zürich" };
    s.address = "Albisstrasse, 8050 Zürich";
    const fields = validateStep1(s).map((e) => e.field);
    expect(fields).toContain("address");
  });
});

describe("validateStep1 — addressFields consistency (Bug H)", () => {
  it("passes when addressFields match parsedAddress exactly", () => {
    const s = makeStep1();
    s.addressFields = { street: "Albisstrasse", houseNumber: "1", zip: "8050", city: "Zürich" };
    const fields = validateStep1(s).map((e) => e.field);
    expect(fields).not.toContain("address");
  });

  it("flags address when canonical street differs from validated parsedAddress (manual edit)", () => {
    const s = makeStep1();
    s.addressFields = { street: "Bahnhofstrasse", houseNumber: "1", zip: "8050", city: "Zürich" };
    const errors = validateStep1(s);
    const fields = errors.map((e) => e.field);
    const messages = errors.map((e) => e.message);
    expect(fields).toContain("address");
    expect(messages).toContain("booking.validation.addressOutOfSync");
  });

  it("flags address when canonical zip differs from validated parsedAddress", () => {
    const s = makeStep1();
    s.addressFields = { street: "Albisstrasse", houseNumber: "1", zip: "9000", city: "Zürich" };
    const messages = validateStep1(s).map((e) => e.message);
    expect(messages).toContain("booking.validation.addressOutOfSync");
  });

  it("ignores consistency check when no addressFields supplied (legacy callers)", () => {
    const s = makeStep1();
    const messages = validateStep1(s).map((e) => e.message);
    expect(messages).not.toContain("booking.validation.addressOutOfSync");
  });

  it("normalizes whitespace + case before comparing", () => {
    const s = makeStep1();
    s.addressFields = { street: "  ALBISSTRASSE  ", houseNumber: " 1 ", zip: "8050", city: "zürich" };
    const messages = validateStep1(s).map((e) => e.message);
    expect(messages).not.toContain("booking.validation.addressOutOfSync");
  });
});
