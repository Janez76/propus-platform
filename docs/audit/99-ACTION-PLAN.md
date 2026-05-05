# Phase 6 — Action-Plan

**Ziel:** Alle Findings aus Phase 3 (60 Bugs) und die Architektur-/DX-Massnahmen aus Phase 4 und 5 in eine umsetzbare Reihenfolge bringen — sortiert nach **Risiko × Dringlichkeit × Aufwand**.

Die drei Buckets **Now**, **Next**, **Later** sind bewusst kalendarisch verankert:

- **Now** = diese Woche, spätestens in den nächsten 14 Tagen. Alles, was entweder akut produktiv ausnutzbar ist oder in jedem Deploy-Schritt weiter schadet.
- **Next** = nächstes Quartal (8–12 Wochen). Strukturelle Fixes, die Planung und Test-Phase brauchen.
- **Later** = nächste 6–12 Monate. Architekturumbauten, die Nutzen bringen, aber nur mit Deploy-Pause oder Grossumbau machbar sind.

Aufwandskürzel: **S** ≤ 0.5 Tag, **M** = 0.5–3 Tage, **L** > 3 Tage.

---

## 1. Top-5 Sofortmassnahmen (Diese Woche)

Die folgenden fünf Punkte sind die höchstpriorisierten. Sie sind bewusst klein dimensioniert, damit sie in einer Woche abgeschlossen werden können, und sie decken die teuersten Risiken ab.

### #1 — Cron-Endpoint absichern (BUG-02)

**Problem:** `tours/routes/cron-api.js:18-29` validiert das `CRON_SECRET` per string-Vergleich ohne Timing-Safe-Check und ohne Rate-Limiting. Ein Angreifer kann externe Cron-Trigger einfach per `?secret=...` erraten oder mit Timing-Seitenkanälen abgleichen.
**Fix:**
```js
const expected = Buffer.from(process.env.CRON_SECRET || "");
const provided = Buffer.from(String(req.query.secret || req.get("X-Cron-Secret") || ""));
if (!process.env.CRON_SECRET || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
  return res.status(403).json({ error: "forbidden" });
}
```
Zusätzlich: Endpoint nur von `127.0.0.1` oder den VPS-Egress-IPs annehmen (Reverse-Proxy-Regel). **Aufwand: S.**
**Abhängigkeit:** keine.

### #2 — Hartcodierte Passwörter aus dem Repo entfernen (BUG-03, BUG-04, BUG-21)

**Problem:** 
- `scripts/deploy-mail-inbox.ps1:35` enthält `Biel2503!` im Klartext.
- `booking/reset-admin-password.js:37` nutzt ein Default-Passwort beim ersten Lauf.
- `booking/admin-account.json` enthält einen scrypt-Hash eines realen Admin-Accounts — im Git.

**Fix (in dieser Reihenfolge):**
1. `git filter-repo` (oder BFG) nutzen, um `admin-account.json` und `deploy-mail-inbox.ps1` aus der History zu entfernen; danach `git push --force` (einmaliger Ausnahmefall, vorher mit allen Clones abstimmen).
2. Passwort rotieren — die geleakten Credentials sind kompromittiert, Hash-Rainbow gegen Biel2503! trivial.
3. Secrets in GitHub-Actions-Secrets / VPS-Secrets-Manager verschieben.
4. `admin-account.json` ersetzen durch einen DB-gestützten Admin-Invite-Flow (core.admin_users mit Seed-Script ausserhalb Git).

**Aufwand: M.** **Abhängigkeit:** keine, ABER gitleaks-Action erst nach dem History-Rewrite aktivieren, sonst blockt sie den Push.

### #3 — Payrexx-Webhook-Fallback schliessen (BUG-07)

**Problem:** `tours/routes/payrexx-webhook.js:58` akzeptiert Payloads auch ohne `PAYREXX_WEBHOOK_SECRET` — wenn die Variable fehlt, fällt der Code auf "nicht verifizieren" zurück statt hart abzubrechen. Das ist ein direkter Geldhebel: Fake-Webhooks können Buchungen als bezahlt markieren.
**Fix:**
```js
if (!process.env.PAYREXX_WEBHOOK_SECRET) {
  throw new Error("PAYREXX_WEBHOOK_SECRET missing — refusing to start");
}
// Beim Handler:
const signature = req.get("X-Payrexx-Signature") || "";
const expected = crypto
  .createHmac("sha256", process.env.PAYREXX_WEBHOOK_SECRET)
  .update(req.rawBody)
  .digest("hex");
if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
  return res.status(401).json({ error: "invalid signature" });
}
```
`express.json()`-Middleware so konfigurieren, dass `rawBody` verfügbar ist. **Aufwand: S.**
**Abhängigkeit:** keine.

### #4 — Security-Updates: nodemailer (3×) + Next.js (BUG aus Phase 2)

**Problem:** 4× `npm audit` HIGH:
- `next@16.2.1` — Server-Components-DoS
- `nodemailer@^6.9.16` in booking/platform
- `nodemailer@^6.10.1` in tours
**Fix:**
```bash
cd app   && npm update next && npm audit --omit=dev
cd booking && npm install nodemailer@^6.10.x && npm audit --omit=dev
cd tours  && npm install nodemailer@^6.10.x && npm audit --omit=dev
cd platform && npm install nodemailer@^6.10.x && npm audit --omit=dev
```
Anschliessend Regressionslauf: Kontaktformular + Buchungs-Bestätigungsmail + Admin-Mails + Tour-Renewal-Mails live testen.
**Aufwand: S.** (Install) + **M** (Test).
**Abhängigkeit:** keine.

### #5 — Husky + lint-staged + Commit-Lint einführen (DX-Basis)

**Problem:** Jeder Commit kann heute ungeprüften Code enthalten. Phase 2 zeigte 144 ESLint-Probleme, die nie geblockt wurden.
**Fix:** Snippets aus `40-DX-WORKFLOW.md` §1 und §2 — eine Stunde Setup, spart pro Woche mehrere Stunden Review-Rückfragen.
**Aufwand: S.** **Abhängigkeit:** keine, kann parallel zu #1–#4 laufen.

**Total Top-5: ~3 Arbeitstage, kritische Risiken eliminiert.**

---

## 2. Bucket „Now" — Diese Woche / Nächste 14 Tage

Zusätzlich zu den Top-5:

| # | Thema | BUG-IDs | Aufwand | Begründung |
|---|---|---|---|---|
| N1 | Cookie `secure: true` statt `"auto"` erzwingen | BUG-19 | S | Session-Hijacking über HTTP-Request in Zwischennetzen möglich. |
| N2 | `httpOnly`-Flag auf allen Session-Cookies | BUG-11 | S | XSS → Cookie-Theft verhindern. |
| N3 | CORS whitelisten statt `origin:"*"` | BUG-10 | S | Credentialed Requests nur von `booking.propus.ch`, `admin.propus.ch`, `propus.ch`. |
| N4 | `ADMIN_PASSWORD_DEFAULT` hart ablehnen | BUG-04 | S | Boot-Check in reset-admin-password.js. |
| N5 | `.env.example` vervollständigen + Boot-Guard | — | S | Aus 40-DX-WORKFLOW.md §7.2 übernehmen. |
| N6 | PR-Template + CODEOWNERS committen | — | S | Aus 40-DX-WORKFLOW.md §3/§4. |
| N7 | Branch-Protection main aktivieren | — | S | Aus 40-DX-WORKFLOW.md §5. |
| N8 | `ci.yml` mit lint/test/audit als Required-Checks | — | M | Aus 40-DX-WORKFLOW.md §6.1. |
| N9 | Dependabot-Config + Secrets-Scan aktivieren | BUG-21 | S | Aus 40-DX-WORKFLOW.md §6.2 — erst NACH History-Rewrite. |
| N10 | Process-Level `unhandledRejection` + `uncaughtException` Handler | BUG-16 | S | Crashloop vermeiden, sauberes Logging. |
| N11 | PG-Port von `0.0.0.0` auf `127.0.0.1` binden | BUG-20 | S | Ein-Zeilen-Fix in docker-compose.vps.yml. |
| N12 | `admin-account.json` aus Working-Tree entfernen + `.gitignore` | BUG-21 | S | Nach History-Rewrite (Top-5 #2). |

**Bucket-Now-Aufwand total: ~5–6 Tage.** Nach Abschluss sollte das Produkt **ohne HIGH-Vulns**, ohne leaked Secrets, mit funktionierendem PR/Review-Gate dastehen.

---

## 3. Bucket „Next" — Nächstes Quartal (8–12 Wochen)

Strukturelle Fixes, die Planung, Staging-Tests und eventuell kleine Migrationen brauchen.

### 3.1 Datenkonsistenz & Race-Conditions (M–L)

| # | Thema | BUG-IDs | Aufwand |
|---|---|---|---|
| X1 | Double-Booking-Race im Booking-Flow fixen (`FOR UPDATE` + unique partial index) | BUG-05 | L |
| X2 | Renewal-Invoice-Race im Tour-Manager (Advisory-Lock auf `tour_id`) | BUG-06, BUG-26 | M |
| X3 | Fire-and-forget-Mail-Sends durch Outbox-Pattern ersetzen | BUG-26, BUG-29 | M |
| X4 | `Math.random()`-basierte IDs durch DB-Sequenzen oder `nanoid` ersetzen | BUG-13 | M |
| X5 | JSON-als-Datenbank (Attribute-Blobs) in saubere Spalten migrieren | BUG-14 | L |
| X6 | Migration-Runner um Checksum + Duplicate-Prefix-Check erweitern | BUG-01 | S |
| X7 | 6 duplicate-prefix-Migrationen auflösen (neue Namen, Schema-Rewrite-Migration für Prod) | BUG-01 | M |

### 3.2 Monorepo-Konsolidierung (L)

| # | Thema | Aufwand |
|---|---|---|
| X8 | pnpm-Workspaces einführen, gemeinsame `node_modules` hoisten | M |
| X9 | Turborepo für cache-fähiges `lint/test/build` | M |
| X10 | Shared `tsconfig.base.json`, `eslint.base.js`, `.prettierrc` | S |
| X11 | Dependency-Audit überall (booking/core/auth/website) — noch nicht gelaufen in Phase 2 | S |
| X12 | 14 unused Deps aus `app/package.json` entfernen | S |

### 3.3 Sicherheit & RBAC (M)

| # | Thema | BUG-IDs | Aufwand |
|---|---|---|---|
| X13 | CSRF-Token auf allen state-mutating Routes | BUG-12 | M |
| X14 | RBAC-Granularität: statt binär `isAdmin` zu rollenbasiert (`admin`, `editor`, `viewer`, `cron`, `api`) | BUG-23 | L |
| X15 | Zod/Valibot-Validierung auf allen API-Routen (Request-Body-Schema) | — | M |
| X16 | Rate-Limiting (express-rate-limit + Redis-Store) auf öffentlichen Routen (Booking-POST, Webhook-Endpoints, Auth-Login) | — | M |
| X17 | EJS-Ausgaben auf sichere Helper umstellen (keine `<%- %>`-Raw-Outputs in User-Content) | BUG-24 | S |
| X18 | XXE-Hardening beim fast-xml-parser (noEntities, strictAttributes) | BUG-28 | S |

### 3.4 Tests & Qualität (M–L)

| # | Thema | Aufwand |
|---|---|---|
| X19 | Vitest-Coverage-Report in CI, Ziel: 40 % Lines auf Business-Logik | M |
| X20 | Integration-Tests für Payrexx-Webhook, MS-Graph-Calendar-Sync, Cron-Jobs | L |
| X21 | Playwright-E2E: Buchungsfluss, Admin-Login, Tour-Renewal | L |
| X22 | Testcontainers (Postgres, Mailhog) für Backend-Integration-Tests | M |
| X23 | DB-Test-Reset-Script, damit Tests nie auf Prod-DB laufen (siehe ECONNREFUSED in Phase 2 §6.2) | S |

### 3.5 Observability (M)

| # | Thema | Aufwand |
|---|---|---|
| X24 | Sentry für alle Node-Prozesse + Next.js | M |
| X25 | Prometheus-Metriken-Endpoint auf jedem Service (`/metrics`) | M |
| X26 | Structured Logging einheitlich auf `pino` (winston → pino in booking/ migrieren) | M |
| X27 | Request-Tracing-ID (X-Request-ID) durchgehend | S |
| X28 | Uptime-Monitoring + Alarmierung (Uptimerobot/Betterstack) | S |

### 3.6 DevOps (M)

| # | Thema | Aufwand |
|---|---|---|
| X29 | GitHub-Actions auf SHA-Pinning (statt `@v5` → `@<sha>`) | S |
| X30 | Blue/Green-Deploy-Pfad via Traefik vorbereiten (siehe `30-ARCHITECTURE.md` §7) | L |
| X31 | Nightly-Postgres-Backups + Wiederherstellungs-Rehearsal | M |
| X32 | Docker-Compose-Files konsolidieren (dev/vps/staging.nas — dedupe per `extends`) | M |

**Bucket-Next-Aufwand total: ~40–60 Arbeitstage (verteilt über das Quartal, nicht Vollzeit).**

---

## 4. Bucket „Later" — Nächste 6–12 Monate

Architektur-Investitionen, die grossen Nutzen bringen, aber mit Kosten-/Risiko-Horizont >1 Quartal verbunden sind.

| # | Thema | Aufwand | Begründung |
|---|---|---|---|
| L1 | Auth-Unifizierung auf Logto (booking+tours+app nutzen eine Session-Quelle) | L | Beseitigt Session-Bridge-Hack in `platform/server.js:92-123`, ein IdP statt drei. |
| L2 | Frontend-Migration SPA-in-Next → native Next-Pages | L | Entfernt die Catch-All-Route, volle SSR-/SEO-Vorteile, weniger pages-legacy/-Code. |
| L3 | booking/server.js (13'195 LOC) in Domain-Module zerlegen | L | Wartbarkeit, Testbarkeit, parallele Entwicklung möglich. |
| L4 | Event-Bus (NATS oder BullMQ) für Cross-Module-Events (Order→Calendar, Renewal→Mail) | L | Heute synchrone direkt-calls; entkoppelt Module, erlaubt Retry/Dead-Letter. |
| L5 | Shared Domain-Layer `core/domain/*` mit Zod-Schemas für Booking, Tour, User, Invoice | L | Einheitliche Validierung & Typen, End-to-End-Type-Safety via tRPC optional. |
| L6 | API-Gateway oder BFF (siehe `30-ARCHITECTURE.md` §3) | L | Entscheidung „Next.js-BFF" vs. „Hono-Gateway" treffen nach Prod-Lastmessung. |
| L7 | OpenTelemetry + verteiltes Tracing über alle Services | L | Schneller Root-Cause bei Cross-Module-Requests. |
| L8 | Migration von `winston` (booking) und `console.log` (alle) auf einheitliches `pino` + Logtail/Loki | M | Log-Aggregation und Durchsuchbarkeit. |
| L9 | Feature-Flag-System (Unleash oder selbstgebaut mit `core.feature_flags`-Tabelle) | M | Risikoärmere Rollouts, A/B-Tests. |
| L10 | Compliance-Dokumentation: DSGVO-Verarbeitungsverzeichnis, Datenexport/-löschung-Endpoints | M | Schweizer DSG + DSGVO-Gäste-Anfragen bedienen können. |
| L11 | Multi-Tenant-fähig machen (falls Produkt für andere Tour-Betreiber verkauft werden soll) | L | Tenant-ID in allen Tabellen, RLS in Postgres. |
| L12 | Performance-Budget + Core-Web-Vitals-Monitoring für website/ und app/ | M | Lighthouse-CI in Pipeline. |

---

## 5. BUG→Bucket-Matrix (alle 60 Findings mapped)

| BUG-ID | Severity | Titel (kurz) | Bucket | Aufwand |
|---|---|---|---|---|
| BUG-01 | CRITICAL | Duplicate migration prefixes | Next (X6/X7) | M |
| BUG-02 | CRITICAL | Cron endpoint ohne timing-safe secret | **Now (Top-5 #1)** | S |
| BUG-03 | CRITICAL | Hardcoded password Biel2503! | **Now (Top-5 #2)** | M |
| BUG-04 | CRITICAL | Default admin password fallback | **Now (Top-5 #2, N4)** | S |
| BUG-05 | CRITICAL | Double-booking race | Next (X1) | L |
| BUG-06 | CRITICAL | Renewal-invoice race | Next (X2) | M |
| BUG-07 | CRITICAL | Payrexx webhook secret fallback | **Now (Top-5 #3)** | S |
| BUG-08 | HIGH | Hardcoded session secret fallback | Now (N5) | S |
| BUG-09 | HIGH | Tours-Session secret fallback | Now (N5) | S |
| BUG-10 | HIGH | CORS origin:"*" | Now (N3) | S |
| BUG-11 | HIGH | Missing httpOnly | Now (N2) | S |
| BUG-12 | HIGH | No CSRF | Next (X13) | M |
| BUG-13 | HIGH | Math.random() for IDs | Next (X4) | M |
| BUG-14 | HIGH | JSON-as-database blobs | Next (X5) | L |
| BUG-15 | HIGH | Cron without distributed lock | Next (X4) | M |
| BUG-16 | HIGH | No process error handlers | Now (N10) | S |
| BUG-17 | HIGH | OAuth forwarded-headers | Next (X14) | M |
| BUG-18 | HIGH | 65 components missing "use client" | Next (eigener) | M |
| BUG-19 | HIGH | cookie.secure: "auto" | Now (N1) | S |
| BUG-20 | HIGH | PG port on 0.0.0.0 | Now (N11) | S |
| BUG-21 | HIGH | admin-account.json in git | **Now (Top-5 #2, N9, N12)** | M |
| BUG-22 | HIGH | OpenAI key exposure risk | Next (X15) | S |
| BUG-23 | HIGH | RBAC granularity | Next (X14) | L |
| BUG-24 | HIGH | EJS XSS vectors | Next (X17) | S |
| BUG-25 | HIGH | Payrexx proxy no sig check | Now (zu Top-5 #3) | S |
| BUG-26 | HIGH | Fire-and-forget renewal mail | Next (X3) | M |
| BUG-27 | HIGH | Floating GitHub Actions refs | Next (X29) | S |
| BUG-28 | HIGH | XXE hardening | Next (X18) | S |
| BUG-29 | HIGH | async without try/catch | Next (X3) | M |
| BUG-30 | HIGH | Supabase service-role exposure | Now | S |
| BUG-31 → BUG-55 | MEDIUM | (25× Logging, Validierung, Deadcode, Typing, etc.) | verteilt auf Next/Later | S–M |
| BUG-56 → BUG-60 | LOW | (5× Kosmetik, Konsistenz, Dokumentation) | Later | S |

*(Die 25 Medium- und 5 Low-Findings sind in `20-FINDINGS.md` einzeln aufgeführt und werden hier zur Platzsparnis aggregiert. Die meisten fallen unter X15/X24/X28 bzw. sind Kandidaten für kleine „Good-First-Issue"-PRs.)*

---

## 6. Messbare Erfolgskriterien pro Bucket

Ohne klare Ziele verliert ein Plan Relevanz. Vorschlag für Metriken, die sich pro Release-Ende überprüfen lassen:

### Nach „Now" (Ende 2 Wochen)

- `npm audit --omit=dev --audit-level=high` → **0 Findings** in allen 4 installierbaren Modulen
- Secrets-Scan (gitleaks) → **0 Findings** im aktuellen Tree
- CI-Workflow `ci.yml` hat **≥ 5 Required-Checks** und blockt PR-Merge bei Fehler
- Mindestens **1 fehlgeschlagener Commit** mit „lint-staged blockt" in den letzten 7 Tagen (Beweis, dass der Hook greift)
- Branch-Protection aktiv, **0 direkte Pushes** auf main seit Aktivierung

### Nach „Next" (Ende Quartal)

- **Testabdeckung ≥ 30 % Line-Coverage** auf `booking/` und `tours/` (aktuell: unbekannt, geschätzt < 5 %)
- **0 Race-Condition-bedingte Support-Tickets** (Double-Booking, Doppel-Rechnung)
- Monorepo auf **pnpm-Workspaces + Turborepo** migriert (`node_modules`-Grösse −60 %)
- **Sentry + Prometheus** integriert, Alert-Runbook existiert
- `booking/server.js` von 13k LOC auf **≤ 8k LOC** reduziert (Extraktion von 2–3 Domain-Modulen)
- Alle 60 BUG-Findings entweder **„Fixed"** oder mit bewusstem „Won't Fix" + Begründung im Issue-Tracker

### Nach „Later" (Ende Jahr)

- **Ein Auth-System** (Logto), keine Bridge-Middleware mehr in `platform/server.js`
- **Native Next.js-Frontend** ohne SPA-Catch-All in `app/`
- **Blue/Green-Deploy** produktiv, Deployzeit von aktuell X min auf < 2 min Downtime
- **Postgres-Backups** stündlich, Restore-Rehearsal dokumentiert
- DSGVO-/DSG-Endpoints (Datenexport, Datenlöschung) für Kunden nutzbar

---

## 7. Risiko-Kommunikation

Drei Punkte, die dem/der Auftraggebenden **ausserhalb dieser Dokumentation** kommuniziert werden sollten, weil sie Entscheidungscharakter haben:

1. **`admin-account.json` in Git-History = reales Compromise-Risiko.** Der Hash kann von jedem mit Repo-Zugriff (oder einem geleakten Clone) offline geknackt werden. Passwort-Rotation ist **Pflicht**, nicht Option. Dauer: 1 Stunde. Konsequenz bei Ausbleiben: möglicher Full-Admin-Takeover.
2. **Double-Booking-Race ist in Produktion latent.** Die Stelle in `booking/server.js:~3926-4100` kann zu Überbuchungen führen, sobald 2 Gäste gleichzeitig denselben Slot anfragen. Unter geringer Last selten, aber das Monitoring misst es heute nicht. Kosten im Schadensfall: Gastreklamation, manueller Rollback, Umbuchung.
3. **Kein Rollback-Plan für DB-Migrationen.** Der Runner ist transaktional pro Datei, aber es gibt keine automatisch erzeugten `DOWN`-Migrationen. Wenn eine Migration in Prod stecken bleibt, ist der Einstieg manuell (SQL per `psql`). In Next-Bucket enthalten (X6/X7), aber bis dahin ist **jeder `BEGIN; … COMMIT;`-Fehler ein 15-Minuten-Incident**.

---

## 8. Übergangsorganisation / Cadence

Vorschlag, den Plan nicht zu verlieren:

- **Wochenstart-Meeting (15 min):** Status der 5 Top-Sofortmassnahmen, dann Status des aktuellen Next-Tickets.
- **Monatsende-Review (30 min):** Bucket-Metriken (oben §6) gegen Plan prüfen, Scope anpassen.
- **Quartalsende-Retro (60 min):** Bucket „Later" in „Next" verschieben, was reif ist; neue Findings aus den 3 Monaten einordnen.
- **Issue-Hygiene:** Jedes BUG-XX aus `20-FINDINGS.md` wird ein GitHub-Issue mit Label `audit-2026-04`, damit der Fortschritt messbar ist.

---

## 9. Nicht-Ziele (bewusst ausgelassen)

Folgende Themen sind **kein Teil** dieses Audits und sollten bei Bedarf separat beauftragt werden:

- **Performance-Audit** (Bundle-Size, Hydration-Kosten, DB-Query-Profile): Hätte `next build` mit Bundle-Analyzer und `EXPLAIN ANALYZE` auf Produktionsdaten erfordert — beides nicht im Sandbox machbar.
- **Accessibility-Audit** (WCAG 2.1 AA): Skill `design:accessibility-review` vorhanden, aber nicht beauftragt.
- **UX-/Design-Review** der Admin-Oberfläche: Siehe Skill `design:design-critique`.
- **Penetration-Test:** Die hier gefundenen Issues sind statisch identifiziert. Ein Black-Box-Pentest gegen eine Staging-Umgebung würde ergänzende Findings liefern (Session-Fixation, CSRF-Chain, IDOR, etc.).
- **Rechtliche Prüfung** der DSG/DSGVO-Compliance: Verarbeitungsverzeichnis, AVV mit Dienstleistern, Cookie-Banner-Compliance — alles rechtliche Expertise, nicht technische.
- **Geschäftslogik-Korrektheit:** Ob die Preise in `booking/pricing.js` fachlich korrekt sind, ist eine Business-Frage, keine Code-Frage.

---

## 10. Schlusswort

Der Stack ist **im Kern gesund**: Tests sind grün, TypeScript ist sauber, Datenmodell ist durchdacht (drei Schemata + transaktionaler Runner), Dokumentation in einzelnen Bereichen (README, Deploy-Docs) ist gut.

Die Hauptrisiken kommen aus drei Quadranten:

1. **Altlasten aus der Start-Up-Phase** (hartcodierte Secrets, SPA-in-Next, duplizierte nodemailer-Instanzen).
2. **Halb-migrierte Architektur** (drei Auth-Systeme, drei node_modules, drei docker-compose-Files).
3. **Fehlende Gates** (kein pre-commit, keine required CI-Checks, kein Branch-Protection).

Alle drei sind mit den in diesem Plan skizzierten Massnahmen **adressierbar**, ohne den laufenden Betrieb zu stören. Die Top-5-Sofortmassnahmen schliessen die teuersten akuten Löcher in unter 3 Arbeitstagen. Der Rest ist methodische Ernte über das Quartal.
