import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";

const ADMIN_PANEL_URL = process.env.ADMIN_PANEL_URL || "http://127.0.0.1:5173";
const API_BASE = process.env.API_BASE || "http://127.0.0.1:3004";
const TEST_ORDER_NO = process.env.TEST_ORDER_NO || "";

const ADMIN_USER = process.env.TEST_ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "Biel2503!";

async function loginAdmin(request: APIRequestContext): Promise<string> {
  const resp = await request.post(`${API_BASE}/api/admin/login`, {
    data: { user: ADMIN_USER, password: ADMIN_PASSWORD, rememberMe: false },
  });
  expect(resp.ok(), "Admin login failed").toBeTruthy();
  const json = (await resp.json()) as { token?: string };
  const token = String(json.token || "");
  expect(token.length > 10, "Admin token missing").toBeTruthy();
  return token;
}

async function resolveOrderNo(request: APIRequestContext, adminToken: string): Promise<string> {
  if (TEST_ORDER_NO) return TEST_ORDER_NO;
  const resp = await request.get(`${API_BASE}/api/admin/orders`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(resp.ok(), "Could not load admin orders").toBeTruthy();
  const json = (await resp.json()) as { orders?: Array<{ orderNo?: string | number }> };
  const first = json.orders?.[0]?.orderNo;
  if (first) return String(first);

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const createResp = await request.post(`${API_BASE}/api/admin/orders`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      customerName: "E2E Testkunde",
      customerEmail: "e2e.chat@example.test",
      customerPhone: "0790000000",
      address: "E2E Teststrasse 1",
      street: "E2E Teststrasse 1",
      zipcity: "2500 Biel",
      date: `${yyyy}-${mm}-${dd}`,
      time: "10:00",
      durationMin: 60,
      objectType: "apartment",
      area: 80,
      floors: 1,
      rooms: 3,
      package: { key: "bestseller", label: "BESTSELLER", price: 0 },
      addons: [],
      subtotal: 0,
      discount: 0,
      vat: 0,
      total: 0,
    },
  });
  expect(createResp.ok(), "Could not create fallback test order").toBeTruthy();
  const created = (await createResp.json()) as { orderNo?: string | number };
  const orderNo = String(created.orderNo || "");
  expect(orderNo.length > 0, "Fallback order missing orderNo").toBeTruthy();
  return orderNo;
}

async function openOrderChat(browser: Browser, adminToken: string, orderNo: string) {
  const context = await browser.newContext();
  await context.addInitScript((token) => {
    window.localStorage.setItem("admin_token_v2", token);
  }, adminToken);
  const page = await context.newPage();
  await page.goto(`${ADMIN_PANEL_URL}/orders?open=${encodeURIComponent(orderNo)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("order-chat")).toBeVisible();
  return { context, page };
}

test.describe("Auftrags-Chat E2E", () => {
  test("API sendet Nachricht, UI sieht sie live (SSE)", async ({ request, browser }) => {
    const adminToken = await loginAdmin(request);
    const orderNo = await resolveOrderNo(request, adminToken);
    const { context, page } = await openOrderChat(browser, adminToken, orderNo);

    const msg = `E2E api -> ui ${Date.now()}`;
    const sendResp = await request.post(`${API_BASE}/api/admin/orders/${encodeURIComponent(orderNo)}/chat/message`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { message: msg },
    });
    expect(sendResp.ok()).toBeTruthy();

    await expect(page.getByText(msg)).toBeVisible({ timeout: 10000 });
    await context.close();
  });

  test("UI sendet Nachricht, API listet sie", async ({ request, browser }) => {
    const adminToken = await loginAdmin(request);
    const orderNo = await resolveOrderNo(request, adminToken);
    const { context, page } = await openOrderChat(browser, adminToken, orderNo);

    const msg = `E2E ui -> api ${Date.now()}`;
    await page.getByTestId("chat-input").fill(msg);
    await page.getByTestId("chat-send").click();

    await expect.poll(async () => {
      const resp = await request.get(`${API_BASE}/api/admin/orders/${encodeURIComponent(orderNo)}/chat`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!resp.ok()) return false;
      const data = (await resp.json()) as { messages?: Array<{ message?: string }> };
      return !!data.messages?.some((m) => String(m.message || "") === msg);
    }, { timeout: 10000 }).toBeTruthy();

    await context.close();
  });
});
