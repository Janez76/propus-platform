import { describe, it, expect } from "vitest";
import { phoneCH, swissZip, timeHHmm, isoDate } from "@/lib/validators/common";

describe("phoneCH", () => {
  it("akzeptiert +41", () => {
    expect(phoneCH.safeParse("+41 79 123 45 67").success).toBe(true);
  });
  it("akzeptiert 079", () => {
    expect(phoneCH.safeParse("079 123 45 67").success).toBe(true);
  });
  it("erlaubt leer", () => {
    expect(phoneCH.safeParse("").success).toBe(true);
  });
});

describe("swissZip", () => {
  it("4 Ziffern", () => {
    expect(swissZip.safeParse("8000").success).toBe(true);
  });
  it("lehnt 5", () => {
    expect(swissZip.safeParse("80000").success).toBe(false);
  });
});

describe("timeHHmm", () => {
  it("15-Min", () => {
    expect(timeHHmm.safeParse("10:15").success).toBe(true);
  });
  it("lehnt 10:20", () => {
    expect(timeHHmm.safeParse("10:20").success).toBe(false);
  });
});

describe("isoDate", () => {
  it("format", () => {
    expect(isoDate.safeParse("2026-04-22").success).toBe(true);
  });
});
