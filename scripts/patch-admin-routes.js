/**
 * Ersetzt alle EJS-Render-Aufrufe in tours/routes/admin.js durch React-SPA-Redirects.
 * Läuft einmal durch und schreibt das Ergebnis zurück.
 */

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'tours', 'routes', 'admin.js');
let src = fs.readFileSync(file, 'utf8');

const ORIGINAL_LEN = src.length;

// 1. Füge reactUrl-Hilfsfunktion nach der router-Deklaration hinzu
const REACT_URL_HELPER = `
/**
 * Baut eine absolute URL zur React-SPA (Platform-Frontend).
 * Umgeht den Mount-Path-Rewrite-Middleware aus tours/server.js,
 * der relative Pfade mit /tour-manager prefixiert.
 */
function reactUrl(req, spaPart) {
  const base = process.env.APP_BASE_URL || (req.protocol + '://' + req.get('host'));
  return base.replace(/\\/$/, '') + spaPart;
}
`;

src = src.replace(
  "const router = express.Router();",
  "const router = express.Router();\n" + REACT_URL_HELPER
);

// 2. Hilfsfunktion: ersetzt eine GET-Route (die EJS rendert) durch einen Redirect.
//    Matcht von router.get('PATH', async... bis zum ersten });  an Zeilenanfang.
function replaceGetRoute(src, routePath, redirectPath, preserveQueryString = false) {
  // Escape special regex chars in path
  const escapedPath = routePath.replace(/[/.*+?^${}()|[\]\\]/g, '\\$&');

  // Match: router.get('PATH', async (req, res) => { ...whole body... });
  // The closing }); must be at the start of a line (no indentation)
  const pattern = new RegExp(
    `router\\.get\\('${escapedPath}',\\s+async\\s*\\([^)]*\\)\\s*=>\\s*\\{[\\s\\S]*?^\\}\\);`,
    'gm'
  );

  let redirect;
  if (preserveQueryString) {
    if (routePath.includes(':id')) {
      redirect = `router.get('${routePath}', (req, res) => {\n  const qs = new URLSearchParams(req.query).toString();\n  res.redirect(reactUrl(req, '${redirectPath}/' + req.params.id + (qs ? '?' + qs : '')));\n});`;
    } else {
      redirect = `router.get('${routePath}', (req, res) => {\n  const qs = new URLSearchParams(req.query).toString();\n  res.redirect(reactUrl(req, '${redirectPath}' + (qs ? '?' + qs : '')));\n});`;
    }
  } else if (routePath.includes(':id')) {
    const partsAfter = redirectPath.replace(':id', "' + req.params.id + '");
    redirect = `router.get('${routePath}', (req, res) => {\n  res.redirect(reactUrl(req, '${partsAfter}'));\n});`;
  } else {
    redirect = `router.get('${routePath}', (req, res) => {\n  res.redirect(reactUrl(req, '${redirectPath}'));\n});`;
  }

  const matches = [...src.matchAll(pattern)];
  if (matches.length === 0) {
    console.warn(`  [WARN] No match for: ${routePath}`);
    return src;
  }
  if (matches.length > 1) {
    console.warn(`  [WARN] Multiple matches for: ${routePath}`);
  }
  const match = matches[0];
  console.log(`  Replacing GET '${routePath}' (${match[0].length} chars) → redirect to ${redirectPath}`);
  return src.slice(0, match.index) + redirect + src.slice(match.index + match[0].length);
}

// Ebenfalls: handleRenewalInvoices - die res.render darin durch redirect ersetzen
function replaceRenderInFunction(src, renderTarget, redirectPath) {
  const escapedTarget = renderTarget.replace(/[/.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `res\\.render\\('${escapedTarget}',\\s*\\{[\\s\\S]*?\\}\\);`,
    'm'
  );
  const match = src.match(pattern);
  if (!match) {
    console.warn(`  [WARN] No render match for: ${renderTarget}`);
    return src;
  }
  const redirect = `res.redirect(reactUrl(req, '${redirectPath}'));`;
  console.log(`  Replacing render '${renderTarget}' in helper function → redirect`);
  return src.replace(pattern, redirect);
}

console.log('Patching tours/routes/admin.js...');

// Alle GET-Routes ersetzen
src = replaceGetRoute(src, '/dashboard', '/admin/tours');
src = replaceGetRoute(src, '/ai-chat', '/admin/tours/ai-chat');
src = replaceGetRoute(src, '/settings', '/admin/tours/settings');
src = replaceGetRoute(src, '/email-templates', '/admin/tours/email-templates');
src = replaceGetRoute(src, '/portal-roles', '/admin/tours/portal-roles');
src = replaceGetRoute(src, '/team', '/admin/tours/team');
src = replaceGetRoute(src, '/automations', '/admin/tours/automations');
src = replaceGetRoute(src, '/tours', '/admin/tours/list', true);  // preserveQueryString
src = replaceGetRoute(src, '/invoices', '/admin/tours/invoices');
src = replaceGetRoute(src, '/bank-import', '/admin/tours/bank-import');
src = replaceGetRoute(src, '/tours/:id', '/admin/tours/:id');
src = replaceGetRoute(src, '/tours/:id/link-invoice', '/admin/tours/:id/link-invoice');
src = replaceGetRoute(src, '/link-matterport', '/admin/tours/link-matterport', true);
src = replaceGetRoute(src, '/tours/:id/link-exxas-customer', '/admin/tours/:id/link-exxas-customer');
src = replaceGetRoute(src, '/customers', '/admin/tours/customers', true);
src = replaceGetRoute(src, '/customers/new', '/admin/tours/customers/new');
src = replaceGetRoute(src, '/customers/:id', '/admin/tours/customers/:id');

// handleRenewalInvoices-Funktion hat auch res.render (wird von GET /invoices aufgerufen)
src = replaceRenderInFunction(src, 'admin/invoices', '/admin/tours/invoices');

console.log(`\nDone. Chars: ${ORIGINAL_LEN} → ${src.length} (delta: ${src.length - ORIGINAL_LEN})`);

// Verify no admin EJS renders remain
const remaining = [...src.matchAll(/res\.render\('admin\//g)];
if (remaining.length > 0) {
  console.warn(`\n[WARN] Still ${remaining.length} admin EJS render calls remaining!`);
} else {
  console.log('[OK] No admin EJS render calls remaining.');
}

fs.writeFileSync(file, src, 'utf8');
console.log('File written.');
