import { describe, it, expect } from "vitest";
import { scorePassword } from "../lib/passwordStrength";

describe("scorePassword", () => {
  it("returns 0 for empty string", () => {
    expect(scorePassword("")).toBe(0);
  });

  it("returns 0 for short lowercase-only password", () => {
    expect(scorePassword("abc")).toBe(0);
  });

  it("returns 1 when only length >= 10 is satisfied", () => {
    expect(scorePassword("abcdefghij")).toBe(1);
  });

  it("returns 2 for length + mixed case", () => {
    expect(scorePassword("Abcdefghij")).toBe(2);
  });

  it("returns 3 for length + mixed case + digit", () => {
    expect(scorePassword("Abcdefgh1j")).toBe(3);
  });

  it("returns 4 for length + mixed case + digit + special char", () => {
    expect(scorePassword("Abcdefgh1!")).toBe(4);
  });

  it("awards length point at exactly 10 chars", () => {
    expect(scorePassword("aaaaaaaaaa")).toBe(1);
  });

  it("does not award length point at 9 chars", () => {
    expect(scorePassword("aaaaaaaaa")).toBe(0);
  });

  it("treats unicode letters as special chars (matches [^A-Za-z0-9])", () => {
    expect(scorePassword("Abcdefghi1ä")).toBe(4);
  });

  it("short mixed-case still awards mixed-case point", () => {
    expect(scorePassword("Ab")).toBe(1);
  });

  it("only-digits long scores 2 (length + digit)", () => {
    expect(scorePassword("1234567890")).toBe(2);
  });

  it("space counts as special char", () => {
    expect(scorePassword("Abcdef gh1")).toBe(4);
  });
});
