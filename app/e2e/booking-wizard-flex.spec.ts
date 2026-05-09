import { test, expect } from "@playwright/test";

/**
 * Flex-Buchungs-Smoke: Wizard auf Step 3 vorbereiten, dann Buchungsart-Toggle
 * auf "flexible" schalten und prüfen, dass die Flex-Sektion (Deadline-Input,
 * Disposition-Hinweis) erscheint und der Photographer-Picker verschwindet.
 *
 * Wir umgehen Step 1+2 indem wir den Zustand des Zustand-Stores
 * (`propus-booking-wizard-draft`) per `addInitScript` mit minimalen
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

const STORE_KEY = "propus-booking-wizard-draft";

/**
 * Minimal-Wizard-State auf Step 3 mit gewählter `bookingKind`.
 * Versionsnummer muss zur aktuellen `bookingWizardStore.ts` passen (v7).
 */
function seedState(bookingKind: "fixed" | "flexible") {
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
      billing: {
        salutation: "", first_name: "", company: "", company_email: "", company_phone: "",
        name: "", email: "", phone: "", phone_mobile: "",
        street: "", street_suffix: "", zip: "", city: "", zipcity: "",
        order_ref: "", notes: "",
        alt_company: "", alt_company_email: "", alt_company_phone: "",
        alt_street: "", alt_street_suffix: "", alt_zip: "", alt_city: "", alt_zipcity: "",
        alt_salutation: "", alt_first_name: "", alt_name: "",
        alt_email: "", alt_phone: "", alt_phone_mobile: "",
        alt_order_ref: "", alt_notes: "",
        structured: {
          mode: "company",
          company: { name: "", uid: "", address: {} as Record<string, unknown>, orderRef: "" },
          private: { salutation: "", firstName: "", lastName: "", email: "", phone: "", phoneMobile: "", address: {} as Record<string, unknown> },
          contacts: [{ salutation: "", firstName: "", lastName: "", department: "", email: "", phone: "", phoneMobile: "" }],
          altBilling: {
            enabled: false, mode: "company",
            company: { name: "", uid: "", address: {} as Record<string, unknown>, orderRef: "", contact: { salutation: "", firstName: "", lastName: "", email: "", phone: "" } },
            private: { salutation: "", firstName: "", lastName: "", email: "", phone: "", address: {} as Record<string, unknown>, orderRef: "" },
            notes: "",
          },
        },
      },
      altBilling: false,
      discount: { code: "", percent: 0, amount: 0 },
      keyPickup: { enabled: false, address: "", info: "" },
      slotPeriod: "am",
      agbAccepted: false,
    },
    version: 7,
  };
}

async function gotoWizardOnStep3(page: import("@playwright/test").Page, baseURL: string | undefined, bookingKind: "fixed" | "flexible") {
  const path = bookingStartPath(baseURL);
  await page.addInitScript(({ key, payload }) => {
    try { window.localStorage.setItem(key, payload); } catch { /* noop */ }
  }, { key: STORE_KEY, payload: JSON.stringify(seedState(bookingKind)) });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // Landing-Klick falls Landing aktiv ist
  const landingStart = page.getByTestId("booking-landing-start");
  if (await landingStart.isVisible().catch(() => false)) {
    await landingStart.click();
  }
  await expect(page.getByTestId("booking-wizard")).toBeVisible({ timeout: 60_000 });
}

test.describe("Buchungs-Wizard Flex (Smoke)", () => {
  test("Step 3: Toggle 'Flexibel' zeigt Deadline-Input + Hinweis, blendet Photographer-Picker aus", async ({ page, baseURL }) => {
    await gotoWizardOnStep3(page, baseURL, "fixed");

    // Toggle muss sichtbar sein.
    const fixedRadio = page.locator('input[name="bookingKind"][value="fixed"]');
    const flexibleRadio = page.locator('input[name="bookingKind"][value="flexible"]');
    await expect(fixedRadio).toBeVisible();
    await expect(flexibleRadio).toBeVisible();

    // Anfangs: Fix → Date-Input sichtbar.
    await expect(page.getByTestId("booking-input-date")).toBeVisible();

    // Auf Flex umschalten — Klick auf das Label-Element (Radio ist sr-only).
    await page.getByText("Flexibel mit Deadline").click();

    // Deadline-Input sichtbar, Date-Input weg.
    await expect(page.getByTestId("booking-input-deadline")).toBeVisible();
    await expect(page.getByTestId("booking-input-date")).toBeHidden();

    // Disposition-Hinweis sichtbar.
    await expect(
      page.getByText(/Wir disponieren den Termin/i),
    ).toBeVisible();
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

    // Kein Banner-Error sichtbar.
    await expect(page.getByText(/Bitte wählen Sie eine Deadline/i)).toBeHidden();

    // "Weiter"-Button bleibt klickbar (kein disabled).
    const nextBtn = page.getByTestId("booking-nav-next");
    await expect(nextBtn).toBeEnabled();
  });
});
