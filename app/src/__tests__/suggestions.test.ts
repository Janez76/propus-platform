import { describe, expect, it } from "vitest";
import { extractSuggestions } from "../lib/assistant/suggestions";

describe("extractSuggestions", () => {
  it("returns empty when no marker present", () => {
    const r = extractSuggestions("Lorem ipsum dolor sit amet.");
    expect(r.suggestions).toEqual([]);
    expect(r.displayContent).toBe("Lorem ipsum dolor sit amet.");
  });

  it("parses marker at end of string", () => {
    const r = extractSuggestions(
      "Wer ist der Auftraggeber?\n[[OPTIONS: Annette Doerfel | Bruno Iemmello | Cvacho Jordan]]",
    );
    expect(r.suggestions).toEqual(["Annette Doerfel", "Bruno Iemmello", "Cvacho Jordan"]);
    expect(r.displayContent).toBe("Wer ist der Auftraggeber?");
  });

  it("trims whitespace and skips empty options", () => {
    const r = extractSuggestions("Frage?\n[[OPTIONS:  A  |  | B  ||C]]");
    expect(r.suggestions).toEqual(["A", "B", "C"]);
  });

  it("caps to 6 options", () => {
    const opts = Array.from({ length: 12 }, (_, i) => `Option ${i}`).join(" | ");
    const r = extractSuggestions(`Frage?\n[[OPTIONS: ${opts}]]`);
    expect(r.suggestions).toHaveLength(6);
    expect(r.suggestions[0]).toBe("Option 0");
    expect(r.suggestions[5]).toBe("Option 5");
  });

  it("truncates long options to 80 chars", () => {
    const long = "A".repeat(120);
    const r = extractSuggestions(`Frage?\n[[OPTIONS: ${long}]]`);
    expect(r.suggestions[0]).toMatch(/^A{77}\.\.\.$/);
  });

  it("ignores marker not at end of string", () => {
    const r = extractSuggestions("[[OPTIONS: A | B]] dazwischen");
    expect(r.suggestions).toEqual([]);
    expect(r.displayContent).toBe("[[OPTIONS: A | B]] dazwischen");
  });

  it("tolerates trailing whitespace after marker", () => {
    const r = extractSuggestions("Q?\n[[OPTIONS: Ja | Nein]]   \n");
    expect(r.suggestions).toEqual(["Ja", "Nein"]);
    expect(r.displayContent).toBe("Q?");
  });

  it("handles empty content", () => {
    const r = extractSuggestions("");
    expect(r.suggestions).toEqual([]);
    expect(r.displayContent).toBe("");
  });
});
