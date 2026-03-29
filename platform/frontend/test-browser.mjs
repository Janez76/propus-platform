import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';

const SCREENSHOTS_DIR = 'C:/Users/svajc/.cursor/worktrees/Buchungstool/cgy/admin-panel/screenshots';
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(10000);

async function shot(name) {
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/${name}.png`, fullPage: true });
  console.log(`[SCREENSHOT] ${name}.png`);
}

async function getPageInfo(label) {
  const url = page.url();
  const title = await page.title();
  const bodyText = await page.locator('body').innerText().catch(() => '(error reading body)');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  console.log(`\n=== ${label} ===`);
  console.log(`URL: ${url}`);
  console.log(`Title: ${title}`);
  console.log(`Body (first 600 chars): ${bodyText.substring(0, 600)}`);
  if (errors.length) console.log(`JS Errors: ${errors.join(', ')}`);
}

// Collect console errors
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', e => consoleErrors.push(`PAGEERROR: ${e.message}`));

// Step 1: Open login page
console.log('\n--- STEP 1: Login Page ---');
await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle' });
await getPageInfo('Login Page');
await shot('01-login');

// Step 2: Login
console.log('\n--- STEP 2: Performing Login ---');
// Try to find email/username input
const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i], input[placeholder*="user" i], input[id*="email" i], input[id*="user" i]').first();
const passwordInput = page.locator('input[type="password"]').first();

try {
  await emailInput.waitFor({ timeout: 5000 });
  await emailInput.fill('admin');
  console.log('Filled email/username field');
} catch {
  // Try any text input
  const inputs = page.locator('input[type="text"], input:not([type])');
  const count = await inputs.count();
  console.log(`No email input found, trying ${count} text inputs`);
  if (count > 0) await inputs.first().fill('admin');
}

try {
  await passwordInput.waitFor({ timeout: 3000 });
  await passwordInput.fill('Biel2503!');
  console.log('Filled password field');
} catch {
  console.log('No password field found');
}

await shot('02-login-filled');

// Submit
const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Anmelden"), button:has-text("Einloggen")').first();
try {
  await submitBtn.click();
  console.log('Clicked submit button');
} catch {
  console.log('No submit button found, pressing Enter');
  await page.keyboard.press('Enter');
}

await page.waitForTimeout(3000);
await getPageInfo('After Login');
await shot('03-after-login');

// Step 3: Check Sidebar
console.log('\n--- STEP 3: Check Sidebar for Reviews & Feedback ---');
const sidebarText = await page.locator('aside, nav, [class*="sidebar"], [class*="Sidebar"]').allInnerTexts().catch(() => []);
console.log('Sidebar text:', sidebarText.join(' | ').substring(0, 800));
const hasReviews = sidebarText.some(t => /review/i.test(t));
console.log('Has "Reviews" in sidebar:', hasReviews);
await shot('04-sidebar');

// Step 4: Navigate to /reviews
console.log('\n--- STEP 4: Navigate to /reviews ---');
await page.goto('http://localhost:5174/reviews', { waitUntil: 'networkidle' });
await getPageInfo('/reviews');
await shot('05-reviews');

// Step 5: Navigate to /settings
console.log('\n--- STEP 5: Navigate to /settings ---');
await page.goto('http://localhost:5174/settings', { waitUntil: 'networkidle' });
await getPageInfo('/settings');
const settingsText = await page.locator('body').innerText().catch(() => '');
const hasWorkflow = /workflow/i.test(settingsText);
const hasEmailTemplates = /e.?mail.?vorlage|email.?template/i.test(settingsText);
console.log('Has "Workflow" on /settings:', hasWorkflow);
console.log('Has "E-Mail-Vorlagen" on /settings:', hasEmailTemplates);
await shot('06-settings');

// Step 6: Navigate to /settings/workflow
console.log('\n--- STEP 6: Navigate to /settings/workflow ---');
await page.goto('http://localhost:5174/settings/workflow', { waitUntil: 'networkidle' });
await getPageInfo('/settings/workflow');
await shot('07-settings-workflow');

// Step 7: Navigate to /settings/email-templates
console.log('\n--- STEP 7: Navigate to /settings/email-templates ---');
await page.goto('http://localhost:5174/settings/email-templates', { waitUntil: 'networkidle' });
await getPageInfo('/settings/email-templates');
await shot('08-settings-email-templates');

// Summary
console.log('\n=== CONSOLE ERRORS COLLECTED ===');
if (consoleErrors.length === 0) {
  console.log('No console errors detected.');
} else {
  consoleErrors.forEach(e => console.log(' -', e));
}

await browser.close();
console.log('\nDone. Screenshots saved to:', SCREENSHOTS_DIR);
