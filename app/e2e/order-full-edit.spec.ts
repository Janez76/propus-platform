import { test, expect } from "@playwright/test";

/**
 * Smoke / Regression: Bestell-Admin (Tabs, optional Bearbeiten).
 * Setzt voraus: Admin-Session (Cookie) + Test-Bestellung in E2E_ORDER_NO
 * (Windows: `$env:E2E_ORDER_NO=12345; npx playwright test e2e/order-full-edit.spec.ts`)
 */
test.describe("Admin Bestellung – vollständige Tab-Flows", () => {
  test.skip(() => !process.env.E2E_ORDER_NO, "E2E_ORDER_NO nicht gesetzt");

  const tabs = [
    { path: "", name: "Übersicht" },
    { path: "termin?edit=1", name: "Termin" },
    { path: "objekt?edit=1", name: "Objekt" },
    { path: "leistungen?edit=1", name: "Leistungen" },
    { path: "kommunikation", name: "Kommunikation" },
    { path: "dateien", name: "Dateien" },
    { path: "verlauf", name: "Verlauf" },
  ] as const;

  test("durch alle 7 Tabs (Smoke)", async ({ page, context }) => {
    const id = process.env.E2E_ORDER_NO!;
    const token = process.env.E2E_ADMIN_SESSION;
    if (token) {
      await context.addCookies([
        { name: "admin_session", value: token, domain: "localhost", path: "/" },
      ]);
    }
    for (const t of tabs) {
      const suffix = t.path ? `/${t.path}` : "";
      await page.goto(`/orders/${id}${suffix}`);
      await expect(
        page.getByRole("heading", { name: new RegExp(`Bestellung #${id}`) }),
      ).toBeVisible({ timeout: 30000 });
    }
  });
});
