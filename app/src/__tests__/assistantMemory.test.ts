import { describe, expect, it } from "vitest";
import { rankMemoryBodiesForPrompt, tokenizeForMatch, validateMemoryBody } from "@/lib/assistant/memory-store";

describe("validateMemoryBody", () => {
  it("rejects empty body", () => {
    expect(validateMemoryBody("")).toBeTruthy();
    expect(validateMemoryBody("   ")).toBeTruthy();
  });

  it("rejects likely secrets", () => {
    expect(validateMemoryBody("password: abc")).toBeTruthy();
    expect(validateMemoryBody("api_key=xyz")).toBeTruthy();
  });

  it("accepts normal memo text", () => {
    expect(validateMemoryBody("Kunde bevorzugt Termine am Vormittag.")).toBeNull();
  });
});

describe("tokenizeForMatch", () => {
  it("drops short tokens", () => {
    const s = tokenizeForMatch("ab cd efghij");
    expect(s.has("efghij")).toBe(true);
    expect(s.has("ab")).toBe(false);
  });
});

describe("rankMemoryBodiesForPrompt", () => {
  it("prioritizes bodies sharing keywords with the user message", () => {
    const rows = [
      { id: "1", body: "Generische Notiz ohne Bezug.", updatedAt: "2026-05-01T10:00:00.000Z" },
      { id: "2", body: "Immobilien in Zürich immer mit Drohne.", updatedAt: "2026-05-01T09:00:00.000Z" },
      { id: "3", body: "Zürich Shootings: Checkliste beachten.", updatedAt: "2026-05-01T08:00:00.000Z" },
    ];
    const ranked = rankMemoryBodiesForPrompt(rows, "Was gilt für Zürich Drohnen?", 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toContain("Zürich");
    expect(ranked[1]).toContain("Zürich");
  });
});
