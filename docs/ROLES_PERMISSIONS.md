# Propus Platform — Rollen, Permissions & Logto-Mapping

> **Automatisch mitpflegen:** Bei neuen Rollen, geänderten Permission-Zuweisungen oder Logto-Org-Änderungen dieses Dokument aktualisieren.

*Zuletzt aktualisiert: April 2026 (überarbeitet: Admin-Verwaltung zentralisiert, Portal-Rollen UI konsolidiert; §9 Unified-Login Rollen-Mapping; Firmenverwaltung entfernt – Portal-Rolle direkt am Kontakt)*

---

## Inhaltsverzeichnis

1. [RBAC-System Übersicht](#1-rbac-system-übersicht)
2. [System-Rollen](#2-system-rollen)
3. [Alle Permission-Keys](#3-alle-permission-keys)
4. [Rollen → Permissions Mapping](#4-rollen--permissions-mapping)
5. [Rollen-Sync-Logik](#5-rollen-sync-logik)
6. [Logto-Integration](#6-logto-integration)
7. [Portal-Rollen (Tour-Manager)](#7-portal-rollen-tour-manager)
8. [Access-Subjects](#8-access-subjects)
9. [Unified-Login: Rollen-Zuweisung für Portal-Kunden](#9-unified-login-rollen-zuweisung-für-portal-kunden)

---

## 1. RBAC-System Übersicht

Das RBAC-System (`booking/access-rbac.js`) verwaltet alle Zugriffsrechte der Plattform. Es besteht aus:

- **System-Rollen** — Vordefinierte Rollen mit festen Permission-Sets
- **Permission-Gruppen** — Scope-basierte Gruppen (system, company, customer)
- **Subject-Overrides** — Individuelle allow/deny pro Subject+Permission+Scope
- **Access-Subjects** — Jeder Akteur hat genau ein Subject (exactly-one-FK)

**DB-Tabellen:**
- `booking.permission_definitions`
- `booking.system_roles`
- `booking.system_role_permissions`
- `booking.access_subjects`
- `booking.access_subject_system_roles`
- `booking.permission_groups`
- `booking.permission_group_permissions`
- `booking.permission_group_members`
- `booking.subject_permission_overrides`

---

## 2. System-Rollen

| role_key | Label | Zugeordnet an |
|---|---|---|
| `super_admin` | Super-Admin | `admin_users.roles = ['super_admin']` |
| `internal_admin` | Interner Admin | `admin_users.roles = ['admin']` oder `['employee']` |
| `tour_manager` | Tour-Manager (intern) | `portal_staff_roles.role = 'tour_manager'` |
| `photographer` | Fotograf | `photographers.is_admin = FALSE` |
| `company_owner` | Firmen-Hauptkontakt | `company_members.role = 'company_owner'` |
| `company_admin` | Firmen-Admin (**deprecated**) | Nicht mehr vergeben — Migration 066 migriert Altdaten zu `company_employee` |
| `company_employee` | Firmen-Mitarbeiter | `company_members.role = 'company_employee'` |
| `customer_admin` | Kunden-Admin | `customers.is_admin = TRUE` oder `portal_team_members.role = 'admin'` |
| `customer_user` | Kunden-Benutzer | `customers.is_admin = FALSE` |

---

## 3. Alle Permission-Keys

| Permission-Key | Modul | Beschreibung |
|---|---|---|
| `tours.read` | tours | Touren lesen |
| `tours.manage` | tours | Touren bearbeiten |
| `tours.assign` | tours | Touren zuweisen |
| `tours.cross_company` | tours | Firmenübergreifend |
| `tours.archive` | tours | Touren archivieren |
| `tours.link_matterport` | tours | Matterport verknüpfen |
| `portal_team.manage` | tours | Team im Portal verwalten |
| `dashboard.view` | booking | Dashboard anzeigen |
| `orders.read` | booking | Aufträge lesen |
| `orders.create` | booking | Aufträge erstellen |
| `orders.update` | booking | Aufträge bearbeiten |
| `orders.delete` | booking | Aufträge löschen |
| `orders.assign` | booking | Fotografen zuweisen |
| `orders.export` | booking | Aufträge exportieren |
| `customers.read` | booking | Kunden lesen |
| `customers.manage` | booking | Kunden verwalten |
| `contacts.read` | booking | Kontakte lesen |
| `contacts.manage` | booking | Kontakte verwalten |
| `company.manage` | booking | Firma verwalten |
| `team.manage` | booking | Team verwalten |
| `photographers.read` | booking | Fotografen lesen |
| `photographers.manage` | booking | Fotografen verwalten |
| `products.manage` | booking | Produkte verwalten |
| `discount_codes.manage` | booking | Rabattcodes verwalten |
| `calendar.view` | booking | Kalender anzeigen |
| `settings.manage` | booking | Einstellungen verwalten |
| `emails.manage` | booking | E-Mails verwalten |
| `billing.read` | booking | Abrechnung lesen |
| `backups.manage` | booking | Backups verwalten |
| `bugs.read` | booking | Bugs lesen |
| `bugs.manage` | booking | Bugs verwalten |
| `reviews.manage` | booking | Reviews verwalten |
| `roles.manage` | booking | Rollen verwalten |
| `users.manage` | booking | Benutzer verwalten |

---

## 4. Rollen → Permissions Mapping

| Permission | super_admin | internal_admin | tour_manager | photographer | company_owner | company_admin | company_employee | customer_admin | customer_user |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `tours.read` | ✓ | ✓ | ✓ | | | | | | |
| `tours.manage` | ✓ | ✓ | ✓ | | | | | | |
| `tours.assign` | ✓ | ✓ | ✓ | | | | | | |
| `tours.cross_company` | ✓ | ✓ | ✓ | | | | | | |
| `tours.archive` | ✓ | ✓ | ✓ | | | | | | |
| `tours.link_matterport` | ✓ | ✓ | ✓ | | | | | | |
| `portal_team.manage` | ✓ | ✓ | ✓ | | | | | | |
| `dashboard.view` | ✓ | ✓ | | ✓ | | | | | |
| `orders.read` | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `orders.create` | ✓ | ✓ | | | ✓ | | | ✓ | |
| `orders.update` | ✓ | ✓ | | ✓ | ✓ | | | ✓ | |
| `orders.delete` | ✓ | | | | | | | | |
| `orders.assign` | ✓ | ✓ | | ✓ | | | | | |
| `orders.export` | ✓ | ✓ | | | | | | | |
| `customers.read` | ✓ | ✓ | | | ✓ | ✓ | | ✓ | |
| `customers.manage` | ✓ | ✓ | | | | | | | |
| `contacts.read` | ✓ | ✓ | | | | | | ✓ | |
| `contacts.manage` | ✓ | ✓ | | | | | | ✓ | |
| `company.manage` | ✓ | ✓ | | | ✓ | | | | |
| `team.manage` | ✓ | ✓ | | | ✓ | | | | |
| `photographers.read` | ✓ | ✓ | | ✓ | | | | | |
| `photographers.manage` | ✓ | ✓ | | | | | | | |
| `products.manage` | ✓ | ✓ | | | | | | | |
| `discount_codes.manage` | ✓ | ✓ | | | | | | | |
| `calendar.view` | ✓ | ✓ | | ✓ | ✓ | ✓ | | | |
| `settings.manage` | ✓ | | | | | | | | |
| `emails.manage` | ✓ | ✓ | | | | | | | |
| `billing.read` | ✓ | ✓ | | | | | | | |
| `backups.manage` | ✓ | | | | | | | | |
| `bugs.read` | ✓ | ✓ | | | | | | | |
| `bugs.manage` | ✓ | ✓ | | | | | | | |
| `reviews.manage` | ✓ | ✓ | | | | | | | |
| `roles.manage` | ✓ | | | | | | | | |
| `users.manage` | ✓ | | | | | | | | |

---

## 5. Rollen-Sync-Logik

Alle Sync-Funktionen sind in `booking/access-rbac.js`:

```
syncAdminUserRolesFromDb(adminUserId)
  → admin_users.roles enthält 'super_admin' → Rolle: super_admin
  → sonst (admin/employee) → Rolle: internal_admin

syncPhotographerRolesFromDb(key)
  → photographers.is_admin = TRUE → Rolle: internal_admin  [Legacy-Feld, read-only im UI]
  → FALSE → Rolle: photographer

syncCompanyMemberRolesFromDb(memberId)
  → company_members.role = 'company_owner' → Rolle: company_owner
  → company_members.role = 'company_admin' → Rolle: company_employee (deprecated, wird wie company_employee behandelt)
  → sonst → Rolle: company_employee

syncCustomerRolesFromDb(customerId)
  → customers.is_admin = TRUE → Rolle: customer_admin
  → FALSE → Rolle: customer_user
```

**Logto → System-Rolle Mapping (`mapLogtoRolesToSystemRole`):**

Logto-Rollen-Array wird von links nach rechts geprüft (erste Übereinstimmung gewinnt):
1. `super_admin`
2. `tour_manager`
3. `admin`
4. `photographer`
5. `company_owner`
6. `company_admin` (deprecated → wird als `company_employee` behandelt)
7. `company_employee`
8. `customer_admin`
9. `customer`
10. (Fallback: `photographer`)

**Exklusivitäts-Regel (UI-Enforcement):**
`super_admin` und `admin` schließen sich gegenseitig aus.
Das UI (`/settings/users`, `AdminUsersPage.tsx`) entfernt die jeweils andere Rolle automatisch beim Zuweisen.

---

## 6. Logto-Integration

### 6.1 Firmen-Organisationen (`booking/logto-org-sync.js`)

Jede `core.companies`-Firma bekommt eine Logto-Organisation:

```
customData: {
  source: 'propus-core',
  companyId: number,
  slug: string
}
```

**`ensureOrganizationForCompany(company)`**
1. Suche via `customData.companyId`
2. Erstelle neue Org falls nicht vorhanden
3. Aktualisiere Namen bei Änderung

**`addCompanyMemberToLogtoOrg(companyId, member)`**
1. Findet Logto-Org via `companyId`
2. Löst Logto-User-ID auf: `member.auth_subject` → E-Mail-Lookup
3. Fügt User zur Org hinzu (ignoriert 409/422)

> **Hinweis:** Firmen-Org-Rollen werden **nicht** in `logto-org-sync.js` vergeben — nur Mitgliedschaft. Rollen kommen aus dem RBAC-System.

---

### 6.2 Portal-Workspaces (`booking/logto-portal-workspace-sync.js`)

Jeder Kunden-Workspace bekommt eine separate Logto-Organisation:

```
customData: {
  source: 'tour-portal',
  ownerEmail: string,
  customerId: number
}
```

**Logto Organization Roles:**

| Konstante | Rollenname | Zugeordnet an |
|---|---|---|
| `ORG_ROLE_OWNER` | `workspace_owner` | Workspace-Inhaber |
| `ORG_ROLE_ADMIN` | `workspace_admin` | `portal_team_members.role = 'admin'` |
| `ORG_ROLE_MEMBER` | `workspace_member` | `portal_team_members.role = 'mitarbeiter'` |

**`syncPortalMemberToLogtoOrg(ownerEmail, memberEmail, portalRole)`**
1. Workspace-Org sicherstellen
2. Logto-User per E-Mail finden
3. User zur Org hinzufügen
4. Alle bestehenden Org-Rollen des Users löschen
5. Neue Rolle setzen:
   - `memberEmail === ownerEmail` → `workspace_owner`
   - `portalRole === 'admin'` → `workspace_admin`
   - sonst → `workspace_member`

---

## 7. Portal-Rollen (Tour-Manager)

### 7.0 UI — Zentrale Verwaltung

**Alle Rollen werden an diesen Stellen verwaltet:**

| Was | Wo im UI | Pfad |
|---|---|---|
| Admin-Panel-Zugriff (Logto) | **Einstellungen → Benutzer** | `/settings/users` |
| Portal-Rolle pro Kontakt | **Kunden → Kunde öffnen → Kontakte** | `/customers` |
| Portal-Zugang Übersicht (intern + extern) | **Einstellungen → Rollen & Rechte → Tab "Portal-Zugang"** | `/settings/roles?view=portal` |
| Rollen-Matrix (Referenz) | **Einstellungen → Rollen & Rechte → Tab "Rollen-Matrix"** | `/settings/roles` |

**Portal-Rolle direkt am Kontakt (ab April 2026):**

Die `portal_role` wird neu direkt im Kontakt-Formular gesetzt (Dropdown, editierbar beim Anlegen und Bearbeiten). Das Backend (`customer-contacts-routes.js`) synct die Rolle automatisch auf `core.company_members` und die Logto-Organisation.

API: `GET /api/admin/customers/:id/contacts` liefert neu `member_status` (`"invited"` | `"active"` | `"disabled"` | `null`) via LEFT JOIN auf `company_members`.

Einladen-Endpunkt: `POST /api/admin/customers/:id/contacts/:contactId/invite` erstellt einen `company_invitations`-Eintrag (Token-basiert, kein automatischer E-Mail-Versand im Backend — Logto-seitige Notification abhängig von Logto-Konfiguration).

> **Entfernt (April 2026):** Die Seite `/settings/companies` ("Firmenverwaltung") wurde aus der Navigation entfernt. Die URL leitet auf `/customers` weiter. Firmen-Workspaces existieren weiterhin als technisches Konzept (Tabelle `core.companies`), werden aber nicht mehr separat verwaltet — sie entstehen automatisch beim Kontakt-Sync.

> **Deprecated:** Die alte Route `/admin/tours/portal-roles` leitet automatisch auf `/settings/roles?view=portal` weiter.
>
> **Deprecated:** Der "Admin-Zugriff"-Toggle im Mitarbeiter-Modal (`EmployeeModal.tsx`) wurde durch einen Info-Hinweis + Link auf `/settings/users` ersetzt. Das `photographers.is_admin`-Feld ist read-only im UI (wird nur noch für Legacy-Session-Auth benötigt).

**Tour-Manager — Rechnungen (zentrales Modul):**

| Route | Sidebar | Permission (`ROUTE_PERMISSIONS`) |
|---|---|---|
| `/admin/invoices` | Top-Level „Rechnungen“ | `dashboard.view` (wie `/admin/tours`) |
| `/admin/tours/invoices` | — | Redirect → `/admin/invoices` |

Quelle: `app/src/lib/permissions.ts`, `ClientShell.tsx`.

---

### 7.1 `tour_manager.portal_staff_roles` — Interne Portal-Zugriffsrechte

Globale Rollen für interne Mitarbeiter, die auf alle Kunden-Workspaces zugreifen dürfen.

| role | Bedeutung | RBAC-Systemrolle |
|---|---|---|
| `tour_manager` | Sieht alle Touren firmenübergreifend | `tour_manager` |

---

### 7.2 `tour_manager.portal_team_members` — Kunden-Workspace-Mitglieder

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `owner_email` | TEXT | Legacy: E-Mail des Workspace-Inhabers |
| `member_email` | TEXT | E-Mail des Mitglieds |
| `customer_id` | BIGINT FK → core.customers CASCADE | Bevorzugter Cutover-Schlüssel |
| `display_name` | TEXT | |
| `role` | TEXT DEFAULT `'mitarbeiter'` | `mitarbeiter`, `admin` |
| `status` | TEXT DEFAULT `'pending'` | `pending`, `active` |
| `invite_token_hash` | TEXT | |
| `expires_at` | TIMESTAMPTZ | |
| `invited_by` | TEXT | |
| `created_at` | TIMESTAMPTZ | |
| `accepted_at` | TIMESTAMPTZ | |

**Zugriffsrechte:**

| portal_team_members.role | status | RBAC-Systemrolle | Logto-Org-Rolle |
|---|---|---|---|
| `admin` | `active` | `customer_admin` | `workspace_admin` |
| `mitarbeiter` | `active` | — (kein RBAC) | `workspace_member` |

---

### 7.3 `tour_manager.portal_tour_assignees` — Verantwortliche je Tour

| Feld | Bedeutung |
|---|---|
| `tour_id` | Tour-ID (PK) |
| `assignee_email` | E-Mail des Verantwortlichen |
| `workspace_owner_email` | Legacy-Owner |
| `customer_id` | Cutover-FK auf core.customers |

---

### 7.4 Zugriffsprüfung im Portal (`booking/portal-rbac-sync.js`)

```
emailHasPortalPermission(email, permissionKey)
  → Alle access_subjects dieser E-Mail (portal_user + customer_contact)
  → getEffectivePermissions() für jeden Subject im system-Scope

Interne Tour-Manager:
  → syncPortalStaffTourManagerRbac(email, 'add')
  → liest portal_staff_roles WHERE role = 'tour_manager'
  → Subject-Typ: portal_user

Kunden-Admin (aus Portal-Team):
  → syncPortalTeamMemberAdminRbac(ownerEmail, memberEmail)
  → portal_team_members.role = 'admin' AND status = 'active'
  → Subject: bevorzugt customer_contact (via customer_id), sonst portal_user
```

---

## 8. Access-Subjects

`booking.access_subjects` — Jeder Akteur hat genau ein Subject-Eintrag.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `subject_type` | TEXT | s. Typen unten |
| `admin_user_id` | BIGINT FK | → `core.admin_users` |
| `photographer_key` | TEXT FK | → `booking.photographers` |
| `customer_id` | INT FK | → `core.customers` |
| `customer_contact_id` | INT FK | → `core.customer_contacts` |
| `company_member_id` | INT FK | → `core.company_members` |
| `portal_user_email` | TEXT UNIQUE | E-Mail-basiert (Unique lowercase) |

**Subject-Typen:**

| subject_type | FK-Feld | Beschreibung |
|---|---|---|
| `admin_user` | `admin_user_id` | Interner Admin-User |
| `photographer` | `photographer_key` | Fotograf |
| `customer` | `customer_id` | Kundenkonto |
| `customer_contact` | `customer_contact_id` | Kontaktperson eines Kunden |
| `company_member` | `company_member_id` | Firmen-Mitglied |
| `portal_user` | `portal_user_email` | Portal-User (E-Mail-basiert) |

**Exactly-one-FK-Constraint:** Genau einer der FKs darf pro Zeile gesetzt sein (DB-Constraint).

---

## 9. Unified-Login: Rollen-Zuweisung für Portal-Kunden

Seit April 2026 können sich Portal-Kunden über den einheitlichen `POST /auth/login`-Endpunkt anmelden. Die Rolle wird dabei durch `getPortalCustomerRole()` in `booking/portal-auth-bridge.js` ermittelt:

```
getPortalCustomerRole(email)
  │
  ├── 1. tour_manager.portal_staff_roles WHERE role = 'tour_manager'
  │         → Systemrolle: "tour_manager"
  │
  ├── 2. tour_manager.portal_team_members
  │         WHERE role IN ('inhaber','admin') AND status = 'active'
  │         → Systemrolle: "customer_admin"
  │
  ├── 3. tour_manager.tours WHERE customer_email = email
  │         (direkter Tour-Besitzer)
  │         → Systemrolle: "customer_admin"
  │
  └── 4. Fallback → "customer_user"
```

**Ergebnis:** Das zurückgegebene Token in `booking.admin_sessions` enthält die ermittelte Systemrolle. Das Frontend speichert Rolle + Token und behandelt den Nutzer entsprechend der Kunden-UI (Portal-Ansicht, Buchungs-Wizard-Vorausfüllung, etc.).

**`isKundenRole(role)`** (`app/src/lib/permissions.ts`): Gibt `true` für `customer_user`, `customer_admin`, `tour_manager` zurück. Steuert:
- Standard-Redirect nach Login → `/portal/tours`
- Anzeige von Portal-UI vs. Admin-UI
- Vorausfüllung des Buchungs-Wizard Schritt 4 via `GET /auth/profile`

**Verhältnis zu RBAC-Permissions:**  
Portal-Kunden erhalten `legacyFallbackPermissions(role)` (kein volles RBAC-Lookup wie bei Admin-Users). Die relevanten Permissions für Kunden-Rollen sind in §4 (Rollen → Permissions Mapping) dokumentiert.

Vollständige Auth-Flow-Dokumentation: [docs/FLOWS_AUTH.md](./FLOWS_AUTH.md)
