import { describe, it, expect } from "vitest";
import { suggestSplitName } from "@/lib/nameSplit";

describe("suggestSplitName", () => {
  it("splittet 'Richard A. Lüdi' im Nachname-Feld", () => {
    const r = suggestSplitName("", "Richard A. Lüdi");
    expect(r).toEqual({ first: "Richard", last: "A. Lüdi" });
  });
  it("gibt null wenn Vorname gesetzt", () => {
    expect(suggestSplitName("Hans", "Lüdi")).toBeNull();
  });
});
