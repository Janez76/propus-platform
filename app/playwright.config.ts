import { defineConfig, devices } from "@playwright/test";

/**
 * E2E / Smoke: gebucht gegen produktive oder Staging-URL (BASE_URL, GitHub: Secret STAGING_URL).
 * Kein lokalen Next-Dev-Server nötig — reine Black-Box-Prüfung.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "https://admin.propus.ch",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
