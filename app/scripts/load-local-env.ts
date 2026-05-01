import path from "path";
import { config } from "dotenv";
import { fileURLToPath } from "url";

/** Lädt `app/.env.local` und `app/.env` (wie Next.js). Überschreibt keine bereits gesetzten Umgebungsvariablen. */
export function loadAppEnv(scriptImportMetaUrl: string): void {
  const scriptDir = path.dirname(fileURLToPath(scriptImportMetaUrl));
  const appRoot = path.join(scriptDir, "..");
  config({ path: path.join(appRoot, ".env.local") });
  config({ path: path.join(appRoot, ".env") });
}
