import { describe, expect, it } from "vitest";
import { selectInitialModel, shouldEscalate, parseTier } from "@/lib/assistant/model-router";

describe("model-router", () => {
  describe("selectInitialModel", () => {
    it("returns haiku for short simple messages", () => {
      expect(selectInitialModel("Hallo", "sonnet")).toBe("haiku");
      expect(selectInitialModel("Zeig mir offene Aufträge", "sonnet")).toBe("haiku");
    });

    it("returns sonnet for long messages (>500 chars)", () => {
      const longMessage = "a".repeat(501);
      expect(selectInitialModel(longMessage, "sonnet")).toBe("sonnet");
    });

    it("returns sonnet for complexity keywords", () => {
      expect(selectInitialModel("Erkläre mir den Unterschied", "sonnet")).toBe("sonnet");
      expect(selectInitialModel("Analysiere die Umsätze", "sonnet")).toBe("sonnet");
      expect(selectInitialModel("Warum ist das so?", "sonnet")).toBe("sonnet");
      expect(selectInitialModel("Zusammenfassung der letzten Woche", "sonnet")).toBe("sonnet");
      expect(selectInitialModel("Plane die nächsten Schritte", "sonnet")).toBe("sonnet");
      expect(selectInitialModel("Vergleiche Tour A und B", "opus")).toBe("sonnet");
    });

    it("returns haiku when maxTier is haiku", () => {
      expect(selectInitialModel("Erkläre mir alles", "haiku")).toBe("haiku");
      expect(selectInitialModel("a".repeat(600), "haiku")).toBe("haiku");
    });

    it("keywords are case-insensitive", () => {
      expect(selectInitialModel("ERKLÄRE mir das", "sonnet")).toBe("sonnet");
      expect(selectInitialModel("Analysiere", "sonnet")).toBe("sonnet");
    });
  });

  describe("shouldEscalate", () => {
    it("returns null when already at max tier", () => {
      expect(shouldEscalate({ finalText: "", toolCallsCount: 0 }, "sonnet", "sonnet")).toBeNull();
      expect(shouldEscalate({ finalText: "", toolCallsCount: 0 }, "opus", "opus")).toBeNull();
    });

    it("escalates haiku to sonnet on uncertainty", () => {
      expect(shouldEscalate(
        { finalText: "Ich weiss nicht genau", toolCallsCount: 0 },
        "haiku",
        "sonnet",
      )).toBe("sonnet");
    });

    it("escalates on 'ich weiß nicht' (with ß)", () => {
      expect(shouldEscalate(
        { finalText: "Das weiß ich leider nicht.", toolCallsCount: 0 },
        "haiku",
        "sonnet",
      )).toBe("sonnet");
    });

    it("escalates on 'kann ich nicht'", () => {
      expect(shouldEscalate(
        { finalText: "Das kann ich leider nicht beantworten", toolCallsCount: 0 },
        "haiku",
        "sonnet",
      )).toBe("sonnet");
    });

    it("escalates on too many tools with short answer", () => {
      expect(shouldEscalate(
        { finalText: "Hmm", toolCallsCount: 5 },
        "haiku",
        "sonnet",
      )).toBe("sonnet");
    });

    it("does NOT escalate on many tools with good answer", () => {
      expect(shouldEscalate(
        { finalText: "Hier sind die Ergebnisse: Tour 1 aktiv, Tour 2 abgelaufen, Tour 3 in Planung. Insgesamt 3 Touren gefunden.", toolCallsCount: 5 },
        "haiku",
        "sonnet",
      )).toBeNull();
    });

    it("escalates on very short empty-like response", () => {
      expect(shouldEscalate(
        { finalText: "Okay.", toolCallsCount: 0 },
        "haiku",
        "sonnet",
      )).toBe("sonnet");
    });

    it("escalates sonnet to opus when maxTier is opus", () => {
      expect(shouldEscalate(
        { finalText: "Ich weiss nicht", toolCallsCount: 0 },
        "sonnet",
        "opus",
      )).toBe("opus");
    });

    it("does NOT escalate sonnet when maxTier is sonnet", () => {
      expect(shouldEscalate(
        { finalText: "Ich weiss nicht", toolCallsCount: 0 },
        "sonnet",
        "sonnet",
      )).toBeNull();
    });

    it("returns null for confident normal responses", () => {
      expect(shouldEscalate(
        { finalText: "Du hast 5 offene Aufträge für heute. Hier die Details: ...", toolCallsCount: 1 },
        "haiku",
        "sonnet",
      )).toBeNull();
    });
  });

  describe("parseTier", () => {
    it("parses valid tiers", () => {
      expect(parseTier("haiku", "sonnet")).toBe("haiku");
      expect(parseTier("sonnet", "haiku")).toBe("sonnet");
      expect(parseTier("opus", "haiku")).toBe("opus");
    });

    it("returns fallback for invalid values", () => {
      expect(parseTier(undefined, "sonnet")).toBe("sonnet");
      expect(parseTier("invalid", "sonnet")).toBe("sonnet");
      expect(parseTier("", "haiku")).toBe("haiku");
    });
  });
});
