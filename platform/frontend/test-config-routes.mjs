import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.ADMIN_TEST_BASE_URL || "http://127.0.0.1:5174";
const LOGIN_USER = process.env.ADMIN_TEST_USER || "";
const LOGIN_PASS = process.env.ADMIN_TEST_PASS || "";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(process.cwd(), "test-results", `config-routes-${RUN_ID}`);

mkdirSync(OUT_DIR, { recursive: true });

const TARGET_ROUTES = [
  "/settings",
  "/settings/team",
  "/settings/workflow",
  "/settings/exxas",
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
page.setDefaultTimeout(20_000);

const consoleErrors = [];
const pageErrors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") {
    consoleErrors.push(msg.text());
  }
});
page.on("pageerror", (err) => {
  pageErrors.push(err.message);
});

function sanitizeFilePart(input) {
  return String(input || "")
    .replace(/^\//, "")
    .replace(/[^\w-]/g, "_")
    .replace(/_+/g, "_");
}

async function screenshot(name) {
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
}

async function maybeLogin() {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_000);

  if (!LOGIN_USER || !LOGIN_PASS) {
    return { attempted: false, success: false, reason: "ADMIN_TEST_USER/ADMIN_TEST_PASS fehlen" };
  }

  const userInput = page
    .locator(
      'input[type="email"], input[name="email"], input[name="username"], input[type="text"], input:not([type])'
    )
    .first();
  const passInput = page.locator('input[type="password"]').first();
  const submitBtn = page
    .locator('button[type="submit"], button:has-text("Login"), button:has-text("Anmelden"), button:has-text("Einloggen")')
    .first();

  await userInput.fill(LOGIN_USER);
  await passInput.fill(LOGIN_PASS);
  await screenshot("01-login-filled");

  if ((await submitBtn.count()) > 0) {
    await submitBtn.click();
  } else {
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(2_000);

  const afterUrl = page.url();
  const success = !/\/login\b/i.test(afterUrl);
  return {
    attempted: true,
    success,
    reason: success ? "Login erfolgreich oder Session bereits aktiv" : "Login-Seite weiterhin aktiv",
  };
}

const routeResults = [];
const loginResult = await maybeLogin();

for (const route of TARGET_ROUTES) {
  const url = `${BASE_URL}${route}`;
  let ok = true;
  let reason = "";
  let status = null;
  let title = "";
  let bodySample = "";

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    status = response?.status?.() ?? null;
    await page.waitForTimeout(1_500);

    title = await page.title();
    bodySample = (await page.locator("body").innerText().catch(() => "")).slice(0, 800);

    if (status != null && status >= 400) {
      ok = false;
      reason = `HTTP ${status}`;
    }
    if (/Cannot GET|404|Not Found/i.test(bodySample)) {
      ok = false;
      reason = reason || "Body zeigt 404/Not Found";
    }
    if (/\/login\b/i.test(page.url())) {
      ok = false;
      reason = reason || "Auf Login umgeleitet (Session fehlt/ungültig)";
    }
  } catch (err) {
    ok = false;
    reason = err instanceof Error ? err.message : "Unbekannter Fehler";
  }

  await screenshot(`route-${sanitizeFilePart(route)}`);
  routeResults.push({ route, url, ok, reason, status, title, bodySample });
}

await browser.close();

const result = {
  baseUrl: BASE_URL,
  outDir: OUT_DIR,
  login: loginResult,
  routes: routeResults,
  consoleErrors,
  pageErrors,
  ok: routeResults.every((r) => r.ok),
  checkedAt: new Date().toISOString(),
};

const reportPath = join(OUT_DIR, "report.json");
writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");

console.log(`\nConfig-Route-Verifikation abgeschlossen.`);
console.log(`Base URL: ${BASE_URL}`);
console.log(`Report: ${reportPath}`);
for (const entry of routeResults) {
  console.log(`- ${entry.route}: ${entry.ok ? "OK" : `FAIL (${entry.reason || "unbekannt"})`}`);
}
if (consoleErrors.length || pageErrors.length) {
  console.log(`Console/Page Errors: ${consoleErrors.length + pageErrors.length}`);
}

if (!result.ok) {
  process.exit(1);
}
