const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Test fuer den In-flight-Refresh-Lock in gbp-client.getAccessToken
 * (Bug-Hunt T07 HIGH). Ohne den Lock starten parallele Aufrufer beide
 * einen Token-Refresh — Google rotiert Refresh-Tokens und wuerde den
 * vorherigen invalidieren.
 *
 * Wir laden gbp-client mit gemockten env vars + setzen einen globalen
 * fetch-Stub. Module-State (_accessTokenCache/_refreshInFlight) wird
 * fuer jeden Test frisch via require-cache-reset isoliert.
 */
function loadFreshGbpClient(env = {}) {
  process.env.GBP_CLIENT_ID = env.GBP_CLIENT_ID ?? "test-client";
  process.env.GBP_CLIENT_SECRET = env.GBP_CLIENT_SECRET ?? "test-secret";
  process.env.GBP_REDIRECT_URI = env.GBP_REDIRECT_URI ?? "http://localhost/callback";
  // require-cache invalidieren damit module-level let-Variablen reset werden
  const path = require.resolve("../gbp-client");
  delete require.cache[path];
  return require("../gbp-client");
}

function makePoolStub({ row, onUpdate }) {
  const queries = [];
  return {
    queries,
    query: async (sql, params) => {
      queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
      if (sql.startsWith("SELECT")) return { rows: row ? [row] : [] };
      if (sql.startsWith("UPDATE")) {
        if (onUpdate) onUpdate(params);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

test("getAccessToken: Cache-Hit macht KEINEN fetch", async () => {
  const gbp = loadFreshGbpClient();
  const futureTimestamp = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const pool = makePoolStub({
    row: {
      access_token: "cached_token",
      refresh_token: "rt",
      expires_at: futureTimestamp,
    },
  });
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; return new Response("{}"); };
  try {
    // Erster Call lädt aus DB und cached
    const t1 = await gbp.getAccessToken(pool);
    assert.equal(t1, "cached_token");
    // Zweiter Call sofort danach: Cache-Hit, KEIN DB-/HTTP-Roundtrip
    const t2 = await gbp.getAccessToken(pool);
    assert.equal(t2, "cached_token");
    assert.equal(fetchCalls, 0, "Cache-Hit darf keinen fetch ausloesen");
  } finally {
    delete global.fetch;
  }
});

test("getAccessToken: parallele stale-Refresh-Aufrufe machen NUR EINEN fetch (Lock)", async () => {
  const gbp = loadFreshGbpClient();
  const stalePast = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const pool = makePoolStub({
    row: {
      access_token: "old_token",
      refresh_token: "rt-1",
      expires_at: stalePast,
    },
  });

  let fetchCalls = 0;
  let resolveFetch;
  const fetchPromise = new Promise((res) => { resolveFetch = res; });
  global.fetch = async () => {
    fetchCalls += 1;
    await fetchPromise; // simuliere langsamen Token-Refresh
    return new Response(JSON.stringify({ access_token: "new_token", expires_in: 3600 }), {
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    // 5 parallele Aufrufer
    const calls = Promise.all([
      gbp.getAccessToken(pool),
      gbp.getAccessToken(pool),
      gbp.getAccessToken(pool),
      gbp.getAccessToken(pool),
      gbp.getAccessToken(pool),
    ]);
    // microtask warten lassen damit alle 5 in den Refresh-Pfad einsteigen
    await new Promise((r) => setImmediate(r));
    assert.equal(fetchCalls, 1, "Nur ein Refresh-fetch erwartet");
    resolveFetch();
    const tokens = await calls;
    assert.deepEqual(tokens, [
      "new_token", "new_token", "new_token", "new_token", "new_token",
    ]);
    assert.equal(fetchCalls, 1, "Auch nach Auflösen weiterhin nur EIN fetch");
  } finally {
    delete global.fetch;
  }
});

test("getAccessToken: Lock wird auch bei Fehler freigegeben (kein Permanent-Hang)", async () => {
  const gbp = loadFreshGbpClient();
  const stalePast = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const pool = makePoolStub({
    row: {
      access_token: "old_token",
      refresh_token: "rt-1",
      expires_at: stalePast,
    },
  });

  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      // erster Refresh-Versuch fehlt
      throw new Error("network down");
    }
    return new Response(JSON.stringify({ access_token: "new_token", expires_in: 3600 }), {
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(() => gbp.getAccessToken(pool), /network down/);
    // Nach dem Fehler muss ein erneuter Aufruf einen NEUEN fetch ausloesen,
    // nicht auf der alten in-flight-Promise haengen bleiben.
    const t = await gbp.getAccessToken(pool);
    assert.equal(t, "new_token");
    assert.equal(fetchCalls, 2);
  } finally {
    delete global.fetch;
  }
});
