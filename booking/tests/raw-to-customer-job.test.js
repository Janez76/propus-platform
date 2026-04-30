const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { startRawToCustomerJob, isRawToCustomerJobActive } = require("../raw-to-customer-job");

test("startRawToCustomerJob spawns detached worker and returns immediately", () => {
  const calls = [];
  const child = {
    pid: 4242,
    unrefCalled: false,
    on() {},
    unref() {
      this.unrefCalled = true;
    },
  };
  const job = startRawToCustomerJob({
    orderNo: 100089,
    spawnImpl: (cmd, args, options) => {
      calls.push({ cmd, args, options });
      return child;
    },
  });

  assert.equal(job.started, true);
  assert.equal(job.pid, 4242);
  assert.equal(child.unrefCalled, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].cmd, /node(\.exe)?$/);
  assert.deepEqual(calls[0].args, [
    path.join(__dirname, "..", "raw-to-customer-worker.js"),
    "--orderNo",
    "100089",
  ]);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.stdio, "ignore");
});

test("startRawToCustomerJob prevents duplicate active jobs per order", () => {
  const children = [];
  const first = {
    pid: 5001,
    on(event, cb) {
      this[`on_${event}`] = cb;
    },
    unref() {},
  };
  const second = {
    pid: 5002,
    on() {},
    unref() {},
  };
  const spawnImpl = () => {
    const child = children.length ? second : first;
    children.push(child);
    return child;
  };

  const firstJob = startRawToCustomerJob({ orderNo: 100090, spawnImpl });
  const duplicate = startRawToCustomerJob({ orderNo: 100090, spawnImpl });

  assert.equal(firstJob.started, true);
  assert.equal(duplicate.started, false);
  assert.equal(duplicate.alreadyRunning, true);
  assert.equal(children.length, 1);
  assert.equal(isRawToCustomerJobActive(100090), true);

  first.on_exit?.(0);
  assert.equal(isRawToCustomerJobActive(100090), false);
});
