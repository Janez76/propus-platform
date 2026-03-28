import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = 'https://admin-booking.propus.ch';
const SCREENSHOTS_DIR = 'C:/Users/svajc/.cursor/worktrees/Buchungstool/cgy/admin-panel/screenshots-prod';
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
page.setDefaultTimeout(15000);

const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', e => consoleErrors.push(`PAGEERROR: ${e.message}`));

async function shot(name) {
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/${name}.png`, fullPage: true });
  console.log(`[SCREENSHOT] ${name}.png`);
}

async function info(label) {
  const url = page.url();
  const title = await page.title().catch(() => '?');
  const body = await page.locator('body').innerText().catch(() => '(error)');
  console.log(`\n=== ${label} ===`);
  console.log(`URL: ${url}`);
  console.log(`Title: ${title}`);
  console.log(`Body (first 800 chars):\n${body.substring(0, 800)}`);
}

// Step 1: Login
console.log('\n--- STEP 1: Login ---');
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await info('Login Page');
await shot('01-login');

// Fill credentials
const emailInput = page.locator('input[type="email"], input[type="text"], input[name="email"], input[placeholder*="mail" i], input[placeholder*="user" i]').first();
const passwordInput = page.locator('input[type="password"]').first();

try {
  await emailInput.waitFor({ timeout: 5000 });
  await emailInput.fill('admin');
  console.log('Filled username field');
} catch { console.log('No email input found'); }

try {
  await passwordInput.waitFor({ timeout: 3000 });
  await passwordInput.fill('Biel2503!');
  console.log('Filled password field');
} catch { console.log('No password field found'); }

await shot('02-login-filled');

const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Anmelden"), button:has-text("Einloggen")').first();
try {
  await submitBtn.click();
  console.log('Clicked submit');
} catch { await page.keyboard.press('Enter'); }

await page.waitForTimeout(4000);
await info('After Login');
await shot('03-after-login');

// Step 2: Sidebar check
console.log('\n--- STEP 2: Sidebar / Reviews & Feedback ---');
const sidebarTexts = await page.locator('aside, nav, [class*="sidebar"], [class*="Sidebar"]').allInnerTexts().catch(() => []);
const hasReviews = sidebarTexts.some(t => /review/i.test(t));
console.log('Sidebar content:', sidebarTexts.join(' | ').substring(0, 600));
console.log('Has "Reviews" in sidebar:', hasReviews);
await shot('04-sidebar');

// Step 3: /reviews
console.log('\n--- STEP 3: /reviews ---');
await page.goto(`${BASE}/reviews`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await info('/reviews');
await shot('05-reviews');

// Step 4: /settings/workflow
console.log('\n--- STEP 4: /settings/workflow ---');
await page.goto(`${BASE}/settings/workflow`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await info('/settings/workflow');
await shot('06-settings-workflow');

// Step 5: /settings/email-templates
console.log('\n--- STEP 5: /settings/email-templates ---');
await page.goto(`${BASE}/settings/email-templates`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await info('/settings/email-templates');
await shot('07-settings-email-templates');

// Console errors
console.log('\n=== CONSOLE ERRORS ===');
if (consoleErrors.length === 0) console.log('None.');
else consoleErrors.forEach(e => console.log(' -', e));

await browser.close();
console.log('\nDone. Screenshots in:', SCREENSHOTS_DIR);
