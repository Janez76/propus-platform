import { describe, it, expect } from "vitest";
import { INITIAL_STATE, type WizardFormState } from "./hooks/useWizardForm";
import { isObjectAddressComplete, validateStep } from "./validation";

function makeState(overrides: Partial<WizardFormState> = {}): WizardFormState {
  return { ...INITIAL_STATE, ...overrides };
}

describe("isObjectAddressComplete", () => {
  it("returns true when structured address fields are populated", () => {
    const state = makeState({
      address: "Bahnhofstrasse 1, 8001 Zürich",
      houseNumber: "1",
      zipcity: "8001 Zürich",
    });
    expect(isObjectAddressComplete(state)).toBe(true);
  });

  it("returns true when only the address string carries house number and zip/city", () => {
    const state = makeState({ address: "Bahnhofstrasse 1, 8001 Zürich" });
    expect(isObjectAddressComplete(state)).toBe(true);
  });

  it("returns false for empty address", () => {
    expect(isObjectAddressComplete(makeState())).toBe(false);
  });

  it("returns false when there are no digits at all", () => {
    const state = makeState({ address: "Bahnhofstrasse Zürich" });
    expect(isObjectAddressComplete(state)).toBe(false);
  });

  it("returns false when zip/city is missing", () => {
    const state = makeState({ address: "Bahnhofstrasse 1" });
    expect(isObjectAddressComplete(state)).toBe(false);
  });
});

describe("validateStep – step 0 (customer)", () => {
  it("reports all required customer fields as missing on empty state", () => {
    const errors = validateStep(0, makeState());
    expect(errors.customerName).toBeDefined();
    expect(errors.customerEmail).toBeDefined();
    expect(errors.billingStreet).toBeDefined();
    expect(errors.billingZip).toBeDefined();
    expect(errors.billingCity).toBeDefined();
  });

  it("returns no errors when all customer fields are filled", () => {
    const state = makeState({
      customerName: "Alice",
      customerEmail: "alice@example.com",
      billingStreet: "Bahnhofstrasse 1",
      billingZip: "8001",
      billingCity: "Zürich",
    });
    expect(validateStep(0, state)).toEqual({});
  });

  it("treats whitespace-only values as missing", () => {
    const state = makeState({
      customerName: "   ",
      customerEmail: "alice@example.com",
      billingStreet: "Bahnhofstrasse 1",
      billingZip: "8001",
      billingCity: "Zürich",
    });
    expect(validateStep(0, state).customerName).toBeDefined();
  });
});

describe("validateStep – step 1 (object)", () => {
  it("flags address when object address is incomplete", () => {
    const errors = validateStep(1, makeState());
    expect(errors.address).toBeDefined();
  });

  it("returns no errors for a complete object address", () => {
    const state = makeState({ address: "Bahnhofstrasse 1, 8001 Zürich" });
    expect(validateStep(1, state)).toEqual({});
  });
});

describe("validateStep – step 3 (schedule)", () => {
  it("has no errors for the default 'pending' status", () => {
    expect(validateStep(3, makeState())).toEqual({});
  });

  it("requires date and time when status is 'confirmed'", () => {
    const errors = validateStep(3, makeState({ initialStatus: "confirmed" }));
    expect(errors.date).toBeDefined();
    expect(errors.photographerKey).toBeDefined();
  });

  it("requires date and time when status is 'provisional'", () => {
    const errors = validateStep(3, makeState({ initialStatus: "provisional" }));
    expect(errors.date).toBeDefined();
    expect(errors.photographerKey).toBeDefined();
  });

  it("clears errors when a confirmed order has date and time", () => {
    const state = makeState({
      initialStatus: "confirmed",
      date: "2026-05-01",
      time: "09:00",
    });
    expect(validateStep(3, state)).toEqual({});
  });

  it("still flags missing time when status is 'confirmed' and date is set", () => {
    const state = makeState({ initialStatus: "confirmed", date: "2026-05-01" });
    const errors = validateStep(3, state);
    expect(errors.date).toBeUndefined();
    expect(errors.photographerKey).toBeDefined();
  });
});

describe("validateStep – step 2 (service)", () => {
  it("has no errors (service step is optional)", () => {
    expect(validateStep(2, makeState())).toEqual({});
  });
});
