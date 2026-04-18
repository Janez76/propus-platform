#!/usr/bin/env node
// scripts/extract-routes.js
//
// Parst Express-Routen-Definitionen aus booking/server.js und tours/routes/*.js
// via Regex und generiert einen OpenAPI-3.1-Stub pro Route.
//
// Ziel: Vollständiges Endpoint-Inventar als openapi-auto.yaml, das Swagger UI
// zusammen mit der kuratierten openapi.yaml anzeigen kann.
//
// Begrenzungen (bewusst, kein Bug):
// - Request/Response-Schemas werden NICHT extrahiert (`additionalProperties: true`).
// - Pfad-Parameter werden aus `:name`-Syntax in `{name}` umgeschrieben.
// - Auth wird aus Middleware-Namen grob abgeleitet (requireAdmin → bearerAuth).
// - Kuratierte Routen aus openapi.yaml werden NICHT überschrieben, sondern
//   gemerget (manuelle Einträge haben Vorrang).
//
// Aufruf: node scripts/extract-routes.js

"use strict";

const fs = require("fs");
const path = require("path");
// js-yaml liegt in app/node_modules (React-Build-Toolchain). Wir importieren
// von dort, um keinen neuen Top-Level-Dep einführen zu müssen. Fallback: JSON.
let YAML;
try {
  YAML = require(path.resolve(__dirname, "../app/node_modules/js-yaml"));
} catch {
  YAML = null;
}

const REPO_ROOT = path.resolve(__dirname, "..");

// ── Scan-Targets ────────────────────────────────────────────────────────────
//
// Mount-Präfixe entsprechen der **Platform-Realität** (platform/server.js),
// nicht der standalone tours/server.js — so zeigen die Pfade auf URLs, die
// unter https://booking.propus.ch tatsächlich callable sind. `mountAuth`
// hält auth-relevante Middleware, die in platform/server.js vor dem Router
// hängt und sonst in der pro-Route-Erkennung nicht auftauchen würde.
//
// Referenzen:
//   platform/server.js:125  → requireAdmin vor /api/tours/admin
//   platform/server.js:126  → requireAdmin vor /api/tours/admin/galleries
//   platform/server.js:135  → tours.app unter TOURS_MOUNT_PATH (`/tour-manager`)
//   tours/server.js:191     → requireAdminOrRedirect vor /admin
//   tours/server.js:194     → requireAdminOrRedirect vor /admin/api (intern)
const TOURS_MOUNT = "/tour-manager"; // platform/server.js:40 TOURS_MOUNT_PATH
const TARGETS = [
  {
    file: "booking/server.js",
    mountPrefix: "",
    tag: "booking",
  },
  // Direkt-Mounts in platform/server.js — die kanonischen Admin-URLs.
  {
    file: "tours/routes/admin-api.js",
    mountPrefix: "/api/tours/admin",
    mountAuth: "requireAdmin",
    tag: "tours-admin",
  },
  {
    file: "tours/routes/gallery-admin-api.js",
    mountPrefix: "/api/tours/admin/galleries",
    mountAuth: "requireAdmin",
    tag: "tours-admin",
  },
  {
    file: "tours/routes/cron-api.js",
    mountPrefix: "/api/tours/cron",
    tag: "tours",
  },
  {
    file: "tours/routes/gallery-public-api.js",
    mountPrefix: "/api/listing",
    tag: "tours",
  },
  // Standalone tours.app — läuft in der Platform unter `/tour-manager/*`.
  // tours/server.js:116 webhook, 182 /r, 185 /cleanup, 188 authRoutes, 191 /admin,
  // 194 /admin/api (intern), 197 /portal/api, 200 /portal/api, 203 /portal, 206 /api
  {
    file: "tours/routes/payrexx-webhook.js",
    mountPrefix: `${TOURS_MOUNT}/webhook`,
    tag: "tours-webhook",
  },
  {
    file: "tours/routes/customer.js",
    mountPrefix: `${TOURS_MOUNT}/r`,
    tag: "tours-customer",
  },
  {
    file: "tours/routes/cleanup.js",
    mountPrefix: "/cleanup", // platform/server.js:133 mountet cleanup direkt
    tag: "tours",
  },
  {
    file: "tours/routes/auth.js",
    mountPrefix: TOURS_MOUNT,
    tag: "tours-auth",
  },
  {
    file: "tours/routes/admin.js",
    mountPrefix: `${TOURS_MOUNT}/admin`,
    mountAuth: "requireAdminOrRedirect",
    tag: "tours-admin",
  },
  {
    file: "tours/routes/api.js",
    mountPrefix: `${TOURS_MOUNT}/api`,
    tag: "tours",
  },
  {
    file: "tours/routes/portal-api.js",
    mountPrefix: `${TOURS_MOUNT}/portal/api`,
    tag: "tours-portal",
  },
  {
    file: "tours/routes/portal-api-mutations.js",
    mountPrefix: `${TOURS_MOUNT}/portal/api`,
    tag: "tours-portal",
  },
  {
    file: "tours/routes/portal.js",
    mountPrefix: `${TOURS_MOUNT}/portal`,
    tag: "tours-portal",
  },
];

// ── Regex: zieht Methode, Pfad und rohe Argument-Liste aus .get/.post/... ──
// Erfasst sowohl `app.METHOD(...)` als auch `router.METHOD(...)`.
const ROUTE_RE =
  /^\s*(app|router)\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\3\s*,?\s*([^{=]*?)(?:async\s*)?(?:\([^)]*\)\s*=>|function)/gm;

// ── Auth-Ableitung ─────────────────────────────────────────────────────────
const AUTH_MIDDLEWARES = {
  requireAdmin: "admin",
  requirePhotographerOrAdmin: "admin-or-photographer",
  requireCustomer: "customer",
  requireAdminOrRedirect: "admin",
  requirePortalAuth: "portal",
  requirePortalSession: "portal",
};

function deriveSecurity(middlewareSegment) {
  const names = Object.keys(AUTH_MIDDLEWARES);
  for (const n of names) {
    if (middlewareSegment.includes(n)) {
      // Alle geschützten Routen akzeptieren Bearer oder Cookie.
      return [{ bearerAuth: [] }, { sessionCookie: [] }];
    }
  }
  return []; // public
}

// ── Rate-Limit-Ableitung ───────────────────────────────────────────────────
const RATE_LIMITERS = [
  "authLimiter",
  "confirmTokenLimiter",
  "bookingLimiter",
  "passwordResetLimiter",
];
function deriveRateLimit(middlewareSegment) {
  for (const lim of RATE_LIMITERS) {
    if (middlewareSegment.includes(lim)) return lim;
  }
  return null;
}

// ── Express `:name` → OpenAPI `{name}` ─────────────────────────────────────
function convertPath(p) {
  let out = p.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
  // Trailing Slashes entfernen (OpenAPI-Linter erlaubt sie nicht, Express
  // behandelt `/foo` und `/foo/` per Default identisch).
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}
function extractParams(p) {
  const out = [];
  const re = /:([a-zA-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(p)) !== null) {
    out.push({
      in: "path",
      name: m[1],
      required: true,
      schema: { type: "string" },
    });
  }
  return out;
}

// ── Scanner ────────────────────────────────────────────────────────────────
function scanFile(target) {
  const { file, mountPrefix, tag } = target;
  const full = path.join(REPO_ROOT, file);
  if (!fs.existsSync(full)) {
    console.warn(`[skip] ${file} not found`);
    return [];
  }
  const src = fs.readFileSync(full, "utf8");
  const routes = [];

  // Line-by-line scan, damit wir Zeilennummern haben.
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m =
      /^\s*(app|router)\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\3\s*(.*)/.exec(
        line,
      );
    if (!m) continue;
    const method = m[2].toLowerCase();
    const rawPath = m[4];
    const rest = m[5] || "";
    routes.push({
      file,
      line: i + 1,
      method,
      path: mountPrefix + rawPath,
      rawPath,
      // Mount-Level-Middleware (z. B. `requireAdmin` in platform/server.js)
      // mit route-lokaler Middleware kombinieren, damit Security korrekt
      // abgeleitet wird — sonst würden geschützte Routen als public markiert.
      middleware: (target.mountAuth ? target.mountAuth + " " : "") + rest,
      tag,
    });
  }
  return routes;
}

function buildOperation(route, allTags) {
  const op = {
    tags: [route.tag],
    summary: `TODO: ${route.method.toUpperCase()} ${route.path}`,
    description: `**Auto-generierter Stub.** Quelle: \`${route.file}:${route.line}\`. Schemas noch nicht dokumentiert.`,
    operationId: makeOperationId(route),
    "x-source-file": route.file,
    "x-source-line": route.line,
  };

  const params = extractParams(route.rawPath);
  if (params.length) op.parameters = params;

  if (["post", "put", "patch"].includes(route.method)) {
    op.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: { type: "object", additionalProperties: true },
        },
      },
    };
  }

  const security = deriveSecurity(route.middleware);
  if (security.length) op.security = security;

  const rateLim = deriveRateLimit(route.middleware);
  if (rateLim) {
    op.description += `\n\n**Rate-Limit:** \`${rateLim}\` (siehe \`booking/rate-limiters.js\`).`;
  }

  const responses = {
    "200": {
      description: "OK",
      content: {
        "application/json": {
          schema: { type: "object", additionalProperties: true },
        },
      },
    },
  };
  if (security.length) {
    responses["401"] = { $ref: "#/components/responses/Unauthorized" };
  }
  if (rateLim) {
    responses["429"] = { $ref: "#/components/responses/TooManyRequests" };
  }
  responses["5XX"] = { $ref: "#/components/responses/ServerError" };
  op.responses = responses;

  allTags.add(route.tag);
  return op;
}

const seenOperationIds = new Set();
function makeOperationId(route) {
  // e.g. "getApiAdminOrdersOrderNoEmailLog"
  // `:param` und `{param}` werden zu PascalCase ohne Sonderzeichen.
  const slug = route.path
    .replace(/[{}:]/g, "")
    .split("/")
    .filter(Boolean)
    .map((s) => {
      const clean = s.replace(/[^a-zA-Z0-9]/g, "");
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    })
    .join("");
  let id = (route.method + slug).slice(0, 120);
  // Kollisionen bei mehrdeutigen Pfaden (nicht erwartet, aber sicher).
  let suffix = 2;
  let unique = id;
  while (seenOperationIds.has(unique)) {
    unique = `${id}${suffix++}`;
  }
  seenOperationIds.add(unique);
  return unique;
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  if (!YAML) {
    console.error(
      "[extract-routes] js-yaml nicht verfügbar (app/node_modules). Abbruch.",
    );
    process.exit(1);
  }

  const allRoutes = [];
  for (const t of TARGETS) {
    allRoutes.push(...scanFile(t));
  }

  // Kuratierte Spec laden — wir MERGEN in diese Datei, kein Überschreiben
  // der manuellen Einträge. Auto-Stubs (erkennbar an `x-source-file`) werden
  // vor der Regeneration weggeworfen, damit gelöschte Routen nicht ewig bleiben.
  const specPath = path.join(REPO_ROOT, "docs/openapi/openapi.yaml");
  const spec = YAML.load(fs.readFileSync(specPath, "utf8"));
  spec.paths = spec.paths || {};
  const manualPaths = new Set();
  // Trailing-Slash-Normalisierung auf existierende Keys: ältere Stubs hatten
  // `/admin/api/` etc., der Linter verbietet das.
  for (const p of Object.keys(spec.paths)) {
    const normalized = p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
    if (normalized !== p) {
      spec.paths[normalized] = spec.paths[p];
      delete spec.paths[p];
    }
  }
  for (const p of Object.keys(spec.paths)) {
    for (const m of Object.keys(spec.paths[p])) {
      const op = spec.paths[p][m];
      if (op && op["x-source-file"]) {
        // Auto-Stub → wird neu generiert, NICHT als manual merken.
        delete spec.paths[p][m];
      } else {
        manualPaths.add(`${m}:${p}`);
        if (op && op.operationId) seenOperationIds.add(op.operationId);
      }
    }
    if (Object.keys(spec.paths[p]).length === 0) delete spec.paths[p];
  }

  const tags = new Set((spec.tags || []).map((t) => t.name));
  let added = 0;
  let skipped = 0;
  for (const r of allRoutes) {
    const openapiPath = convertPath(r.path);
    const key = `${r.method}:${openapiPath}`;
    if (manualPaths.has(key)) {
      skipped++;
      continue;
    }
    if (!spec.paths[openapiPath]) spec.paths[openapiPath] = {};
    if (spec.paths[openapiPath][r.method]) {
      // Gleiche Methode+Pfad-Duplikate (z. B. in booking/server.js mehrmals
      // definiert) — nur erstes Vorkommen dokumentieren.
      continue;
    }
    spec.paths[openapiPath][r.method] = buildOperation(r, tags);
    added++;
  }

  // Tags aktualisieren (alphabetisch, ohne bestehende Descriptions zu verlieren).
  const existingTagMap = new Map((spec.tags || []).map((t) => [t.name, t]));
  spec.tags = Array.from(tags)
    .sort()
    .map((name) => existingTagMap.get(name) || { name });

  // Security Schemes ergänzen falls noch nicht vorhanden (für Auto-Stubs nötig).
  spec.components = spec.components || {};
  spec.components.securitySchemes = spec.components.securitySchemes || {};
  spec.components.responses = spec.components.responses || {};
  if (!spec.components.responses.Unauthorized) {
    spec.components.responses.Unauthorized = {
      description: "Auth erforderlich oder ungültig",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    };
  }
  spec["x-generator"] = {
    tool: "scripts/extract-routes.js",
    note:
      "Auto-Stubs via `node scripts/extract-routes.js` gemerget. Kuratierte Einträge (mit echten Schemas) bleiben unangetastet; Stubs haben `summary: TODO` und sind an `x-source-file`/`x-source-line` erkennbar.",
    lastRun: new Date().toISOString(),
    routesScanned: allRoutes.length,
    curatedSkipped: skipped,
    autoAdded: added,
  };

  // Zurück als YAML schreiben — bleibt menschlich editierbar, kuratierte
  // Einträge können per Hand weiter ausgebaut werden.
  const out = YAML.dump(spec, { lineWidth: 0, noRefs: true, sortKeys: false });
  const header =
    "# Propus Platform — Unified OpenAPI 3.1 Spec\n" +
    "#\n" +
    "# Diese Datei enthält sowohl kuratierte Einträge (mit echten Schemas)\n" +
    "# als auch auto-generierte Stubs aus booking/server.js + tours/routes/*.js.\n" +
    "# Auto-Stubs sind an `summary: 'TODO: ...'` und `x-source-file` erkennbar.\n" +
    "#\n" +
    "# Stubs regenerieren: `node scripts/extract-routes.js`\n" +
    "# Manuelle Einträge bleiben beim Regen erhalten.\n\n";
  fs.writeFileSync(specPath, header + out);

  console.log(`[extract-routes] scanned ${allRoutes.length} route definitions`);
  console.log(`[extract-routes] added ${added} auto-stubs, skipped ${skipped} curated`);
  console.log(`[extract-routes] wrote ${specPath}`);
}

main();
