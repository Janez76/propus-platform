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
const TARGETS = [
  {
    file: "booking/server.js",
    mountPrefix: "",
    tag: "booking",
  },
  // tours/server.js mountet die Router unter Präfixen, siehe `app.use(...)`-Aufrufe.
  { file: "tours/routes/admin-api.js", mountPrefix: "/admin/api", tag: "tours-admin" },
  { file: "tours/routes/admin.js", mountPrefix: "/admin", tag: "tours-admin" },
  { file: "tours/routes/api.js", mountPrefix: "/api", tag: "tours" },
  { file: "tours/routes/auth.js", mountPrefix: "", tag: "tours-auth" },
  { file: "tours/routes/cleanup.js", mountPrefix: "/cleanup", tag: "tours" },
  { file: "tours/routes/cron-api.js", mountPrefix: "", tag: "tours" },
  { file: "tours/routes/customer.js", mountPrefix: "/r", tag: "tours-customer" },
  { file: "tours/routes/gallery-admin-api.js", mountPrefix: "/admin/api", tag: "tours-admin" },
  { file: "tours/routes/gallery-public-api.js", mountPrefix: "/api", tag: "tours" },
  { file: "tours/routes/payrexx-webhook.js", mountPrefix: "/webhook", tag: "tours-webhook" },
  { file: "tours/routes/portal-api-mutations.js", mountPrefix: "/portal/api", tag: "tours-portal" },
  { file: "tours/routes/portal-api.js", mountPrefix: "/portal/api", tag: "tours-portal" },
  { file: "tours/routes/portal.js", mountPrefix: "/portal", tag: "tours-portal" },
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
  return p.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
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
function scanFile({ file, mountPrefix, tag }) {
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
      middleware: rest,
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
  const allRoutes = [];
  for (const t of TARGETS) {
    allRoutes.push(...scanFile(t));
  }

  // Kuratierte Spec laden, um deren Routen auszufiltern (kein Überschreiben).
  const manualSpecPath = path.join(REPO_ROOT, "docs/openapi/openapi.yaml");
  const manualPaths = new Set();
  if (fs.existsSync(manualSpecPath) && YAML) {
    const manual = YAML.load(fs.readFileSync(manualSpecPath, "utf8"));
    for (const p of Object.keys(manual.paths || {})) {
      for (const m of Object.keys(manual.paths[p])) {
        manualPaths.add(`${m}:${p}`);
      }
    }
  } else if (!YAML) {
    console.warn(
      "[extract-routes] js-yaml nicht gefunden — Dedup gegen openapi.yaml deaktiviert",
    );
  }

  const tags = new Set();
  const paths = {};
  let added = 0;
  let skipped = 0;
  for (const r of allRoutes) {
    const openapiPath = convertPath(r.path);
    const key = `${r.method}:${openapiPath}`;
    if (manualPaths.has(key)) {
      skipped++;
      continue;
    }
    if (!paths[openapiPath]) paths[openapiPath] = {};
    if (paths[openapiPath][r.method]) {
      // Gleiche Methode+Pfad-Duplikate (z. B. in booking/server.js mehrmals
      // definiert) — nur erstes Vorkommen dokumentieren.
      continue;
    }
    paths[openapiPath][r.method] = buildOperation(r, tags);
    added++;
  }

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Propus Platform — Auto-Generated Route Inventory",
      version: "1.0.0",
      description:
        "**Auto-generierter OpenAPI-Stub aller Routen aus `booking/server.js` und `tours/routes/*.js`.** " +
        "Kuratierte Routen aus `openapi.yaml` sind hier ausgenommen (Quelle dort).\n\n" +
        "Regenerieren: `node scripts/extract-routes.js`.\n\n" +
        "Request/Response-Schemas sind `additionalProperties: true` — manuelle Ergänzung empfohlen.",
      license: { name: "Proprietary", identifier: "LicenseRef-Proprietary" },
    },
    servers: [
      { url: "https://booking.propus.ch", description: "Produktion" },
      { url: "http://localhost:3100", description: "Lokale Entwicklung" },
    ],
    tags: Array.from(tags).sort().map((name) => ({ name })),
    security: [],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "opaque",
        },
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "admin_session",
        },
      },
      responses: {
        Unauthorized: {
          description: "Auth erforderlich oder ungültig",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { error: { type: "string" } },
              },
            },
          },
        },
        TooManyRequests: {
          description: "Rate-Limit überschritten",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { error: { type: "string" } },
              },
            },
          },
        },
        ServerError: {
          description: "Interner Fehler",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { error: { type: "string" } },
              },
            },
          },
        },
      },
    },
  };

  // Ausgabe als JSON — swagger-ui-express frisst JSON nativ und wir brauchen
  // keinen YAML-Emitter als zusätzliche Dep. Der Header ist nur Dokumentation.
  const outPath = path.join(REPO_ROOT, "docs/openapi/openapi-auto.json");
  spec["x-generator"] = {
    tool: "scripts/extract-routes.js",
    note: "AUTO-GENERATED — nicht direkt editieren. Regeneriere mit: node scripts/extract-routes.js",
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");

  console.log(`[extract-routes] scanned ${allRoutes.length} route definitions`);
  console.log(`[extract-routes] added ${added} auto-stubs, skipped ${skipped} curated`);
  console.log(`[extract-routes] wrote ${outPath}`);
}

main();
