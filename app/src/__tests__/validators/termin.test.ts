import { describe, it, expect } from "vitest";
import { terminFormSchema } from "@/lib/validators/orders/termin";

describe("terminFormSchema", () => {
  it("akzeptiert gültige Werte", () => {
    const r = terminFormSchema.safeParse({
      orderNo: 1,
      scheduleDate: "2026-04-22",
      scheduleTime: "10:15",
      durationMin: 60,
      status: "pending",
      photographerKey: null,
    });
    expect(r.success).toBe(true);
  });
  it("lehnt falsches 15-Min-Raster", () => {
    const r = terminFormSchema.safeParse({
      orderNo: 1,
      scheduleDate: "2026-04-22",
      scheduleTime: "10:20",
      durationMin: 60,
      status: "pending",
    });
    expect(r.success).toBe(false);
  });
  it("lehnt Dauer < 15", () => {
    const r = terminFormSchema.safeParse({
      orderNo: 1,
      scheduleDate: "2026-04-22",
      scheduleTime: "10:00",
      durationMin: 10,
      status: "pending",
    });
    expect(r.success).toBe(false);
  });
});
