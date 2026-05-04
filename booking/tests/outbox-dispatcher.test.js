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
      const due = rows
        .filter((r) => r.status === "pending" && new Date(r.next_attempt_at).getTime() <= now)
        .sort((a, b) => new Date(a.next_attempt_at) - new Date(b.next_attempt_at));
      return { rows: due.slice(0, 1) };
    }
    if (norm.includes("UPDATE booking.order_outbox") && norm.includes("SET status = 'in_progress'")) {
      const id = params[0];
      const r = rows.find((x) => x.id === id);
      if (r) r.status = "in_progress";
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

test("backoffMs is monotonically non-decreasing and capped", () => {
  const a = backoffMs(0);
  const b = backoffMs(1);
  const c = backoffMs(2);
  const d = backoffMs(99);
  assert.ok(a <= b && b <= c);
  assert.equal(d, backoffMs(4));
});

test("registry rejects non-function handlers", () => {
  const r = createRegistry();
  assert.throws(() => r.register("x", "not a function"), TypeError);
});
