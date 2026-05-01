import { describe, expect, it } from "vitest";
import { anonymizeReplayText } from "@/lib/assistant/replay-anonymize";

describe("anonymizeReplayText", () => {
  it("ersetzt E-Mail-Adressen", () => {
    expect(anonymizeReplayText("Mail an office@propus.ch bitte")).toBe("Mail an [email] bitte");
  });

  it("maskiert typische CH-Nummern grob", () => {
    const s = anonymizeReplayText("Ruf 079 123 45 67 an");
    expect(s).toContain("[phone]");
    expect(s).not.toMatch(/079\s*123/);
  });
});
