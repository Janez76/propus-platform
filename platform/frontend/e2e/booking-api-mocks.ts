import type { Page, Route } from "@playwright/test";

/** Stabile Test-Paket-ID (muss zu data-testid booking-package-* passen) */
export const E2E_PACKAGE_KEY = "e2e_pkg";

const MOCK_CONFIG = {
  googleMapsKey: null,
  googleMapId: null,
  dbFieldHintsEnabled: false,
  provisionalBookingEnabled: false,
  vatRate: 0.081,
  chfRoundingStep: 0.05,
  keyPickupPrice: 0,
  lookaheadDays: 365,
  minAdvanceHours: 24,
};

const MOCK_CATALOG = {
  categories: [] as { key: string; name: string; active: boolean; sort_order: number }[],
  packages: [
    {
      key: E2E_PACKAGE_KEY,
      label: "E2E Paket",
      description: "Nur für automatisierte Tests",
      price: 399,
      sortOrder: 0,
    },
  ],
  addons: [] as { id: string; group: string; label: string; price: number }[],
  products: [] as unknown[],
};

const MOCK_PHOTOGRAPHERS = {
  ok: true,
  photographers: [{ key: "e2e_ph", name: "E2E Fotograf", initials: "E2", image: "" }],
};

const ADDRESS_SUGGEST_CH = {
  ok: true,
  results: [
    {
      type: "address",
      main: "Bahnhofstrasse 1",
      sub: "8001 Zürich",
      display: "Bahnhofstrasse 1, 8001 Zürich",
      street: "Bahnhofstrasse",
      houseNumber: "1",
      zip: "8001",
      city: "Zürich",
      countryCode: "CH",
      complete: true,
      lat: 47.3769,
      lng: 8.5417,
      lon: 8.5417,
    },
  ],
};

function jsonBody(data: unknown) {
  return JSON.stringify(data);
}

async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: jsonBody(data),
  });
}

/**
 * Ersetzt die Buchungs-relevanten API-Antworten, damit der Wizard ohne Backend/API-Keys durchläuft.
 */
export async function installBookingApiMocks(page: Page, opts: { availabilitySlots?: string[] } = {}) {
  const slots = opts.availabilitySlots ?? ["09:00", "14:00"];

  await page.route("**/api/config", (route) => void fulfillJson(route, MOCK_CONFIG));
  await page.route("**/api/catalog/products", (route) => void fulfillJson(route, MOCK_CATALOG));
  await page.route("**/api/catalog/photographers", (route) => void fulfillJson(route, MOCK_PHOTOGRAPHERS));
  await page.route("**/api/address-suggest**", (route) => void fulfillJson(route, ADDRESS_SUGGEST_CH));
  await page.route("**/api/availability**", (route) => {
    const url = new URL(route.request().url());
    const date = url.searchParams.get("date") ?? "";
    return fulfillJson(route, {
      photographer: url.searchParams.get("photographer") ?? "any",
      date,
      free: slots,
    });
  });
  await page.route("**/api/booking", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await fulfillJson(route, { ok: true, orderNo: 999001 });
  });
}
