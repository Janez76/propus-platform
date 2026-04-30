import { describe, expect, it } from "vitest";
import {
  clampTierToMax,
  parseAssistantModelMode,
  parseAssistantModelModeFromRequest,
  resolveAssistantModelForRequest,
} from "@/lib/assistant/assistant-model-mode";
import { MODEL_IDS } from "@/lib/assistant/model-router";

describe("assistant-model-mode", () => {
  describe("parseAssistantModelMode", () => {
    it("accepts valid modes", () => {
      expect(parseAssistantModelMode("auto")).toBe("auto");
      expect(parseAssistantModelMode("SONNET")).toBe("sonnet");
      expect(parseAssistantModelMode(" opus ")).toBe("opus");
    });
    it("defaults to auto", () => {
      expect(parseAssistantModelMode(null)).toBe("auto");
      expect(parseAssistantModelMode("")).toBe("auto");
      expect(parseAssistantModelMode("gpt")).toBe("auto");
    });
  });

  describe("parseAssistantModelModeFromRequest", () => {
    it("prefers header over body", () => {
      expect(parseAssistantModelModeFromRequest("opus", "sonnet")).toBe("opus");
    });
    it("uses body when header empty", () => {
      expect(parseAssistantModelModeFromRequest(null, "sonnet")).toBe("sonnet");
    });
  });

  describe("clampTierToMax", () => {
    it("caps opus to sonnet max", () => {
      expect(clampTierToMax("opus", "sonnet")).toBe("sonnet");
    });
    it("keeps sonnet when max allows", () => {
      expect(clampTierToMax("sonnet", "opus")).toBe("sonnet");
    });
    it("caps sonnet to haiku max", () => {
      expect(clampTierToMax("sonnet", "haiku")).toBe("haiku");
    });
  });

  describe("resolveAssistantModelForRequest", () => {
    it("auto: no force model non-streaming; streaming uses admin default when not sonnet", () => {
      const r = resolveAssistantModelForRequest({
        clientMode: "auto",
        settingsAutoEscalation: true,
        settingsMaxModelTier: "opus",
      });
      expect(r.nonStreamingForceModel).toBeUndefined();
      expect(r.streamingExplicitModel).toBeUndefined();
      expect(r.autoEscalation).toBe(true);
      expect(r.effectiveMode).toBe("auto");
    });

    it("auto: applies env cap to max tier", () => {
      const r = resolveAssistantModelForRequest({
        clientMode: "auto",
        settingsAutoEscalation: true,
        settingsMaxModelTier: "opus",
        envMaxModelTier: "sonnet",
      });
      expect(r.maxModelTier).toBe("sonnet");
    });

    it("sonnet fix: fixed model + no escalation", () => {
      const r = resolveAssistantModelForRequest({
        clientMode: "sonnet",
        settingsAutoEscalation: true,
        settingsMaxModelTier: "opus",
      });
      expect(r.nonStreamingForceModel).toBe(MODEL_IDS.sonnet);
      expect(r.streamingExplicitModel).toBe(MODEL_IDS.sonnet);
      expect(r.autoEscalation).toBe(false);
      expect(r.maxModelTier).toBe("sonnet");
    });

    it("opus fix capped by max sonnet", () => {
      const r = resolveAssistantModelForRequest({
        clientMode: "opus",
        settingsAutoEscalation: true,
        settingsMaxModelTier: "sonnet",
      });
      expect(r.nonStreamingForceModel).toBe(MODEL_IDS.sonnet);
      expect(r.streamingExplicitModel).toBe(MODEL_IDS.sonnet);
      expect(r.autoEscalation).toBe(false);
      expect(r.effectiveMode).toBe("sonnet");
      expect(r.notice).toContain("begrenzt");
    });
  });
});
