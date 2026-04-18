# Propus Platform — Authentifizierungs-Flows

> **Automatisch mitpflegen:** Bei Änderungen an Login-Logik, Session-Verwaltung, Token-Handling oder Portal-Auth dieses Dokument aktualisieren.

*Zuletzt aktualisiert: April 2026 (PR #94: admin_users Legacy-Tabellen durch Views mit INSTEAD-OF-Triggern über `core.admin_users` ersetzt). PR #92: API-Key-Auth bindet req.user.id auf numerische admin_users.id. PR #91: API-Key-Auth-Pfad in Middleware. PR #89: Rate-Limiting auf Login-Endpunkte. PR #88: Unified Login, Portal-Session-Bridge, Profil-Endpunkt, Passwort-Reset-Fix*

---

## Inhaltsverzeichnis

1. [Übersicht & Zwei-System-Architektur](#1-übersicht--zwei-system-architektur)
2. [Unified Login (POST /auth/login)](#2-unified-login-post-authlogin)
3. [Portal-Session-Bridge](#3-portal-session-bridge)
4. [Kunden-Profil-Endpunkt (GET /auth/profile)](#4-kunden-profil-endpunkt-get-authprofile)
5. [Magic-Link-Flow (Buchungs-Mail)](#5-magic-link-flow-buchungs-mail)
6. [Passwort-Reset-Flow (Portal)](#6-passwort-reset-flow-portal)
7. [Post-Login-Redirect](#7-post-login-redirect)
8. [Session-Tabellen & Cookies](#8-session-tabellen--cookies)
9. [Frontend-Integration](#9-frontend-integration)
10. [API-Key-Authentifizierung](#10-api-key-authentifizierung-bearer-token-ppk_live_)
11. [Sicherheitshinweise](#11-sicherheitshinweise)

---

## 1. Übersicht & Zwei-System-Architektur

Die Plattform betreibt **zwei getrennte Auth-Systeme**, die über die Session-Bridge verbunden sind:

| System | Credential-Store | Session-Typ | Cookie |
|---|---|---|---|
| **Admin/Intern** | `booking.admin_users` (scrypt) | `booking.admin_sessions` (JWT-ähnliches Token) | `admin_session` |
| **Portal-Kunden** | `tour_manager.portal_users` (bcrypt) | Express-Session (`propus_tours.sid`) | `propus_tours.sid` |

**Unified-Login-Ziel:** Beide Nutzergruppen können sich über **dieselbe Login-Seite** (`/login`) anmelden. Das Backend probiert Admin-Login zuerst; schlägt dieser fehl, folgt Portal-Kunden-Login. Das zurückgegebene Token ist immer ein `admin_sessions`-Token.

```
Nutzer öffnet /login
  │
  ├── POST /api/auth/login
  │     ├── Versuch 1: admin_users (scrypt)       → token, role ∈ {admin, super_admin, photographer, …}
  │     └── Versuch 2: portal_users (bcrypt)       → token, role ∈ {customer_user, customer_admin, tour_manager}
  │
  └── Frontend speichert Token in localStorage/sessionStorage (Key: "admin_token_v2")
```

**Dateien:**
- `booking/server.js` — Endpunkte `/auth/login`, `/auth/profile`, `/auth/customer/magic`
- `booking/portal-auth-bridge.js` — Brücke zu `tours/lib/portal-auth` (bcrypt-Prüfung + Rollen-Lookup)
- `tours/routes/portal-api.js` — `requirePortalSession` (Session-Bridge für Portal-API)
- `app/src/store/authStore.ts` — `TOKEN_STORAGE_KEY = "admin_token_v2"`, `useAuthStore`
- `app/src/lib/postLoginRedirect.ts` — Sicheres Redirect-Ziel nach Login

---

## 2. Unified Login (POST /auth/login)

**Endpunkt:** `POST /auth/login`  
**Proxy:** Next.js `/api/auth/login` → Express `/auth/login`  
**Datei:** `booking/server.js` (ab Zeile ~2403)

### Ablauf

```
POST /auth/login  { email, password, rememberMe }
  │
  ├── 1. Admin-Login:
  │     db.getAdminUserByUsername(email)
  │     customerAuth.verifyPassword(password, admin_users.password_hash)  ← scrypt
  │     issueAdminSession() → INSERT INTO admin_sessions
  │     RBAC: seedRbacIfNeeded → syncAdminUserRolesFromDb → getEffectivePermissions
  │     → { ok, token, role, permissions }
  │
  ├── 2. Portal-Kunden-Login (nur wenn Versuch 1 fehlschlägt):
  │     portalAuthBridge.verifyPortalCustomerPassword(email, password)  ← bcrypt via tours/lib/portal-auth
  │     portalAuthBridge.getPortalCustomerRole(email)
  │     issueAdminSession() → INSERT INTO admin_sessions  (role = customer_user|customer_admin|tour_manager)
  │     rbac.legacyFallbackPermissions(role)
  │     → { ok, token, role, permissions }
  │
  └── 3. Fehler → 401 "Ungültige Zugangsdaten"
```

### Rollen-Ermittlung für Portal-Kunden (`getPortalCustomerRole`)

Quelle: `booking/portal-auth-bridge.js`

| Prüfreihenfolge | Bedingung | Ergebnis-Rolle |
|---|---|---|
| 1 | `portal_staff_roles WHERE role = 'tour_manager'` | `tour_manager` |
| 2 | `portal_team_members WHERE role IN ('inhaber','admin') AND status='active'` | `customer_admin` |
| 3 | `tours WHERE customer_email = email` | `customer_admin` |
| 4 | (Fallback) | `customer_user` |

### Response-Format

```json
{ "ok": true, "token": "<hex-token>", "role": "customer_admin", "permissions": ["tours.view", …] }
```

---

## 3. Portal-Session-Bridge

**Problem:** Das Portal (`/portal/api/*`) läuft im Tour-Manager-Express-Router und nutzt Express-Sessions (`propus_tours.sid`). Nach Unified-Login hat der Nutzer aber nur ein `admin_sessions`-Token.

**Lösung:** `requirePortalSession` in `tours/routes/portal-api.js` prüft beide Quellen:

```
GET /portal/api/tours  (Header: Authorization: Bearer <token>)
  │
  ├── 1. req.session.portalCustomerEmail vorhanden?  → weiter (Session-Cookie bereits gesetzt)
  │
  ├── 2. Bearer-Token aus Authorization-Header extrahieren
  │     (Fallback: Cookie "admin_session")
  │
  ├── 3. SHA-256-Hash des Tokens → admin_sessions WHERE token_hash = ? AND expires_at > NOW()
  │     row.role ∈ {customer_user, customer_admin, tour_manager}?
  │
  ├── 4. JA → req.session.portalCustomerEmail = row.user_key
  │           req.session.portalCustomerName  = row.user_name
  │           req.session.save() → next()
  │
  └── 5. NEIN / kein Token → 401 "Nicht angemeldet"
```

**Datenbank:** `booking.admin_sessions` (search_path umfasst `booking,tour_manager,core,public`)

**Wichtig:** Das Portal-Frontend (`app/src/api/portalTours.ts`) sendet den Admin-Token automatisch als Bearer-Header in jedem Request (via `portalFetch`).

---

## 4. Kunden-Profil-Endpunkt (GET /auth/profile)

**Endpunkt:** `GET /auth/profile`  
**Proxy:** Next.js `/api/auth/profile` → Express `/auth/profile`  
**Datei:** `booking/server.js` (ab Zeile ~2467)  
**Auth:** `Authorization: Bearer <admin_token_v2>`

### Ablauf

```
GET /auth/profile  (Authorization: Bearer <token>)
  │
  ├── Token → SHA-256-Hash → SELECT FROM admin_sessions WHERE token_hash = ? AND expires_at > NOW()
  ├── role ∈ {customer_user, customer_admin, tour_manager}? (CUSTOMER_ROLES)
  ├── db.getCustomerByEmail(row.user_key) → core.customers
  └── → { ok, email, name, company, phone, street, zipcity }
```

### Response-Felder (aus `core.customers`)

| Feld | Quelle |
|---|---|
| `email` | `admin_sessions.user_key` |
| `name` | `core.customers.name` |
| `company` | `core.customers.company` |
| `phone` | `core.customers.phone` |
| `street` | `core.customers.street` |
| `zipcity` | `core.customers.zipcity` (Format: `"8001 Zürich"` oder `"CH-8001 Zürich"`) |

**Verwendung:** `StepBilling.tsx` im Buchungs-Wizard füllt das Rechnungsformular vor (→ [FLOWS_BOOKING.md §15](./FLOWS_BOOKING.md)).

---

## 5. Magic-Link-Flow (Buchungs-Mail)

**Endpunkt:** `GET /auth/customer/magic?magic=<token>&returnTo=<path>`  
**Datei:** `booking/server.js` (ab Zeile ~2908)  
**Erstellt durch:** `createCustomerPortalMagicLink()` (wird in Buchungs-Bestätigungs-Mails eingebettet)

### Ablauf

```
Buchungsabschluss POST /api/booking
  │
  ├── createCustomerPortalMagicLink(billing)
  │     ├── Kunde suchen/anlegen in core.customers
  │     ├── Firma sicherstellen (ensureCompanyByName)
  │     ├── company_member erstellen / Logto-Org-Sync
  │     └── Token (random hex) → INSERT INTO booking.customer_sessions
  │           → URL: /auth/customer/magic?magic=<token>&returnTo=<path>
  │
  └── Buchungs-Bestätigungs-E-Mail enthält Magic-Link-URL
```

```
Kunde klickt Link: GET /auth/customer/magic?magic=<token>
  │
  ├── SHA-256(token) → getCustomerBySessionTokenHash()
  ├── customer.blocked? → Redirect mit auth_error=invalid_session
  ├── Cookie setzen: "customer_session=<raw-token>; HttpOnly; SameSite=Lax"
  └── Redirect → safeCustomerMagicReturnPath(returnTo)  (open-redirect-sicher)
```

**Hinweis:** Der Magic-Link-Flow ist vom Unified-Login getrennt. Er nutzt `booking.customer_sessions` (nicht `admin_sessions`) und den Cookie `customer_session` (nicht `admin_session`).

---

## 6. Passwort-Reset-Flow (Portal)

**Endpunkte:**
- `POST /portal/api/forgot-password` → sendet Reset-E-Mail
- `GET /portal/api/check-reset-token?token=<t>` → prüft Token-Gültigkeit
- `POST /portal/api/reset-password` → setzt neues Passwort

**Datei:** `tours/routes/portal-api-mutations.js`  
**Frontend:** `app/src/pages-legacy/portal/PortalForgotPasswordPage.tsx`, `PortalResetPasswordPage.tsx`

### Ablauf

```
POST /portal/api/forgot-password  { email }
  │
  ├── portalAuth.normalizeEmail(email)
  ├── portalAuth.issuePasswordReset(email)  (fire-and-forget — verhindert Timing-Angriff)
  │     ├── portal_users WHERE email_norm = ? vorhanden?
  │     │     JA  → Token (random hex) → INSERT portal_password_resets (expires_at = +2h)
  │     │           → { ok: true, token, email }
  │     │     NEIN → { ok: false }
  │     │
  │     └── .then(reset => sendMailDirect({ to: reset.email, subject: …, htmlBody: … }))
  │               Reset-Link: <baseUrl>/portal/reset-password?token=<encoded-token>
  │
  └── Immer → { ok: true, message: "Falls ein Konto existiert, wurde eine E-Mail gesendet." }
              (E-Mail-Enumeration verhindert)
```

```
POST /portal/api/reset-password  { token, password }
  │
  ├── password.length >= 8?
  ├── portalAuth.consumePasswordReset(token, password)
  │     ├── portal_password_resets WHERE token_hash = ? AND expires_at > NOW()
  │     ├── bcrypt.hash(password) → UPDATE portal_users SET password_hash
  │     └── DELETE portal_password_resets WHERE token_hash = ?
  └── → { ok: true }
```

**Wichtig — behobener Bug (April 2026):** Der ursprüngliche Code rief `issuePasswordReset()` auf, ignorierte aber das Ergebnis und rief `sendMailDirect` nie auf. Die E-Mail wurde deshalb nie versandt. Behoben durch fire-and-forget-Pattern mit `.then(reset => sendMailDirect(…))`.

**"Zurück zum Login"-Link:** Beide Passwort-Reset-Seiten verlinken auf `/login` (unified), **nicht** auf das veraltete `/portal/login`.

---

## 7. Post-Login-Redirect

**Datei:** `app/src/lib/postLoginRedirect.ts`

Nach erfolgreichem Login leitet das Frontend auf `returnTo` weiter (falls im URL-Parameter vorhanden).

### Sicherheit: Open-Redirect-Schutz

```typescript
function isSafeInternalPath(path: string): boolean {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;  // protocol-relative URLs
  return true;
}
```

| Eingabe | Ergebnis |
|---|---|
| `/portal/tours` | ✅ sicher → Redirect |
| `https://evil.com` | ❌ blockiert (kein `/`-Prefix) |
| `//evil.com` | ❌ blockiert (protocol-relative) |
| `/\evil.com` | ❌ blockiert |

**Rollen-basiertes Standard-Redirect-Ziel (`resolvePostLoginTarget`):**

| Rolle | Standard-Ziel |
|---|---|
| `customer_user`, `customer_admin` | `/portal/tours` |
| `tour_manager` | `/portal/tours` |
| `admin`, `super_admin`, `photographer` | `/admin/tours` (oder letztes Admin-Ziel) |
| `company_owner`, `company_employee` | `/admin` |

---

## 8. Session-Tabellen & Cookies

### `booking.admin_sessions`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `token_hash` | TEXT UNIQUE | SHA-256(raw-token) |
| `user_key` | TEXT | E-Mail (Portal-Kunde) oder Admin-User-ID |
| `user_name` | TEXT | Anzeigename |
| `role` | TEXT | System-Rolle |
| `expires_at` | TIMESTAMPTZ | Ablaufzeit (rememberMe → 30d, sonst 1d) |
| `created_at` | TIMESTAMPTZ | |

**Verwendet von:** Unified-Login, Portal-Session-Bridge, `/auth/profile`

### `booking.customer_sessions`

| Feld | Typ | Beschreibung |
|---|---|---|
| `token_hash` | TEXT PK | SHA-256(raw-token) |
| `customer_id` | BIGINT FK | → `core.customers` |
| `expires_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

**Verwendet von:** Magic-Link-Flow

### Express-Session (`propus_tours.sid`)

Verwaltet vom Tour-Manager-Express-Router via `express-session` + Postgres-Store.

| Session-Feld | Inhalt |
|---|---|
| `portalCustomerEmail` | Normalisierte E-Mail (gesetzt durch Portal-Login oder Session-Bridge) |
| `portalCustomerName` | Anzeigename |

### Cookies im Überblick

| Cookie | Scope | Gesetzt von |
|---|---|---|
| `admin_session` | `/` | `issueAdminSession()` in `booking/server.js` |
| `customer_session` | `/` | Magic-Link-Endpunkt |
| `propus_tours.sid` | `/` | Express-Session (Tour-Manager) |

---

## 9. Frontend-Integration

### Token-Speicherung (`app/src/store/authStore.ts`)

```typescript
export const TOKEN_STORAGE_KEY = "admin_token_v2";
```

- `rememberMe = true` → `localStorage`
- `rememberMe = false` → `sessionStorage`

### portalFetch (`app/src/api/portalTours.ts`)

Alle Requests an `/portal/api/*` werden mit dem Admin-Token als Bearer-Header versehen:

```typescript
async function portalFetch<T>(path, options?) {
  const token = getAdminToken();   // localStorage || sessionStorage
  fetch(`/portal/api${path}`, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    },
  });
}
```

Dies aktiviert die **Portal-Session-Bridge** in `requirePortalSession` für Kunden, die sich über Unified-Login (nicht Portal-Cookie) angemeldet haben.

### Kunden-Profil-Hook (`app/src/hooks/useCustomerProfile.ts`)

```typescript
// Lädt Profil nur für Kunden-Rollen (customer_user, customer_admin, tour_manager)
const { profile } = useCustomerProfile();
```

Verwendet in: `StepBilling.tsx` (Buchungs-Wizard Schritt 4)

### isKundenRole (`app/src/lib/permissions.ts`)

```typescript
isKundenRole(role) // true für: customer_user, customer_admin, tour_manager
```

Steuert u.a.: Login-Hinweis-Banner, Profil-Vorausfüllung, Standard-Redirect nach Login.

---

## 10. API-Key-Authentifizierung (Bearer-Token `ppk_live_…`)

Seit PR #91 unterstuetzt die Auth-Middleware in `booking/server.js` neben Session-Tokens auch langlebige API-Keys als Bearer-Token.

### Erkennung

Das Middleware prueft nach Token-Extraktion (`getRequestTokenDetails`):
1. `source !== "cookie"` — API-Keys werden nur via `Authorization: Bearer` oder Query-Parameter akzeptiert, nie aus Cookies.
2. Token beginnt mit `ppk_live_` — Prefix-basierte Unterscheidung von Session-Tokens.

### Ablauf

```
Eingehender Request mit Bearer ppk_live_<secret>
  │
  ├── SHA-256(token) → core.api_keys WHERE token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
  │
  ├── api_key.created_by → core.admin_users WHERE id = ? AND active = TRUE
  │     → req.user = { id: String(admin_users.id), userKey: String(admin_users.id), email, name, role }
  │     → id und userKey enthalten die numerische Admin-User-ID (als String), nicht die E-Mail
  │     → req.apiKeyId = api_key.id
  │
  ├── Async: UPDATE core.api_keys SET last_used_at = NOW()  (fire-and-forget)
  │
  └── next()  (Routing-Middleware prueft dann requireAdmin + rbac.requirePermission)
```

### Sicherheitsaspekte

| Thema | Massnahme |
|---|---|
| Kein Cookie-Pfad | `source !== "cookie"` verhindert CSRF-Angriffe ueber API-Keys |
| Permissions | Token erbt Rolle + Permissions des erstellenden Admin-Users (kein eigener Scope) |
| Revoke | Sofort wirksam — `revoked_at IS NULL`-Check in jeder Anfrage |
| Token-Format | `ppk_live_` + 32 Bytes base64url (256 Bit Entropie) |
| Speicherung | Nur SHA-256-Hash in DB; Klartext wird einmalig bei Erstellung angezeigt |

---

## 11. Sicherheitshinweise

| Thema | Maßnahme |
|---|---|
| **E-Mail-Enumeration** | `/forgot-password` antwortet immer mit derselben Nachricht; Mail wird fire-and-forget versandt (keine Timing-Korrelation) |
| **Open-Redirect** | `isSafeInternalPath()` blockiert `//`-Prefixe und externe URLs |
| **Token-Hashing** | Alle Tokens werden als SHA-256-Hash in der DB gespeichert (nie Klartext) |
| **Passwort-Hashing** | Admin-Users: scrypt (Node.js crypto) · Portal-Users: bcrypt (bcryptjs) |
| **Pool-Null-Check** | `requirePortalSession` prüft `if (!pool)` → 503, kein unbehandelter Crash |
| **Token-Key-Konstante** | `TOKEN_STORAGE_KEY = "admin_token_v2"` zentral in `authStore.ts` exportiert — kein Hard-Coding in einzelnen Dateien |
| **Session-Bridge** | Bearer-Token nur für Kunden-Rollen (`customer_user`, `customer_admin`, `tour_manager`) akzeptiert — Admin-Tokens können kein Portal-Session hijacken |
| **Rate-Limiting** | `authLimiter` (5 Versuche / 15 min pro IP, nur fehlgeschlagene Requests) auf `POST /auth/login` und `POST /api/admin/login`. `passwordResetLimiter` (3 / 60 min) auf Forgot-Password. Konfiguration: `booking/rate-limiters.js`, ENV-Overrides möglich. Details: [FLOWS_BOOKING.md §16](./FLOWS_BOOKING.md#16-rate-limiting--security-header) |
