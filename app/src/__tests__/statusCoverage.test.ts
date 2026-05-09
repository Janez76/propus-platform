import { describe, expect, it } from "vitest";
import { STATUS_KEYS, type StatusKey } from "../lib/status";
import { SECTION_ORDER } from "../components/orders/OrderTable";
import { CHIP_GROUPS } from "../pages-legacy/OrdersPage";
import { STATUS_PALETTE, paletteForStatus } from "../components/orders/mapStatusColors";

// Bewusste Auslassungen, die der Wahrheitsmatrix nicht angehoeren:
// - chip groups: alle StatusKeys muessen ueber genau eine Gruppe erreichbar sein
//   (archived ist hidden-by-default, zaehlt aber als abgedeckt).
// - map palette: completed wird in paletteForStatus auf den done-Bucket gemappt,
//   cancelled+archived bekommen keinen eigenen Pin (Karten-Kontext: Auftraege,
//   die nicht mehr ausgefuehrt werden, sind in der Karten-Ansicht unsichtbar).
const PALETTE_REUSE: Record<StatusKey, StatusKey | null> = {
  pending: "pending",
  provisional: "provisional",
  disposition_offen: "disposition_offen",
  confirmed: "confirmed",
  paused: "paused",
  completed: "done",
  done: "done",
  cancelled: null,
  archived: null,
};

describe("status coverage", () => {
  it("OrderTable.SECTION_ORDER contains every StatusKey", () => {
    const missing = STATUS_KEYS.filter((k) => !SECTION_ORDER.includes(k));
    expect(missing).toEqual([]);
  });

  it("OrdersPage.CHIP_GROUPS members union covers every StatusKey", () => {
    const covered = new Set<StatusKey>();
    for (const group of CHIP_GROUPS) {
      for (const member of group.members) covered.add(member);
    }
    const missing = STATUS_KEYS.filter((k) => !covered.has(k));
    expect(missing).toEqual([]);
  });

  it("each StatusKey resolves to a non-fallback palette unless explicitly excluded", () => {
    for (const key of STATUS_KEYS) {
      const expectedTarget = PALETTE_REUSE[key];
      const palette = paletteForStatus(key);
      if (expectedTarget === null) continue;
      expect(palette.id, `palette mismatch for ${key}`).toBe(expectedTarget);
    }
  });

  it("STATUS_PALETTE entries have unique ids", () => {
    const ids = STATUS_PALETTE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
