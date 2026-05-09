import { describe, it, expect } from "vitest";
import { validateStep3 } from "../lib/bookingValidation";

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("validateStep3 — fixed branch (regression)", () => {
  it("accepts complete fixed booking", () => {
    const errs = validateStep3({
      bookingKind: "fixed",
      photographer: { key: "any" },
      date: "2026-12-01",
      time: "10:00",
    });
    expect(errs).toEqual([]);
  });

  it("rejects fixed booking without photographer", () => {
    const errs = validateStep3({
      bookingKind: "fixed",
      photographer: null,
      date: "2026-12-01",
      time: "10:00",
    });
    expect(errs.map((e) => e.field)).toContain("photographer");
  });

  it("rejects fixed booking without date or time", () => {
    const errs = validateStep3({
      bookingKind: "fixed",
      photographer: { key: "x" },
      date: "",
      time: "",
    });
    expect(errs.map((e) => e.field)).toEqual(expect.arrayContaining(["date", "time"]));
  });
});

describe("validateStep3 — flexible branch", () => {
  it("accepts a deadline tomorrow without earliest", () => {
    const errs = validateStep3({
      bookingKind: "flexible",
      photographer: null,
      date: "",
      time: "",
      deadlineAt: isoInDays(1),
    });
    expect(errs).toEqual([]);
  });

  it("rejects empty deadline", () => {
    const errs = validateStep3({
      bookingKind: "flexible",
      photographer: null,
      date: "",
      time: "",
      deadlineAt: "",
    });
    expect(errs.map((e) => e.field)).toContain("deadlineAt");
  });

  it("rejects deadline today (must be at least tomorrow)", () => {
    const errs = validateStep3({
      bookingKind: "flexible",
      photographer: null,
      date: "",
      time: "",
      deadlineAt: isoInDays(0),
    });
    expect(errs.map((e) => e.field)).toContain("deadlineAt");
  });

  it("rejects earliest >= deadline", () => {
    const deadline = isoInDays(7);
    const errs = validateStep3({
      bookingKind: "flexible",
      photographer: null,
      date: "",
      time: "",
      deadlineAt: deadline,
      flexibleEarliestAt: deadline,
    });
    expect(errs.map((e) => e.field)).toContain("flexibleEarliestAt");
  });

  it("ignores photographer/date/time fields when bookingKind=flexible", () => {
    // Even with empty photographer/date/time, flex should pass with valid deadline.
    const errs = validateStep3({
      bookingKind: "flexible",
      photographer: null,
      date: "",
      time: "",
      deadlineAt: isoInDays(14),
      flexibleEarliestAt: isoInDays(2),
    });
    expect(errs).toEqual([]);
  });
});
