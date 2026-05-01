import { afterEach, describe, expect, it, vi } from "vitest";

const origUnlimited = process.env.ASSISTANT_UNLIMITED_EMAILS;
const origSuper = process.env.ASSISTANT_SUPERADMIN_EMAILS;

afterEach(() => {
  if (origUnlimited === undefined) delete process.env.ASSISTANT_UNLIMITED_EMAILS;
  else process.env.ASSISTANT_UNLIMITED_EMAILS = origUnlimited;
  if (origSuper === undefined) delete process.env.ASSISTANT_SUPERADMIN_EMAILS;
  else process.env.ASSISTANT_SUPERADMIN_EMAILS = origSuper;
  vi.resetModules();
});

describe("assistant access-env", () => {
  it("isAssistantDailyLimitExempt respects ASSISTANT_UNLIMITED_EMAILS (case-insensitive)", async () => {
    process.env.ASSISTANT_UNLIMITED_EMAILS = "js@propus.ch, a@b.ch ";
    const { isAssistantDailyLimitExempt } = await import("@/lib/assistant/access-env");
    expect(isAssistantDailyLimitExempt("JS@propus.ch")).toBe(true);
    expect(isAssistantDailyLimitExempt("a@b.ch")).toBe(true);
    expect(isAssistantDailyLimitExempt("other@propus.ch")).toBe(false);
  });

  it("isAssistantSettingsSuperAdmin: role super_admin", async () => {
    const { isAssistantSettingsSuperAdmin } = await import("@/lib/assistant/access-env");
    expect(
      isAssistantSettingsSuperAdmin({
        role: "super_admin",
        userKey: "x@y.ch",
        userName: "X",
        isImpersonating: false,
      }),
    ).toBe(true);
    expect(
      isAssistantSettingsSuperAdmin({
        role: "admin",
        userKey: "js@propus.ch",
        userName: "J",
        isImpersonating: false,
      }),
    ).toBe(false);
  });

  it("isAssistantSettingsSuperAdmin: ASSISTANT_SUPERADMIN_EMAILS", async () => {
    process.env.ASSISTANT_SUPERADMIN_EMAILS = "js@propus.ch";
    const { isAssistantSettingsSuperAdmin } = await import("@/lib/assistant/access-env");
    expect(
      isAssistantSettingsSuperAdmin({
        role: "admin",
        userKey: "js@propus.ch",
        userName: "J",
        isImpersonating: false,
      }),
    ).toBe(true);
  });
});
