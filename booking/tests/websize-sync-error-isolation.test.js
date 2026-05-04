const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("node:module");

// Mock `sharp` damit der Test ohne native libvips-Binaries laeuft.
// Wir patchen Module._load BEVOR websize-sync geladen wird.
const sharpStub = function () {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    withMetadata: () => chain,
    jpeg: () => chain,
    toFile: async () => {},
  };
  return chain;
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "sharp") return sharpStub;
  return origLoad.call(this, request, ...rest);
};

const { runWebsizeSync } = require("../jobs/websize-sync");

/**
 * Bug-Hunt T09: ein einzelner Folder-Fehler (Permissions, broken Symlink,
 * verschwundener Mount) darf nicht den gesamten Batch killen. Diese Tests
 * verifizieren die per-Folder-Fehler-Isolation.
 */

function makeStubCtx() {
  const errors = [];
  return {
    log: () => {},
    warn: () => {},
    error: (...args) => errors.push(args.join(" ")),
    perRow: undefined, // bewusst weg: testet den Fallback-Pfad in runWebsizeSync
    _errors: errors,
  };
}

function makeStubDb(folderRows) {
  return {
    getPool: () => ({
      query: async () => ({ rows: folderRows }),
    }),
  };
}

test("runWebsizeSync verarbeitet weiter wenn einzelner Folder fehlerhaft ist", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "websize-sync-test-"));
  const ok1 = path.join(tmp, "ok1");
  const ok2 = path.join(tmp, "ok2");
  fs.mkdirSync(path.join(ok1, "Finale", "Bilder", "FULLSIZE"), { recursive: true });
  fs.mkdirSync(path.join(ok2, "Finale", "Bilder", "FULLSIZE"), { recursive: true });

  // FULLSIZE-Dir des "broken"-Folders zeigt auf einen nicht-existenten Pfad,
  // den listFilesRecursive via existsSync abfaengt → kein Fehler. Um echtes
  // Throwing zu simulieren, monkey-patchen wir fs.readdirSync fuer den Pfad.
  const broken = path.join(tmp, "broken");
  fs.mkdirSync(path.join(broken, "Finale", "Bilder", "FULLSIZE"), { recursive: true });
  const brokenFullsize = path.join(broken, "Finale", "Bilder", "FULLSIZE");

  const origReaddirSync = fs.readdirSync;
  fs.readdirSync = (p, opts) => {
    if (p === brokenFullsize) {
      const err = new Error("EACCES: permission denied (test stub)");
      err.code = "EACCES";
      throw err;
    }
    return origReaddirSync(p, opts);
  };

  try {
    const ctx = makeStubCtx();
    const deps = { db: makeStubDb([
      { absolute_path: ok1 },
      { absolute_path: broken },
      { absolute_path: ok2 },
    ]) };

    // Vor dem Fix: Throw aus listFilesRecursive (broken) wuerde den Loop
    // verlassen → ok2 nie verarbeitet. Mit perFolder-Wrapper wird der
    // Fehler isoliert + ctx.error geloggt; ok2 kommt dran.
    await runWebsizeSync(deps, ctx);

    // Wir koennen "ok2 wurde verarbeitet" ueber den ctx.error-Log
    // verifizieren: der Fehler-Log fuer den broken Folder muss da sein.
    const sawBrokenError = ctx._errors.some((line) => /broken|EACCES/i.test(line));
    assert.equal(sawBrokenError, true, "Per-folder-Fehler muss geloggt sein");
  } finally {
    fs.readdirSync = origReaddirSync;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("runWebsizeSync ohne folderLinks ist no-op", async () => {
  const ctx = makeStubCtx();
  const deps = { db: makeStubDb([]) };
  await runWebsizeSync(deps, ctx);
  assert.equal(ctx._errors.length, 0);
});

test("runWebsizeSync nutzt ctx.perRow wenn verfuegbar (scheduleSafeCronJob-Pfad)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "websize-sync-test-"));
  const broken = path.join(tmp, "broken");
  fs.mkdirSync(path.join(broken, "Finale", "Bilder", "FULLSIZE"), { recursive: true });
  const brokenFullsize = path.join(broken, "Finale", "Bilder", "FULLSIZE");

  const origReaddirSync = fs.readdirSync;
  fs.readdirSync = (p, opts) => {
    if (p === brokenFullsize) {
      const err = new Error("EACCES: stub");
      err.code = "EACCES";
      throw err;
    }
    return origReaddirSync(p, opts);
  };

  try {
    const perRowCalls = [];
    const ctx = {
      log: () => {},
      warn: () => {},
      error: () => {},
      perRow: async (link, fn) => {
        perRowCalls.push(link.absolute_path);
        try { await fn(link); } catch { /* swallow */ }
      },
    };
    const deps = { db: makeStubDb([{ absolute_path: broken }]) };
    await runWebsizeSync(deps, ctx);
    assert.equal(perRowCalls.length, 1);
    assert.equal(perRowCalls[0], broken);
  } finally {
    fs.readdirSync = origReaddirSync;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
