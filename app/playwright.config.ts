import { defineConfig, devices } from "@playwright/test";

/**
 * E2E / Smoke: Black-Box gegen oeffentliche Base-URL (lokal: `BASE_URL` setzen).
 * CI-Workflow: Secret STAGING_URL oder Default booking.propus.ch (nicht zwingend
 * admin.*, siehe docs/BOOKING-E2E-DEPLOY.md).
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "https://booking.propus.ch",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
