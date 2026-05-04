import { Pool } from "pg";
import { logger } from "./logger";

declare global {
  // Prevents multiple pool instances in Next.js hot reload (dev)
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function createPool(): Pool {
  const searchPath =
    process.env.DB_SEARCH_PATH || "booking,tour_manager,core,public";

  const sslEnv = process.env.DATABASE_URL || "";
  const needsSsl =
    sslEnv.includes("sslmode=require") ||
    sslEnv.includes("sslmode=verify") ||
    sslEnv.includes("ssl=true");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    options: `-c search_path=${searchPath}`,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (err) => {
    logger.error("Unexpected PostgreSQL pool error", { error: err.message });
  });

  return pool;
}

// Singleton pool -- reuse across hot reloads in development
export const pool: Pool =
  process.env.NODE_ENV === "production"
    ? createPool()
    : (global._pgPool ?? (global._pgPool = createPool()));

/**
 * Querier ist alles, gegen das `.query(text, values)` aufgerufen werden kann
 * — sowohl der Pool selbst (auto-acquire) als auch ein bereits acquirter
 * PoolClient (laeuft innerhalb einer Transaktion).
 *
 * Dadurch koennen Repos und Server-Actions wahlweise im eigenen Verbindungs-
 * pool laufen oder in eine vom Caller geoeffnete Transaktion eingehaengt
 * werden — siehe withTransaction + saveOrderAllSections (Bug-Hunt T02 HIGH:
 * Bulk-Save Multi-Step ohne Tx).
 */
export type Querier = Pool | import("pg").PoolClient;

/** Execute a query and return rows. Optional `tx` haengt die Query in eine bestehende Transaktion ein. */
export async function query<T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
  tx?: Querier,
): Promise<T[]> {
  const querier = tx ?? pool;
  const result = await querier.query(text, values);
  return result.rows as T[];
}

/** Execute a query and return the first row or null. */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
  tx?: Querier,
): Promise<T | null> {
  const rows = await query<T>(text, values, tx);
  return rows[0] ?? null;
}

/**
 * Run multiple queries in a transaction.
 *
 * - Wird `existing` uebergeben, laeuft `fn` ohne neue BEGIN/COMMIT direkt
 *   gegen den vorhandenen Client. Damit lassen sich Repos und Sub-Actions
 *   in eine outer-Transaktion einhaengen.
 * - Ohne `existing` werden BEGIN/COMMIT/ROLLBACK selbst gemanaged.
 */
export async function withTransaction<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>,
  existing?: import("pg").PoolClient | null,
): Promise<T> {
  if (existing) {
    return fn(existing);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
