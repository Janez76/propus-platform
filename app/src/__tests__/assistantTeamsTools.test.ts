import { describe, expect, it, vi } from "vitest";
import { createTeamsHandlers } from "@/lib/assistant/tools/teams";
import type { ToolContext } from "@/lib/assistant/tools";

const ctx: ToolContext = { userId: "test-user", userEmail: "admin@propus.ch", role: "admin" };

function makeFetchOk(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  });
}

function makeFetchErr(status: number, error: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ ok: false, error }),
  });
}

const baseDeps = { platformUrl: "http://mock:3100" };

describe("teams: list_ms_teams", () => {
  it("calls /api/tours/admin/teams with limit", async () => {
    const fetch = makeFetchOk({
      ok: true,
      total: 2,
      teams: [
        { id: "t1", displayName: "Propus Office", visibility: "private" },
        { id: "t2", displayName: "OGZ", visibility: "private" },
      ],
    });
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    const result = await handlers.list_ms_teams({ limit: 25 }, ctx);

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain("http://mock:3100/api/tours/admin/teams");
    expect(url).toContain("top=25");
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { "x-internal-call": "assistant" } });
    expect(result).toMatchObject({ ok: true, total: 2 });
  });

  it("clamps limit to max 200", async () => {
    const fetch = makeFetchOk({ ok: true, total: 0, teams: [] });
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    await handlers.list_ms_teams({ limit: 9999 }, ctx);
    expect((fetch.mock.calls[0][0] as string)).toContain("top=200");
  });

  it("falls back to default when limit invalid", async () => {
    const fetch = makeFetchOk({ ok: true, total: 0, teams: [] });
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    await handlers.list_ms_teams({ limit: "abc" }, ctx);
    expect((fetch.mock.calls[0][0] as string)).toContain("top=50");
  });
});

describe("teams: list_team_channels", () => {
  it("requires team_id", async () => {
    const fetch = vi.fn();
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    const result = await handlers.list_team_channels({}, ctx);
    expect(result).toEqual({ error: "team_id ist erforderlich" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("URL-encodes team_id", async () => {
    const fetch = makeFetchOk({ ok: true, total: 0, channels: [] });
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    await handlers.list_team_channels({ team_id: "team/with slash" }, ctx);
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain("/teams/team%2Fwith%20slash/channels");
  });
});

describe("teams: find_user_in_teams", () => {
  it("hits /teams/users/search with q param", async () => {
    const fetch = makeFetchOk({ ok: true, total: 1, users: [{ id: "u1", displayName: "Janez" }] });
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    const result = await handlers.find_user_in_teams({ query: "Janez" }, ctx);
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain("/teams/users/search");
    expect(url).toContain("q=Janez");
    expect(result).toMatchObject({ ok: true });
  });

  it("returns error on empty query", async () => {
    const fetch = vi.fn();
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    const result = await handlers.find_user_in_teams({ query: "  " }, ctx);
    expect(result).toEqual({ error: "query ist erforderlich" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("teams: read_channel_messages", () => {
  it("requires team_id and channel_id", async () => {
    const fetch = vi.fn();
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await handlers.read_channel_messages({ team_id: "t1" }, ctx)).toEqual({
      error: "team_id und channel_id sind erforderlich",
    });
    expect(await handlers.read_channel_messages({ channel_id: "c1" }, ctx)).toEqual({
      error: "team_id und channel_id sind erforderlich",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes since filter through", async () => {
    const fetch = makeFetchOk({ ok: true, total: 0, messages: [] });
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    await handlers.read_channel_messages(
      { team_id: "t1", channel_id: "c1", limit: 10, since: "2026-05-01" },
      ctx,
    );
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain("/teams/t1/channels/c1/messages");
    expect(url).toContain("top=10");
    expect(url).toContain("since=2026-05-01");
  });

  it("propagates 403 (Protected API not enabled)", async () => {
    const fetch = makeFetchErr(403, "Teams-Zugriff verweigert. Protected-API-Billing nicht aktiviert.");
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    const result = await handlers.read_channel_messages(
      { team_id: "t1", channel_id: "c1" },
      ctx,
    );
    expect(result).toMatchObject({ error: expect.stringContaining("Protected-API") });
  });
});

describe("teams: list_user_chats", () => {
  it("works without explicit user (server falls back to mailbox UPN)", async () => {
    const fetch = makeFetchOk({ ok: true, userUpn: "office@propus.ch", total: 0, chats: [] });
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    await handlers.list_user_chats({}, ctx);
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain("/teams/chats");
    expect(url).not.toContain("user=");
  });

  it("forwards explicit user parameter", async () => {
    const fetch = makeFetchOk({ ok: true, total: 0, chats: [] });
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    await handlers.list_user_chats({ user: "js@propus.ch" }, ctx);
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain("user=js%40propus.ch");
  });
});

describe("teams: read_chat_messages", () => {
  it("requires chat_id", async () => {
    const fetch = vi.fn();
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await handlers.read_chat_messages({}, ctx)).toEqual({ error: "chat_id ist erforderlich" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("teams: phase 2 write tools (delegated)", () => {
  function makeDelegatedOk(payload: { id?: string; webUrl?: string }) {
    return vi.fn().mockResolvedValue({ data: payload, status: 201, error: null });
  }
  function makeDelegatedErr(error: string) {
    return vi.fn().mockResolvedValue({ data: null, status: 0, error });
  }

  it("send_chat_message POSTs to /chats/{id}/messages with HTML body", async () => {
    const delegated = makeDelegatedOk({ id: "msg-1", webUrl: "https://teams.microsoft.com/m/1" });
    const handlers = createTeamsHandlers({
      ...baseDeps,
      delegatedGraphRequest: delegated as unknown as typeof import("@/lib/assistant/teams-delegated").delegatedGraphRequest,
    });
    const result = await handlers.send_chat_message({ chat_id: "chat/1", body_text: "Hallo" }, ctx);

    expect(delegated).toHaveBeenCalledTimes(1);
    const [url, opts] = delegated.mock.calls[0];
    expect(url).toBe("https://graph.microsoft.com/v1.0/chats/chat%2F1/messages");
    expect(opts).toMatchObject({
      method: "POST",
      body: { body: { contentType: "html", content: "Hallo" } },
    });
    expect(result).toMatchObject({ ok: true, messageId: "msg-1" });
  });

  it("send_chat_message escapes plaintext body_text to HTML", async () => {
    const delegated = makeDelegatedOk({ id: "x" });
    const handlers = createTeamsHandlers({
      ...baseDeps,
      delegatedGraphRequest: delegated as unknown as typeof import("@/lib/assistant/teams-delegated").delegatedGraphRequest,
    });
    await handlers.send_chat_message({ chat_id: "c", body_text: "<script>alert(1)</script>\nLine 2" }, ctx);
    const [, opts] = delegated.mock.calls[0];
    const content = (opts as { body: { body: { content: string } } }).body.body.content;
    expect(content).toContain("&lt;script&gt;");
    expect(content).toContain("<br/>");
  });

  it("send_chat_message prefers body_html over body_text", async () => {
    const delegated = makeDelegatedOk({ id: "x" });
    const handlers = createTeamsHandlers({
      ...baseDeps,
      delegatedGraphRequest: delegated as unknown as typeof import("@/lib/assistant/teams-delegated").delegatedGraphRequest,
    });
    await handlers.send_chat_message(
      { chat_id: "c", body_text: "plain", body_html: "<p>rich</p>" },
      ctx,
    );
    const [, opts] = delegated.mock.calls[0];
    const content = (opts as { body: { body: { content: string } } }).body.body.content;
    expect(content).toBe("<p>rich</p>");
  });

  it("send_chat_message rejects empty body", async () => {
    const delegated = vi.fn();
    const handlers = createTeamsHandlers({
      ...baseDeps,
      delegatedGraphRequest: delegated as unknown as typeof import("@/lib/assistant/teams-delegated").delegatedGraphRequest,
    });
    const result = await handlers.send_chat_message({ chat_id: "c" }, ctx);
    expect(result).toEqual({ error: "body_text oder body_html erforderlich" });
    expect(delegated).not.toHaveBeenCalled();
  });

  it("send_channel_message includes optional subject", async () => {
    const delegated = makeDelegatedOk({ id: "msg-2" });
    const handlers = createTeamsHandlers({
      ...baseDeps,
      delegatedGraphRequest: delegated as unknown as typeof import("@/lib/assistant/teams-delegated").delegatedGraphRequest,
    });
    await handlers.send_channel_message(
      { team_id: "t1", channel_id: "c1", subject: "Status", body_text: "Update" },
      ctx,
    );
    const [url, opts] = delegated.mock.calls[0];
    expect(url).toBe("https://graph.microsoft.com/v1.0/teams/t1/channels/c1/messages");
    expect(opts).toMatchObject({ method: "POST", body: { subject: "Status" } });
  });

  it("reply_channel_message hits /replies endpoint", async () => {
    const delegated = makeDelegatedOk({ id: "reply-1" });
    const handlers = createTeamsHandlers({
      ...baseDeps,
      delegatedGraphRequest: delegated as unknown as typeof import("@/lib/assistant/teams-delegated").delegatedGraphRequest,
    });
    const result = await handlers.reply_channel_message(
      { team_id: "t1", channel_id: "c1", message_id: "m1", body_text: "Got it" },
      ctx,
    );
    const [url] = delegated.mock.calls[0];
    expect(url).toBe(
      "https://graph.microsoft.com/v1.0/teams/t1/channels/c1/messages/m1/replies",
    );
    expect(result).toMatchObject({ ok: true, replyId: "reply-1" });
  });

  it("propagates 'no delegated token' error with admin hint", async () => {
    const delegated = makeDelegatedErr(
      "Keine delegierten Teams-Tokens gefunden — Admin: /api/teams-oauth/start aufrufen.",
    );
    const handlers = createTeamsHandlers({
      ...baseDeps,
      delegatedGraphRequest: delegated as unknown as typeof import("@/lib/assistant/teams-delegated").delegatedGraphRequest,
    });
    const result = await handlers.send_chat_message({ chat_id: "c", body_text: "Hi" }, ctx);
    expect(result).toMatchObject({
      error: expect.stringContaining("/api/teams-oauth/start"),
    });
  });

  it("send_channel_message requires team_id and channel_id", async () => {
    const delegated = vi.fn();
    const handlers = createTeamsHandlers({
      ...baseDeps,
      delegatedGraphRequest: delegated as unknown as typeof import("@/lib/assistant/teams-delegated").delegatedGraphRequest,
    });
    expect(await handlers.send_channel_message({ team_id: "t1", body_text: "x" }, ctx)).toEqual({
      error: "team_id und channel_id sind erforderlich",
    });
    expect(delegated).not.toHaveBeenCalled();
  });
});

describe("teams: network errors", () => {
  it("returns error on fetch rejection", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const handlers = createTeamsHandlers({ ...baseDeps, fetch: fetch as unknown as typeof globalThis.fetch });
    const result = await handlers.list_ms_teams({}, ctx);
    expect(result).toMatchObject({ error: expect.stringContaining("ECONNREFUSED") });
  });
});
