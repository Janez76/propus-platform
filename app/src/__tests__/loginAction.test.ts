import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieSetMock, headerMap } = vi.hoisted(() => ({
  cookieSetMock: vi.fn(),
  headerMap: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookieSetMock })),
  headers: vi.fn(async () => ({ get: (k: string) => headerMap.get(k.toLowerCase()) ?? null })),
}));

import { loginAction } from "@/app/(auth)/login/actions";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

type MockResInit = {
  ok?: boolean;
  body?: unknown;
  setCookies?: string[];
};

function mockRes({ ok = true, body = {}, setCookies = [] }: MockResInit = {}): Response {
  return {
    ok,
    json: async () => body,
    headers: { getSetCookie: () => setCookies },
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  cookieSetMock.mockReset();
  headerMap.clear();
  headerMap.set("x-forwarded-for", "203.0.113.7");
  headerMap.set("host", "admin-booking.propus.ch");
  process.env = { ...originalEnv };
  process.env.PLATFORM_INTERNAL_URL = "http://backend.internal";
  delete process.env.NEXT_PUBLIC_PORTAL_URL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

const VALID = { email: "user@example.com", password: "secret1" };

describe("loginAction – validation", () => {
  it("rejects an invalid email", async () => {
    const res = await loginAction({ ok: false, error: null }, fd({ ...VALID, email: "not-an-email" }));
    expect(res.ok).toBe(false);
    expect(res.field).toBe("email");
    expect(res.error).toBeTruthy();
  });

  it("rejects a too-short password", async () => {
    const res = await loginAction({ ok: false, error: null }, fd({ ...VALID, password: "12345" }));
    expect(res.ok).toBe(false);
    expect(res.field).toBe("password");
  });
});

describe("loginAction – backend wiring", () => {
  it("fails when PLATFORM_INTERNAL_URL is not configured", async () => {
    delete process.env.PLATFORM_INTERNAL_URL;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const res = await loginAction({ ok: false, error: null }, fd(VALID));
    expect(res.ok).toBe(false);
    expect(res.field).toBe("form");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("targets the trusted backend origin and forwards the client IP", async () => {
    const fetchMock = vi.fn(async () => mockRes({ body: { token: "t", role: "admin" } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await loginAction({ ok: false, error: null }, fd(VALID));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://backend.internal/auth/login");
    const sentHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(sentHeaders["x-forwarded-for"]).toBe("203.0.113.7");
  });

  it("returns a form error when the backend is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const res = await loginAction({ ok: false, error: null }, fd(VALID));
    expect(res.ok).toBe(false);
    expect(res.field).toBe("form");
  });

  it("surfaces the backend error message on a non-ok response", async () => {
    globalThis.fetch = vi.fn(async () =>
      mockRes({ ok: false, body: { error: "E-Mail oder Passwort nicht korrekt." } }),
    ) as unknown as typeof fetch;
    const res = await loginAction({ ok: false, error: null }, fd(VALID));
    expect(res.ok).toBe(false);
    expect(res.field).toBe("form");
    expect(res.error).toBe("E-Mail oder Passwort nicht korrekt.");
  });

  it("treats a 200 response without a token as a failure", async () => {
    globalThis.fetch = vi.fn(async () => mockRes({ body: { role: "admin" } })) as unknown as typeof fetch;
    const res = await loginAction({ ok: false, error: null }, fd(VALID));
    expect(res.ok).toBe(false);
    expect(res.field).toBe("form");
  });
});

describe("loginAction – success", () => {
  it("forwards backend Set-Cookie attributes verbatim", async () => {
    globalThis.fetch = vi.fn(async () =>
      mockRes({
        body: { token: "tok-1", role: "admin", permissions: ["orders.write"] },
        setCookies: [
          "admin_session=abc123; Path=/; Domain=.propus.ch; Max-Age=3600; HttpOnly; Secure; SameSite=Lax",
        ],
      }),
    ) as unknown as typeof fetch;

    const res = await loginAction({ ok: false, error: null }, fd({ ...VALID, remember: "on" }));

    expect(res.ok).toBe(true);
    expect(res.token).toBe("tok-1");
    expect(res.role).toBe("admin");
    expect(res.permissions).toEqual(["orders.write"]);
    expect(res.remember).toBe(true);

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieSetMock.mock.calls[0];
    expect(name).toBe("admin_session");
    expect(value).toBe("abc123");
    expect(options).toMatchObject({
      path: "/",
      domain: ".propus.ch",
      maxAge: 3600,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
  });

  it("keeps a safe internal returnTo as the redirect target", async () => {
    globalThis.fetch = vi.fn(async () =>
      mockRes({ body: { token: "t", role: "admin" } }),
    ) as unknown as typeof fetch;
    const res = await loginAction({ ok: false, error: null }, fd({ ...VALID, returnTo: "/orders/42" }));
    expect(res.target).toBe("/orders/42");
  });

  it("falls back to /dashboard for an unsafe returnTo", async () => {
    globalThis.fetch = vi.fn(async () =>
      mockRes({ body: { token: "t", role: "admin" } }),
    ) as unknown as typeof fetch;
    const res = await loginAction({ ok: false, error: null }, fd({ ...VALID, returnTo: "//evil.example" }));
    expect(res.target).toBe("/dashboard");
  });

  it("sends portal roles to the portal URL", async () => {
    process.env.NEXT_PUBLIC_PORTAL_URL = "https://portal.example.ch";
    globalThis.fetch = vi.fn(async () =>
      mockRes({ body: { token: "t", role: "customer_admin" } }),
    ) as unknown as typeof fetch;
    const res = await loginAction({ ok: false, error: null }, fd({ ...VALID, returnTo: "/orders/1" }));
    expect(res.target).toBe("https://portal.example.ch");
  });
});
