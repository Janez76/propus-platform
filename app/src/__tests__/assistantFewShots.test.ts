import { describe, expect, it } from "vitest";
import { FEW_SHOTS, selectFewShots } from "@/lib/assistant/few-shot-examples";
import { buildSystemPrompt } from "@/lib/assistant/system-prompt";

describe("few-shot selection", () => {
  it("rankt Rechnungs-Tippfehler vor Smalltalk", () => {
    const msg = "Hat poleti noch offene Rechnungen?";
    const picked = selectFewShots(msg, 3);
    expect(picked.length).toBeLessThanOrEqual(3);
    expect(picked[0]?.id).toBe("typo-search");
  });

  it("füllt mit weiteren Beispielen auf wenn Overlap gering", () => {
    const picked = selectFewShots("xyz-unknown-token-zz", 3);
    expect(picked).toHaveLength(3);
    const ids = new Set(picked.map((p) => p.id));
    expect(ids.size).toBe(3);
  });

  it("BEISPIELE-Block im Prompt wenn fewShots gesetzt", () => {
    const prompt = buildSystemPrompt({
      userName: "T",
      userEmail: "t@test.local",
      currentTime: "now",
      timezone: "Europe/Zurich",
      fewShots: FEW_SHOTS.slice(0, 2),
    });
    expect(prompt).toContain("BEISPIELE (Muster, kein Wortlaut):");
    expect(prompt).toContain(FEW_SHOTS[0]!.user);
    expect(prompt).toContain("Tool-Plan:");
  });
});
