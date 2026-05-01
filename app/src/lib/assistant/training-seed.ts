import fs from "fs";
import path from "path";
import { parseSeedMemoriesYaml } from "../../../scripts/seed-memories";
import { createMemory, validateMemoryBody } from "@/lib/assistant/memory-store";
import { queryOne } from "@/lib/db";

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

export async function runAssistantMemorySeed(input: {
  targetUserId: string;
  dryRun: boolean;
  yamlPath?: string;
}): Promise<{ created: number; skipped: number; errors: number }> {
  const yamlPath =
    input.yamlPath && fs.existsSync(input.yamlPath)
      ? input.yamlPath
      : path.join(process.cwd(), "scripts", "seed-memories.yaml");

  if (!fs.existsSync(yamlPath)) {
    throw new Error(`Seed-Datei fehlt: ${yamlPath}`);
  }

  const raw = fs.readFileSync(yamlPath, "utf8");
  const parsed = parseSeedMemoriesYaml(raw);
  const targetUserId = input.targetUserId.trim();

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const e of parsed.entries) {
    const err = validateMemoryBody(e.body);
    if (err) {
      errors += 1;
      continue;
    }
    const body = e.body.trim();
    const exists = await memoryExists(targetUserId, body);
    if (exists) {
      skipped += 1;
      continue;
    }
    if (input.dryRun) {
      created += 1;
      continue;
    }
    try {
      await createMemory(targetUserId, body, "admin_created");
      created += 1;
    } catch {
      errors += 1;
    }
  }

  return { created, skipped, errors };
}
