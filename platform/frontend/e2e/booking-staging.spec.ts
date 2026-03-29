import { expect, test } from "@playwright/test";

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function requireEnv(names: string[]): string[] {
  return names.filter((name) => !env(name));
}

function slotTestId(slot: string): string {
  return `booking-slot-${slot.replace(":", "-")}`;
}

test.describe("Buchungs-Wizard Staging", () => {
  test("Happy Path gegen echte API", async ({ page, baseURL }) => {
    test.skip(
      env("PLAYWRIGHT_LIVE_BOOKING") !== "1",
      "Live-Buchung ist deaktiviert. Setze PLAYWRIGHT_LIVE_BOOKING=1 fuer echte Staging-Laeufe.",
    );

    const missing = requireEnv([
      "PLAYWRIGHT_BOOKING_ADDRESS_QUERY",
      "PLAYWRIGHT_BOOKING_PACKAGE_KEY",
      "PLAYWRIGHT_BOOKING_DATE",
      "PLAYWRIGHT_BOOKING_SLOT",
      "PLAYWRIGHT_BOOKING_COMPANY",
      "PLAYWRIGHT_BOOKING_NAME",
      "PLAYWRIGHT_BOOKING_EMAIL",
      "PLAYWRIGHT_BOOKING_PHONE",
      "PLAYWRIGHT_BOOKING_STREET",
      "PLAYWRIGHT_BOOKING_ZIP",
      "PLAYWRIGHT_BOOKING_CITY",
    ]);

    test.skip(missing.length > 0, `Fehlende Env-Variablen: ${missing.join(", ")}`);
    test.skip(!baseURL || /localhost|127\.0\.0\.1/.test(baseURL), "Der Staging-Spec benoetigt eine entfernte URL.");

    const objectType = env("PLAYWRIGHT_BOOKING_OBJECT_TYPE", "apartment");
    const area = env("PLAYWRIGHT_BOOKING_AREA", "120");
    const onsiteName = env("PLAYWRIGHT_BOOKING_ONSITE_NAME", "Playwright Vor Ort");
    const onsitePhone = env("PLAYWRIGHT_BOOKING_ONSITE_PHONE", env("PLAYWRIGHT_BOOKING_PHONE"));
    const addressQuery = env("PLAYWRIGHT_BOOKING_ADDRESS_QUERY");
    const packageKey = env("PLAYWRIGHT_BOOKING_PACKAGE_KEY");
    const bookingDate = env("PLAYWRIGHT_BOOKING_DATE");
    const bookingSlot = env("PLAYWRIGHT_BOOKING_SLOT");

    await page.addInitScript(() => {
      try {
        localStorage.removeItem("propus-booking-wizard-draft");
      } catch {
        /* ignore */
      }
    });

    await page.goto("/book");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("booking-landing-start")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("booking-landing-start").click();

    await expect(page.getByTestId("booking-wizard-loading")).toBeHidden({ timeout: 60_000 });
    await expect(page.getByTestId("booking-wizard")).toBeVisible();

    // Schritt 1: Adresse aus echter Suggest-API auswaehlen, damit strukturierte Felder/Koordinaten gesetzt werden.
    await page.getByTestId("booking-input-address").fill(addressQuery);
    const firstAddressHit = page.locator('ul[role="listbox"] [role="option"]').first();
    await expect(firstAddressHit).toBeVisible({ timeout: 20_000 });
    await firstAddressHit.click();

    await page.getByTestId(`booking-object-type-${objectType}`).click();
    await page.getByTestId("booking-input-area").fill(area);
    await page.getByTestId("booking-input-onsite-name").fill(onsiteName);
    await page.getByTestId("booking-input-onsite-phone").fill(onsitePhone);
    await page.getByTestId("booking-nav-next").click();

    // Schritt 2: Paket muss in Staging bekannt und aktiv sein.
    await page.getByTestId(`booking-package-${packageKey}`).click();
    await page.getByTestId("booking-nav-next").click();

    // Schritt 3: Vorab reservierter Staging-Slot fuer reproduzierbare Deploy-Smoke-Tests.
    await page.getByTestId("booking-input-date").fill(bookingDate);
    await expect(page.getByTestId(slotTestId(bookingSlot))).toBeVisible({ timeout: 30_000 });
    await page.getByTestId(slotTestId(bookingSlot)).click();
    await page.getByTestId("booking-nav-next").click();

    // Schritt 4: Test-Kundendaten.
    await page.getByTestId("booking-input-company").fill(env("PLAYWRIGHT_BOOKING_COMPANY"));
    await page.getByTestId("booking-input-billing-name").fill(env("PLAYWRIGHT_BOOKING_NAME"));
    await page.getByTestId("booking-input-email").fill(env("PLAYWRIGHT_BOOKING_EMAIL"));
    await page.getByTestId("booking-input-phone").fill(env("PLAYWRIGHT_BOOKING_PHONE"));
    await page.getByTestId("booking-input-billing-street").fill(env("PLAYWRIGHT_BOOKING_STREET"));
    await page.getByTestId("booking-input-zip").fill(env("PLAYWRIGHT_BOOKING_ZIP"));
    await page.getByTestId("booking-input-city").fill(env("PLAYWRIGHT_BOOKING_CITY"));
    await page.getByTestId("booking-checkbox-agb").check();
    await page.getByTestId("booking-nav-submit").click();

    await expect(page.getByTestId("booking-thank-you-root")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("booking-thank-you")).toBeVisible();
    await expect(page.getByText(/#\d+/)).toBeVisible();
  });
});
