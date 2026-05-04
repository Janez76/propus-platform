import { describe, it, expect, vi } from "vitest";
import { PostCommitQueue } from "@/app/(admin)/orders/[id]/_bulk-tx";

describe("PostCommitQueue", () => {
  it("runs queued tasks in order after commit", async () => {
    const calls: string[] = [];
    const q = new PostCommitQueue();
    q.push(async () => {
      calls.push("a");
    });
    q.push(async () => {
      calls.push("b");
    });
    const { errors } = await q.run();
    expect(calls).toEqual(["a", "b"]);
    expect(errors).toEqual([]);
  });

  it("captures task errors but keeps running remaining tasks", async () => {
    const calls: string[] = [];
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const q = new PostCommitQueue();
    q.push(async () => {
      throw new Error("boom");
    });
    q.push(async () => {
      calls.push("after-failure");
    });
    const { errors } = await q.run("test");
    expect(calls).toEqual(["after-failure"]);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("boom");
    consoleSpy.mockRestore();
  });

  it("noop when no tasks pushed", async () => {
    const q = new PostCommitQueue();
    const { errors } = await q.run();
    expect(errors).toEqual([]);
  });
});
