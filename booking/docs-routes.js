/**
 * Mountet Swagger UI für `docs/openapi/openapi.yaml`.
 *
 * Endpoints:
 *   - GET /api/docs                   → Swagger UI (lädt Spec aus JSON-Endpoint)
 *   - GET /api/docs/                  → Swagger UI (gleiche HTML wie /api/docs)
 *   - GET /api/docs/openapi.json      → OpenAPI-Spec als JSON
 *   - GET /api/docs/openapi.yaml      → Original-YAML
 *
 * Beim Start wird die Spec einmal validiert (Parse-Check). Bei Fehler werden die
 * Routen *nicht* registriert, damit der Server trotzdem hochkommt.
 *
 * Redirect-Loop-Schutz: `swaggerUi.serveFiles` verwendet intern
 * `express.static`, das `/api/docs` per 301 nach `/api/docs/` umleitet
 * (serve-static directory-redirect). Hinter Next.js mit Default
 * `trailingSlash: false` strippt Next den Slash wieder, was eine Endlosschleife
 * (`ERR_TOO_MANY_REDIRECTS`) erzeugt. Wir umgehen das, indem wir die HTML-Seite
 * an beiden Pfaden direkt ausliefern und ein `<base href="/api/docs/">`
 * injizieren – damit lösen die relativen Asset-URLs (`./swagger-ui.css` …)
 * unabhängig vom aktuellen Pfad konsistent gegen `/api/docs/` auf.
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

  const swaggerOpts = {
    customSiteTitle: "Propus Platform – API Docs",
    swaggerOptions: { url: "/api/docs/openapi.json", persistAuthorization: true },
  };

  // HTML zuerst registrieren – beide Pfade liefern dieselbe Seite (kein 301).
  // <base href="/api/docs/"> sorgt dafür, dass `./swagger-ui.css` etc. korrekt
  // unter `/api/docs/swagger-ui.css` aufgelöst werden, auch wenn der Trailing
  // Slash fehlt.
  app.get(["/api/docs", "/api/docs/"], (_req, res) => {
    const html = swaggerUi
      .generateHTML(null, swaggerOpts)
      .replace("<head>", '<head>\n  <base href="/api/docs/">');
    res.type("html").send(html);
  });

  // Statische Assets + swagger-ui-init.js nur unter `/api/docs/` (mit Slash).
  // Nicht unter `/api/docs` mounten, sonst löst `express.static` wieder den
  // 301-Redirect auf den Mount-Root aus.
  app.use("/api/docs/", swaggerUi.serveFiles(null, swaggerOpts));
}

module.exports = { registerDocsRoutes };
