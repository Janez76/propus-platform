import { describe, expect, it, vi } from "vitest";
import { createOrdersHandlers } from "@/lib/assistant/tools/orders";

function makeDeps(overrides?: { querySequences?: unknown[][] }) {
  const sequences = overrides?.querySequences ?? [];
  let callIdx = 0;
  return {
    query: vi.fn().mockImplementation(() => Promise.resolve(sequences[callIdx++] ?? [])),
  };
}

describe("validate_booking_order", () => {
  it("lists missing steps for empty input", async () => {
    const deps = makeDeps();
    const handlers = createOrdersHandlers(deps);
    const result = (await handlers.validate_booking_order({}, {
      userId: "u",
      userEmail: "a@b.ch",
    })) as { ready: boolean; missingSteps: string[] };

    expect(result.ready).toBe(false);
    expect(result.missingSteps.length).toBeGreaterThanOrEqual(3);
  });

  it("returns ready when customer, address and services are valid", async () => {
    const deps = makeDeps({
      querySequences: [[{ id: 5 }], [{ key: "jdoe" }]],
    });
    const handlers = createOrdersHandlers(deps);
    const result = (await handlers.validate_booking_order(
      {
        customer_id: 5,
        address: "Bahnhofstrasse 1, 8001 Zürich",
        services: { photography: true },
        photographer_key: "jdoe",
      },
      { userId: "u", userEmail: "a@b.ch" },
    )) as { ready: boolean; missingSteps: string[]; validationErrors: string[] };

    expect(result.ready).toBe(true);
    expect(result.missingSteps).toEqual([]);
    expect(result.validationErrors).toEqual([]);
  });
});
