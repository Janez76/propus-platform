import { readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = process.cwd();

function readAppFile(path: string) {
  return readFileSync(join(appRoot, path), "utf8");
}

describe("assistant theme integration", () => {
  it("uses semantic admin tokens instead of hardcoded dark/light surfaces", () => {
    const source = [
      readAppFile("src/app/(admin)/assistant/_components/ConversationView.tsx"),
      readAppFile("src/app/(admin)/assistant/_components/VoiceButton.tsx"),
      readAppFile("src/components/global/FloatingVoiceButton.tsx"),
    ].join("\n");

    expect(source).not.toMatch(/#111217|bg-black\/55|text-black|text-red-300/);
    expect(source).toContain("var(--surface)");
    expect(source).toMatch(/var\(--surface-card/);
    expect(source).toContain("var(--text-main)");
    expect(source).toContain("var(--text-subtle)");
    expect(source).toContain("var(--border-soft)");
    expect(source).toContain("var(--accent)");
  });

  it("keeps the assistant page clear of the fixed sidebar", () => {
    const source = readAppFile("src/app/(admin)/assistant/layout.tsx");

    expect(source).toContain("--assistant-sidebar-offset:272px");
    expect(source).not.toContain("lg:pl-[calc(272px+1.5rem)]");
  });
});
