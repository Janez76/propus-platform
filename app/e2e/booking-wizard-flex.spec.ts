import { test, expect } from "@playwright/test";
import {
  BOOKING_WIZARD_STORE_NAME,
  BOOKING_WIZARD_STORE_VERSION,
} from "../src/store/bookingWizardStore";

/**
 * Flex-Buchungs-Smoke: Wizard auf Step 3 vorbereiten, dann Buchungsart-Toggle
 * auf "flexible" schalten und prüfen, dass die Flex-Sektion (Deadline-Input,
 * Disposition-Hinweis) erscheint und der Photographer-Picker verschwindet.
 *
 * Wir umgehen Step 1+2 indem wir den Zustand des Zustand-Stores
 * (`BOOKING_WIZARD_STORE_NAME`) per `addInitScript` mit minimalen
 * Pflichtdaten vorbelegen — sonst wäre ein E2E-Lauf gegen die Live-API
 * nötig, der echte Aufträge anlegen würde.
 */

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

/** Minimal-Wizard-State auf Step 3 — Rückgabetyp ist `unknown`, weil wir
 *  die JSON-Form für localStorage produzieren und der Store bei der
 *  Hydration via `merge`/`migrate` fehlende Felder aus INITIAL ergänzt.
 *  So bleibt der Test-Seed klein und ohne tiefe Type-Acrobatics. */
function seedState(bookingKind: "fixed" | "flexible"): unknown {
  return {
    state: {
      step: 3,
      address: "Bahnhofstrasse 1, 8001 Zürich",
      coords: { lat: 47.3769, lng: 8.5417 },
      parsedAddress: { street: "Bahnhofstrasse", houseNumber: "1", zip: "8001", city: "Zürich" },
      object: {
        type: "wohnung",
        area: "100",
        floors: 1,
        rooms: "3.5",
        specials: "",
        desc: "",
        onsiteName: "Test",
        onsitePhone: "0791234567",
        onsiteEmail: "test@example.com",
        onsiteCalendarInvite: false,
        additionalOnsiteContacts: [],
        address: {
          street: "Bahnhofstrasse",
          houseNumber: "1",
          addressSuffix: "",
          zip: "8001",
          city: "Zürich",
          canton: "ZH",
          countryCode: "CH",
          lat: 47.3769,
          lng: 8.5417,
          formatted: "Bahnhofstrasse 1, 8001 Zürich",
        },
      },
      selectedPackage: { key: "basis", price: 500, label: "Basis-Paket", labelKey: "package.basis" },
      addons: [],
      photographer: { key: "any", name: "Kein Wunsch" },
      date: "",
      time: "",
      provisional: false,
      bookingKind,
      deadlineAt: "",
      flexibleEarliestAt: "",
      // billing absichtlich weglassen — der Store-Merge ist shallow, ein
      // leeres `billing: {}` wuerde die Default-INITIAL.billing-Struktur
      // (incl. `structured.contacts[0]` etc.) komplett ersetzen und
      // spaetere Renderings brechen.
      altBilling: false,
      discount: { code: "", percent: 0, amount: 0 },
      keyPickup: { enabled: false, address: "", info: "" },
      slotPeriod: "am",
      agbAccepted: false,
    },
    version: BOOKING_WIZARD_STORE_VERSION,
  };
}

async function gotoWizardOnStep3(page: import("@playwright/test").Page, baseURL: string | undefined, bookingKind: "fixed" | "flexible") {
  const path = bookingStartPath(baseURL);
  await page.addInitScript(({ key, payload }) => {
    try { window.localStorage.setItem(key, payload); } catch { /* noop */ }
  }, { key: BOOKING_WIZARD_STORE_NAME, payload: JSON.stringify(seedState(bookingKind)) });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // Landing-Klick: explizit auf Sichtbarkeit warten — `Locator.isVisible()`
  // kehrt sofort zurueck, ohne auf Sichtbarkeit zu warten, was zu einer
  // Race-Condition fuehrte: bei langsamem Laden wurde der Klick uebersprungen
  // und der Test blieb in der Landing-Page haengen.
  const landingStart = page.getByTestId("booking-landing-start");
  await expect(landingStart).toBeVisible({ timeout: 60_000 });
  await landingStart.click();
  await expect(page.getByTestId("booking-wizard")).toBeVisible({ timeout: 60_000 });
}

test.describe("Buchungs-Wizard Flex (Smoke)", () => {
  test("Step 3: Toggle 'Flexibel' zeigt Deadline-Input + Hinweis, blendet Photographer-Picker aus", async ({ page, baseURL }) => {
    await gotoWizardOnStep3(page, baseURL, "fixed");

    // Toggle muss sichtbar sein.
    await expect(page.getByTestId("booking-kind-fixed-label")).toBeVisible();
    await expect(page.getByTestId("booking-kind-flexible-label")).toBeVisible();

    // Anfangs: Fix → Date-Input sichtbar.
    await expect(page.getByTestId("booking-input-date")).toBeVisible();

    // Auf Flex umschalten — i18n-stabil ueber data-testid.
    await page.getByTestId("booking-kind-flexible-label").click();

    // Vollstaendige Sichtbarkeits-Matrix Flex-Modus:
    //  - Deadline-Input + Hinweis: sichtbar
    //  - gesamte Fix-Section (Photographer + Date + Time): ausgeblendet
    await expect(page.getByTestId("booking-input-deadline")).toBeVisible();
    await expect(page.getByTestId("booking-flex-disposition-hint")).toBeVisible();
    await expect(page.getByTestId("booking-fixed-section")).toBeHidden();
    await expect(page.getByTestId("booking-photographer-picker")).toBeHidden();
    await expect(page.getByTestId("booking-input-date")).toBeHidden();
    // booking-time-picker rendert nur wenn date gesetzt — entweder versteckt
    // oder gar nicht im DOM. toBeHidden erfasst beide Faelle.
    await expect(page.getByTestId("booking-time-picker")).toBeHidden();
  });

  test("Step 3 Flex: Deadline in der Zukunft setzen produziert keine Validation-Errors", async ({ page, baseURL }) => {
    await gotoWizardOnStep3(page, baseURL, "flexible");

    const deadlineInput = page.getByTestId("booking-input-deadline");
    await expect(deadlineInput).toBeVisible();

    // 14 Tage in der Zukunft → > +24h Mindestabstand.
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    const iso = deadline.toISOString().slice(0, 10);
    await deadlineInput.fill(iso);

    // Kein Banner-Error sichtbar (i18n-stabil ueber data-testid).
    await expect(page.getByTestId("booking-validation-errors")).toBeHidden();

    // "Weiter"-Button bleibt klickbar (kein disabled).
    const nextBtn = page.getByTestId("booking-nav-next");
    await expect(nextBtn).toBeEnabled();
  });
});
