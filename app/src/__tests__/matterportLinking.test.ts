import { describe, expect, it } from "vitest";
import { addSubscriptionMonths, planMatterportUnlink, toIsoDate } from "@/app/(admin)/orders/[id]/verknuepfungen/matterport-linking";

describe("planMatterportUnlink", () => {
  it("deletes auto-created Matterport stubs without dependencies", () => {
    expect(
      planMatterportUnlink([
        { id: 365, autoCreated: true, hasDependencies: false },
        { id: 366, autoCreated: true, hasDependencies: true },
        { id: 12, autoCreated: false, hasDependencies: false },
      ]),
    ).toEqual({
      deleteIds: [365],
      unlinkIds: [366, 12],
      resetIds: [366],
    });
  });

  it("computes the initial six-month term for auto-created Matterport stubs", () => {
    const createdAt = new Date("2026-04-30T21:00:53.857Z");

    expect(toIsoDate(addSubscriptionMonths(createdAt))).toBe("2026-10-30");
  });
});
