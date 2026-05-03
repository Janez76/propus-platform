<!-- markdownlint-disable MD052 -->
<!-- Die Notation [TXX][SEVERITY][CONFIDENCE] ist keine Reference-Link-Syntax,
     sondern ein internes Tranchen-Schema. MD052 ist deshalb hier deaktiviert. -->

# Propus Platform – Findings (Bug Hunt)

**Start:** 2026-05-03
**Basis-Commit:** `1107201f594261eee9d103993b5a4d4d0ffccbf2`
**Branch:** `claude/bug-hunt-repo-9MZAR`
**Modus:** Lese-/Berichts-Modus (keine Code-Änderungen)

Pilot-Findings zu `app/src/app/(admin)/orders/[id]/termin/actions.ts` siehe
`bug-hunt/PILOT.md` (11 Findings, T02-Vorbild) – hier nicht dupliziert, aber im
Cross-Cutting-Block referenziert.

---

## Statistik

| Severity | Anzahl |
|----------|-------:|
| CRITICAL | 7 |
| HIGH     | 23 |
| MEDIUM   | 30 |
| LOW      | 6 |
| INFO     | 2 |
| **Total (dedupliziert, ohne Pilot)** | **68** |

> **Zählbasis:** dedupliziert, exklusive Pilot. Pilot-Findings
> (`bug-hunt/PILOT.md`, 11 Einträge inkl. eigener TOCTOU-/Tx-/Mail-Findings)
> sind hier bewusst **nicht** dupliziert und werden nur im Cross-Cutting-Block
> (Punkt 10) referenziert. 7+23+30+6+2 = 68 = Tabelle.

Tranchen-Verteilung (vor Dedup): T01/T03 (12) · T02/T04 (16) · T05/T08 (15) ·
T07/T09 (15) · T10/T12/T15 (12) · T13/T14 (17) = 87 Roh-Findings · nach
Cross-Cutting-Dedup (−19) → **68 unique** = `Total (ohne Pilot)`.

---

## Index

### CRITICAL
- [T01][CRITICAL] JWT ohne Signaturprüfung → `app/src/lib/auth.ts:18-39` *(Sprint A: gefixt durch Entfernen des unsicheren Codes — siehe commit `ce57b82`)*
- ~~[T01][CRITICAL] Admin-Bridge ermöglicht Customer-Impersonation~~ → **auf HIGH herabgestuft nach Re-Lesen** (siehe Detail-Block, der sichtbare Code setzt nur die E-Mail des Admins selbst).
- [T07][CRITICAL] Kein Fetch-Timeout im Next-Proxy → `app/src/lib/proxy.ts:68` *(Sprint A: gefixt — commit `ce57b82`)*
- [T09][CRITICAL] Payrexx-Webhook ohne Replay-Schutz → `tours/routes/payrexx-webhook.js:51-73` *(Sprint A: gefixt via `webhook_events`-Idempotency-Tabelle)*
- [T10][CRITICAL] Leere `key`-Datei im Repo-Root → bereits gelöscht vor Sprint A.
- [T13][CRITICAL] Async-Express-Handler ohne try/catch → `tours/routes/api.js:28-545` *(Sprint A: globaler Async-Error-Shim in tours+booking — commit `5e531fd`)*
- [T14][CRITICAL] `sendMailDirect` ohne Empfänger-Allowlist → `tours/lib/microsoft-graph.js:286-316` *(Sprint A: Allowlist-Helper mit warn-only Default + STRICT-Env)*

### HIGH
- [T01/T13/T14][HIGH] Hardcoded Default Session-Secrets → `tours/server.js:96`, `booking/server.js:2456`
- [T10][HIGH] `setup-admin-user.js` mit Default-Passwort → `scripts/setup-admin-user.js:24`
- [T01][HIGH] Portal-API IDOR via Admin-Bridge → `tours/routes/portal-api.js:54-69`
- [T03][HIGH] Open Redirect (`//attacker.com`) → `tours/routes/auth.js:119-121`
- [T02][HIGH] Multi-Step-Mutation ohne Transaktion → `app/src/app/(admin)/orders/[id]/order-bulk-actions.ts:21-68`
- [T02][HIGH] TOCTOU Order-No-Allokation → `app/src/app/(admin)/orders/[id]/duplicate-actions.ts:56-90`
- [T02][HIGH] `revalidate*()` nach `redirect()` (Throw verschluckt Revalidate) → `verknuepfungen/actions.ts:59,113,133,175,195`
- [T02][HIGH] Status-Coercion `String(x || "pending")` → `status-change-actions.ts:40`
- [T02][HIGH] Status-Update ohne Optimistic Concurrency → `status-change-actions.ts:20-85`
- [T02][HIGH] Termin-Photographer-Lookup ohne Lock → `lib/repos/orders/termin.ts:42-67`
- [T05][HIGH] `dangerouslySetInnerHTML` für Email-HTML → `pages-legacy/admin/posteingang/PosteingangPage.tsx:920`
- [T05][HIGH] `dangerouslySetInnerHTML` für Dashboard-Summary → `components/dashboard/HeroGreeting.tsx:84`
- [T05][HIGH] Form-Doppel-Submit in Posteingang → `PosteingangPage.tsx:693-700`
- [T07][HIGH] Token-Cache ohne Refresh-Lock (gbp-client) → `booking/gbp-client.js:26,94-97`
- [T07][HIGH] Hardcoded VAT 8.1% ohne Historie (7.7%) → `app/src/lib/pricing.ts:1`
- [T07][HIGH] Fehlende Fetch-Timeouts (Nextcloud, DoH) → `booking/nextcloud-share.js:49,85`, `booking/selekto-proxy.js:79`
- [T09][HIGH] Cron-Jobs ohne Distributed-Lock → `booking/jobs/index.js:21-44`
- [T09][HIGH] Cron-Job try/catch zu breit (1 Fehler bricht Batch) → `booking/jobs/provisional-expiry.js:21-103`
- [T09][HIGH] node-cron-Callbacks ohne Error-Handler → `booking/jobs/review-requests.js:29`
- [T10][HIGH] Astro: `checkOrigin: false` + `host: 0.0.0.0` → `website/astro.config.mjs:24,30`
- [T12][HIGH] `booking/Dockerfile` läuft als root → `booking/Dockerfile`
- [T13][HIGH] Tours: kein Rate-Limit auf Login/Forgot-Password → `tours/routes/portal-api-mutations.js:50-120`
- [T14][HIGH] Booking-Customer-Endpoints ohne Auth-Middleware → `booking/server.js:3238-3260`

### MEDIUM (Auswahl, alle Details unten)
- T03 Schwache Passwort-Policy (nur Länge ≥ 8)
- T03 Sensible Fehlermeldungen im Response (Assistant)
- T03 Fehlende Zod-Validierung (Assistant Confirm)
- T03 Token-Hash in Logs
- T03 Kein Per-Minute-Rate-Limit auf Assistant
- T02 Mehrere fehlende Tx-Scopes (kommunikation, leistungen)
- T05 Mehrere `useEffect`-Closure-Bugs (HeroGreeting, AppSidebar)
- T05 Optimistic-UI ohne Rollback (topbar-actions)
- T05 `requireAdminLayoutSession()` evtl. zu schwach
- T08 `useNow()` Hydration-Mismatch
- T08 zustand stale-state in updateStructured
- T07 Math.random für Multer-Filenames
- T07 In-Memory-Geocoder-Cache ohne Eviction
- T07 toISOString in Cron um DST
- T07 unescaped User-HTML in Fallback-Mail
- T13 Multer ohne Magic-Bytes-Validierung (×2)
- T13 Admin-Logout: remember_token nicht revoked
- T13 Email-Wechsel revoked nicht alle Sessions
- T13 GET-Endpoint mit State-Mutation (Portal Detail)
- T13 `pendingAdminChatAction` ohne Server-Validation
- T14 Discount-Code ohne Rate-Limit
- T15 Astro `prerender = true` auf Auth-Pages (3 Dateien)
- T10 VPS-Deploy als root ohne Pre-Flight
- T12 docker-compose Default-Passwort
- T12 SUPABASE_URL als Build-Arg
- T03 Session-Fixation-Restrisiko in Portal-Login
- T13 Customer-Token-Replay (`/r/yes`/`/r/no`)
- T08 Blob-URL-Leak im Portrait-Crop

### LOW / INFO
- T02 Hard-coded Status-Strings ohne Enum
- T02 `|| null` löscht leere Strings (Billing-Patch)
- T05 `StaleClientReloadHandler` patcht `window.fetch` non-idempotent
- T08 `use()`-Hook-Pattern-Risiko (kein konkreter Treffer)
- T10 Tailwind-v4-Drift ohne Doku
- T10 `.dockerignore` zu kurz
- T01 [INFO] `booking.admin_sessions` ohne `revoked_at`
- T12 [INFO] `PLATFORM_INTERNAL_URL` hartkodiert

---

## Findings

### CRITICAL

#### [T01][CRITICAL][H] JWT ohne Signaturprüfung
- Datei: `app/src/lib/auth.ts:18-39`
- Kategorie: 1. Security / Auth-Bypass
- Problem: `decodeJwtPayload()` decodiert Base64 ohne Signaturverifikation;
  `requireAuth()` reicht den Payload als Identität durch.
- Auswirkung: Vollständiger Auth-Bypass. Angreifer kann beliebige `sub`-Claims
  fälschen und sich als jeder User ausgeben.
- Vorschlag: JWT mit `jose` o.ä. signaturverifizieren (Public-Key/HMAC), Issuer
  + Audience + `exp` validieren. Niemals dekodierten Payload als Identität
  zurückgeben.
- Aufwand: M
- Confidence: H
- Tags: #security #breaking

#### [T01][HIGH][M] Admin-Bridge: ungeprüfter Impersonation-Pfad (Re-Klassifizierung)
- Datei: `tours/routes/portal.js:91-124`
- Kategorie: 1. Security / Privilege Escalation
- **Update Sprint A (2026-05-03):** Beim erneuten Lesen **CRITICAL → HIGH
  herabgestuft.** Der Code setzt `portalCustomerEmail = row.user_key`, also die
  E-Mail des **eingeloggten Admins selbst** – nicht eine fremde Kunden-E-Mail.
  Der ursprüngliche „pivotet zu beliebigem Kunden"-Pfad ist im sichtbaren Code
  nicht reproduzierbar. Allerdings:
    - `isAdminImpersonation: true` wird unkonditional gesetzt,
    - `impersonatorUserKey` wird gesetzt, ohne dass irgendwo geprüft wird,
      welchen Customer der Admin als Subject übernehmen soll,
    - in nachgelagerten Routen könnte ein zusätzlicher Switch-Mechanismus den
      `portalCustomerEmail` umsetzen, ohne dass dieser Bridge-Endpoint die
      Berechtigung mitprüft.
- Auswirkung: Solange kein nachgelagerter Subject-Switch existiert, sieht der
  Admin im Portal nur die Daten zu seiner eigenen E-Mail (limitierter Effekt).
  Existiert ein solcher Switch, ist horizontale Privilege-Escalation möglich.
- Vorschlag (unverändert): Whitelist `admin_id → allowed_customer_ids`,
  zwingender Audit-Log pro Bridge, Re-Auth-Prompt für sensible Aktionen. Vor
  Implementierung: separater Audit, der den vollständigen Impersonation-Flow
  durch `tours/routes/portal*.js` und das Frontend traced.
- Aufwand: M (nach Audit ggf. L)
- Confidence: M
- Tags: #security

#### [T07][CRITICAL][H] Kein Fetch-Timeout im Next→Express-Proxy
- Datei: `app/src/lib/proxy.ts:68`
- Kategorie: 9. External I/O
- Problem: `fetch(targetUrl, init)` ohne `signal: AbortSignal.timeout(...)`. Hängt
  Express-Backend, hängt der Next-Proxy mit – Connection-Pool wird gefüllt.
- Auswirkung: DoS-Verstärker bei jedem Backend-Slowdown (Node-Event-Loop, DB-
  Locks). Kaskadiert auf gesamte Next-App.
- Vorschlag: `AbortSignal.timeout(env.PROXY_TIMEOUT_MS ?? 30_000)`. Bei Timeout
  504 mit korrelierender Trace-ID.
- Aufwand: S
- Confidence: H
- Tags: #regression-risk

#### [T09][CRITICAL][H] Payrexx-Webhook ohne Replay-Schutz
- Datei: `tours/routes/payrexx-webhook.js:51-73`
- Kategorie: 1. Security / Webhooks
- Problem: Signatur wird verifiziert, aber Transaktion-ID/Timestamp werden nicht
  gegen verarbeitete Events deduziert. Replay desselben gültigen Webhooks ist
  möglich.
- Auswirkung: Mehrfach-Verbuchung einer Zahlung, doppelte Rechnungen,
  Status-Doppel-Sprung („paid"-Workflow zweimal).
- Vorschlag: `webhook_events(transaction_id PK, processed_at)`-Tabelle, vor
  Verarbeitung INSERT mit `ON CONFLICT DO NOTHING`; nur bei `inserted == 1`
  weiter. Failed-Signature-Versuche loggen.
- Aufwand: M
- Confidence: H
- Tags: #data-loss #security

#### [T10][CRITICAL][H] Leere `key`-Datei im Repo-Root
- Datei: `key` (0 Bytes, getrackt)
- Kategorie: 11. Secrets / Hygiene
- Problem: Datei ohne Inhalt mit verdächtigem Namen in der Wurzel committed.
  Entweder versehentlich (Stub für eigentlichen Schlüssel) oder von einer
  Tool-Pipeline ausgespielt.
- Auswirkung: Indikator, dass Schlüssel-Material in Git landen könnte; bei
  versehentlichem Befüllen fließt Secret in Repo.
- Vorschlag: Datei entfernen, in `.gitignore` aufnehmen. Falls absichtlich
  Platzhalter, in `infra/` mit README dokumentieren.
- Aufwand: S
- Confidence: H
- Tags: #security

#### [T13][CRITICAL][H] Async Express-Handler ohne try/catch
- Datei: `tours/routes/api.js:28-545` (mehrere Routen)
- Kategorie: 10. Error Handling
- Problem: Viele `router.get/post(... , async (req, res) => {...})`-Handler
  haben kein `try/catch`. In Express ohne `express-async-errors`-Patch wird ein
  abgelehnter Promise zur Unhandled Rejection.
- Auswirkung: DB-/Netzwerk-Fehler killen den Node-Prozess (Crash-Loop) oder
  bleiben als 500 ohne Body hängen.
- Vorschlag: `express-async-errors` ganz oben einbinden ODER alle Handler in
  `asyncHandler(...)`-Wrapper packen, der zu `next(err)` weiterleitet.
- Aufwand: S
- Confidence: H
- Tags: #breaking #regression-risk

#### [T14][CRITICAL][M] `sendMailDirect` ohne Empfänger-Allowlist
- Datei: `tours/lib/microsoft-graph.js:286-316`
- Kategorie: 1. Security / Mail-Abuse
- Problem: Funktion akzeptiert beliebigen `to`-Parameter und versendet via
  Tenant. Wenn ein Aufrufer `to` aus `req.body` durchreicht, kann jeder Mails
  über die Org-Domain verschicken (Spam, Phishing, Reputations-Schaden).
- Auswirkung: Open-Relay-ähnlich, Domain-Reputation bricht ein, Spam-Welle.
- Vorschlag: `to` zwingend gegen Allowlist (Kunden/Admin-Domains, bekannte
  Order-Empfänger) prüfen; alternativ Aufrufer-Liste auditieren und
  `sendMailToCustomer`/`sendMailToAdmin`-Helper mit fester Empfänger-Resolution
  einführen.
- Aufwand: M
- Confidence: M
- Tags: #security

---

### HIGH

#### [T01/T13/T14][HIGH][H] Hardcoded Default Session-Secrets
- Dateien: `tours/server.js:96-98`, `booking/server.js:2456-2457`
- Kategorie: 1. Security / Sessions
- Problem: Beide Express-Apps fallen auf hartkodierte Strings
  (`"propus-tour-manager-secret"`, `"buchungstool_sso_session_secret"`) zurück,
  wenn Env-Vars fehlen.
- Auswirkung: Bei vergessener Env-Konfig im Deploy → Session-Forgery → Account-
  Takeover.
- Vorschlag: Boot-Validierung mit Zod: in Production muss `SESSION_SECRET` ≥ 32
  Byte gesetzt sein, sonst Hard-Fail beim Start.
- Aufwand: S
- Confidence: H
- Tags: #security

#### [T10][HIGH][H] Default-Passwort in `setup-admin-user.js`
- Datei: `scripts/setup-admin-user.js:24`
- Kategorie: 11. Secrets
- Problem: `const ADMIN_PASSWORD = process.argv[2] || "Zuerich8038!";` – wenn
  Skript ohne Arg läuft, wird ein bekanntes Passwort gesetzt.
- Auswirkung: Erstkonfiguration bekommt ein im Repo dokumentiertes Passwort.
- Vorschlag: Default entfernen, ohne Arg → `process.exit(1)` mit Hinweis. Ggf.
  selbst-generieren und einmalig stdout drucken.
- Aufwand: S
- Confidence: H
- Tags: #security

#### [T01][HIGH][M] Portal-API trustet Admin-Session-Bridge ohne Re-Validation
- Datei: `tours/routes/portal-api.js:54-69`
- Kategorie: 1. Security / IDOR
- Problem: `requirePortalSession` nimmt `admin_session`-Token, holt `user_key`
  aus DB und setzt damit die Portal-Identität – ohne zu prüfen, dass der
  Token-Inhaber tatsächlich diesen `user_key` repräsentiert.
- Auswirkung: Wer einen fremden Admin-Session-Hash erlangt (Logs, DB-Leak), kann
  als beliebiger User in Portal-API agieren.
- Vorschlag: Portal-Auth ausschließlich über eigene Portal-Credentials; Bridge
  nur explizit aus Admin-UI mit signiertem One-Time-Token.
- Aufwand: M
- Confidence: M
- Tags: #security

#### [T03][HIGH][H] Open Redirect über `returnTo`
- Datei: `tours/routes/auth.js:119-121`
- Kategorie: 1. Security / Open Redirect
- Problem: `returnTo.startsWith('/')` blockt `http://`, aber **nicht**
  protokoll-relativ `//attacker.com/phishing`.
- Auswirkung: Phishing nach Login (Vertrauenskette „echtes Login → fremde
  Seite").
- Vorschlag: `URL`-Konstruktor + Same-Origin-Check oder strikte Whitelist
  `^/[A-Za-z0-9_/-]+$`.
- Aufwand: S
- Confidence: H
- Tags: #security

#### [T02][HIGH][H] Multi-Step Bulk-Save ohne Transaktion
- Datei: `app/src/app/(admin)/orders/[id]/order-bulk-actions.ts:21-68`
- Kategorie: 4. SQL & DB
- Problem: Overview/Objekt/Leistungen/Termin werden sequentiell mutiert; bei
  Fehler in Schritt N bleiben N-1 Schritte committed (Kommentar im Code bestätigt
  das explizit).
- Auswirkung: Inkonsistente Order-Zustände; manuelles Aufräumen nötig.
- Vorschlag: Gemeinsame `withTransaction(...)`-Klammer um alle DB-Schritte;
  externe Effekte via Outbox.
- Aufwand: L
- Confidence: H
- Tags: #data-loss

#### [T02][HIGH][H] TOCTOU Order-No-Allokation
- Datei: `app/src/app/(admin)/orders/[id]/duplicate-actions.ts:56-90`
- Kategorie: 8. Race Conditions
- Problem: `MAX(order_no)+1` außerhalb Tx, danach INSERT. Zwei Parallel-
  Duplicates kollidieren am Unique-Constraint.
- Auswirkung: Sporadischer 500 für Anwender beim Duplizieren.
- Vorschlag: Postgres-Sequence (`bigserial` oder `nextval('order_no_seq')`) oder
  `INSERT ... RETURNING` mit Retry-Schleife.
- Aufwand: M
- Confidence: H
- Tags: #regression-risk

#### [T02][HIGH][H] `revalidatePath()` nach `redirect()` ist tot
- Datei: `app/src/app/(admin)/orders/[id]/verknuepfungen/actions.ts:59,113,133,175,195`
- Kategorie: 2. Next.js
- Problem: `redirect()` wirft `NEXT_REDIRECT`. `revalidatePath()` davor wirkt –
  aber im Code steht teilweise `revalidate*`, dann `redirect`; in anderen
  Stellen umgekehrt. Reihenfolge inkonsistent.
- Auswirkung: Listen-Caches bleiben stale nach Verknüpfungs-Änderungen.
- Vorschlag: Konvention: erst `revalidate*` (synchron), dann `redirect`. Code
  prüfen und vereinheitlichen.
- Aufwand: S
- Confidence: H
- Tags: #regression-risk

#### [T02][HIGH][M] `String(row.status || "pending")` löscht valide Werte
- Datei: `app/src/app/(admin)/orders/[id]/status-change-actions.ts:40`
- Kategorie: 7. Logik / Coercion
- Problem: `||` greift bei `""` und `"0"` – sollte `??` sein.
- Auswirkung: Fehlinterpretation von leeren/numerisch-zero-Status (heute selten,
  aber wartungsanfällig).
- Vorschlag: `String(row.status ?? "pending")`.
- Aufwand: S
- Confidence: M
- Tags: —

#### [T02][HIGH][H] Status-Update ohne Optimistic-Concurrency
- Datei: `app/src/app/(admin)/orders/[id]/status-change-actions.ts:20-85`
- Kategorie: 8. Race Conditions
- Problem: Read-then-Write ohne `expected_updated_at`. Zwei parallele Status-
  Wechsel überschreiben sich still.
- Auswirkung: Lost Updates; State-Machine kann ungültige Transitionen
  verschlucken.
- Vorschlag: `WHERE order_no = $1 AND updated_at = $2`; bei Affected-Rows = 0
  → 409.
- Aufwand: M
- Confidence: H
- Tags: #data-loss

#### [T02][HIGH][M] Termin-Photographer-Lookup ohne Lock
- Datei: `app/src/lib/repos/orders/termin.ts:42-67`
- Kategorie: 8. Race Conditions
- Problem: `buildPhotographerJson` liest Photographer-Datensatz und schreibt
  dann in `orders.termin_meta` – kein `FOR UPDATE` auf Photographer.
- Auswirkung: Wenn Photographer parallel gelöscht/umbenannt wird, landet
  Stale-Snapshot in der Order.
- Vorschlag: Innerhalb der Termin-Tx `SELECT … FOR UPDATE` auf Photographer-Row
  oder Snapshot in eigene Tabelle versionieren.
- Aufwand: M
- Confidence: M
- Tags: #data-loss

#### [T05][HIGH][H] `dangerouslySetInnerHTML` für externes Email-HTML
- Datei: `app/src/pages-legacy/admin/posteingang/PosteingangPage.tsx:920`
- Kategorie: 1. Security / XSS
- Problem: `m.body_html` aus eingehenden Mails wird ungefiltert gerendert.
- Auswirkung: Stored XSS im Admin-Posteingang – Mail-Body kann beliebiges JS im
  Admin-Kontext ausführen (Token-Diebstahl).
- Vorschlag: DOMPurify mit konservativer Allowlist (`a, p, br, ul, li, b, i,
  img[src=https]`), `target=_blank rel=noopener` erzwingen, `<script>`/Event-
  Handler stripping.
- Aufwand: M
- Confidence: H
- Tags: #security

#### [T05][HIGH][H] `dangerouslySetInnerHTML` im HeroGreeting
- Datei: `app/src/components/dashboard/HeroGreeting.tsx:84`
- Kategorie: 1. Security / XSS
- Problem: Übersetzungs-Template mit `.replace()`-Substitutionen wird via
  `dangerouslySetInnerHTML` gerendert. Wenn Metric-Werte (z.B. Customer-Name)
  HTML enthalten, läuft es.
- Auswirkung: Reflected/Stored XSS, abhängig von der Datenquelle.
- Vorschlag: Plain-Text rendern; falls Markup nötig → `react-i18next`-Trans
  oder Markdown-Renderer mit Sanitizer.
- Aufwand: S
- Confidence: M
- Tags: #security

#### [T05][HIGH][H] Form-Doppel-Submit in Posteingang
- Datei: `app/src/pages-legacy/admin/posteingang/PosteingangPage.tsx:693-700` (Send-Button)
- Kategorie: 7. Logik / UX
- Problem: `disabled={sending}` ist gesetzt, `setSending(true)` aber erst innerhalb
  des async-Handlers – React-Batching kann das State-Update verzögern.
- Auswirkung: Doppel-Klick → zwei Mails verschickt, doppelter Audit-Eintrag.
- Vorschlag: `useTransition()` ODER synchron deaktivieren via Ref-Flag, Rev-Token
  serverseitig.
- Aufwand: S
- Confidence: M
- Tags: #regression-risk

#### [T07][HIGH][H] gbp-client Token-Cache ohne Refresh-Lock
- Datei: `booking/gbp-client.js:26,94-97,155-158`
- Kategorie: 9. External I/O
- Problem: `_accessTokenCache` wird ohne Mutex aktualisiert. Mehrere parallele
  Requests können gleichzeitig refreshen oder mit abgelaufenem Token weiter
  arbeiten.
- Auswirkung: Sporadische 401 von Google, fehlgeschlagene Review-Replies.
- Vorschlag: In-flight-Refresh-Promise cachen
  (`if (refreshing) return refreshing`).
- Aufwand: S
- Confidence: M
- Tags: —

#### [T07][HIGH][M] Hardcoded VAT-Rate 8.1 % ohne Historie
- Datei: `app/src/lib/pricing.ts:1`
- Kategorie: 13. Konsistenz
- Problem: `VAT_RATE = 0.081` ist eine Konstante – die alte 7.7 %-Periode (vor
  2024-01-01) ist nicht abgedeckt.
- Auswirkung: Wenn alte Order neu berechnet/storniert wird, falsche MwSt.
- Vorschlag: Helper `vatRateFor(date)` mit `[(2024-01-01, 0.081), (—, 0.077)]`.
- Aufwand: M
- Confidence: M
- Tags: #data-loss

#### [T07][HIGH][H] Fetch-Timeouts fehlen (Nextcloud, DoH)
- Dateien: `booking/nextcloud-share.js:49,85`, `booking/selekto-proxy.js:79`
- Kategorie: 9. External I/O
- Problem: `fetch()` ohne `AbortSignal.timeout`.
- Auswirkung: Hängende Request → blockierte Worker → Cascade-Outage.
- Vorschlag: `AbortSignal.timeout(5_000–10_000)` plus retry/backoff für
  Idempotente Calls.
- Aufwand: S
- Confidence: H
- Tags: —

#### [T09][HIGH][H] Cron-Jobs ohne Distributed-Lock
- Dateien: `booking/jobs/index.js:21-44`, alle Job-Module + `tours/cron-trigger-renewals.js`
- Kategorie: 6. Background-Jobs
- Problem: `cron.schedule()` läuft in jeder Replica. Multi-Pod = N-fache
  Ausführung.
- Auswirkung: Doppelte Mails, doppelte Status-Sprünge, doppelte
  Provisional-Expiries.
- Vorschlag: Postgres-Advisory-Lock pro Job-Name (`pg_try_advisory_lock(hash)`)
  oder dedizierter `JOB_RUNNER=true`-Pod.
- Aufwand: M
- Confidence: H
- Tags: #data-loss

#### [T09][HIGH][H] Cron-Job try/catch zu breit
- Datei: `booking/jobs/provisional-expiry.js:21-103` (analog `provisional-reminders.js`)
- Kategorie: 10. Error Handling
- Problem: Outer-`try/catch` bricht bei einem fehlerhaften Datensatz die
  gesamte Schleife ab.
- Auswirkung: Ein einziger Bad-Record blockiert alle restlichen Mails/Updates
  – stiller Stillstand.
- Vorschlag: `try/catch` **innerhalb** der `for`-Schleife pro Row; Fehler
  loggen + Sentry, weiterlaufen.
- Aufwand: S
- Confidence: H
- Tags: #regression-risk

#### [T09][HIGH][H] node-cron-Callbacks ohne Error-Handler
- Datei: `booking/jobs/review-requests.js:29` (Pattern in mehreren Jobs)
- Kategorie: 10. Error Handling
- Problem: Async Cron-Callback ohne `.catch()` → Unhandled Rejection → Prozess
  crasht (Node ≥ 15) oder verliert Job-Run.
- Auswirkung: Job-Loop bricht still ab.
- Vorschlag: Wrapper `safeCronJob(name, fn)` der `await fn().catch(logErr)`.
- Aufwand: S
- Confidence: H
- Tags: #breaking

#### [T10][HIGH][H] Astro Website: `checkOrigin: false` + 0.0.0.0
- Datei: `website/astro.config.mjs:24,30`
- Kategorie: 1. Security / CSRF
- Problem: Origin-Check abgeschaltet, Server an alle Interfaces gebunden.
- Auswirkung: CSRF auf Astro-Forms möglich, sofern Reverse-Proxy keinen Origin-
  Check macht.
- Vorschlag: `checkOrigin: true` aktivieren oder Nginx-seitig `Host`-/`Origin`-
  Validierung erzwingen.
- Aufwand: M
- Confidence: H
- Tags: #security

#### [T12][HIGH][H] `booking/Dockerfile` läuft als root
- Datei: `booking/Dockerfile`
- Kategorie: 12. Container
- Problem: Kein `USER`-Statement (Vergleich: `app/Dockerfile` legt `nextjs` an).
- Auswirkung: Container-Escape oder RCE läuft mit root-Privilegien.
- Vorschlag: `RUN adduser --system --uid 1001 booking && USER booking` analog
  zu `app/Dockerfile`.
- Aufwand: S
- Confidence: H
- Tags: #security

#### [T13][HIGH][H] Tours: kein Rate-Limit auf Login/Forgot-Password
- Datei: `tours/routes/portal-api-mutations.js:50-120`
- Kategorie: 1. Security
- Problem: Kein `express-rate-limit` auf `/login`, `/forgot-password`.
- Auswirkung: Brute-Force möglich; User-Enumeration über Forgot-Password.
- Vorschlag: 5/15 min auf `/login`, 3/h auf `/forgot-password`, IP+Email-Bucket.
- Aufwand: S
- Confidence: H
- Tags: #security

#### [T14][HIGH][H] Booking-Customer-Endpoints ohne Auth
- Datei: `booking/server.js:3238-3260`
- Kategorie: 1. Security
- Problem: `POST /api/customer/logout`, `/resend-verification`, `/reset-password`
  hängen ohne `requireCustomer` an der Route-Tabelle.
- Auswirkung: Unauthentifizierte Aktoren triggern Logouts, Mail-Bombing,
  Reset-Spam.
- Vorschlag: `requireCustomer`-Middleware vorhängen, Rate-Limit zusätzlich.
- Aufwand: S
- Confidence: H
- Tags: #security

---

### MEDIUM

#### [T03][MEDIUM][M] Schwache Passwort-Policy
- Dateien: `booking/customer-auth.js:20-30`, `tours/lib/portal-auth.js:251-252`
- Problem: Nur `length >= 8`, keine Komplexitäts-Anforderung.
- Vorschlag: `>= 12` ODER `≥ 1 Upper + 1 Digit + 1 Symbol`. Optional `zxcvbn`.
- Aufwand: M · Confidence: M

#### [T03][MEDIUM][M] Sensible Fehlermeldungen im Response (Assistant)
- Datei: `app/src/app/api/assistant/route.ts:309-319`
- Problem: `err.message` direkt in 500-Response.
- Vorschlag: Generische Meldung an Client, Details in Logger.
- Aufwand: S · Confidence: M

#### [T03][MEDIUM][M] Fehlende Zod-Validation Assistant-Confirm
- Datei: `app/src/app/api/assistant/confirm/route.ts:17-26`
- Problem: `confirmationId`/`toolName` ohne Schema.
- Vorschlag: `z.object({ confirmationId: z.string().uuid(), toolName: z.enum([...]) })`.
- Aufwand: S · Confidence: M

#### [T01][MEDIUM][M] Token-Hash in Logs
- Datei: `tours/middleware/auth.js:97,104,120,126`
- Problem: `getAuthRequestMeta(req)` enthält ggf. `admin_session`-Cookie.
- Vorschlag: Auth-Header in Log-Meta-Helper komplett ausblenden.
- Aufwand: S · Confidence: M

#### [T03][MEDIUM][M] Kein Per-Minute-Rate-Limit auf Assistant
- Datei: `app/src/app/api/assistant/route.ts:62-69`
- Problem: Nur Daily-Token-Limit, kein Per-Minute-Burst-Limit.
- Vorschlag: 10 req/min/User via in-memory `Map` oder Redis.
- Aufwand: M · Confidence: M

#### [T02][MEDIUM][M] Calendar-Sync-Fehler verschluckt
- Datei: `app/src/app/(admin)/orders/[id]/leistungen/actions.ts:161-182`
- Problem: `console.error` only, Action returned `ok: true`.
- Vorschlag: Soft-Warning im Result, Sentry, optional Retry.
- Aufwand: M · Confidence: M

#### [T02][MEDIUM][M] `String(input.orderNo)` ohne `Number.isInteger`-Guard
- Datei: `app/src/app/(admin)/orders/[id]/order-bulk-actions.ts:24-26`
- Problem: `String(...)` immer truthy → Validation-Check `if (!n)` läuft nie.
- Vorschlag: `if (!Number.isInteger(input.orderNo) || input.orderNo <= 0) return error`.
- Aufwand: S · Confidence: M

#### [T04][MEDIUM][H] `getVerknuepfungenForClient` lädt vor Auth-Check
- Datei: `app/src/app/(admin)/orders/[id]/verknuepfungen/verknuepfungen-data-actions.ts:11-22`
- Problem: Daten werden geholt bevor `requireOrderViewAccess()` zwingend wirft.
- Vorschlag: Auth zuerst, Daten danach.
- Aufwand: S · Confidence: M

#### [T02][MEDIUM][M] Leistungen-Update ohne Optimistic-Concurrency
- Datei: `app/src/app/(admin)/orders/[id]/leistungen/actions.ts:24-113`
- Vorschlag: `updated_at`-Vergleich in WHERE.
- Aufwand: M · Confidence: M

#### [T02][MEDIUM][M] `sendOrderMessage` ohne Order-Existenz-Check
- Datei: `app/src/app/(admin)/orders/[id]/kommunikation/actions.ts:16-45`
- Problem: INSERT ohne Vorab-Check; FK-Fehler wird verschluckt.
- Vorschlag: SELECT 1 davor oder strukturierten FK-Fehler ans UI.
- Aufwand: S · Confidence: M

#### [T02][MEDIUM][M] Chat-Delete: Audit-Log außerhalb Tx
- Datei: `app/src/app/(admin)/orders/[id]/kommunikation/actions.ts:47-65`
- Problem: `withTransaction` umfasst nur UPDATE; `logOrderEvent` danach.
- Vorschlag: Beide in selbe Tx oder Outbox.
- Aufwand: M · Confidence: M

#### [T05][MEDIUM][M] `useEffect`-Dep `lang` fehlt in HeroGreeting
- Datei: `app/src/components/dashboard/HeroGreeting.tsx:55-65`
- Problem: Profil-Refresh nach Sprachwechsel ausbleibend.
- Aufwand: S · Confidence: M

#### [T05][MEDIUM][M] matterport-spaces-list: setLoading nicht durchgängig guarded
- Datei: `app/src/app/(admin)/orders/[id]/verknuepfungen/matterport-spaces-list.tsx:74-105`
- Vorschlag: Alle setState-Calls hinter `if (!cancelled)`.
- Aufwand: S · Confidence: M

#### [T08][MEDIUM][M] AppSidebar: localStorage + SSR-Mismatch
- Datei: `app/src/components/layout/AppSidebar.tsx:40-56`
- Vorschlag: Initial-State auf Server-Default, Hydration in `useEffect`.
- Aufwand: S · Confidence: M

#### [T05][MEDIUM][M] AppSidebar: zwei `useEffect` mit überlappendem State
- Datei: `app/src/components/layout/AppSidebar.tsx:99-124`
- Vorschlag: Effects mergen oder klare Reihenfolge mit Ref-Flag.
- Aufwand: M · Confidence: M

#### [T05][MEDIUM][M] topbar-actions: Kein Rollback bei Action-Error
- Datei: `app/src/app/(admin)/orders/[id]/topbar-actions.tsx:47-71`
- Vorschlag: Bei `ok:false` UI-State (Menu-Open) wiederherstellen + Toast.
- Aufwand: M · Confidence: M

#### [T05][MEDIUM][M] `requireAdminLayoutSession()` evtl. zu schwach
- Hinweis: in Layout vorhanden, aber Stärke der Session-Validierung verifizieren.
- Vorschlag: Sicherstellen, dass alle `(admin)`-Pages serverseitig blockiert
  werden, nicht nur Client-`RouteGuard`.
- Aufwand: M · Confidence: L

#### [T08][MEDIUM][H] `useNow()` Hydration-Mismatch
- Datei: `app/src/hooks/useNow.ts:10`
- Problem: `useState(() => new Date())` differiert SSR vs. Client.
- Vorschlag: Initial-State `null`, in `useEffect` setzen.
- Aufwand: S · Confidence: H

#### [T07][MEDIUM][M] zustand `updateStructured` mit Stale-Closure
- Datei: `app/src/store/bookingWizardStore.ts:408-412`
- Vorschlag: Updater immer aus `set((s) => ...)`-Callback verwenden.
- Aufwand: M · Confidence: M

#### [T07][MEDIUM][H] `Math.random()` für Multer-Filenames
- Datei: `booking/server.js:250,258,317`
- Problem: Nicht-kryptografisch → vorhersagbar.
- Vorschlag: `crypto.randomBytes(16).toString('hex')`.
- Aufwand: S · Confidence: H

#### [T09][MEDIUM][M] In-Memory Geocoder-Cache ohne Eviction
- Datei: `booking/geocoder.js:27-45`
- Vorschlag: LRU mit max. 10k Einträgen oder Redis.
- Aufwand: M · Confidence: M

#### [T07][MEDIUM][M] Cron-Threshold via UTC-`toISOString` (DST-Drift)
- Datei: `booking/jobs/provisional-reminders.js:79,98,118`
- Vorschlag: Local-Date-Arithmetic mit `Europe/Zurich` (date-fns-tz / Luxon).
- Aufwand: M · Confidence: M

#### [T07][MEDIUM][M] User-HTML in Fallback-Mail nicht escaped
- Datei: `booking/jobs/review-requests.js:123-127`
- Vorschlag: `escapeHtml()` für `row.billing.name` etc.
- Aufwand: S · Confidence: M

#### [T13][MEDIUM][M] Multer ohne Magic-Bytes-Validierung (×2)
- Dateien: `tours/routes/admin-api.js:76-90`, `tours/routes/portal-api-mutations.js:456-474`
- Vorschlag: `file-type` für Magic-Bytes; Bilder zusätzlich via `sharp`
  re-encoden.
- Aufwand: M · Confidence: M

#### [T13][MEDIUM][M] Admin-Logout: remember_token nicht revoked
- Datei: `tours/routes/admin.js:1883-1885`
- Vorschlag: `UPDATE admin_remember_tokens SET revoked_at = NOW() WHERE admin_id = $1`.
- Aufwand: S · Confidence: M

#### [T13][MEDIUM][M] Email-Wechsel revoked nicht alle Sessions
- Datei: `tours/routes/admin.js:1866-1880`
- Vorschlag: Bei Email-Change alle aktiven Sessions/RememberTokens des Admins
  invalidieren.
- Aufwand: M · Confidence: M

#### [T13][MEDIUM][L] State-mutating GET in Portal-Detail
- Datei: `tours/routes/portal-api-mutations.js:372-452`
- Vorschlag: GET strikt read-only halten; Mutationen via POST.
- Aufwand: S · Confidence: L

#### [T13][MEDIUM][M] `pendingAdminChatAction` ohne Server-Validation
- Datei: `tours/routes/admin.js:1955-1997`
- Vorschlag: Action-Payload signieren oder Whitelist + erneute Berechtigungs-
  Prüfung beim Apply.
- Aufwand: M · Confidence: M

#### [T14][MEDIUM][M] Discount-Code-Validierung ohne Rate-Limit
- Datei: `booking/server.js:4573-4584`
- Vorschlag: Rate-Limit + HMAC-signierte Codes.
- Aufwand: M · Confidence: M

#### [T15][MEDIUM][M] Astro: 3 Pages mit `prerender = true`
- Hinweis: Auth-/dynamische Pages dürfen nicht statisch ausgeliefert werden.
- Vorschlag: Pro Page evaluieren; Auth-Pages → `prerender = false`.
- Aufwand: M · Confidence: M

#### [T10][MEDIUM][M] VPS-Deploy als root ohne Pre-Flight
- Datei: `.github/workflows/deploy-vps-and-booking-smoke.yml:174,199,234`
- Vorschlag: Manual-Approval-Gate, dedizierter Deploy-User mit `command=`-Restriction.
- Aufwand: M · Confidence: M

#### [T12][MEDIUM][M] docker-compose Default-Passwort
- Datei: `docker-compose.yml:9,34,105,131`
- Vorschlag: Fallbacks entfernen, Hard-Fail wenn ungesetzt.
- Aufwand: S · Confidence: M

#### [T12][MEDIUM][M] `SUPABASE_URL` als Build-Arg → in Image-Layer geleakt
- Datei: `docker-compose.vps.yml:237-239`
- Vorschlag: Nur als Runtime-Env, oder BuildKit-Secret.
- Aufwand: M · Confidence: M

#### [T03][MEDIUM][L] Session-Fixation Restrisiko in Portal-Login
- Datei: `tours/routes/portal-api-mutations.js:63-77`
- Vorschlag: Bei `regenerate`-Error alte Session destroyen, Request abbrechen.
- Aufwand: S · Confidence: L

#### [T13][MEDIUM][M] Customer-Token-Replay (`/r/yes`/`/r/no`)
- Datei: `tours/routes/customer.js:39-112`
- Vorschlag: Atomic `UPDATE … SET used_at = NOW() WHERE used_at IS NULL
  RETURNING token` als Single-Source-of-Truth.
- Aufwand: M · Confidence: M

#### [T08][MEDIUM][M] Blob-URL-Leak im Portrait-Crop
- Datei: `app/src/components/employees/EmployeeModal.tsx:459-472`
- Vorschlag: `useEffect`-Cleanup, Set aller aktiven URLs revoken.
- Aufwand: S · Confidence: M

---

### LOW

#### [T02][LOW][M] Hard-coded Status-Strings
- Datei: `app/src/app/(admin)/orders/[id]/status-change-actions.ts:22`
- Vorschlag: `STATUS`-Const aus `lib/orderWorkflow/stateMachine` importieren.
- Aufwand: M · Confidence: L

#### [T02][LOW][M] `|| null` löscht leere Strings (Billing-Patch)
- Datei: `app/src/app/(admin)/orders/[id]/actions.ts:37-50`
- Vorschlag: `value === '' ? null : value` explizit.
- Aufwand: S · Confidence: M

#### [T05][LOW][L] StaleClientReloadHandler patcht `window.fetch` non-idempotent
- Datei: `app/src/components/StaleClientReloadHandler.tsx:65-80`
- Vorschlag: Patch idempotent machen oder `MutationObserver` statt
  Fetch-Monkeypatch.
- Aufwand: M · Confidence: L

#### [T08][LOW][L] `use()`-Hook-Patterns risikoanfällig
- Hinweis: Kein konkreter Treffer, aber Pattern-Audit empfohlen.
- Aufwand: M · Confidence: L

#### [T10][LOW][L] Tailwind v4 / PostCSS-Drift ohne Doku
- Datei: `app/postcss.config.mjs`
- Vorschlag: README-Notiz + Pin auf `^4`.
- Aufwand: S · Confidence: L

#### [T10][LOW][L] `.dockerignore` zu kurz
- Datei: `.dockerignore`
- Vorschlag: `.env.*.local`, `.next`, `.turbo`, `coverage`, `*.pem` ergänzen.
- Aufwand: S · Confidence: L

---

### INFO

#### [T01][INFO][L] `booking.admin_sessions` ohne `revoked_at`
- Datei: `app/src/lib/auth.server.ts:22-46`
- Hinweis: Kein hartes Logout möglich; Token bleibt bis Expiry gültig.
- Vorschlag: Spalte ergänzen, Logout setzt `revoked_at`, Query filtert.
- Aufwand: M · Confidence: L

#### [T12][INFO][L] `PLATFORM_INTERNAL_URL` hartkodiert auf 127.0.0.1:3100
- Datei: `docker-compose.vps.yml:46,54,93,169`
- Vorschlag: Compose-Service-Name (`http://platform:3100`) statt IP.
- Aufwand: M · Confidence: L

---

## Cross-Cutting (wiederkehrende Muster)

1. **Hardcoded Default-Secrets** überall (Sessions, Admin-Setup-PW). Empfehlung:
   zentrales `env.ts` mit Zod-Validation in jedem Sub-Projekt, Hard-Fail beim
   Start in Production.
2. **Cron ohne Distributed-Lock** + **Cron try/catch zu breit**: einheitlicher
   `safeCronJob(name, fn)`-Wrapper mit `pg_try_advisory_lock` und Per-Row-
   Error-Boundary.
3. **Fehlende Fetch-Timeouts** an mehreren Stellen (`proxy.ts`, `nextcloud-share`,
   `selekto-proxy`, MS-Graph-Client). Globaler `safeFetch(url, opts, timeoutMs)`-
   Helper mit Default 10 s.
4. **Multi-Step-Mutationen ohne Tx + ohne Outbox** (Server-Actions T02 +
   Pilot-Findings). Outbox-Tabelle für externe Effekte (Outlook, Mail), DB-Tx
   für State-Changes.
5. **Optimistic-Concurrency fehlt durchgehend**: Status-, Leistungen-, Termin-
   Updates ohne `expected_updated_at`. `WHERE updated_at = $X` als Pattern.
6. **`dangerouslySetInnerHTML` ohne Sanitizer** (Posteingang, HeroGreeting):
   zentrales `<SafeHtml>`-Component mit DOMPurify einführen.
7. **Auth-Bridges + IDOR**: Admin↔Portal-Bridges in `tours/` trauen DB-Werten
   ohne Re-Validation. Komplette Bridge-Logik auditieren und mit
   One-Time-Tokens absichern.
8. **Multer ohne Magic-Bytes-Validation** (Tours admin-api + Portal-Profile):
   `file-type` + Re-Encoding für Bilder.
9. **`||` statt `??`** an mehreren Stellen verschluckt valide Falsy-Werte
   (`""`, `0`).
10. **Pilot-Findings (PILOT.md)** sind vollständig adressiert in obigen
    Tranchen — TOCTOU/Multi-Step-Tx/Mail-Errors-verschluckt überlappen mit T02
    und gehören in dieselbe Refactor-Welle.

---

## Empfohlene Reihenfolge für Fix-Sprints

1. **Sprint A (Security-Critical, 2–3 Tage):**
   - JWT-Verify, Admin-Bridge-Authorisierung, `key`-Datei entfernen,
     Default-Admin-PW raus, Default-Session-Secrets raus, Express
     async-Handler-Wrapper, `sendMailDirect`-Allowlist, Open-Redirect-Fix.
2. **Sprint B (Datenintegrität, 3–5 Tage):**
   - Multi-Step-Mutationen in Tx, Optimistic-Concurrency-Pattern, TOCTOU-Fixes
     (Order-No-Sequence, Photographer-Lock), Cron-Lock + Per-Row-try/catch,
     Webhook-Replay-Schutz.
3. **Sprint C (Operations & UX, laufend):**
   - Fetch-Timeouts global, Sanitizer für `dangerouslySetInnerHTML`, Multer-
     Magic-Bytes, AppSidebar-Hydration, Form-Doppel-Submit, Rate-Limits.
4. **Sprint D (Hygiene, locker einplanen):**
   - VAT-Historie, Geocoder-Eviction, `revoked_at`-Spalte, `.dockerignore`,
     Tailwind-Drift-Doku, `prerender = true`-Audit.
