import { describe, expect, it } from "vitest";
import { planMatterportUnlink } from "@/app/(admin)/orders/[id]/verknuepfungen/matterport-linking";

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
});
