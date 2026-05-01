/**
 * Lädt YAML-Einträge und legt Erinnerungen an (admin_created), idempotent nach body+user.
 * ASSISTANT_SEED_USER_ID erforderlich, wenn userId in YAML nicht bereits eine UUID ist.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { queryOne } from "../src/lib/db";
import { createMemory, validateMemoryBody } from "../src/lib/assistant/memory-store";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function isCliEntry(): boolean {
  const script = path.normalize(fileURLToPath(import.meta.url));
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.normalize(argv1) === script;
}
const DEFAULT_FILE = path.join(SCRIPT_DIR, "seed-memories.yaml");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SeedEntry = { userId: string; body: string };

export type SeedFile = {
  version?: number;
  entries: SeedEntry[];
};

export function parseSeedMemoriesYaml(raw: string): SeedFile {
  const data = yaml.load(raw) as unknown;
  if (!data || typeof data !== "object") throw new Error("YAML: Root muss ein Objekt sein");
  const entries = (data as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) throw new Error("YAML: entries[] fehlt");
  const out: SeedEntry[] = [];
  for (const row of entries) {
    if (!row || typeof row !== "object") continue;
    const r = row as { userId?: unknown; body?: unknown };
    const userId = typeof r.userId === "string" ? r.userId.trim() : "";
    const body = typeof r.body === "string" ? r.body.trim() : "";
    if (!userId || !body) continue;
    out.push({ userId, body });
  }
  return { entries: out };
}

export function resolveSeedUserId(declared: string): string {
  const t = declared.trim();
  if (UUID_RE.test(t)) return t;
  const fromEnv = process.env.ASSISTANT_SEED_USER_ID?.trim();
  if (!fromEnv || !UUID_RE.test(fromEnv)) {
    throw new Error(
      "ASSISTANT_SEED_USER_ID muss eine UUID sein, wenn YAML userId kein UUID ist (z. B. userId: admin).",
    );
  }
  return fromEnv;
}

async function memoryExists(userId: string, body: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id
     FROM tour_manager.assistant_memories
     WHERE user_id = $1 AND body = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [userId, body],
  );
  return Boolean(row?.id);
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  const rawPath = fileArg ? fileArg.slice("--file=".length).trim() : "";
  const filePath =
    rawPath.length > 0 ? (path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath)) : DEFAULT_FILE;

  if (!fs.existsSync(filePath)) {
    console.error(`Datei fehlt: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseSeedMemoriesYaml(raw);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const e of parsed.entries) {
    const err = validateMemoryBody(e.body);
    if (err) {
      console.error(`Ungültig: ${err} — ${e.body.slice(0, 60)}`);
      errors += 1;
      continue;
    }

    let userId: string;
    try {
      userId = resolveSeedUserId(e.userId);
    } catch (ex) {
      console.error(ex instanceof Error ? ex.message : ex);
      process.exit(1);
    }

    const exists = await memoryExists(userId, e.body.trim());
    if (exists) {
      skipped += 1;
      console.log(`skip (exists): ${e.body.slice(0, 72)}…`);
      continue;
    }

    if (dry) {
      console.log(`[dry-run] would create for ${userId}: ${e.body.slice(0, 80)}…`);
      created += 1;
      continue;
    }

    try {
      await createMemory(userId, e.body.trim(), "admin_created");
      created += 1;
      console.log(`created: ${e.body.slice(0, 72)}…`);
    } catch (ex) {
      errors += 1;
      console.error(ex instanceof Error ? ex.message : ex);
    }
  }

  console.log(`Fertig: ${created} angelegt, ${skipped} übersprungen, ${errors} Fehler.`);
  if (errors > 0) process.exit(1);
}

if (isCliEntry()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
