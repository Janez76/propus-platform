import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:5174";
const useRemoteBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL?.trim());

/**
 * E2E: Buchungs-Wizard (Happy Path mit API-Mocks, kein Backend nötig).
 *
 * Lokal: `npm run test:e2e` startet Vite automatisch (Port 5174).
 * CI: `CI=1` setzen — dann kein reuseExistingServer, Browser muss installiert sein (`npx playwright install chromium`).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: useRemoteBaseUrl
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5174",
        /** Lokal: `npm run dev` vorher starten spart Zeit (Server wird wiederverwendet). */
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
