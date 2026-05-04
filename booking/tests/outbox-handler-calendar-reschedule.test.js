const test = require("node:test");
const assert = require("node:assert/strict");

const {
  makeCalendarRescheduleHandler,
} = require("../lib/outbox-handler-calendar-reschedule");

const silentLog = { log: () => {}, warn: () => {}, error: () => {} };

function makeCtx(payload, overrides = {}) {
  return {
    id: 7,
    orderNo: 4711,
    kind: "calendar_reschedule",
    payload,
    attempts: 0,
    log: silentLog,
    ...overrides,
  };
}

test("delegates to performAdminReschedule with payload date/time/durationMin", async () => {
  const calls = [];
  const handler = makeCalendarRescheduleHandler({
    performAdminReschedule: async (args) => {
      calls.push(args);
      return { ok: true, orderNo: args.orderNo, schedule: args.body, emailsSent: false };
    },
  });

  await handler(makeCtx({ date: "2026-06-15", time: "10:00", durationMin: 90 }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].orderNo, 4711);
  assert.deepEqual(calls[0].body, { date: "2026-06-15", time: "10:00", durationMin: 90 });
  assert.equal(calls[0].actor.user, "outbox-worker");
  assert.equal(calls[0].actor.role, "system");
});

test("omits durationMin from body when not provided", async () => {
  const calls = [];
  const handler = makeCalendarRescheduleHandler({
    performAdminReschedule: async (args) => { calls.push(args); },
  });
  await handler(makeCtx({ date: "2026-06-15", time: "10:00" }));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { date: "2026-06-15", time: "10:00" });
});

test("skips silently on incomplete payload (no throw -> done)", async () => {
  const calls = [];
  const handler = makeCalendarRescheduleHandler({
    performAdminReschedule: async (args) => { calls.push(args); },
  });
  await handler(makeCtx({ date: "2026-06-15" })); // time fehlt
  await handler(makeCtx({ time: "10:00" }));      // date fehlt
  await handler(makeCtx({}));                     // nichts
  assert.equal(calls.length, 0);
});

test("treats BAD_REQUEST as terminal (no throw -> done)", async () => {
  const handler = makeCalendarRescheduleHandler({
    performAdminReschedule: async () => {
      const e = new Error("Abgesagte Bestellungen können nicht verschoben werden");
      e.code = "BAD_REQUEST";
      throw e;
    },
  });
  await handler(makeCtx({ date: "2026-06-15", time: "10:00", durationMin: 60 }));
  // kein assert.rejects => Handler hat NICHT geworfen
});

test("treats NOT_FOUND as terminal (no throw -> done)", async () => {
  const handler = makeCalendarRescheduleHandler({
    performAdminReschedule: async () => {
      const e = new Error("Order not found");
      e.code = "NOT_FOUND";
      throw e;
    },
  });
  await handler(makeCtx({ date: "2026-06-15", time: "10:00", durationMin: 60 }));
});

test("rethrows unexpected errors so dispatcher can retry", async () => {
  const handler = makeCalendarRescheduleHandler({
    performAdminReschedule: async () => {
      throw new Error("network glitch");
    },
  });
  await assert.rejects(
    () => handler(makeCtx({ date: "2026-06-15", time: "10:00", durationMin: 60 })),
    /network glitch/,
  );
});

test("requires performAdminReschedule in deps", () => {
  assert.throws(() => makeCalendarRescheduleHandler({}), TypeError);
  assert.throws(() => makeCalendarRescheduleHandler({ performAdminReschedule: "no" }), TypeError);
});
