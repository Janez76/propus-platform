/**
 * Mountet Swagger UI für `docs/openapi/openapi.yaml`.
 *
 * Endpoints:
 *   - GET /api/docs                   → Swagger UI (lädt Spec aus JSON-Endpoint)
 *   - GET /api/docs/openapi.json      → OpenAPI-Spec als JSON
 *   - GET /api/docs/openapi.yaml      → Original-YAML
 *
 * Beim Start wird die Spec einmal validiert (Parse-Check). Bei Fehler werden die
 * Routen *nicht* registriert, damit der Server trotzdem hochkommt.
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const YAML = require("yaml");
const swaggerUi = require("swagger-ui-express");

const SPEC_PATH = path.resolve(__dirname, "..", "docs", "openapi", "openapi.yaml");

function loadSpecSync() {
  const raw = fs.readFileSync(SPEC_PATH, "utf8");
  return YAML.parse(raw);
}

async function loadSpec() {
  const raw = await fsp.readFile(SPEC_PATH, "utf8");
  return YAML.parse(raw);
}

function registerDocsRoutes(app, log = console) {
  try {
    loadSpecSync();
  } catch (err) {
    log.warn?.("[docs] OpenAPI-Spec konnte nicht geladen werden – /api/docs deaktiviert", err.message);
    return;
  }

  app.get("/api/docs/openapi.yaml", (_req, res) => {
    res.type("application/yaml").sendFile(SPEC_PATH);
  });

  app.get("/api/docs/openapi.json", async (_req, res) => {
    try {
      res.json(await loadSpec());
    } catch (err) {
      log.error?.("[docs] OpenAPI-Spec konnte nicht serialisiert werden", err.message);
      res.status(500).json({ error: "OpenAPI-Spec nicht verfügbar" });
    }
  });

  app.use(
    "/api/docs",
    swaggerUi.serveFiles(null, {
      swaggerOptions: { url: "/api/docs/openapi.json", persistAuthorization: true },
    }),
    swaggerUi.setup(null, {
      customSiteTitle: "Propus Platform – API Docs",
      swaggerOptions: { url: "/api/docs/openapi.json", persistAuthorization: true },
    }),
  );
}

module.exports = { registerDocsRoutes };
