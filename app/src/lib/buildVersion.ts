import fs from "fs";
import path from "path";

const BUILD_ID_FILE_CANDIDATES = [
  process.env.BUILD_ID_FILE,
  // Runtime-Datei aus dem Platform-Container bevorzugen, damit reine Versionsbump-Deploys
  // nicht den kompletten Next.js-Build invalidieren muessen.
  path.join(process.cwd(), "platform", "frontend", "public", "VERSION"),
  path.join(process.cwd(), "public", "VERSION"),
  path.join(process.cwd(), "nextjs", "public", "VERSION"),
  path.join(process.cwd(), "app", "public", "VERSION"),
  "/opt/buchungstool/VERSION",
].filter(Boolean) as string[];

export function getBuildId(): string {
  for (const candidate of BUILD_ID_FILE_CANDIDATES) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8").trim();
      if (raw) return raw;
    } catch {
      // Try the next candidate.
    }
  }

  return process.env.BUILD_ID || "dev";
}
