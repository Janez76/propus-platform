const test = require("node:test");
const assert = require("node:assert/strict");

const {
  makeWorkflowStatusMailHandler,
} = require("../lib/outbox-handler-workflow-mail");

const silentLog = { log: () => {}, warn: () => {}, error: () => {} };

function makeCtx(payload, overrides = {}) {
  return {
    id: 42,
    orderNo: 1234,
    kind: "workflow_status_mail",
    payload,
    attempts: 0,
    log: silentLog,
    ...overrides,
  };
}

test("delivers a rendered mail via sendMailWithFallback", async () => {
  const calls = [];
  const handler = makeWorkflowStatusMailHandler({
    sendMailWithFallback: async (m) => {
      calls.push(m);
      return { ok: true };
    },
  });

  await handler(makeCtx({
    to: "kunde@example.com",
    subject: "Bestellung #1234 – Bestätigung",
    html: "<p>OK</p>",
    text: "OK",
    effect: "email.confirmed_customer",
    role: "customer",
    context: "test-ctx",
  }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, "kunde@example.com");
  assert.equal(calls[0].subject, "Bestellung #1234 – Bestätigung");
  assert.equal(calls[0].context, "test-ctx");
});

test("skips silently when payload has no `to` (treated as done)", async () => {
  const calls = [];
  const handler = makeWorkflowStatusMailHandler({
    sendMailWithFallback: async (m) => {
      calls.push(m);
    },
  });
  await handler(makeCtx({ to: "", subject: "x", html: "y" }));
  assert.equal(calls.length, 0);
});

test("propagates send-fail so dispatcher can retry/escalate", async () => {
  const handler = makeWorkflowStatusMailHandler({
    sendMailWithFallback: async () => {
      const err = new Error("smtp down");
      throw err;
    },
  });
  await assert.rejects(
    () => handler(makeCtx({
      to: "kunde@example.com",
      subject: "x",
      html: "y",
      text: "z",
    })),
    /smtp down/,
  );
});

test("falls back context to outbox-id when payload context missing", async () => {
  const calls = [];
  const handler = makeWorkflowStatusMailHandler({
    sendMailWithFallback: async (m) => {
      calls.push(m);
    },
  });
  await handler(makeCtx({
    to: "x@example.com",
    subject: "S",
    html: "H",
    text: "T",
  }));
  assert.match(calls[0].context, /outbox:42:order:1234/);
});

test("requires sendMailWithFallback in deps", () => {
  assert.throws(() => makeWorkflowStatusMailHandler({}), TypeError);
  assert.throws(() => makeWorkflowStatusMailHandler({ sendMailWithFallback: "no" }), TypeError);
});
