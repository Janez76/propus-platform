import { test, expect } from "@playwright/test";
import { E2E_PACKAGE_KEY, installBookingApiMocks } from "./booking-api-mocks";

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

test.describe("Buchungs-Wizard", () => {
  test("Happy Path: Landing → 4 Schritte → Danke (gemockte APIs)", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("propus-booking-wizard-draft");
      } catch {
        /* ignore */
      }
    });

    await installBookingApiMocks(page);

    await page.goto("/book");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("booking-landing-start")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("booking-landing-start").click();

    await expect(page.getByTestId("booking-wizard-loading")).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId("booking-wizard")).toBeVisible();

    // Schritt 1: Objekt & Adresse
    const addr = page.getByTestId("booking-input-address");
    await addr.fill("Bah");
    // Kein getByRole("option") — kollidiert mit <select>-Kindern (z. B. Sprache DE/EN).
    const firstAddressHit = page.locator('ul[role="listbox"] [role="option"]').first();
    await expect(firstAddressHit).toBeVisible({ timeout: 15_000 });
    await firstAddressHit.click();

    await page.getByTestId("booking-object-type-apartment").click();
    await page.getByTestId("booking-input-area").fill("120");
    await page.getByTestId("booking-input-onsite-name").fill("E2E Vor Ort");
    await page.getByTestId("booking-input-onsite-phone").fill("+41 79 000 00 01");
    await page.getByTestId("booking-nav-next").click();

    // Schritt 2: Paket
    await page.getByTestId(`booking-package-${E2E_PACKAGE_KEY}`).click();
    await page.getByTestId("booking-nav-next").click();

    // Schritt 3: Termin
    await page.getByTestId("booking-input-date").fill(tomorrowISO());
    await expect(page.getByTestId("booking-slot-09-00")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("booking-slot-09-00").click();
    await page.getByTestId("booking-nav-next").click();

    // Schritt 4: Rechnung
    await page.getByTestId("booking-input-company").fill("E2E AG");
    await page.getByTestId("booking-input-billing-name").fill("Test");
    await page.getByTestId("booking-input-email").fill("e2e@example.test");
    await page.getByTestId("booking-input-phone").fill("+41 79 000 00 02");
    await page.getByTestId("booking-input-billing-street").fill("Musterweg 5, 8000 Zürich");
    await page.getByTestId("booking-input-zip").fill("8000");
    await page.getByTestId("booking-input-city").fill("Zürich");
    await page.getByTestId("booking-checkbox-agb").check();
    await page.getByTestId("booking-nav-submit").click();

    await expect(page.getByTestId("booking-thank-you-root")).toBeVisible();
    await expect(page.getByTestId("booking-thank-you")).toBeVisible();
    await expect(page.getByText("#999001")).toBeVisible();
  });
});
