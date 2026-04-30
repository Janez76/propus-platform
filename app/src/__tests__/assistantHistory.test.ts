import { beforeEach, describe, expect, it, vi } from "vitest";

describe("assistant history store", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  async function getStoreModule() {
    vi.doMock("@/lib/db", () => ({
      query: mockQuery,
      queryOne: vi.fn(),
    }));
    return import("@/lib/assistant/store");
  }

  it("lists active conversations by default and excludes archived and deleted rows", async () => {
    mockQuery.mockResolvedValue([]);
    const store = await getStoreModule();

    await store.listAssistantHistory({ userId: "u1", limit: 20 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("c.deleted_at IS NULL");
    expect(sql).toContain("c.archived_at IS NULL");
    expect(params).toEqual(["u1", 20]);
  });

  it("lists archived conversations when requested", async () => {
    mockQuery.mockResolvedValue([]);
    const store = await getStoreModule();

    await store.listAssistantHistory({ userId: "u1", filter: "archived", limit: 20 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("c.deleted_at IS NULL");
    expect(sql).toContain("c.archived_at IS NOT NULL");
    expect(params).toEqual(["u1", 20]);
  });

  it("lists trashed conversations when requested", async () => {
    mockQuery.mockResolvedValue([]);
    const store = await getStoreModule();

    await store.listAssistantHistory({ userId: "u1", filter: "trash", limit: 20 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("c.deleted_at IS NOT NULL");
    expect(params).toEqual(["u1", 20]);
  });

  it("adds a search predicate across title, messages, customer, order and tour labels", async () => {
    mockQuery.mockResolvedValue([]);
    const store = await getStoreModule();

    await store.listAssistantHistory({ userId: "u1", q: "Muster", limit: 20 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("c.title ILIKE $2");
    expect(sql).toContain("tour_manager.assistant_messages");
    expect(sql).toContain("cust.name ILIKE $2");
    expect(sql).toContain("c.booking_order_no::TEXT ILIKE $2");
    expect(sql).toContain("COALESCE(t.canonical_object_label, t.object_label, t.bezeichnung) ILIKE $2");
    expect(params).toEqual(["u1", "%Muster%", 20]);
  });

  it("archives and unarchives a conversation for the current user", async () => {
    mockQuery.mockResolvedValue([]);
    const store = await getStoreModule();

    await store.setAssistantConversationArchived({ conversationId: "c1", userId: "u1", archived: true });
    await store.setAssistantConversationArchived({ conversationId: "c1", userId: "u1", archived: false });

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("archived_at = NOW()"),
      ["c1", "u1"],
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("archived_at = NULL"),
      ["c1", "u1"],
    );
  });

  it("soft-deletes and restores a conversation for the current user", async () => {
    mockQuery.mockResolvedValue([]);
    const store = await getStoreModule();

    await store.setAssistantConversationDeleted({ conversationId: "c1", userId: "u1", deleted: true });
    await store.setAssistantConversationDeleted({ conversationId: "c1", userId: "u1", deleted: false });

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("deleted_at = NOW()"),
      ["c1", "u1"],
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("deleted_at = NULL"),
      ["c1", "u1"],
    );
  });
});
