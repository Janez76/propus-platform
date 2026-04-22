import { test, expect } from "@playwright/test";

/** Admin-Host bettet den Wizard unter `/book` ein; public booking nutzt `/`. */
function bookingStartPath(baseURL: string | undefined): string {
  if (!baseURL) return "/book";
  try {
    const h = new URL(baseURL).hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") return "/book";
    return h.startsWith("admin.") ? "/book" : "/";
  } catch {
    return "/book";
  }
}

test.describe("Buchungs-Wizard (Smoke)", () => {
  test("Landing → Wizard Schritt 1 sichtbar", async ({ page, baseURL }) => {
    const path = bookingStartPath(baseURL);
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.ok(), "HTTP-Status der Startseite").toBeTruthy();

    await page.getByTestId("booking-landing-start").click();
    await expect(page.getByTestId("booking-wizard")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("booking-input-street")).toBeVisible({ timeout: 30_000 });
  });
});
