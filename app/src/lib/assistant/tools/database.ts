import { pool } from "@/lib/db";
import type { ToolContext, ToolDefinition, ToolHandler } from "./index";

const DANGEROUS_PATTERN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|CALL)\b/i;
const MAX_ROWS = 100;
const STATEMENT_TIMEOUT_MS = 5000;

export function isSafeSelectQuery(sql: string): { safe: boolean; reason?: string } {
  const stripped = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();

  if (!stripped) return { safe: false, reason: "Leere Abfrage" };

  if (DANGEROUS_PATTERN.test(stripped)) {
    const match = stripped.match(DANGEROUS_PATTERN);
    return { safe: false, reason: `Verbotene Anweisung: ${match?.[0]?.toUpperCase()}` };
  }

  if (!/^\s*SELECT\b/i.test(stripped) && !/^\s*WITH\b/i.test(stripped)) {
    return { safe: false, reason: "Nur SELECT- und WITH-Abfragen erlaubt" };
  }

  return { safe: true };
}

export function ensureLimit(sql: string): string {
  const stripped = sql.replace(/;+\s*$/, "").trim();
  if (/\bLIMIT\s+\d+/i.test(stripped)) return stripped;
  return `${stripped} LIMIT ${MAX_ROWS}`;
}

export const databaseTools: ToolDefinition[] = [
  {
    name: "query_database",
    description:
      "Führt eine schreibgeschützte SQL-Abfrage aus (nur SELECT). Nur für super_admin. Max. 100 Zeilen, 5s Timeout.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL SELECT-Abfrage" },
        params: {
          type: "array",
          description: "Optionale Parameter ($1, $2, …)",
          items: {},
        },
      },
      required: ["sql"],
    },
  },
];

export function createDatabaseHandlers(): Record<string, ToolHandler> {
  return {
    query_database: async (input: Record<string, unknown>, ctx: ToolContext) => {
      if (ctx.role !== "super_admin") {
        return { error: "Nur super_admin darf SQL-Abfragen ausführen." };
      }

      const rawSql = typeof input.sql === "string" ? input.sql.trim() : "";
      if (!rawSql) return { error: "sql ist erforderlich" };

      const check = isSafeSelectQuery(rawSql);
      if (!check.safe) return { error: check.reason };

      const safeSql = ensureLimit(rawSql);
      const params = Array.isArray(input.params) ? input.params : [];

      const client = await pool.connect();
      try {
        await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}'`);
        const result = await client.query(safeSql, params);
        await client.query("RESET statement_timeout");

        const rows = result.rows.slice(0, MAX_ROWS);
        const serialized = JSON.stringify(rows);
        const truncated = serialized.length > 50_000
          ? serialized.slice(0, 50_000) + `\n… Ergebnis gekürzt (${serialized.length} Zeichen).`
          : serialized;

        return {
          rowCount: rows.length,
          fields: result.fields?.map((f) => f.name) || [],
          rows: JSON.parse(truncated.length <= 50_000 ? serialized : serialized.slice(0, 50_000)),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("statement timeout")) {
          return { error: "Abfrage hat das Zeitlimit von 5 Sekunden überschritten." };
        }
        return { error: `SQL-Fehler: ${message}`.slice(0, 500) };
      } finally {
        try { await client.query("RESET statement_timeout"); } catch { /* ignore */ }
        client.release();
      }
    },
  };
}

export const databaseHandlers = createDatabaseHandlers();
