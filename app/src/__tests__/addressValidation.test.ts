import { describe, it, expect } from "vitest";
import {
  validateStreet,
  validateHouseNumber,
  validateZip,
  validateCity,
  validateCompanyName,
  validateUidOptional,
  validateLastName,
  validateEmailRequired,
  validateEmailOptional,
  validatePhoneOptional,
  validateStructuredAddress,
  validateBillingContact,
} from "../lib/addressValidation";

describe("validateStreet", () => {
  it("rejects empty", () => {
    expect(validateStreet("")).toEqual({ valid: false, error: "Strasse ist erforderlich" });
    expect(validateStreet("   ")).toMatchObject({ valid: false });
  });
  it("rejects too short", () => {
    expect(validateStreet("A")).toMatchObject({ valid: false });
  });
  it("accepts typical Swiss street names", () => {
    expect(validateStreet("Albisstrasse")).toEqual({ valid: true });
    expect(validateStreet("Untere Mühlebachstrasse")).toEqual({ valid: true });
    expect(validateStreet("Im Lee")).toEqual({ valid: true });
  });
  it("rejects too long", () => {
    expect(validateStreet("A".repeat(101))).toMatchObject({ valid: false });
  });
});

describe("validateHouseNumber", () => {
  it("requires non-empty", () => {
    expect(validateHouseNumber("")).toMatchObject({ valid: false });
  });
  it.each([
    ["12", true],
    ["158", true],
    ["15a", true],
    ["22A", true],
    ["7-9", true],
    ["15/17", true],
    ["15 / 17", true],
    ["abc", false],
    ["12abc", false],
    ["", false],
  ])("house number %s → valid=%s", (input, expected) => {
    expect(validateHouseNumber(input).valid).toBe(expected);
  });
  it("rejects too long", () => {
    expect(validateHouseNumber("12345678901").valid).toBe(false);
  });
});

describe("validateZip", () => {
  it("CH: exactly 4 digits", () => {
    expect(validateZip("8038", "CH").valid).toBe(true);
    expect(validateZip("803", "CH").valid).toBe(false);
    expect(validateZip("80380", "CH").valid).toBe(false);
    expect(validateZip("803a", "CH").valid).toBe(false);
  });
  it("DE: exactly 5 digits", () => {
    expect(validateZip("10115", "DE").valid).toBe(true);
    expect(validateZip("8038", "DE").valid).toBe(false);
  });
  it("FL/AT use 4 digits like CH", () => {
    expect(validateZip("9490", "FL").valid).toBe(true);
    expect(validateZip("1010", "AT").valid).toBe(true);
  });
  it("empty always rejected", () => {
    expect(validateZip("", "CH").valid).toBe(false);
  });
});

describe("validateCity", () => {
  it("accepts typical city names", () => {
    expect(validateCity("Zürich").valid).toBe(true);
    expect(validateCity("St. Gallen").valid).toBe(true);
  });
  it("rejects empty / too short", () => {
    expect(validateCity("").valid).toBe(false);
    expect(validateCity("Z").valid).toBe(false);
  });
});

describe("validateCompanyName", () => {
  it("requires non-empty", () => {
    expect(validateCompanyName("").valid).toBe(false);
  });
  it("accepts typical Swiss company name", () => {
    expect(validateCompanyName("CSL Immobilien AG").valid).toBe(true);
  });
});

describe("validateUidOptional", () => {
  it("accepts empty (optional)", () => {
    expect(validateUidOptional("").valid).toBe(true);
  });
  it("accepts Swiss UID format", () => {
    expect(validateUidOptional("CHE-123.456.789").valid).toBe(true);
  });
  it("rejects malformed UID", () => {
    expect(validateUidOptional("CHE-12.34.56").valid).toBe(false);
    expect(validateUidOptional("123.456.789").valid).toBe(false);
  });
});

describe("validateLastName", () => {
  it("is required", () => {
    expect(validateLastName("").valid).toBe(false);
  });
  it("accepts typical names", () => {
    expect(validateLastName("Smirmaul").valid).toBe(true);
    expect(validateLastName("Müller-Meier").valid).toBe(true);
  });
});

describe("validateEmailRequired / Optional", () => {
  it("required rejects empty", () => {
    expect(validateEmailRequired("").valid).toBe(false);
  });
  it("optional accepts empty", () => {
    expect(validateEmailOptional("").valid).toBe(true);
  });
  it.each([
    ["user@example.com", true],
    ["js@propus.ch", true],
    ["a+tag@x.co", true],
    ["noatsign", false],
    ["missing@tld", false],
    ["@nolocal.com", false],
    ["trailing space @x.com", false],
  ])("email %s → valid=%s", (input, expected) => {
    expect(validateEmailRequired(input).valid).toBe(expected);
  });
});

describe("validatePhoneOptional", () => {
  it("accepts empty", () => {
    expect(validatePhoneOptional("").valid).toBe(true);
  });
  it.each([
    ["+41 44 123 45 67", true],
    ["+41 (0)44 123 45 67", true],
    ["044 123 45 67", true],
    ["076-340-70-75", true],
    ["abc", false],
    ["+41 <script>", false],
  ])("phone %s → valid=%s", (input, expected) => {
    expect(validatePhoneOptional(input).valid).toBe(expected);
  });
});

describe("validateStructuredAddress", () => {
  it("returns empty object for a valid address", () => {
    expect(validateStructuredAddress({
      street: "Albisstrasse",
      houseNumber: "158",
      zip: "8038",
      city: "Zürich",
      countryCode: "CH",
    })).toEqual({});
  });
  it("reports every missing field", () => {
    const errs = validateStructuredAddress({ street: "", houseNumber: "", zip: "", city: "" });
    expect(errs.street).toBeDefined();
    expect(errs.houseNumber).toBeDefined();
    expect(errs.zip).toBeDefined();
    expect(errs.city).toBeDefined();
  });
  it("respects German PLZ rules", () => {
    const errs = validateStructuredAddress({
      street: "Hauptstrasse",
      houseNumber: "5",
      zip: "8038",
      city: "Berlin",
      countryCode: "DE",
    });
    expect(errs.zip).toBeDefined();
  });
});

describe("validateBillingContact", () => {
  it("valid contact passes", () => {
    expect(validateBillingContact({
      firstName: "Janez",
      lastName: "Smirmaul",
      email: "js@propus.ch",
      phone: "+41 76 340 70 75",
    })).toEqual({});
  });
  it("missing lastName / email reported", () => {
    const errs = validateBillingContact({ firstName: "Janez", lastName: "", email: "" });
    expect(errs.lastName).toBeDefined();
    expect(errs.email).toBeDefined();
  });
});
