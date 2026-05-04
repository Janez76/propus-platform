const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRegistry,
  processOutboxBatch,
  backoffMs,
} = require("../lib/outbox-dispatcher");

/**
 * In-Memory-Mock von pg.Pool, das genug von der Outbox-Tabelle simuliert
 * um den Dispatcher End-to-End zu testen — ohne echte Postgres-Verbindung.
 *
 * Verwaltet ein Array von Outbox-Rows; SELECT FOR UPDATE SKIP LOCKED
 * ist Single-Threaded okay als plain Array-Filter (die Tests laufen nicht
 * parallel innerhalb einer Tx).
 */
function createMockPool(initialRows = []) {
  const rows = initialRows.map((r, idx) => ({
    id: r.id ?? idx + 1,
    order_no: r.order_no ?? 100 + idx,
    kind: r.kind,
    payload: r.payload || {},
    status: r.status || "pending",
    attempts: r.attempts || 0,
    max_attempts: r.max_attempts || 5,
    last_error: r.last_error || null,
    next_attempt_at: r.next_attempt_at || new Date(Date.now() - 1000),
    processed_at: null,
  }));
  let inTx = false;

  function execute(sql, params = []) {
    const norm = String(sql).replace(/\s+/g, " ").trim();
    if (norm === "BEGIN") { inTx = true; return { rows: [] }; }
    if (norm === "COMMIT") { inTx = false; return { rows: [] }; }
    if (norm === "ROLLBACK") { inTx = false; return { rows: [] }; }
    if (norm.startsWith("SELECT id, order_no, kind, payload, attempts, max_attempts FROM booking.order_outbox")) {
      const now = Date.now();
      const staleMs = 10 * 60_000;
      const due = rows
        .filter((r) => {
          if (r.status === "pending" && new Date(r.next_attempt_at).getTime() <= now) return true;
          if (r.status === "in_progress" && r.updated_at && now - new Date(r.updated_at).getTime() > staleMs) return true;
          return false;
        })
        .sort((a, b) => new Date(a.next_attempt_at) - new Date(b.next_attempt_at));
      return { rows: due.slice(0, 1) };
    }
    if (norm.includes("UPDATE booking.order_outbox") && norm.includes("SET status = 'in_progress'")) {
      const id = params[0];
      const r = rows.find((x) => x.id === id);
      if (r) {
        r.status = "in_progress";
        r.updated_at = new Date();
      }
      return { rows: [] };
    }
    if (norm.includes("SET status = 'done'")) {
      const id = params[0];
      const r = rows.find((x) => x.id === id);
      if (r) {
        r.status = "done";
        r.processed_at = new Date();
        r.last_error = null;
      }
      return { rows: [] };
    }
    if (norm.includes("SET status = 'failed'") && norm.includes("attempts = $2") && norm.includes("last_error = $3")) {
      // failed mit attempts (max_attempts erreicht)
      const [id, attempts, err] = params;
      const r = rows.find((x) => x.id === id);
      if (r) { r.status = "failed"; r.attempts = attempts; r.last_error = err; }
      return { rows: [] };
    }
    if (norm.includes("SET status = 'failed'") && norm.includes("last_error = $2")) {
      // unbekannter kind: failed ohne attempts-Update
      const [id, err] = params;
      const r = rows.find((x) => x.id === id);
      if (r) { r.status = "failed"; r.last_error = err; }
      return { rows: [] };
    }
    if (norm.includes("SET status = 'pending'") && norm.includes("next_attempt_at = NOW()")) {
      const [id, attempts, err, ms] = params;
      const r = rows.find((x) => x.id === id);
      if (r) {
        r.status = "pending";
        r.attempts = attempts;
        r.last_error = err;
        r.next_attempt_at = new Date(Date.now() + ms);
      }
      return { rows: [] };
    }
    return { rows: [] };
  }

  const client = {
    query: async (sql, params) => execute(sql, params),
    release: () => {},
  };

  return {
    rows,
    inTx: () => inTx,
    connect: async () => client,
    query: async (sql, params) => execute(sql, params),
  };
}

const silentLog = { log: () => {}, warn: () => {}, error: () => {} };

test("processOutboxBatch dispatches a pending row to its handler", async () => {
  const pool = createMockPool([
    { id: 1, kind: "noop", payload: { x: 1 } },
  ]);
  const calls = [];
  const registry = createRegistry();
  registry.register("noop", async (ctx) => {
    calls.push({ id: ctx.id, payload: ctx.payload });
  });

  const stats = await processOutboxBatch({ pool, registry, batchSize: 5, log: silentLog });

  assert.equal(stats.processed, 1);
  assert.equal(stats.succeeded, 1);
  assert.equal(stats.failed, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 1);
  assert.deepEqual(calls[0].payload, { x: 1 });
  assert.equal(pool.rows[0].status, "done");
});

test("handler error reschedules row with backoff (retry)", async () => {
  const pool = createMockPool([
    { id: 7, kind: "flaky", attempts: 0, max_attempts: 3 },
  ]);
  const registry = createRegistry();
  registry.register("flaky", async () => {
    throw new Error("boom");
  });

  const stats = await processOutboxBatch({ pool, registry, batchSize: 5, log: silentLog });

  assert.equal(stats.retried, 1);
  assert.equal(stats.failed, 0);
  assert.equal(pool.rows[0].status, "pending");
  assert.equal(pool.rows[0].attempts, 1);
  assert.match(String(pool.rows[0].last_error), /boom/);
  assert.ok(new Date(pool.rows[0].next_attempt_at).getTime() > Date.now());
});

test("handler error after max_attempts marks row as failed", async () => {
  const pool = createMockPool([
    { id: 9, kind: "broken", attempts: 4, max_attempts: 5 },
  ]);
  const registry = createRegistry();
  registry.register("broken", async () => {
    throw new Error("permanent");
  });

  const stats = await processOutboxBatch({ pool, registry, batchSize: 5, log: silentLog });

  assert.equal(stats.failed, 1);
  assert.equal(stats.retried, 0);
  assert.equal(pool.rows[0].status, "failed");
  assert.equal(pool.rows[0].attempts, 5);
  assert.match(String(pool.rows[0].last_error), /permanent/);
});

test("unknown handler kind marks row as failed", async () => {
  const pool = createMockPool([
    { id: 11, kind: "unregistered" },
  ]);
  const registry = createRegistry();
  // kein Handler registriert

  const stats = await processOutboxBatch({ pool, registry, batchSize: 5, log: silentLog });

  assert.equal(stats.failed, 1);
  assert.equal(pool.rows[0].status, "failed");
  assert.match(String(pool.rows[0].last_error), /Unbekannter Handler-Kind/);
});

test("processes multiple pending rows up to batchSize", async () => {
  const pool = createMockPool([
    { id: 1, kind: "noop", payload: { i: 1 } },
    { id: 2, kind: "noop", payload: { i: 2 } },
    { id: 3, kind: "noop", payload: { i: 3 } },
  ]);
  const seen = [];
  const registry = createRegistry();
  registry.register("noop", async (ctx) => {
    seen.push(ctx.payload.i);
  });

  const stats = await processOutboxBatch({ pool, registry, batchSize: 10, log: silentLog });

  assert.equal(stats.processed, 3);
  assert.equal(stats.succeeded, 3);
  assert.deepEqual(seen.sort(), [1, 2, 3]);
});

test("respects batchSize and stops when queue is empty", async () => {
  const pool = createMockPool([
    { id: 1, kind: "noop" },
  ]);
  const registry = createRegistry();
  registry.register("noop", async () => {});

  const stats = await processOutboxBatch({ pool, registry, batchSize: 100, log: silentLog });

  assert.equal(stats.processed, 1);
});

test("does not pick rows with future next_attempt_at", async () => {
  const pool = createMockPool([
    { id: 1, kind: "noop", next_attempt_at: new Date(Date.now() + 60_000) },
  ]);
  const registry = createRegistry();
  registry.register("noop", async () => {});

  const stats = await processOutboxBatch({ pool, registry, batchSize: 5, log: silentLog });

  assert.equal(stats.processed, 0);
  assert.equal(pool.rows[0].status, "pending");
});

test("backoffMs schedule matches docs (10s, 1m, 5m, 30m, 2h cap)", () => {
  // Konkrete Werte — entdeckt Off-by-one-Verschiebungen sofort
  // (CodeRabbit Nitpick #260).
  assert.equal(backoffMs(0), 10_000);
  assert.equal(backoffMs(1), 60_000);
  assert.equal(backoffMs(2), 5 * 60_000);
  assert.equal(backoffMs(3), 30 * 60_000);
  assert.equal(backoffMs(4), 2 * 60 * 60_000);
  // Cap: alles ab Index 4 bleibt bei 2 h
  assert.equal(backoffMs(99), backoffMs(4));
});

test("registry rejects non-function handlers", () => {
  const r = createRegistry();
  assert.throws(() => r.register("x", "not a function"), TypeError);
});

test("first retry waits ~10s, not 60s (Codex P2 #260)", async () => {
  const pool = createMockPool([
    { id: 1, kind: "flaky", attempts: 0, max_attempts: 5 },
  ]);
  const registry = createRegistry();
  registry.register("flaky", async () => {
    throw new Error("boom");
  });

  const before = Date.now();
  await processOutboxBatch({ pool, registry, batchSize: 1, log: silentLog });

  const r = pool.rows[0];
  assert.equal(r.status, "pending");
  assert.equal(r.attempts, 1);
  const delay = new Date(r.next_attempt_at).getTime() - before;
  // Erste Stufe = 10 s, kleine Toleranz fuer Test-Latency.
  assert.ok(delay >= 9_000 && delay < 30_000, `expected ~10s, got ${delay}ms`);
});

test("reclaims stale in_progress rows (Codex P1 #260)", async () => {
  // Row wurde vor 11 min als in_progress markiert (Worker-Crash Szenario)
  const eleven = new Date(Date.now() - 11 * 60_000);
  const pool = createMockPool([
    {
      id: 1,
      kind: "noop",
      status: "in_progress",
      next_attempt_at: eleven,
    },
  ]);
  pool.rows[0].updated_at = eleven;
  const seen = [];
  const registry = createRegistry();
  registry.register("noop", async (ctx) => {
    seen.push(ctx.id);
  });

  const stats = await processOutboxBatch({ pool, registry, batchSize: 5, log: silentLog });

  assert.equal(stats.processed, 1);
  assert.equal(stats.succeeded, 1);
  assert.equal(seen[0], 1);
  assert.equal(pool.rows[0].status, "done");
});

test("does NOT reclaim recent in_progress rows", async () => {
  const recent = new Date(Date.now() - 30_000); // 30 s alt
  const pool = createMockPool([
    {
      id: 1,
      kind: "noop",
      status: "in_progress",
      next_attempt_at: recent,
    },
  ]);
  pool.rows[0].updated_at = recent;
  const registry = createRegistry();
  registry.register("noop", async () => {});

  const stats = await processOutboxBatch({ pool, registry, batchSize: 5, log: silentLog });

  assert.equal(stats.processed, 0);
  assert.equal(pool.rows[0].status, "in_progress");
});
