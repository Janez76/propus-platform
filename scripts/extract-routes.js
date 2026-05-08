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
//
// Session/Bearer-Guards (bearerAuth + sessionCookie).
const AUTH_MIDDLEWARES = {
  requireAdmin: "admin",
  requirePhotographerOrAdmin: "admin-or-photographer",
  requireCustomer: "customer",
  requireAdminOrRedirect: "admin",
  requirePortalAuth: "portal",
  requirePortalSession: "portal",
  // Next.js App-Router Auth-Helpers — werden im Route-Body als Funktion
  // aufgerufen (nicht als Middleware), aber das Sicherheits-Modell ist
  // identisch zum Express-Pendant.
  resolveAssistantUser: "admin-or-photographer-or-tour-manager",
  getAdminSession: "admin",
  requireAdminLayoutSession: "admin",
  requireAssistantTrainingAccess: "super_admin",
};
// API-Key-Guards (separates Scheme, z. B. Cron-Endpoints).
const API_KEY_MIDDLEWARES = ["requireApiKey"];

function deriveSecurity(middlewareSegment) {
  for (const n of API_KEY_MIDDLEWARES) {
    if (middlewareSegment.includes(n)) {
      return [{ apiKeyAuth: [] }];
    }
  }
  for (const n of Object.keys(AUTH_MIDDLEWARES)) {
    if (middlewareSegment.includes(n)) {
      // Alle session-geschützten Routen akzeptieren Bearer oder Cookie.
      return [{ bearerAuth: [] }, { sessionCookie: [] }];
    }
  }
  return []; // public
}

// Sammelt alle auth-relevanten `router.use(<name>)`-Aufrufe im File und
// liefert pro Zeilennummer die kumulierte Middleware-Liste. Express führt
// `router.use(fn)` in Reihenfolge aus — ein Guard gilt für alle Routen,
// die nach ihm registriert werden. Path-Form `router.use('/path', ...)`
// wird bewusst ignoriert (pfadspezifischer Mount, nicht globaler Guard).
function collectRouterUseGuards(src) {
  const known = new Set([
    ...Object.keys(AUTH_MIDDLEWARES),
    ...API_KEY_MIDDLEWARES,
  ]);
  const lines = src.split("\n");
  const guards = []; // { line, name }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Nur `router.use(IDENT)` oder `app.use(IDENT)` ohne Pfad-String als Arg 1.
    const m = /^\s*(?:router|app)\.use\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[),]/.exec(
      line,
    );
    if (!m) continue;
    const name = m[1];
    if (known.has(name)) guards.push({ line: i + 1, name });
  }
  return guards;
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
  // Express `:name` UND OpenAPI `{name}` — letzteres entsteht bereits beim
  // Next.js-Scanner, wo wir [name] direkt zu {name} umschreiben.
  const seen = new Set();
  const expressRe = /:([a-zA-Z0-9_]+)/g;
  const openapiRe = /\{([a-zA-Z0-9_]+)\}/g;
  for (const re of [expressRe, openapiRe]) {
    let m;
    while ((m = re.exec(p)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({
        in: "path",
        name,
        required: true,
        schema: { type: "string" },
      });
    }
  }
  return out;
}

// Extrahiert simple `const IDENT = "literal";`-Zuweisungen aus einem File.
// Wird genutzt, um Routen wie `app.get(ADDRESS_AUTOCOMPLETE_ENDPOINT, ...)`
// aufzulösen — sonst würden solche Endpoints im OpenAPI-Inventar fehlen.
function collectStringConstants(src) {
  const out = new Map(); // name → literal
  const re =
    /^\s*(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['"`])([^'"`]+)\2\s*;?\s*$/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.set(m[1], m[3]);
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

  // Erst die `router.use(X)`-Guards im File sammeln, damit wir pro Route
  // wissen, welche Middlewares vor ihrer Registrierung aktiv geworden sind.
  const routerUseGuards = collectRouterUseGuards(src);
  // Simple String-Konstanten zum Auflösen identifier-basierter Routen
  // (z. B. `app.get(ADDRESS_AUTOCOMPLETE_ENDPOINT, ...)`).
  const stringConstants = collectStringConstants(src);

  // Line-by-line scan, damit wir Zeilennummern haben.
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Erstes Argument ist entweder ein Stringliteral ODER ein Identifier.
    // Bei Identifier wird der Wert über `stringConstants` aufgelöst; fehlt
    // er, wird die Route übersprungen (Warning), damit wir keine Fantasie-
    // Pfade dokumentieren.
    const litMatch =
      /^\s*(app|router)\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\3\s*(.*)/.exec(
        line,
      );
    const identMatch = !litMatch
      ? /^\s*(app|router)\.(get|post|put|patch|delete)\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(.*)/.exec(
          line,
        )
      : null;
    let method, rawPath, rest;
    if (litMatch) {
      method = litMatch[2].toLowerCase();
      rawPath = litMatch[4];
      rest = litMatch[5] || "";
    } else if (identMatch) {
      const ident = identMatch[3];
      const resolved = stringConstants.get(ident);
      if (!resolved) {
        console.warn(
          `[extract-routes] ${file}:${i + 1} identifier ${ident} not resolved, skipping`,
        );
        continue;
      }
      method = identMatch[2].toLowerCase();
      rawPath = resolved;
      rest = identMatch[4] || "";
    } else {
      continue;
    }
    // Alle `router.use(X)`-Guards, die VOR dieser Route registriert sind,
    // gelten laut Express-Semantik für die Route — bisher haben wir die
    // ignoriert, wodurch z. B. `tours/routes/portal-api.js`-Endpunkte
    // (`router.use(requirePortalSession)`) fälschlich als public markiert
    // wurden.
    const inheritedGuards = routerUseGuards
      .filter((g) => g.line < i + 1)
      .map((g) => g.name)
      .join(" ");
    routes.push({
      file,
      line: i + 1,
      method,
      path: mountPrefix + rawPath,
      rawPath,
      // Mount-Level-Middleware (z. B. `requireAdmin` in platform/server.js)
      // + geerbte `router.use(...)`-Guards + route-lokale Middleware.
      middleware: [
        target.mountAuth || "",
        inheritedGuards,
        rest,
      ]
        .filter(Boolean)
        .join(" "),
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

// ── Next.js App Router Scanner ─────────────────────────────────────────────
//
// Scannt `app/src/app/api/**/route.ts(x)` und mapped Datei-Pfad → URL-Pfad
// nach Next.js App-Router-Konventionen:
//   - `[name]`        → `{name}` (single segment)
//   - `[...slug]`     → `{slug}` (catch-all, wir nehmen es als ein Segment)
//   - `(group)`       → wird ignoriert (Route-Group, beeinflusst URL nicht)
// HTTP-Methoden ergeben sich aus `export async function GET|POST|...`.
// Auth wird aus den importierten/aufgerufenen Helpers abgeleitet
// (resolveAssistantUser, getAdminSession, requireAssistantTrainingAccess).
function scanNextJsRoutes() {
  const apiRoot = path.join(REPO_ROOT, "app/src/app/api");
  if (!fs.existsSync(apiRoot)) return [];

  const routes = [];
  function deriveTag(segments) {
    // segments[0] === "api". Erste Sub-Section ist die Tag-Quelle.
    const seg = segments[1];
    if (!seg) return "next";
    return `next-${seg.replace(/[{}]/g, "")}`;
  }

  function walk(dir, urlSegments) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        let segment = entry.name;
        // Route-Groups (parens) beeinflussen die URL nicht
        if (segment.startsWith("(") && segment.endsWith(")")) {
          walk(fullPath, urlSegments);
          continue;
        }
        // Dynamic-Segmente
        if (segment.startsWith("[...") && segment.endsWith("]")) {
          segment = `{${segment.slice(4, -1)}}`;
        } else if (segment.startsWith("[[...") && segment.endsWith("]]")) {
          // Optional catch-all
          segment = `{${segment.slice(5, -2)}}`;
        } else if (segment.startsWith("[") && segment.endsWith("]")) {
          segment = `{${segment.slice(1, -1)}}`;
        }
        walk(fullPath, [...urlSegments, segment]);
        continue;
      }
      if (entry.name !== "route.ts" && entry.name !== "route.tsx") continue;

      const src = fs.readFileSync(fullPath, "utf8");
      const lines = src.split("\n");
      const fileRel = path
        .relative(REPO_ROOT, fullPath)
        .replace(/\\/g, "/");
      const apiPath = "/" + urlSegments.join("/");
      const tag = deriveTag(urlSegments);

      // Auth aus Imports/Body ableiten — der "middleware"-String wird vom
      // bestehenden deriveSecurity konsumiert, daher konkatenieren wir die
      // gefundenen Helper-Namen wie eine Middleware-Liste.
      const authHits = [];
      for (const helper of Object.keys(AUTH_MIDDLEWARES)) {
        if (src.includes(helper)) authHits.push(helper);
      }
      const middleware = authHits.join(" ");

      // Pro HTTP-Methode eine Route. Zeilennummer zeigt auf den export.
      const methodRe =
        /^\s*export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/;
      for (let i = 0; i < lines.length; i++) {
        const m = methodRe.exec(lines[i]);
        if (!m) continue;
        routes.push({
          file: fileRel,
          line: i + 1,
          method: m[1].toLowerCase(),
          path: apiPath,
          rawPath: apiPath,
          middleware,
          tag,
        });
      }
    }
  }
  walk(apiRoot, ["api"]);
  return routes;
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
  // Next.js App-Router Routes (app/src/app/api/**/route.ts)
  allRoutes.push(...scanNextJsRoutes());

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
  if (!spec.components.securitySchemes.apiKeyAuth) {
    spec.components.securitySchemes.apiKeyAuth = {
      type: "apiKey",
      in: "header",
      name: "x-api-key",
      description:
        "Shared-Secret für Cron-/Server-zu-Server-Integrationen (requireApiKey).",
    };
  }
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
