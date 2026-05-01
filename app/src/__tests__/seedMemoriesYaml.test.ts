import { describe, expect, it } from "vitest";
import { parseSeedMemoriesYaml } from "../../scripts/seed-memories";
import { validateMemoryBody } from "@/lib/assistant/memory-store";

describe("seed-memories YAML", () => {
  it("parst entries und validiert body", () => {
    const raw = `
version: 1
entries:
  - userId: admin
    body: "Kurzer gültiger Merksatz ohne Geheimnisse."
`;
    const p = parseSeedMemoriesYaml(raw);
    expect(p.entries).toHaveLength(1);
    expect(validateMemoryBody(p.entries[0]!.body)).toBeNull();
  });

  it("lehnt leere Bodies ab", () => {
    const raw = `
entries:
  - userId: 00000000-0000-4000-8000-000000000001
    body: ""
`;
    const p = parseSeedMemoriesYaml(raw);
    expect(p.entries.length).toBe(0);
  });
});
