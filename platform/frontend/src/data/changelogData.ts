export type ChangeType = "feature" | "fix" | "improvement" | "breaking" | "security";

export interface ChangeEntry {
  type: ChangeType;
  text: string;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  title: string;
  changes: ChangeEntry[];
}

// CHANGELOG: Bei jeder neuen Version oben eintragen (dieses Modul), dann in ChangelogPage importieren.
export const CHANGELOG: ChangelogVersion[] = [
  {
    version: "2.3.287",
    date: "2026-03-30",
    title: "Mitarbeiter-Porträt-Crop: Strict-Mode + Same-Origin-CORS",
    changes: [
      {
        type: "fix",
        text: "PortraitCropDialog: setPixels(null) nicht mehr bei jedem open/imageSrc-Lauf (React 18 Strict Mode überschrieb sonst den ersten onCropComplete → «Übernehmen» blieb deaktiviert). crossOrigin nur bei echtem Cross-Origin (Cropper + Canvas-Export). CSS direkt im Dialog-Modul + disableAutomaticStylesInjection; Cropper key={imageSrc}; z-index 9999; rotation/minZoom/maxZoom/restrictPosition explizit.",
      },
      {
        type: "improvement",
        text: "Deploy-Version auf v2.3.287 erhöht.",
      },
    ],
  },
  {
    version: "2.3.286",
    date: "2026-03-30",
    title: "Admin: Zwei Kunden zusammenführen (inkl. Kontakte)",
    changes: [
      {
        type: "feature",
        text: "Kundenliste: «Zusammenführen» öffnet Dialog; Zielzeile bleibt, zweiter Kunde wird aufgelöst. POST /api/admin/customers/merge verschiebt Aufträge, Kontakte, Firmen-Verknüpfungen, RBAC-scope u. a. in einer Transaktion und synchronisiert Rollen.",
      },
      {
        type: "improvement",
        text: "Deploy-Version auf v2.3.286 erhöht.",
      },
    ],
  },
  {
    version: "2.3.285",
    date: "2026-03-30",
    title: "Health/buildId: VERSION aus Platform-Image vor /opt/buchungstool",
    changes: [
      {
        type: "fix",
        text: "getBuildId(): platform/frontend/public/VERSION wird vor /opt/buchungstool/VERSION gelesen. Auf dem VPS konnte eine alte Legacy-Datei unter /opt die angezeigte Version (Footer, /api/health) auf z. B. v2.3.281 festhalten trotz neuem Docker-Image.",
      },
      {
        type: "improvement",
        text: "Deploy-Version auf v2.3.285 erhöht.",
      },
    ],
  },
  {
    version: "2.3.284",
    date: "2026-03-30",
    title: "Changelog: Aktuelle Version wie Footer (Server-buildId)",
    changes: [
      {
        type: "fix",
        text: "Seite «Letzte Änderungen»: Banner «Aktuelle Version» liest dieselbe Quelle wie der Footer (/api/health buildId, Fallback /VERSION), nicht nur die beim Build eingebettete CHANGELOG[0]. Titel/Datum kommen aus dem passenden Changelog-Eintrag; fehlt der, Hinweis auf veraltetes Frontend-Build.",
      },
      {
        type: "improvement",
        text: "Deploy-Version auf v2.3.284 erhöht.",
      },
    ],
  },
  {
    version: "2.3.283",
    date: "2026-03-30",
    title: "Mitarbeiter-Porträt: Zuschneiden repariert (CSS + Portal)",
    changes: [
      {
        type: "fix",
        text: "react-easy-crop: Styles fest in main.tsx eingebunden (Paket meldet sideEffects:false; ohne CSS war der Crop-Bereich nicht bedienbar). Zuschneide-Dialog per createPortal nach document.body, z-index 200; onCropAreaChange zusätzlich zu onCropComplete; Stage-Breite w-full/min-height; touch-action none.",
      },
      {
        type: "improvement",
        text: "Deploy-Version auf v2.3.283 erhöht.",
      },
    ],
  },
  {
    version: "2.3.282",
    date: "2026-03-30",
    title: "Admin: Mobile-Sidebar scrollbar (Flex + dvh)",
    changes: [
      {
        type: "fix",
        text: "Mobiles Admin-Menü (Drawer): flex flex-col mit min-h-0 auf dem Navigationsbereich, overflow-y-auto und 100dvh-Höhe. Ermöglicht Scrollen bei geöffnetem Einstellungen-Accordion (z. B. bis Fehlerberichte).",
      },
      {
        type: "improvement",
        text: "Deploy-Version auf v2.3.282 erhöht.",
      },
    ],
  },
  {
    version: "2.3.281",
    date: "2026-03-30",
    title: "Buchungs-Wizard: Reset, Porträts, Auto-Termin; Admin: Porträt zuschneiden",
    changes: [
      {
        type: "feature",
        text: "Öffentlicher Buchungs-Wizard: In der Zusammenfassung «Neu beginnen» (mit Bestätigung); Store-reset behält geladenen Katalog/Config. Danke-Seite «Neue Buchung» profitiert vom gleichen sicheren reset().",
      },
      {
        type: "fix",
        text: "Buchungs-Wizard Fotografen-Avatare: portrait-URLs nutzen /assets/photographers/... wie das Backend (express.static), nicht /assets/booking/photographers.",
      },
      {
        type: "feature",
        text: "Admin Mitarbeiter-Modal: Nach Datei-Upload oder Bibliothek Porträt im Dialog zuschneiden (rund, Zoom/Position); Upload als JPEG 512×512. Abhängigkeit react-easy-crop.",
      },
      {
        type: "feature",
        text: "Buchung Schritt 3: Nächstes freies Datum wird automatisch vorgeschlagen (ab morgen, je nach Fotograf inkl. «Kein Wunsch»); Kontext-Signatur im Store verhindert Überschreiben bei Schritt-Wechsel nach manueller Datumswahl.",
      },
      {
        type: "improvement",
        text: "GET /api/availability: photographer=any liefert die Vereinigung freier Slots aller konfigurierten Fotograf:innen (Kalender + Fahrzeitfilter pro Person). Ermöglicht Verfügbarkeitssuche für «Kein Wunsch».",
      },
    ],
  },
  {
    version: "2.3.280",
    date: "2026-03-30",
    title: "Katalog-i18n (catalog.*), Tour-Manager: Zurück ins Admin-Panel",
    changes: [
      {
        type: "improvement",
        text: "Admin-i18n: Namespace products.* → catalog.*; fehlende EN/DE-Strings für Kategorie-Manager ergänzt; sichtbare Texte ohne DB-Spaltennamen (group_key, category_key, CODE/NAME).",
      },
      {
        type: "feature",
        text: "Tour Manager (EJS): Link «Zurück zum Admin-Panel» in der Sidebar; optional BOOKING_ADMIN_SPA_URL; basePath-Rewrite überspringt diesen Link.",
      },
    ],
  },
  {
    version: "2.3.279",
    date: "2026-03-30",
    title: "RBAC-Deploy-Fix: Rollenstammdaten und Schema-Erkennung",
    changes: [
      {
        type: "fix",
        text: "booking/access-rbac.js erkennt RBAC-Tabellen jetzt im aktiven Schema-Search-Path statt nur in public. Dadurch laeuft das Rollen-/Permission-Seeding auf booking.* wieder korrekt.",
      },
      {
        type: "fix",
        text: "booking/migrations/047 legt die benoetigten system_roles idempotent an, bevor neue role_permissions geschrieben werden. Behebt Startfehler mit FK-Fehler auf system_role_permissions.role_key.",
      },
    ],
  },
  {
    version: "2.3.278",
    date: "2026-03-30",
    title: "Deploy-Skript: tar-Pipe durch Temp-Datei + SCP ersetzt",
    changes: [
      {
        type: "fix",
        text: "deploy-vps.ps1: Upload-Schritt nutzt kein cmd.exe-Pipe mehr (tar → tmp-Datei → scp → ssh-Extraktion). Behebt «Command failed to spawn» im Cursor-Agent und funktioniert auch direkt im Terminal.",
      },
    ],
  },
  {
    version: "2.3.277",
    date: "2026-03-30",
    title: "Mitarbeiter-Settings: kein HTTP 500 bei fehlenden DB-Spalten",
    changes: [
      {
        type: "fix",
        text: "PUT /api/admin/photographers/:key/settings: photographer_settings-Patch und updatePhotographerCore nur noch gegen vorhandene Tabellenspalten (pg regclass + Cache). Verhindert 500, wenn Migrationen auf einer Installation noch nicht alle Admin-Spalten angelegt haben.",
      },
      {
        type: "improvement",
        text: "Deploy-Version auf v2.3.277 erhöht.",
      },
    ],
  },
  {
    version: "2.3.276",
    date: "2026-03-29",
    title: "Deploy: Core-DB-Migrationen für Fotografen-Stammdaten",
    changes: [
      {
        type: "fix",
        text: "Core-Migrationen 009–011: booking.photographers um bookable, photo_url und active; booking.photographer_settings um Admin-Spalten (wie Booking 055/057). Läuft mit docker compose --profile migrate – behebt «column p.bookable does not exist» auf rein Core-migrierten DBs.",
      },
      {
        type: "improvement",
        text: "core/migrations/002_booking_schema.sql: CREATE booking.photographers entspricht den Feldern; booking/schema.sql um active ergänzt.",
      },
      {
        type: "improvement",
        text: "Backend-Boot: Fehler bei initSchema/runMigrations brechen den Start ab (kein stilles Weiterlaufen ohne Spalten).",
      },
    ],
  },
  {
    version: "2.3.274",
    date: "2026-03-29",
    title: "Mitarbeiter-Settings: Migration 057 und stabileres Speichern",
    changes: [
      {
        type: "fix",
        text: "DB-Migration 057: Spalten languages, native_language, event_color, password_hash in photographer_settings nachziehen (behebt HTTP 500 bei PUT /api/admin/photographers/:key/settings auf älteren Installationen).",
      },
      {
        type: "fix",
        text: "Backend: JSONB-Felder für Mitarbeiter-Settings als Objekte an pg übergeben; photographers.active im Stammdaten-Update; Logto-Abfrage auf photographers; Fehlerlogging mit PG-Code.",
      },
      {
        type: "fix",
        text: "EXXAS-Abgleich & Buchungs-Wizard: kleine TypeScript-/Konfig-Fixes (hasCredentials, API-Antwort-Cast).",
      },
    ],
  },
  {
    version: "2.3.272",
    date: "2026-03-29",
    title: "Buchungsportal: Wizard-Fixes, Verfügbarkeit, Deploy",
    changes: [
      {
        type: "fix",
        text: "Öffentliche Buchung: Standard «Kein Wunsch» in Schritt 3; Validierungsbanner passt sich bei Korrektur an; Schlüsselabholung nur noch als Addon (Schritt 2), nicht doppelt in Schritt 4.",
      },
      {
        type: "fix",
        text: "Nach «Buchung absenden» zuverlässig zur Bestätigungsseite (Erkennung der API-Antwort, Persist-Merge ohne submitted/orderNo aus dem Draft).",
      },
      {
        type: "fix",
        text: "Backend: /api/availability nutzt dieselbe Shoot-Dauer wie die Buchung (getShootDurationMinutes); deutsche Fehlertexte mit korrekten Umlauten.",
      },
    ],
  },
  {
    version: "2.3.271",
    date: "2026-03-29",
    title: "Tour Manager: Mount-Prefix nicht mehr doppelt in Links",
    changes: [
      {
        type: "fix",
        text: "Unter /tour-manager verdoppelte Pfade (/tour-manager/tour-manager/...) behoben: DOM-Fix in admin- und portal-Header setzt basePath nur noch, wenn der Link noch nicht mit dem Mount-Prefix beginnt.",
      },
    ],
  },
  {
    version: "2.3.270",
    date: "2026-03-29",
    title: "EXXAS-Abgleich: Bestätigungsdialog mit Übersicht und Kundenwahl",
    changes: [
      {
        type: "improvement",
        text: "Bulk-Bestätigen öffnet einen Dialog: pro ausgewähltem EXXAS-Kunden sichtbar, was gespeichert wird; Wahl Abgleich (bestehend verknüpfen), neuer Kunde oder überspringen; Kontakt-Zusammenfassung; Speichern erst bei vollständigen Zielen.",
      },
    ],
  },
  {
    version: "2.3.269",
    date: "2026-03-29",
    title: "Kundenliste: Suchfeld, Tabellenkopf, Aktion Buchungsportal",
    changes: [
      {
        type: "improvement",
        text: "Kunden-Seite: größeres Suchfeld (Flex-Layout), keine Überlappung von Lupe und Leeren-Button; fehlende Übersetzung customerList.table.id (DE/EN) für Tabellenkopf ID.",
      },
      {
        type: "improvement",
        text: "Desktop-Kundenliste: Button Buchungsportal öffnen nur noch als Icon; voller Text im Tooltip und für Screenreader (sr-only).",
      },
    ],
  },
  {
    version: "2.3.265",
    date: "2026-03-29",
    title: "Buchungs-Wizard: Vor-Ort-Kontakte, Alt-Rechnungsadresse, Sprachauswahl",
    changes: [
      {
        type: "feature",
        text: "Kontakt vor Ort: E-Mail, optionale Kalender-Einladung (ICS), mehrere Personen; Zusatzpersonen nur in der Bestellung (onsite_contacts), nicht in der Kundenkartei.",
      },
      {
        type: "improvement",
        text: "Abweichende Rechnungsadresse: Vorname, E-Mail, Referenz und Bemerkungen; Backend und Büro-Mail ergänzt.",
      },
      {
        type: "improvement",
        text: "Sprachwahl im Buchungs-Wizard und auf der Landing-Page als Dropdown statt einzelner Buttons.",
      },
    ],
  },
  {
    version: "2.3.264",
    date: "2026-03-29",
    title: "Öffentliche Buchung: React-SPA statt Legacy-HTML",
    changes: [
      {
        type: "breaking",
        text: "booking.propus.ch liefert die React-Buchung (Root `/` = Wizard); statisches Legacy-Frontend (booking/index.html, script.js) entfernt.",
      },
      {
        type: "improvement",
        text: "Buchungs-Landing/Wizard: Medien unter `/assets/booking/...` statt `/legacy-booking/...` (Logo im Repo; Paket- und Fotografen-PNGs ggf. nach `public/assets/booking/` kopieren).",
      },
      {
        type: "improvement",
        text: "Optional: `VITE_PUBLIC_BOOKING_HOSTNAME` setzen, falls der öffentliche Buchungs-Host nicht `booking.propus.ch` ist.",
      },
    ],
  },
  {
    version: "2.3.263",
    date: "2026-03-29",
    title: "Backup-System: Vollständiges Backup mit NAS-Sync und erweiterter UI",
    changes: [
      {
        type: "feature",
        text: "Backup-Script sichert jetzt beide Datenbanken (propus + logto) sowie optional die Upload-Ordner (Kundenbilder) als .tar.gz.",
      },
      {
        type: "feature",
        text: "Backup-Panel zeigt Konfigurations-Panel mit Zeitplan, Aufbewahrung, NAS-Sync-Status und aktiven Modulen.",
      },
      {
        type: "feature",
        text: "Neues Backup erstellen: Dialog mit Option zum Einbeziehen der Upload-Ordner und Übersicht der gesicherten Daten.",
      },
      {
        type: "feature",
        text: "Wiederherstellen: Option 'Logto-Datenbank überspringen' um nur Haupt-DB wiederherzustellen.",
      },
      {
        type: "feature",
        text: "Backup-Einträge zeigen Inhalt (db.sql, logto.sql, uploads) als aufklappbare Detail-Zeile.",
      },
      {
        type: "improvement",
        text: "Automatischer NAS-Sync täglich 02:00 Uhr via Cron auf der UGREEN NAS nach /volume1/backup/propus-platform/data/.",
      },
    ],
  },
  {
    version: "2.3.262",
    date: "2026-03-29",
    title: "Admin-Topbar: Direkter Einstieg in die Buchung",
    changes: [
      {
        type: "feature",
        text: "Admin-Topbar: Neuer Button 'Jetzt buchen' öffnet die öffentliche Buchungsmaske direkt unter /book im neuen Tab.",
      },
      {
        type: "improvement",
        text: "Deploy-Version auf v2.3.262 erhöht, damit der neue Stand im Footer und bei Cache-Busting eindeutig sichtbar ist.",
      },
    ],
  },
  {
    version: "2.3.261",
    date: "2026-03-27",
    title: "Benutzerverwaltung: Auto-Sync, korrekter UI-Status und Empty State",
    changes: [
      {
        type: "fix",
        text: "Beim Laden der Firmenliste wird syncCompaniesFromCustomersAndContacts ausgeführt (soft-fail), damit Firmen aus Kunden mit gesetztem Feld company und verknüpften Kontakten erscheinen.",
      },
      {
        type: "fix",
        text: "Berechneter Firmen-UI-Status: inaktiv wird nicht mehr fälschlich als ausstehend gemappt; GET /api/admin/users/companies liefert uiStatus explizit.",
      },
      {
        type: "improvement",
        text: "Admin Benutzerverwaltung: Empty State mit Hinweis, Meldung bei leerer Suche/Filter, korrektes setLoading ohne users.manage, Status-Badge Inaktiv, Super-Admin-Löschbutton auch für inaktive Firmen.",
      },
    ],
  },
  {
    version: "2.3.260",
    date: "2026-03-27",
    title: "Benutzerverwaltung, Portal-Filter und Admin-Companies API",
    changes: [
      {
        type: "feature",
        text: "Neue zentrale Benutzerverwaltung unter /admin/users mit Firmen-Stats, Suche/Filter, aufklappbaren Firmenkarten, Rollenwechsel und Einladungen pro Firma.",
      },
      {
        type: "feature",
        text: "Kundenportal erweitert: /portal/firma mit Status-/Datums-/Mitarbeiter-Filtern sowie Mitarbeiter-Übersicht inklusive letzter Bestellung; /portal/bestellungen mit Aktionen für Dateien und Feedback.",
      },
      {
        type: "improvement",
        text: "Backend: neue Admin-Endpunkte für Firmenverwaltung unter /api/admin/companies plus kompatible Alias-Routen unter /api/admin/users/* für bestehende Clients.",
      },
    ],
  },
  {
    version: "2.3.259",
    date: "2026-03-27",
    title: "Deploy: Admin-Image wird auch mit -SkipRestart neu gebaut",
    changes: [
      {
        type: "fix",
        text: "deploy-prod.ps1: Mit -SkipRestart wurde zuvor der gesamte Docker-Block übersprungen – der Admin-Container lief weiter auf altem Image (u.a. Zuweisung Explorer sichtbar, Nginx-302 fehlte). Admin-Rebuild läuft jetzt immer bei geänderten Admin-Quellen; SkipRestart betrifft nur noch Backend/Health-Checks. Deploy-Hashes werden immer geschrieben.",
      },
      {
        type: "improvement",
        text: "Beispiel-Host-Nginx deploy/nginx/admin-booking.propus.ch.conf: 302 von /settings/assignment-explorer nach /settings/access (falls Host-Nginx vor dem Container läuft).",
      },
    ],
  },
  {
    version: "2.3.258",
    date: "2026-03-27",
    title: "Admin: alte URL /settings/assignment-explorer leitet auf Rechte & Rollen um",
    changes: [
      {
        type: "fix",
        text: "Nginx: GET /settings/assignment-explorer antwortet mit 302 auf /settings/access (auch bei gecachtem SPA-Bundle oder Lesezeichen).",
      },
      {
        type: "fix",
        text: "React-Router: gleiche Weiterleitung im Client, falls die Route noch in einem geladenen Bundle vorkommt.",
      },
    ],
  },
  {
    version: "2.3.257",
    date: "2026-03-27",
    title: "Admin-Navigation: Rechte sichtbar, Zuweisung Explorer entfernt",
    changes: [
      {
        type: "improvement",
        text: "Einstellungen-Sidebar: Eintrag \u201eRechte & Rollen\u201c steht direkt unter \u201eAllgemein\u201c; Unterpunkte werden nach effektiver Route-Berechtigung gefiltert (u.a. roles.manage für /settings/access).",
      },
      {
        type: "fix",
        text: "i18n: sidebar.nav.access für Französisch und Italienisch ergänzt (kein Roh-Key mehr bei FR/IT).",
      },
      {
        type: "improvement",
        text: "Zuweisung Explorer entfernt (eigene Seite, API-Client assignment.ts und zugehörige Komponenten) – Zuteilungsregeln bleiben unter Konfiguration.",
      },
    ],
  },
  {
    version: "2.3.256",
    date: "2026-03-27",
    title: "RBAC: Zentrales Rechte- und Rollensystem",
    changes: [
      {
        type: "feature",
        text: "Neues RBAC-System mit Subjects, Systemrollen, Permission-Gruppen und Overrides. Granulare API-Absicherung pro Modul (orders, customers, photographers, products, settings, emails, calendar, backups, bugs, reviews).",
      },
      {
        type: "feature",
        text: "Admin-Panel: Seite \u201eRechte & Rollen\u201c unter Einstellungen zum Verwalten von Berechtigungsgruppen und Permission-Zuweisungen.",
      },
      {
        type: "feature",
        text: "Kunden-Access-Panel: Kundenbezogene Gruppen und Kontakt-Rechteverwaltung direkt im Kunden-Dialog.",
      },
      {
        type: "improvement",
        text: "Sidebar-Navigation wird dynamisch nach effektiven Berechtigungen gefiltert. Legacy-Rollenfallback für bestehende Sessions.",
      },
    ],
  },
  {
    version: "2.3.227",
    date: "2026-03-24",
    title: "Kundenliste: nur Firma, Kontaktdaten nur unter Kontakte",
    changes: [
      {
        type: "improvement",
        text: "Admin-Kundenliste: erste Spalte zeigt ausschließlich die Firma (ohne Namenszeile); E-Mail und Telefon nicht mehr in der mobilen Kartenansicht – Namen und Erreichbarkeit siehe Kontakte.",
      },
    ],
  },
  {
    version: "2.3.226",
    date: "2026-03-24",
    title: "Kunden-Modal: Manuelles Speichern statt Autosave",
    changes: [
      {
        type: "improvement",
        text: "Kunden bearbeiten: Auto-Speichern entfernt – Änderungen werden nur noch über den expliziten Speichern-Button gespeichert. Status-Anzeige direkt im Button (Gespeichert / Speichern / Fehler).",
      },
    ],
  },
  {
    version: "2.3.225",
    date: "2026-03-24",
    title: "PuTTY-Deploy, Kontakt-Duplikate, Admin-Rechte lokal",
    changes: [
      { type: "improvement", text: "Deploy: PuTTY automatisch via winget installiert; Deploy-Skript nutzt plink/pscp für Passwort-Login zum VPS." },
    ],
  },
  {
    version: "2.3.224",
    date: "2026-03-24",
    title: "Deploy-Skript & .env.example",
    changes: [
      {
        type: "improvement",
        text: "scripts/deploy-prod.ps1: Frontend-Build vor VERSION-Bump; bei fehlendem npm harter Abbruch (kein altes dist deployen). -SkipBuild für manuell gebautes dist.",
      },
      {
        type: "improvement",
        text: "Deploy: npm-Suche erweitert (Volta, nvm-windows unter %APPDATA%\\nvm); klarere SSH/SCP-Hinweise bei Permission denied mit OpenSSH.",
      },
      {
        type: "feature",
        text: "Repository-Root: .env.example mit Platzhaltern für CF_*, VPS_* und VITE_API_BASE; .gitignore-Ausnahme !.env.example. Hilfsskript scripts/_deploy-openssh.ps1 (VPS_USE_OPENSSH).",
      },
    ],
  },
  {
    version: "2.3.223",
    date: "2026-03-24",
    title: "Kunden-Admin & Passwort lokal, Kontakt-Duplikate, Profil ohne SSO-Zwang",
    changes: [
      {
        type: "fix",
        text: "Backend: PATCH /api/admin/customers/:id/admin und POST .../reset-password setzen is_admin bzw. Passwort (scrypt) und beenden SSO-Stubs; Kundenliste liefert echtes is_admin statt immer false.",
      },
      {
        type: "improvement",
        text: "Admin-Profil: SSO-Banner nur noch bei VITE_ADMIN_SSO=true; Texte ohne festen IdP-Namen. Photographen-Login-Stub ohne SSO-Hinweis.",
      },
      {
        type: "fix",
        text: "Kundenkontakte: Duplikat-Check bei gleicher E-Mail/Name pro Kunde (API + UI); Migration 037 bereinigt bestehende E-Mail-Duplikate und legt partiellen Unique-Index an.",
      },
    ],
  },
  {
    version: "2.3.222",
    date: "2026-03-24",
    title: "Admin: Kalender- und ICS-Vorlagen",
    changes: [
      {
        type: "feature",
        text: "Einstellungen: Seite „Kalender / ICS“ (/settings/calendar-templates) inkl. Sidebar und Übersetzungen; Backend-API /api/admin/calendar-templates für Vorlagen, Vorschau und Aktiv-Status.",
      },
    ],
  },
  {
    version: "2.3.221",
    date: "2026-03-24",
    title: "ICS aus DB-Vorlagen, lokaler Admin-Login, Kunden-Login, Fixes",
    changes: [
      { type: "feature", text: "Kalender: Öffentlicher ICS-Download und Graph-/E-Mail-Termine nutzen gespeicherte Vorlagen (customer_event / photographer_event) mit buildCalendarVars und Fallback auf die bisherige Logik." },
      { type: "fix", text: "Admin Reschedule: Kalender-E-Mail-Adresse des Fotografen (workMailbox) statt undefinierter Variable; Kunden-Mail nach Verschiebung nutzt rsPhotogPhone im richtigen Scope." },
      { type: "breaking", text: "Externes Admin-SSO entfernt: Anmeldung über POST /api/admin/login und Tabelle admin_users (Migration 032). Bearer-Token / admin_session wie bisher." },
      { type: "feature", text: "Kunden: POST /api/customer/login und /api/customer/register mit Passwort (scrypt); Legacy-URLs /auth/customer/* leiten bei Bedarf ins Frontend um." },
      { type: "feature", text: "GET /api/admin/contacts für Kontakt-Suche; Platzhalter {{photographerPhone}} in E-Mail-Templates." },
      { type: "improvement", text: "Kundendialog: Firma Pflicht, Nachname optional; Feld Etage bei Schlüsselabholung (cf_kp_floor) entfernt." },
    ],
  },
  {
    version: "2.3.220",
    date: "2026-03-24",
    title: "E-Mail-Templates: CSS aus <head> beim Speichern erhalten",
    changes: [
      { type: "fix", text: "Beim Reduzieren eines vollständigen HTML-Dokuments auf den E-Mail-Body werden <style>-Blöcke und Stylesheet-<link> aus dem <head> jetzt vor den Body-Inhalt gehängt – Layout und Vorschau bleiben erhalten." },
      { type: "fix", text: "E-Mail-Vorschau: Fragmente werden in ein minimales HTML-Dokument mit UTF-8 eingebettet." },
    ],
  },
  {
    version: "2.3.219",
    date: "2026-03-24",
    title: "E-Mail-Editor: WYSIWYG entfernt, nur noch HTML-Modus",
    changes: [
      { type: "improvement", text: "E-Mail-Vorlagen: WYSIWYG-Editor (TipTap) vollständig entfernt. Der HTML-Quellcode-Editor ist jetzt der einzige Bearbeitungsmodus – keine Formatierungsverluste mehr durch Editor-Serialisierung möglich." },
    ],
  },
  {
    version: "2.3.218",
    date: "2026-03-24",
    title: "Versandeinstellungen pro Template: Aktiv-Toggle + ICS-Anhänge",
    changes: [
      { type: "feature", text: "E-Mail-Vorlagen: Versandeinstellungen direkt beim Template – Aktiv/Inaktiv-Toggle sowie ICS-Anhang (Kunde / Büro) pro Status-Eintrag konfigurierbar." },
      { type: "feature", text: "Backend: ICS-Flags (ics_customer, ics_office) werden beim echten Status-E-Mail-Versand aus der DB gelesen und der Mail angehängt." },
      { type: "improvement", text: "Die globale Workflow-Tabelle entfernt – Einstellungen sind jetzt direkt beim jeweiligen Template sichtbar und bedienbar." },
    ],
  },
  {
    version: "2.3.216",
    date: "2026-03-24",
    title: "E-Mail-Editor: Vollständige HTML-Dokumente automatisch reparieren",
    changes: [
      { type: "fix", text: "Backend: Beim Speichern eines E-Mail-Templates wird aus einem vollständigen <!DOCTYPE html>-Dokument automatisch nur der <body>-Inhalt extrahiert, damit TipTap das Fragment korrekt rendern kann." },
      { type: "fix", text: "Frontend: Vollständige HTML-Dokumente werden beim Laden erkannt, automatisch auf den Body-Inhalt reduziert und mit Warnhinweis angezeigt." },
    ],
  },
  {
    version: "2.3.215",
    date: "2026-03-24",
    title: "E-Mail-Editor: Kein Formatierungsverlust mehr beim Speichern",
    changes: [
      { type: "fix", text: "E-Mail-Vorlagen: editHtmlRef wird mit dem Original-DB-HTML befüllt statt mit TipTaps re-serialisiertem HTML – verhindert akkumulierte Formatierungsveränderungen bei wiederholtem Speichern." },
      { type: "fix", text: "HTML-Normalisierung: <p><br></p> wird zu <p></p> vereinheitlicht, um inkonsistente Leerzeilen durch TipTap-Interna zu eliminieren." },
    ],
  },
  {
    version: "2.3.214",
    date: "2026-03-24",
    title: "E-Mail-Workflow-Steuerung und Test-Mail-Upgrade",
    changes: [
      { type: "fix", text: "E-Mail-Vorlagen: Nach dem Speichern wird der Editor mit dem frischen DB-HTML synchronisiert; verhindert Formatierungsverlust bei wiederholtem Speichern." },
      { type: "feature", text: "Test-Mail in E-Mail-Vorlagen erweitert: eigene Empfängeradresse plus zwei ICS-Checkboxen (Kunde/Büro) für Anhänge." },
      { type: "feature", text: "Neue Status-E-Mail-Workflow-Konfiguration mit API + UI-Toggles: steuert je Status, Template und Empfängerrolle, ob E-Mails versendet werden." },
    ],
  },
  {
    version: "2.3.213",
    date: "2026-03-24",
    title: "E-Mail-Editor: Spellcheck, addressLine & HTML-Normalisierung",
    changes: [
      { type: "fix", text: "E-Mail-Vorlagen WYSIWYG-Editor: Browser-Rechtschreibprüfung deaktiviert – Platzhalter wie {{orderNo}} werden nicht mehr rot unterstrichen." },
      { type: "feature", text: "Neuer Platzhalter {{addressLine}}: Kombiniert PLZ/Ort + Objektadresse zu einer Variable; vermeidet fehlendes Komma wenn zipCity leer ist." },
      { type: "fix", text: "E-Mail-Vorlagen: HTML-Normalisierung beim Laden und beim Modewechsel bereinigt verschachtelte <p>-Tags, die durch wiederholtes Bearbeiten entstehen." },
    ],
  },
  {
    version: "2.3.212",
    date: "2026-03-24",
    title: "ICS-Vorlagen robuster und einfacher",
    changes: [
      {
        type: "fix",
        text: "Kalender-Templates: fehleranfällige bedingte Platzhalter-Syntax wird nicht mehr benötigt; neue Backend-Felder wie addressLine, objectSummary, customerBlock, onsiteBlock, notesBlock und keyPickupBlock liefern fertige robuste Inhalte.",
      },
      {
        type: "improvement",
        text: "ICS-Preview und Laufzeit-Rendering verwenden jetzt dieselbe Kalender-Template-Logik; customer_event und photographer_event wurden auf einfache Default-Templates mit nur noch direkten Platzhaltern umgestellt.",
      },
      {
        type: "improvement",
        text: "Admin-Bereich Kalender-Vorlagen: deutlichere Hilfe für empfohlene Block-Platzhalter und sichtbare Beispiel-Templates für customer_event und photographer_event.",
      },
    ],
  },
  {
    version: "2.3.198",
    date: "2026-03-24",
    title: "Deploy: optional Git-Push zu GitHub nach Prod-Deploy",
    changes: [
      {
        type: "improvement",
        text: "deploy-prod.ps1: Schalter -PushGit und Umgebungsvariable DEPLOY_PUSH_GIT; nach erfolgreichem Deploy werden VERSION, admin-panel/public/VERSION und changelogData.ts committet und gepusht; optional -PushGitIncludeAll. deploy-with-backup.ps1 reicht dieselben Parameter durch.",
      },
      {
        type: "security",
        text: ".gitignore: .env und .env.* ausgeschlossen (optional .env.example erlaubt), damit lokale Secrets nicht versehentlich mit ins Repo gelangen.",
      },
      {
        type: "fix",
        text: "deploy-prod.ps1: Get-NpmPath bevorzugt unter Windows npm.cmd statt npm.ps1, damit npm run build die lokalen Binaries (tsc, vite) zuverlässig findet.",
      },
      {
        type: "fix",
        text: "Admin: assignment-API-Modul liegt wieder unter src/api/assignment.ts (Importpfade für AssignmentExplorer und Vergabe-Komponenten).",
      },
      {
        type: "fix",
        text: "deploy-prod.ps1: SSH-Befehle für Entpacken, Docker-Compose und Hash-Dateien wieder als Einzeiler (Windows-CRLF in Here-Strings lösten auf dem VPS bash: set: - aus). Admin-Restart nach Backend-Recreate wieder eingefügt.",
      },
    ],
  },
  {
    version: "2.3.197",
    date: "2026-03-20",
    title: "Admin-SSO robuster und besser konfigurierbar",
    changes: [
      {
        type: "fix",
        text: "Admin-OIDC-Callback loggt Fehler mit Kontext ([oidc] SSO callback failed); OAuth-Fehler vom SSO-Anbieter (access_denied, invalid_scope) werden als eigene sso_error-Codes an die Login-Seite übergeben.",
      },
      {
        type: "improvement",
        text: "CALLBACK_URL kann aus ADMIN_PANEL_URL abgeleitet werden; OIDC_SCOPE per Umgebung steuerbar; SESSION_COOKIE_DOMAIN für Subdomain-Split; Docker Compose (prod/Synology) und DEPLOY-Doku um die neuen Variablen ergänzt.",
      },
      {
        type: "improvement",
        text: "Login-Seite: spezifische Meldungen für abgebrochene Anmeldung und invalid_scope; sso_error wird nach Anzeige aus der URL entfernt.",
      },
      {
        type: "improvement",
        text: "Neues Skript scripts/pull-deploy-prod.ps1: git pull --rebase und anschließend Prod-Deploy; DEPLOY.md um Ablauf ergänzt.",
      },
      {
        type: "improvement",
        text: "scripts/git-sync-all.ps1: add/commit/push mit optionalem safe.directory für NAS; optional -Deploy; Doku in DEPLOY.md.",
      },
      {
        type: "improvement",
        text: "deploy-prod.ps1: OpenSSH (ssh/scp) als Fallback wenn PuTTY fehlt und VPS_SSH_PW leer (Key/Agent); VPS_USE_OPENSSH=1; DEPLOY.md aktualisiert.",
      },
      {
        type: "fix",
        text: "Prod-Backend nutzt jetzt ein gebautes Docker-Image statt bind-mounted Runtime-Dependencies; docker-entrypoint-prod.sh und docker-compose.prod.yml umgehen damit defekte node_modules-Volumes auf dem VPS.",
      },
    ],
  },
  {
    version: "2.3.196",
    date: "2026-03-19",
    title: "Kunden-API Routen wiederhergestellt",
    changes: [
      {
        type: "fix",
        text: "Backend stellt die fehlenden Kunden-Admin-Routen wieder bereit (u. a. PUT /api/admin/customers/:id). Dadurch schlagen Kundenänderungen im Admin nicht mehr mit 404 fehl.",
      },
      {
        type: "improvement",
        text: "Kunden-Admin/Passwort-Operationen geben nun eine klare SSO-Hinweismeldung statt 404, da diese zentral über SSO verwaltet werden.",
      },
    ],
  },
  {
    version: "2.3.195",
    date: "2026-03-19",
    title: "Backend-Crash bei fehlender Migration abgefangen",
    changes: [
      {
        type: "fix",
        text: "Order- und Customer-Abfragen referenzieren optionale NAS-Spalten jetzt migrationssicher über to_jsonb(...)->>'...'. Dadurch crasht das Backend nicht mehr, wenn die Spalten in einer Umgebung noch fehlen.",
      },
      {
        type: "improvement",
        text: "PATCH für Kunden-NAS-Basen prüft jetzt explizit auf vorhandene DB-Spalten und liefert eine klare Fehlermeldung statt indirekter SQL-Exceptions.",
      },
    ],
  },
  {
    version: "2.3.194",
    date: "2026-03-19",
    title: "Stabilerer Deploy-Ablauf",
    changes: [
      {
        type: "improvement",
        text: "Deploy-Routine für Service-Neustarts weiter gehärtet: Ziel ist, dass bei Admin-only-Änderungen der Backend-Container nicht mehr unnötig neu erstellt wird und damit keine API-Aussetzer erzeugt.",
      },
    ],
  },
  {
    version: "2.3.193",
    date: "2026-03-18",
    title: "Deploy-Kompatibilität auf Windows",
    changes: [
      {
        type: "fix",
        text: "Die Hash-Erkennung im Deploy-Skript verwendet jetzt eine Windows-/PowerShell-kompatible relative Pfadberechnung. Dadurch läuft die selektive Restart-Logik auch auf dem lokalen Deploy-Rechner stabil durch.",
      },
    ],
  },
  {
    version: "2.3.192",
    date: "2026-03-18",
    title: "Selektive Deploy-Restarts",
    changes: [
      {
        type: "improvement",
        text: "Produktiv-Deploy erkennt jetzt getrennt Backend- und Admin-Änderungen per Inhalts-Hash und startet nur die betroffenen Services neu. Reine Admin-Deploys lösen damit keinen unnötigen Backend-Recreate und keine wiederkehrenden 502 mehr aus.",
      },
      {
        type: "fix",
        text: "Die Backend-Build-ID wird nicht mehr in server.js umgeschrieben, sondern zur Laufzeit aus VERSION gelesen. Dadurch erzeugt ein reiner Versions-/Admin-Deploy keine künstliche Backend-Änderung mehr.",
      },
    ],
  },
  {
    version: "2.3.191",
    date: "2026-03-18",
    title: "Admin-API 502 nach Backend-Neustart",
    changes: [
      {
        type: "fix",
        text: "Nginx im Admin-Container löst den Hostnamen backend jetzt dynamisch (Docker-DNS 127.0.0.11 + variabler proxy_pass). Nach Deploy bekam das Backend oft eine neue Container-IP – fester Upstream zeigte noch auf die alte Adresse und lieferte dauerhaft 502.",
      },
    ],
  },
  {
    version: "2.3.190",
    date: "2026-03-18",
    title: "Weniger 502 nach Deploy",
    changes: [
      {
        type: "fix",
        text: "Backend-Start: npm ci nur bei geänderten Dependencies (docker-entrypoint-prod.sh) statt jedes Mal npm install - deutlich kürzere Ausfallzeit beim Container-Neustart.",
      },
      {
        type: "improvement",
        text: "Admin-Nginx: mehrere Upstream-Versuche bei kurzem Backend-Ausfall; Deploy-Skript wartet auf /api/health bevor Admin-Image gebaut wird; Backend-Healthcheck + Admin startet erst bei healthy Backend.",
      },
      {
        type: "improvement",
        text: "docker-compose.prod.yml wird bei jedem Deploy auf den VPS geschrieben (VPS-Pfade, Entrypoint, Healthcheck) – kein manuelles Abgleichen mehr.",
      },
    ],
  },
  {
    version: "2.3.189",
    date: "2026-03-18",
    title: "Kunden-NAS-Basis (Ordner pro Auftrag)",
    changes: [
      {
        type: "feature",
        text: "Pro Kunde optionaler Basis-Pfad für Kundenordner und Rohmaterial (relativ zu NAS-Root): neue Aufträge erhalten Unterordner Basis + PLZ Ort, Strasse #Auftragsnr. Pflege im Kunden-Modal; Migration 026.",
      },
    ],
  },
  {
    version: "2.3.188",
    date: "2026-03-18",
    title: "Zentrale Konfiguration und Deploy-Absicherung",
    changes: [
      { type: "feature", text: "Neue zentrale Konfigurationsseite im React-Admin: globale Settings, Workflow, EXXAS und Mitarbeiter gebündelt unter /settings." },
      { type: "fix", text: "Mitarbeiter-API und Backend-SSOT konsolidiert (inkl. POST /api/admin/photographers, aktiv/inaktiv auf photographers.active, erweiterte Settings-Felder)." },
      { type: "improvement", text: "Deploy-Skript nimmt jetzt auch admin.html mit; Legacy-Mitarbeiterbereich verweist auf die zentrale Konfiguration statt Parallelpflege." },
    ],
  },
  {
    version: "2.3.187",
    date: "2026-03-18",
    title: "Abwesenheit im Kalender und Buchung",
    changes: [
      { type: "fix", text: "Abwesenheiten (blocked_dates) fließen in /api/availability, Admin-Verfügbarkeit, Buchung und Reschedule ein – gewählte Fotograf:innen sind an Abwesenden Tagen/Zeiten nicht mehr buchbar." },
      { type: "fix", text: "Admin-Kalender zeigt Abwesenheiten als eigene Events (grau, Typ absence)." },
      { type: "improvement", text: "POST /api/booking prüft Slot serverseitig gegen Kalender + Abwesenheit (409 bei Konflikt)." },
    ],
  },
  {
    version: "2.3.186",
    date: "2026-03-18",
    title: "Abwesenheiten speichern",
    changes: [
      { type: "fix", text: "Abwesenheit: Frontend sendet von/bis, Backend erwartete start/end – Einträge landeten nicht in blocked_dates. Speichern jetzt in photographer_settings.blocked_dates mit UUID; Löschen per ID. Terminvergabe prüft Von–Bis-Bereiche." },
    ],
  },
  {
    version: "2.3.185",
    date: "2026-03-18",
    title: "Kundenaufträge API",
    changes: [
      { type: "fix", text: "GET /api/admin/customers/:id/orders: Aufträge nach customer_id und E-Mail (billing/object) wie in der Kundenliste; behebt 404 im Kunden-Dialog/Wizard." },
      { type: "improvement", text: "Kunden-Modal: Passwort-Feld mit autocomplete=new-password (Browser-Hinweis)." },
    ],
  },
  {
    version: "2.3.184",
    date: "2026-03-18",
    title: "Production: Mitarbeiter-Settings speichern",
    changes: [
      { type: "fix", text: "Deploy v2.3.184: PUT Mitarbeiter-Settings (phone/is_admin in photographers, radius_km -> max_radius_km) live auf VPS." },
    ],
  },
  {
    version: "2.3.183",
    date: "2026-03-18",
    title: "Mitarbeiter-Settings PUT repariert",
    changes: [
      { type: "fix", text: "PUT /api/admin/photographers/:key/settings: phone/is_admin/name/email/initials gehen in photographers; nur gültige Spalten in photographer_settings. radius_km wird als max_radius_km gespeichert. Behebt 500 beim Speichern im Mitarbeiter-Dialog." },
    ],
  },
  {
    version: "2.3.182",
    date: "2026-03-18",
    title: "Kalender-E-Mail aus Mitarbeiter-DB",
    changes: [
      { type: "fix", text: "Verfügbarkeit, Buchung und Graph-Kalender nutzen photographers.email aus der DB vor photographers.config.js – freie Slots entsprechen dem echten Outlook-Kalender des Mitarbeiters (wenn E-Mail im Admin gepflegt ist)." },
      { type: "fix", text: "Admin-Terminverschiebung: Kalender/Mail nutzen dieselbe aufgelöste E-Mail; photographer.email in der Bestellung wird bei Verschieben auf die kanonische Adresse aktualisiert." },
    ],
  },
  {
    version: "2.3.181",
    date: "2026-03-16",
    title: "Backend-Routen: require-Fix",
    changes: [
      { type: "fix", text: "Backend: Fehlenden require('./admin-missing-routes') in server.js ergänzt – behebt ReferenceError beim Start und 404 für Reviews, E-Mail-Templates, Bug-Reports und Backups." },
    ],
  },
  {
    version: "2.3.180",
    date: "2026-03-16",
    title: "Deploy-Skript: Build optional",
    changes: [
      { type: "improvement", text: "Deploy: Wenn npm nicht im PATH ist, wird der Build übersprungen und vorhandenes dist deployed (statt Abbruch); Hinweis auf manuellen Build + -SkipBuild." },
    ],
  },
  {
    version: "2.3.179",
    date: "2026-03-16",
    title: "Deploy (Changelog 2.3.178)",
    changes: [
      { type: "improvement", text: "Changelog-Eintrag für Deploy; inhaltliche Änderungen siehe v2.3.178 (npm-Pfad im Deploy-Skript)." },
    ],
  },
  {
    version: "2.3.178",
    date: "2026-03-16",
    title: "Deploy-Skript und Changelog",
    changes: [
      { type: "improvement", text: "Deploy-Skript: npm wird automatisch gesucht (Get-NpmPath: PATH, node-Verzeichnis, Program Files, fnm/nvm-Pfade) – Build läuft auch ohne npm im aktuellen PATH." },
    ],
  },
  {
    version: "2.3.177",
    date: "2026-03-16",
    title: "Admin-Routen und TipTap-Fix",
    changes: [
      { type: "fix", text: "Backend: Fehlende Admin-Routen implementiert (admin-missing-routes.js): Reviews (google-link, kpi, Liste), E-Mail-Templates, Bug-Reports, Backups – behebt 404 auf den entsprechenden Admin-Seiten." },
      { type: "fix", text: "TipTap: Duplicate extension 'link'/'underline' behoben – StarterKit konfiguriert mit link: false, underline: false; eigene Link/Underline-Instanzen bleiben aktiv." },
    ],
  },
  {
    version: "2.3.176",
    date: "2026-03-16",
    title: "Performance und Bundle-Optimierung",
    changes: [
      { type: "improvement", text: "Backend: Gzip-Compression für API-Responses, Cache-Control für /api/catalog/products und /api/config (60s)." },
      { type: "fix", text: "N+1 bei Upload-Batches behoben: Batches und Group-Batch-Files werden parallel geladen (Promise.all)." },
      { type: "improvement", text: "Admin-Panel: Vite manualChunks (React, FullCalendar, TipTap, Table, Framer) – kleinere Initial-Chunks." },
      { type: "improvement", text: "Logger: Pino entfernt, schlanker Console-Logger – weniger Bundle-Größe." },
      { type: "improvement", text: "Changelog-Daten nach data/changelogData.ts ausgelagert." },
    ],
  },
  {
    version: "2.3.175",
    date: "2026-03-16",
    title: "Fotograf-Settings und Kundenkontakte",
    changes: [
      { type: "fix", text: "PUT /api/admin/photographers/:key/settings: Spalte radius_km entfernt (Tabelle hat nur max_radius_km). Behebt 500 beim Speichern von Mitarbeiter-Einstellungen." },
      { type: "fix", text: "GET/POST/PUT/DELETE /api/admin/customers/:id/contacts implementiert; customer-contacts-routes.js ins Deploy-Skript aufgenommen. Behebt 404 bei Kundenauswahl im CreateOrderWizard." },
    ],
  },
  {
    version: "2.3.174",
    date: "2026-03-16",
    title: "Deploy (Changelog 2.3.173)",
    changes: [
      { type: "improvement", text: "Changelog-Eintrag für Deploy-Skript; inhaltliche Änderungen siehe v2.3.173." },
    ],
  },
  {
    version: "2.3.173",
    date: "2026-03-16",
    title: "Bot-API und Bestelldetail für Mitarbeiter",
    changes: [
      { type: "fix", text: "POST /api/bot war nicht implementiert – jetzt mit action 'config' (Pakete, Addons, Fotografen). Behebt 404 beim Oeffnen der Bestellseite." },
      { type: "fix", text: "Bestelldetail GET /api/admin/orders/:orderNo erlaubt jetzt Fotografen/Mitarbeiter (nur eigene Aufträge); Detail-Dialog lädt ohne 404." },
      { type: "improvement", text: "OrderDetail: Fotografen sehen nur Leseansicht (kein Bearbeiten, Löschen, E-Mail-Resend); Admin-Config wird optional geladen." },
    ],
  },
  {
    version: "2.3.172",
    date: "2026-03-15",
    title: "DNG-Preview Buildfix",
    changes: [
      { type: "fix", text: "TypeScript-Buildfehler bei der eingebetteten JPEG-Vorschau aus DNG behoben." },
      { type: "improvement", text: "Die schnelle DNG-Vorschau über eingebettete JPEG-Daten bleibt damit deploybar und produktiv nutzbar." },
      { type: "fix", text: "Blob-Erzeugung für RAW-Preview verwendet jetzt ein sauberes ArrayBuffer-Slice statt eines inkompatiblen Uint8Array-BlobParts." },
    ],
  },
  {
    version: "2.3.171",
    date: "2026-03-15",
    title: "Schnellere DNG-Vorschau",
    changes: [
      { type: "fix", text: "DNG-Vorschau liest jetzt zuerst die eingebettete JPEG-Preview aus der RAW-Datei, statt sofort die volle RAW-Dekodierung zu starten." },
      { type: "improvement", text: "Dadurch erscheinen Vorschauen bei DJI-DNG-Dateien deutlich schneller und bleiben nicht mehr auf PREVIEW hängen." },
      { type: "improvement", text: "RAW-Dekodierung hat jetzt zusätzliche Timeouts, damit die UI nicht endlos im Ladezustand bleibt." },
    ],
  },
  {
    version: "2.3.170",
    date: "2026-03-15",
    title: "RAW-Vorschau lokal ausgeliefert",
    changes: [
      { type: "fix", text: "DNG/RAW-Vorschau wird nicht mehr über externe CDN-Worker geladen, sondern lokal aus dem Admin-Frontend ausgeliefert." },
      { type: "improvement", text: "Dadurch funktionieren Worker, WASM und relative Asset-Loads für die RAW-Vorschau robuster im produktiven Browser-Kontext." },
      { type: "improvement", text: "Bei fehlgeschlagener RAW-Dekodierung erscheint jetzt zusaetzlich ein Browser-Console-Hinweis für schnellere Diagnose." },
    ],
  },
  {
    version: "2.3.169",
    date: "2026-03-15",
    title: "Echte DNG-Vorschau vor Upload",
    changes: [
      { type: "feature", text: "Upload-Tool erzeugt für DNG/RAW-Dateien jetzt lokale Vorschaubilder direkt im Browser vor dem Upload." },
      { type: "improvement", text: "RAW-Vorschau wird asynchron geladen, damit die Upload-Oberfläche währenddessen bedienbar bleibt." },
      { type: "fix", text: "Upload-Karten zeigen bei DNG nicht mehr nur Platzhalter, sondern wenn möglich ein echtes Thumbnail." },
    ],
  },
  {
    version: "2.3.168",
    date: "2026-03-15",
    title: "Upload stabiler und Vorschau klarer",
    changes: [
      { type: "fix", text: "Chunk-Upload-Timeout deutlich erhöht und Upload-Chunks auf 8 MB reduziert. Dadurch brechen langsame Uploads wesentlich seltener mit Timeout ab." },
      { type: "improvement", text: "Dateivorschau verbessert: Browser-Bilder werden jetzt auch bei leerem Dateityp korrekt als Thumbnail angezeigt." },
      { type: "improvement", text: "RAW/PDF/Video-Dateien zeigen jetzt eine sichtbare Vorschaukarte mit Dateityp, Name und Größe statt wie eine leere oder nichtssagende Kachel zu wirken." },
    ],
  },
  {
    version: "2.3.167",
    date: "2026-03-15",
    title: "Kalender-API implementiert",
    changes: [
      { type: "fix", text: "Kalender: API-Fehler 'HTTP 404 – Server antwortet mit HTML statt JSON' behoben. Die fehlenden Backend-Routen /api/admin/calendar-events und /api/admin/photographers wurden implementiert." },
      { type: "feature", text: "Mitarbeiter-Routen vollständig ergänzt (GET/PUT Settings, Abwesenheiten, Aktivitätslog, De-/Reaktivierung)." },
    ],
  },
  {
    version: "2.3.166",
    date: "2026-03-15",
    title: "Upload-Vorschau und Fortschrittsanzeige",
    changes: [
      { type: "improvement", text: "Vorschau-Grid: RAW/DNG-Dateien zeigen jetzt Dateityp-Icon und Erweiterung statt '?' – klarer erkennbar welcher Dateityp." },
      { type: "improvement", text: "Fortschrittsbalken pro Karte: während des Uploads wird der Prozentsatz auf der Karte angezeigt, bei 100% erscheint ein grünes Haken-Icon." },
      { type: "feature", text: "Dialog während Upload: zeigt Gesamtfortschrittsbalken, aktuelle Datei und Status jeder einzelnen Datei (ausstehend / laufend / abgeschlossen)." },
    ],
  },
  {
    version: "2.3.165",
    date: "2026-03-15",
    title: "Footer-Version aus Backend",
    changes: [
      { type: "fix", text: "Footer zeigt jetzt die Version vom Backend (/api/health) statt aus dem Frontend-Build – angezeigte Version entspricht der tatsächlich deployten." },
    ],
  },
  {
    version: "2.3.164",
    date: "2026-03-15",
    title: "Original-Datum bei Upload und Transfer erhalten",
    changes: [
      { type: "improvement", text: "Datum und Uhrzeit der Originaldateien bleiben bei Rohmaterial- und Kundenordner-Uploads erhalten – weder beim Staging noch beim NAS-Transfer noch bei Websize-Erzeugung." },
      { type: "improvement", text: "Upload-Bestätigungsdialog erscheint jetzt beim Klick auf «Upload starten» (vor dem Upload), nicht erst nach NAS-Transfer." },
      { type: "improvement", text: "Vorschau-Grid mit Filter-Tabs (ALLE, RAW, JPG, …) und Thumbnails vor dem Upload." },
    ],
  },
  {
    version: "2.3.162",
    date: "2026-03-15",
    title: "Backend-Start repariert (502 behoben)",
    changes: [
      { type: "fix", text: "Fehlende app.listen()-Startlogik in server.js wiederhergestellt – Backend lauscht wieder auf HTTP-Anfragen." },
    ],
  },
  {
    version: "2.3.161",
    date: "2026-03-15",
    title: "Upload: bessere Fehlermeldungen und längere Timeouts",
    changes: [
      { type: "fix", text: "API-Fehlerbehandlung verbessert: echte Backend-Meldungen werden statt 'Unbekannter API-Fehler' angezeigt." },
      { type: "improvement", text: "Timeout für Chunked-Upload-Endpoints (init, status, complete, finalize) auf 2 Minuten erhöht." },
    ],
  },
  {
    version: "2.3.160",
    date: "2026-03-15",
    title: "Chunked Upload stabilisiert (Chunk-Grenzwert)",
    changes: [
      { type: "fix", text: "Chunk-Größe im Frontend auf 31 MiB reduziert, damit Uploads nicht mehr an der 32-MB-Limitgrenze scheitern." },
      { type: "improvement", text: "Upload bleibt kompatibel mit dem 32-MB-Backend-Limit und ist robuster bei Browser-/Multipart-Overhead." },
    ],
  },
  {
    version: "2.3.159",
    date: "2026-03-15",
    title: "Chunked Upload (32 MB Chunks) – stabiler bei grossen Dateien",
    changes: [
      { type: "feature", text: "Uploads in Kundenordner und Rohmaterial nutzen jetzt Chunked Upload (32 MB pro Chunk) wie im Uploadtool – deutlich robuster bei schlechtem Netz." },
      { type: "improvement", text: "Jeder Chunk wird einzeln hochgeladen und gespeichert – Fehler pro Chunk behandelbar mit Retry." },
      { type: "improvement", text: "Neue Backend-Endpoints: init, part, status, complete, finalize. Staging auf lokalem Temp, Merge per Stream auf NAS." },
    ],
  },
  {
    version: "2.3.158",
    date: "2026-03-15",
    title: "Upload-Geschwindigkeit verbessert",
    changes: [
      { type: "improvement", text: "Bei «Zum bestehenden Ordner hinzufügen» werden bis zu 2 Batches parallel hochgeladen – bis zu 2x schneller bei vielen Dateien." },
      { type: "improvement", text: "Polling-Intervall für NAS-Transfer-Status von 2 Sekunden auf 500 ms reduziert – schnellere Reaktion nach Abschluss." },
      { type: "improvement", text: "Batch-Datei-Limit von 10 auf 25 Dateien erhöht – weniger HTTP-Requests bei vielen kleinen Dateien." },
    ],
  },
  {
    version: "2.3.157",
    date: "2026-03-14",
    title: "Upload-Bestätigungsdialog mit Vorschau und Kommentar",
    changes: [
      { type: "feature", text: "Nach jedem erfolgreichen Upload öffnet sich ein Popup-Dialog mit der Frage ob alles hochgeladen wurde, inklusive Dateivorschau mit Thumbnails für Bilder." },
      { type: "feature", text: "Im Bestätigungsdialog kann ein Abschluss-Kommentar eingegeben werden, der als Kommentar.txt im Zielordner auf der NAS gespeichert wird." },
      { type: "feature", text: "Die E-Mail-Benachrichtigung an das Büro wird erst nach explizitem Klick auf 'Ja, abschliessen & Büro benachrichtigen' versendet – nicht mehr automatisch nach dem Transfer." },
      { type: "improvement", text: "Neuer API-Endpunkt POST /upload-batches/:batchId/confirm für die manuelle Bestätigung mit optionalem Kommentar." },
    ],
  },
  {
    version: "2.3.156",
    date: "2026-03-14",
    title: "Sammelupload und Storage-Routen abgesichert",
    changes: [
      { type: "fix", text: "Mehrteilige NAS-Uploads bleiben jetzt logisch ein Sammelupload mit einem Zielordner und einer aggregierten Abschlussmail statt vieler Einzelabschlüsse." },
      { type: "fix", text: "Die fehlenden Storage-Routen für UploadsPage wurden in server.js wiederhergestellt, damit Deploy-Preflight und Storage-Ansicht konsistent bleiben." },
      { type: "improvement", text: "Die Upload-Gruppenlogik ist jetzt auch gegen fehlende DB-Spalten abgesichert, bis alle Migrationen auf dem Zielsystem eingespielt sind." },
    ],
  },
  {
    version: "2.3.155",
    date: "2026-03-14",
    title: "Sammelupload für NAS stabilisiert",
    changes: [
      { type: "fix", text: "Mehrteilige Uploads bleiben technisch klein genug für Cloudflare, laufen aber logisch als ein Sammelupload statt als viele isolierte Einzelabschlüsse." },
      { type: "fix", text: "Bei 'Neuer Unterordner' verwenden alle Teil-Requests jetzt denselben Zielordner, auch wenn der Ordnername serverseitig erst beim ersten Paket erzeugt wird." },
      { type: "improvement", text: "Abschlussmails werden für grosse Sammeluploads nur noch einmal mit aggregierten Datei- und Teilpaket-Zahlen versendet." },
    ],
  },
  {
    version: "2.3.154",
    date: "2026-03-14",
    title: "Upload-Limit für Cloudflare angepasst",
    changes: [
      { type: "fix", text: "RAW-Uploads werden jetzt unter dem Cloudflare-Request-Limit portioniert, damit ~94 MB DNG-Dateien nicht mehr sofort mit HTTP 502 abbrechen." },
      { type: "improvement", text: "Große Dateien werden weiterhin automatisch seriell hochgeladen, aber mit kleinerem Request-Volumen pro Teil-Batch." },
    ],
  },
  {
    version: "2.3.145",
    date: "2026-03-13",
    title: "Upload-Workflow: alle Kategorien, Ordneranlage, Websize-Automation",
    changes: [
      { type: "feature", text: "Alle Upload-Kategorien verfügbar: Finale Bilder (Fullsize/Websize), Finale Grundrisse, Finales Video, Zur Auswahl." },
      { type: "feature", text: "Ordner 'Zur Auswahl' akzeptiert nur noch .jpg/.jpeg-Dateien." },
      { type: "feature", text: "Beim Upload im Modus 'Neuer Unterordner' kann ein eigener Ordnername eingegeben werden." },
      { type: "feature", text: "Nach jedem final_fullsize-Upload werden automatisch Websize-Kopien (max. 1920px, JPEG 90%) erzeugt." },
      { type: "feature", text: "Cron-Job alle 10 Minuten: Websize-Ordner wird mit Fullsize synchron gehalten (auch für manuell abgelegte Dateien)." },
      { type: "fix", text: "folderType (Rohmaterial / Kundenordner) wird jetzt korrekt an das Backend übergeben – war zuvor hardcoded auf 'customer_folder'." },
      { type: "fix", text: "EXDEV-Fehler bei Cross-Filesystem-Uploads endgültig behoben (copyFileSync + unlinkSync statt renameSync)." },
      { type: "improvement", text: "Dateibaum und Datei-Operationen (Delete, Clear, Preview) verwenden jetzt den richtigen folderType." },
    ],
  },
  {
    version: "2.3.144",
    date: "2026-03-13",
    title: "Upload-Ziel: Rohmaterial oder Kundenordner",
    changes: [
      { type: "feature", text: "Beim Upload wird jetzt gefragt: Rohmaterial oder Kundenordner? Der gewählte Ordnertyp wird an das Backend übergeben." },
      { type: "fix", text: "EXDEV-Fehler bei Cross-Filesystem-Uploads behoben (renameSync durch copyFileSync + unlinkSync ersetzt)." },
    ],
  },
  {
    version: "2.3.143",
    date: "2026-03-13",
    title: "EXXAS-Mapping vollständig erweitert",
    changes: [
      { type: "feature", text: "EXXAS-Integration unterstützt jetzt getrennte Mapping-Sektionen für Kunden, Kontakte und Bestellungen." },
      { type: "improvement", text: "Lokale EXXAS-Felder wurden auf die tatsächlichen DB-Namen aus customers, customer_contacts und den Billing-Daten der Bestellungen angepasst." },
      { type: "improvement", text: "Neue Rechnungsadress-Felder und Kontaktfelder können vorbereitet verknüpft werden, ohne bereits einen Daten-Sync auszuführen." },
    ],
  },
  {
    version: "2.3.142",
    date: "2026-03-13",
    title: "Wizard: Kontakt vor Ort immer editierbar",
    changes: [
      { type: "improvement", text: "Kontakt-Dropdown unter Objektdaten füllt Name/Telefon vor, die Felder bleiben aber immer frei editierbar — Änderungen wirken nur auf die Bestellung, nicht auf die Kundenstammdaten." },
    ],
  },
  {
    version: "2.3.141",
    date: "2026-03-13",
    title: "Bestellung bearbeiten: Firma-Feld mit Autocomplete",
    changes: [
      { type: "improvement", text: "Im Bestellungs-Bearbeiten-Modus hat das Firma-Feld jetzt Autocomplete — Firmennamen eingeben, alle Kundendaten werden automatisch ausgefüllt." },
    ],
  },
  {
    version: "2.3.140",
    date: "2026-03-13",
    title: "Kunden-Anzeige und Bestellwizard verbessert",
    changes: [
      { type: "improvement", text: "Bestellliste zeigt bei Firmenbestellungen den Firmennamen als Haupteintrag, Kontaktperson als Unterzeile." },
      { type: "feature", text: "Firma-Feld im Bestellwizard mit Autocomplete: Firmenname eingeben, alle Kundendaten werden automatisch ausgefüllt." },
      { type: "feature", text: "Ansprechpartner-Dropdown unter Kundendaten: Firmenkontakte auswählen oder manuell eingeben, wird in Kundendaten gespeichert." },
    ],
  },
  {
    version: "2.3.139",
    date: "2026-03-13",
    title: "Bestellliste: Alle Status als aufklappbare Sektionen",
    changes: [
      { type: "feature", text: "Jeder Status (Ausstehend, Provisorisch, Bestätigt, Pausiert, Erledigt, Abgeschlossen, Archiviert, Storniert) ist nun ein eigener aufklappbarer Bereich in der Bestellliste." },
      { type: "improvement", text: "Logische Status-Reihenfolge: Ausstehend → Provisorisch → Bestätigt → Pausiert → Erledigt → Abgeschlossen → Archiviert → Storniert." },
      { type: "improvement", text: "Aktive Status standardmässig aufgeklappt, abgeschlossene/archivierte/stornierte Status zugeklappt." },
    ],
  },
  {
    version: "2.3.138",
    date: "2026-03-13",
    title: "Deploy: Tunnel-Migration abgeschlossen, server.js repariert, Git-Stand gesichert",
    changes: [
      { type: "improvement", text: "Cloudflare-Tunnel für alle Buchungstool-Domains läuft jetzt direkt über Docker-Service-Namen (kein Host-Gateway mehr)." },
      { type: "fix", text: "server.js war korrupt (40 MB, doppelt enkodierte UTF-8-Zeilen) – durch gesunde v2.3.134-Version ersetzt, Backend läuft stabil." },
      { type: "improvement", text: "Dedizierter buchungstool-cloudflared Docker-Container ersetzt den alten Host-Prozess." },
    ],
  },
  {
    version: "2.3.137",
    date: "2026-03-12",
    title: "OIDC-Login-Fehler behoben: Session-Cookie nach SSO-Callback",
    changes: [
      { type: "fix", text: "Backend setzt jetzt 'trust proxy', damit der Session-Cookie beim OIDC-Callback korrekt übermittelt wird und kein 'oidc_failed'-Fehler mehr auftritt." },
      { type: "fix", text: "Session-Cookie erhält SameSite=lax, um den SSO-Callback-Flow mit Nginx-Reverse-Proxy zuverlässig zu unterstützen." },
    ],
  },
  {
    version: "2.3.136",
    date: "2026-03-12",
    title: "Kunden-Modal öffnet sich immer – kein sofortiger Redirect",
    changes: [
      { type: "fix", text: "Klick auf 'Anmelden' im Buchungsportal öffnet jetzt das Konto-Modal mit dem Login-Button, statt sofort zur SSO-Seite weiterzuleiten." },
      { type: "improvement", text: "Bei abgelaufenem Token bleibt das Modal offen, damit der Kunde selbst auf 'Anmelden' klicken kann." },
    ],
  },
  {
    version: "2.3.135",
    date: "2026-03-12",
    title: "Login-Button im Kundenportal sprachabhängig",
    changes: [
      { type: "fix", text: "Login-Button im Buchungsportal zeigt auf Deutsch wieder korrekt 'Anmelden' statt eines inkonsistenten harten Labels." },
      { type: "improvement", text: "Kundenkonto-Header nutzt jetzt i18n-Keys für die Zustände 'Anmelden' und 'Portal' in allen unterstützten Sprachen." },
    ],
  },
  {
    version: "2.3.134",
    date: "2026-03-12",
    title: "Kunden-Portal nutzt separaten public OIDC-Client",
    changes: [
      { type: "fix", text: "Der Kunden-SSO-Flow verwendet jetzt einen dedizierten Kunden-Client auch dann korrekt, wenn dieser als public client ohne Secret konfiguriert ist." },
      { type: "fix", text: "Docker-Umgebungsvariablen für OIDC_CUSTOMER_CLIENT_ID, OIDC_CUSTOMER_CLIENT_SECRET und CUSTOMER_CALLBACK_URL sind jetzt explizit im Backend-Container verdrahtet." },
    ],
  },
  {
    version: "2.3.133",
    date: "2026-03-12",
    title: "Kunden-SSO auf echten Portal-Client umgestellt",
    changes: [
      { type: "fix", text: "Kunden-Login/-Logout nutzt jetzt den OIDC-Client 'booking-app' statt den Admin-Client, inklusive gültiger Callback-URL über api-booking.propus.ch." },
      { type: "improvement", text: "Passwort-Reset im Kundenportal verwendet jetzt dynamisch die produktive Kunden-Client-ID aus /api/config." },
    ],
  },
  {
    version: "2.3.132",
    date: "2026-03-12",
    title: "Kunden-Abmelden ohne SSO-Fehler",
    changes: [
      { type: "fix", text: "Kunden-Abmelden leitet jetzt bei fehlender separater Kunden-OIDC-Konfiguration direkt sauber ins Buchungsportal zurück, statt eine SSO-Fehlerseite mit 'Invalid redirect uri' zu öffnen." },
    ],
  },
  {
    version: "2.3.131",
    date: "2026-03-12",
    title: "Kunden-Login Redirect robuster gemacht",
    changes: [
      { type: "fix", text: "SSO-Callback hängt customer_token und auth_error jetzt sauber an bestehende Redirect-URLs an, ohne kaputte Mehrfach-Querystrings mit wiederholten '?' zu erzeugen." },
      { type: "fix", text: "Buchungsportal bereinigt alte fehlerhafte auth_error/customer_token-Parameterketten vor dem nächsten Kunden-Login automatisch." },
    ],
  },
  {
    version: "2.3.130",
    date: "2026-03-12",
    title: "Kundenbereich sprachlich vereinfacht",
    changes: [
      { type: "improvement", text: "Bezeichnungen im Kundenbereich vereinfacht: 'Anmelden / Registrieren' zu 'Login', 'Konto' zu 'Portal' und 'Logout' zu 'Abmelden'." },
    ],
  },
  {
    version: "2.3.129",
    date: "2026-03-12",
    title: "Autofill respektiert manuelle Eingaben",
    changes: [
      { type: "improvement", text: "Automatisches Vorausfüllen im Buchungsformular überschreibt jetzt keine Felder mehr, die der Kunde selbst bearbeitet oder bewusst geleert hat." },
    ],
  },
  {
    version: "2.3.128",
    date: "2026-03-12",
    title: "Kundendaten im Bestellformular automatisch vorausfüllen",
    changes: [
      { type: "improvement", text: "Eingeloggte Kunden erhalten ihre Kontodaten jetzt automatisch im Bestellformular – ohne zusätzlichen Button 'Daten übernehmen'." },
      { type: "improvement", text: "Auch Vor-Ort-Kontakt und zusätzliche Kundendaten aus dem Konto werden beim Ausfüllen berücksichtigt." },
    ],
  },
  {
    version: "2.3.127",
    date: "2026-03-12",
    title: "Kunden-Logout und Registrierung via SSO verbessert",
    changes: [
      { type: "fix", text: "Kunden-Logout ohne aktive Session leitet jetzt sauber zurück ins Buchungsportal statt in einen SSO-Fehler (HTTP 400)." },
      { type: "improvement", text: "Kunden-Registrierung springt jetzt direkt in die SSO-Selbstregistrierung, auch aus dem 'Konto erstellen'-Hinweis nach einer Buchung." },
    ],
  },
  {
    version: "2.3.126",
    date: "2026-03-12",
    title: "SSO-Logout für Kunden und Admin stabilisiert",
    changes: [
      { type: "fix", text: "SSO-Logout übergibt jetzt den benötigten id_token_hint und verhindert damit den Fehler 'Missing parameter: id_token_hint'." },
      { type: "improvement", text: "Cloudflare-Tunnel-Routing für booking.propus.ch, admin-booking.propus.ch und api-booking.propus.ch auf das korrekte Docker-Gateway umgestellt." },
    ],
  },
  {
    version: "2.3.125",
    date: "2026-03-12",
    title: "Kunden-Impersonation: Als Kunde anzeigen",
    changes: [
      { type: "feature", text: "Neuer Schnellzugriff „Als Kunde anzeigen“ in der Kundenliste – öffnet das Buchungsportal im neuen Tab in Kundenansicht." },
      { type: "improvement", text: "Backend: POST /api/admin/customers/:id/impersonate erzeugt kurzlebigen Token und gibt Buchungsportal-URL zurück." },
    ],
  },
  {
    version: "2.3.124",
    date: "2026-03-12",
    title: "Deploy-System: VPS statt NAS",
    changes: [
      { type: "improvement", text: "Deploy-Script vollständig auf VPS (87.106.24.107) umgestellt – kein NAS-Deploy mehr. Dateien werden per SSH/SCP hochgeladen." },
      { type: "improvement", text: ".env: VPS-Verbindungsdaten (VPS_IP, VPS_USER, VPS_HOST_KEY, VPS_SSH_PW, VPS_PROJECT_ROOT) ergänzt." },
    ],
  },
  {
    version: "2.3.123",
    date: "2026-03-12",
    title: "Nginx: HTML-Dateien nie cachen",
    changes: [
      { type: "improvement", text: "Buchungsportal-Nginx: index.html und alle HTML-Seiten werden nicht mehr gecacht (Cache-Control: no-store). Statische Assets weiterhin mit 1-Jahr-Cache." },
    ],
  },
  {
    version: "2.3.122",
    date: "2026-03-12",
    title: "Kunden-Modal auf SSO umgestellt",
    changes: [
      { type: "improvement", text: "Login-/Registrierungs-Formular im Kundenkonto-Modal über SSO-Redirect (Logto) ersetzt." },
      { type: "improvement", text: "Passwort-Feld im Checkout-Widget entfernt — Kontobeitritt läuft über SSO (Logto)." },
    ],
  },
  {
    version: "2.3.121",
    date: "2026-03-12",
    title: "SSO-only: lokale Auth vollständig entfernt",
    changes: [
      { type: "breaking", text: "Alle lokalen Login-Mechanismen entfernt. Admin, Fotografen und Kunden melden sich ausschliesslich über SSO an." },
      { type: "feature", text: "Kunden-OIDC-Flow: /auth/customer/login und /auth/customer/callback für Kunden-Portal implementiert." },
      { type: "feature", text: "Legacy: früheres Import-Skript für externe IdPs wurde entfernt (Kunden verknüpfen jetzt über Logto/SSO)." },
      { type: "improvement", text: "SSO_ENABLED Variable entfernt – SSO ist dauerhaft aktiv." },
      { type: "improvement", text: "Admin-Panel: ForgotPasswordPage, ResetPasswordPage und useSsoStatus-Hook entfernt." },
      { type: "improvement", text: "DB-Migration 022: auth_sub-Spalte in customers-Tabelle für schnelle OIDC-Lookups." },
    ],
  },
  {
    version: "2.3.120",
    date: "2026-03-10",
    title: "Buchungsformular Schritt 4 – Bezeichnungen & Layout bereinigt",
    changes: [
      { type: "fix", text: "Feldbezeichnungen in Schritt 4 (Rechnungsdetails) korrigiert: 'Nachname' → 'Name' in allen Sprachen, Platzhalter vereinheitlicht." },
      { type: "improvement", text: "Mobil-Feld nimmt nun die volle Breite ein statt einspaltig zu erscheinen." },
      { type: "improvement", text: "Checkbox 'Abweichende Rechnungsadresse' ist jetzt mehrsprachig übersetzt." },
      { type: "improvement", text: "Cache-Busting-Version für Script und CSS aktualisiert." },
    ],
  },
  {
    version: "2.3.119",
    date: "2026-03-10",
    title: "EXXAS Mapping Dropdown abgeschnitten",
    changes: [
      { type: "fix", text: "In der EXXAS-Feldzuordnung wurde der Dropdown am unteren Kartenrand abgeschnitten. Das Overflow-Verhalten der Mapping-Karte wurde auf sichtbar gestellt." },
    ],
  },
  {
    version: "2.3.118",
    date: "2026-03-10",
    title: "EXXAS Setup vorkonfiguriert + weniger Requests",
    changes: [
      { type: "feature", text: "EXXAS-Setup erweitert um Endpoint-Feld und Auth-Modus (ApiKey oder Bearer), damit die notwendigen Verbindungsdaten direkt gepflegt werden können." },
      { type: "improvement", text: "Verbindungstest nutzt jetzt genau einen Endpoint und nur einen Request statt mehrerer Varianten, um 429 Rate-Limits zu vermeiden." },
      { type: "improvement", text: "EXXAS-Konfiguration speichert Endpoint/Auth-Modus mit sinnvollen Defaults (inkl. Cloud-v2 Endpoint) für schnellere Erstkonfiguration." },
    ],
  },
  {
    version: "2.3.117",
    date: "2026-03-10",
    title: "EXXAS Abruf robuster gemacht",
    changes: [
      { type: "fix", text: "EXXAS-Feldabruf probiert jetzt mehrere Auth-Header-Schemata (Bearer, x-api-key + App-Password, Basic Auth) für bessere API-Kompatibilität." },
      { type: "improvement", text: "Bei manuell gesetztem Endpoint werden passende Kandidaten gezielter getestet statt blind viele Standard-URLs zu prüfen." },
      { type: "improvement", text: "Fehlermeldungen in der EXXAS-Seite sind jetzt kompakter und besser lesbar (mehrzeilig statt langer Einzeile)." },
    ],
  },
  {
    version: "2.3.116",
    date: "2026-03-10",
    title: "EXXAS Feld-Mapping unter Einstellungen",
    changes: [
      { type: "feature", text: "Neue Seite „Einstellungen > EXXAS Feld-Mapping“ ergänzt, um EXXAS-Felder mit Admin-Panel-Feldern zu verknüpfen." },
      { type: "improvement", text: "EXXAS-Felder werden gruppiert nach Kategorien dargestellt und können gezielt pro Panel-Feld gemappt werden." },
      { type: "improvement", text: "Routing, Sidebar-Unterpunkt und mehrsprachige UI-Texte für die EXXAS-Integration ergänzt." },
    ],
  },
  {
    version: "2.3.115",
    date: "2026-03-10",
    title: "Frontpanel: Rechnungsfelder mit Admin abgeglichen",
    changes: [
      { type: "feature", text: "Im Frontpanel wurden die Rechnungsdetails um Anrede, Vorname, Mobile sowie getrennte Felder für PLZ und Ort erweitert." },
      { type: "improvement", text: "Autofill und Adresslogik unterstützen die neuen Felder; PLZ/Ort werden rückwärtskompatibel weiterhin als kombiniertes `zipcity` an das Backend übergeben." },
      { type: "improvement", text: "Das Backend speichert zusätzliche Billing-Felder (`salutation`, `first_name`, `phone_mobile`, `zip`, `city`) direkt im Auftrag." },
    ],
  },
  {
    version: "2.3.114",
    date: "2026-03-10",
    title: "Kundenschutz: Adressname nicht mehr als Kunde",
    changes: [
      { type: "fix", text: "Backend-Schutz ergänzt: beim Speichern von Bestellungen wird kein neuer Kunde mehr erstellt, wenn billing.name offensichtlich eine Adresse statt Personen-/Firmennamen ist." },
      { type: "improvement", text: "Vergleichslogik erweitert: Gleichheit mit Objektadresse/Rechnungsstraße sowie typische Straßentokens mit Hausnummer werden erkannt und geblockt." },
    ],
  },
  {
    version: "2.3.113",
    date: "2026-03-10",
    title: "Kundenansicht: ID im Titel sichtbar",
    changes: [
      { type: "improvement", text: "In der Kundenansicht wird neben dem Kundennamen jetzt die Kunden-ID als Badge angezeigt (z. B. ID: 123)." },
    ],
  },
  {
    version: "2.3.112",
    date: "2026-03-10",
    title: "Bestellung #100058: Objekt-/Kundenadresse korrigiert",
    changes: [
      { type: "fix", text: "Gezielte DB-Migration für Auftrag #100058 ergänzt: vertauschte Objektadresse und Kunden-/Rechnungsadresse werden korrekt zugeordnet." },
      { type: "improvement", text: "Fallback-Logik in der Migration nutzt Kundenstammadresse und robustes Parsing, falls einzelne Billing-Felder unvollständig sind." },
      { type: "improvement", text: "Zusätzliches Backend-Script zur Prüfung ähnlicher Adressvertauschungen vorbereitet (`backend/scripts/check-order-address-swaps.js`)." },
    ],
  },
  {
    version: "2.3.111",
    date: "2026-03-10",
    title: "Kundenansicht: Neue Bestellung direkt erstellen",
    changes: [
      { type: "feature", text: "In der Kundenansicht gibt es jetzt einen Button 'Neue Bestellung' – der Bestellwizard öffnet sich mit vorausgefüllten Kundendaten." },
      { type: "improvement", text: "Kundendaten (Name, E-Mail, Telefon, Firma, Rechnungsadresse) werden automatisch übernommen – keine Doppelerfassung." },
      { type: "improvement", text: "Vorhandene Kontakte des Kunden werden sofort im Wizard geladen und können als Vor-Ort-Kontakt ausgewählt werden." },
    ],
  },
  {
    version: "2.3.110",
    date: "2026-03-10",
    title: "Kunden löschen: FK-Fehler behoben",
    changes: [
      { type: "fix", text: "Foreign-Key-Fehler beim Löschen von Kunden mit Bestellungen behoben (orders.customer_id wird auf NULL gesetzt statt FK-Fehler)." },
      { type: "improvement", text: "DB-Migration: orders_customer_id_fkey auf ON DELETE SET NULL geändert." },
      { type: "improvement", text: "Zweistufiger Lösch-Dialog im Kundenmodal: bei vorhandenen Bestellungen erscheint eine Warnung mit Anzahl Bestellungen." },
      { type: "improvement", text: "Force-Delete möglich: Bestellungen bleiben erhalten, Kunden-Verknüpfung wird aufgehoben." },
    ],
  },
  {
    version: "2.3.109",
    date: "2026-03-10",
    title: "Neue Bestellung: Bugfix Kontaktauswahl",
    changes: [
      { type: "fix", text: "Interne State-Variable bereinigt (kein ungenutzter selectedCustomerId-State mehr)." },
    ],
  },
  {
    version: "2.3.108",
    date: "2026-03-10",
    title: "Neue Bestellung: Kontaktauswahl ohne Duplikate",
    changes: [
      { type: "improvement", text: "Beim Auswählen eines bestehenden Kunden wird dessen Kontaktliste automatisch geladen." },
      { type: "improvement", text: "Vor-Ort-Kontakt kann aus den vorhandenen Kundenkontakten gewählt werden (Name + Telefon autofill)." },
      { type: "improvement", text: "Option 'Neuen Kontakt manuell eingeben' bleibt verfügbar – ohne neuen DB-Eintrag zu erzeugen." },
      { type: "fix", text: "Synthetische @company.local-E-Mails werden beim Kunden-Autofill nicht übernommen." },
    ],
  },
  {
    version: "2.3.107",
    date: "2026-03-10",
    title: "Bestellliste: Synthetische E-Mails ausgeblendet",
    changes: [
      { type: "fix", text: "In der Bestellungsliste werden @company.local-E-Mails nicht mehr unter dem Kundennamen angezeigt." },
    ],
  },
  {
    version: "2.3.106",
    date: "2026-03-10",
    title: "Buchungsformular: Vor-Ort-Felder klar benannt",
    changes: [
      { type: "improvement", text: "Im öffentlichen Buchungsformular wurden die Feldbezeichnungen auf Vor-Ort-Name und Vor-Ort-Telefon präzisiert." },
      { type: "improvement", text: "Die Vor-Ort-Daten bleiben weiterhin direkt auf die bestehenden Datenbankfelder (onsiteName/onsitePhone) gemappt, ohne doppelte Logik." },
    ],
  },
  {
    version: "2.3.105",
    date: "2026-03-10",
    title: "Kontakte-Tab lädt wieder alle Kontakte",
    changes: [
      { type: "fix", text: "Fehlende Backend-Route für die globale Kontaktliste ergänzt (`GET /api/admin/contacts`)." },
      { type: "fix", text: "Globale Kontakt-CRUD-Endpunkte ergänzt (`POST/PUT/DELETE /api/admin/contacts`), damit Verknüpfen und Pflege aus der Kontakte-Ansicht funktionieren." },
      { type: "improvement", text: "Kontakte-API liefert pro Kontakt zusätzlich Kundenname und Firmenname für die Tabellenansicht." },
    ],
  },
  {
    version: "2.3.104",
    date: "2026-03-10",
    title: "Adresslogik: Stammadresse vs. Rechnungsadresse",
    changes: [
      { type: "improvement", text: "Kundenformular kennzeichnet Adressdaten klar als Stammadresse und zeigt c/o-/Zusatzangaben im Feld Adresszusatz." },
      { type: "fix", text: "Rechnungsadresse in der Bestellansicht wird als abweichend markiert, sobald sie von der Kundenstammadresse abweicht." },
      { type: "improvement", text: "Hilfsskript zur Prüfung auffälliger Kundenadressen ergänzt (optional mit sicherer PLZ/Ort-Ergänzung). " },
    ],
  },
  {
    version: "2.3.103",
    date: "2026-03-10",
    title: "Kundenformular: Autocomplete + klare Adresslogik",
    changes: [
      { type: "fix", text: "Strassen-Autocomplete im Kundenformular liefert wieder zuverlässig Vorschläge und füllt PLZ/Ort bei Auswahl korrekt." },
      { type: "improvement", text: "Firmenfeld nutzt nun Kunden-Autocomplete und übernimmt beim Auswählen automatisch Firma, Adresse und Kontaktdaten." },
      { type: "improvement", text: "CustomerAutocompleteInput unterstützt ein konfigurierbares Einfügefeld, damit Firmenname statt Kontaktname gesetzt werden kann." },
      { type: "improvement", text: "Kundenformular kennzeichnet die Adresse jetzt klar als Stammadresse und hebt Adresszusatz für c/o-Abweichungen sichtbar hervor." },
      { type: "improvement", text: "Bestelldetails zeigen den Titel 'Abweichende Rechnungsadresse', sobald sich die Rechnungsadresse von der Kundenstammadresse unterscheidet." },
      { type: "improvement", text: "Neues Backend-Hilfsskript prüft auffällige Kundenadressen und kann fehlende PLZ/Ort-Werte aus klaren Adressmustern ergänzen." },
    ],
  },
  {
    version: "2.3.102",
    date: "2026-03-10",
    title: "Kundenformular: Firmen-E-Mail im Kontaktbereich",
    changes: [
      { type: "improvement", text: "E-Mail im Kunden-Bearbeiten-Dialog aus 'Persönliche Daten' in den Abschnitt 'Kontakt' verschoben, passend zur Datenlogik." },
      { type: "fix", text: "Synthetische @company.local-E-Mails werden im Kunden-Bearbeiten-Dialog nicht mehr als echte Firmen-E-Mail angezeigt." },
      { type: "improvement", text: "Erstellen-Dialog zeigt das E-Mail-Feld ebenfalls im Kontaktblock als einheitliches Firmenkontakt-Feld." },
    ],
  },
  {
    version: "2.3.101",
    date: "2026-03-10",
    title: "Hinweise in Bestelldetails: weiss und fett",
    changes: [
      { type: "improvement", text: "Hinweistext in der Bestelldetails-Kachel wird jetzt weiss und fett dargestellt für bessere Lesbarkeit." },
    ],
  },
  {
    version: "2.3.100",
    date: "2026-03-10",
    title: "Edit-Modus: Kunde und Kontakt getrennte Kacheln",
    changes: [
      { type: "improvement", text: "Im Bearbeiten-Modus sind Kunde (Firma) und Kontakt (Name/E-Mail/Telefon) jetzt in separaten Kacheln – identisch zur Ansicht." },
      { type: "improvement", text: "Vor-Ort-Felder befinden sich im Edit-Modus nur noch in der Bestelldetails-Kachel, nicht mehr doppelt im Kontaktbereich." },
    ],
  },
  {
    version: "2.3.99",
    date: "2026-03-10",
    title: "Kunde-Kachel: E-Mail immer sichtbar, Adresse anklickbar",
    changes: [
      { type: "improvement", text: "E-Mail-Feld in der Kunde-Kachel wird immer angezeigt (auch wenn leer), als klickbarer mailto-Link." },
      { type: "improvement", text: "Adresse in der Kunde-Kachel ist jetzt als Google-Maps-Link anklickbar." },
    ],
  },
  {
    version: "2.3.98",
    date: "2026-03-10",
    title: "Bestelldetails-Kachel: Vor-Ort, Schlüssel, Hinweise",
    changes: [
      { type: "improvement", text: "Kachel 'Objekt / Objektadresse' in 'Bestelldetails' umbenannt – zeigt jetzt alle bestellrelevanten Felder auf einen Blick." },
      { type: "improvement", text: "Vor-Ort-Kontakt (Name + Telefon) aus der Kontakt-Kachel in die Bestelldetails-Kachel verschoben." },
      { type: "feature", text: "Schlüsselabholung (Adresse + Hinweis) und Notizen/Hinweise erscheinen jetzt ebenfalls in der Bestelldetails-Kachel, sofern erfasst." },
      { type: "improvement", text: "Bestelldetails im Edit-Modus in übersichtlichem Zwei-Spalten-Layout, Fläche mit m²-Einheit in der Ansicht." },
    ],
  },
  {
    version: "2.3.97",
    date: "2026-03-10",
    title: "Kundenformular bereinigt und eindeutig beschriftet",
    changes: [
      { type: "fix", text: "Doppelte Adressfelder im Kunden-Formular entfernt (kein gleichzeitiges PLZ/Ort-Kombifeld und Einzel-Felder mehr)." },
      { type: "improvement", text: "Feldbeschriftungen im Erstellen-/Bearbeiten-Dialog vereinheitlicht und klarer benannt (u. a. Nachname, Primäre Telefonnummer)." },
      { type: "fix", text: "Synchronisierung von PLZ/Ort mit internem zipcity-Wert stabilisiert, damit Speicherung und Anzeige konsistent bleiben." },
    ],
  },
  {
    version: "2.3.96",
    date: "2026-03-10",
    title: "Deploy-Fixes",
    changes: [
      { type: "fix", text: "Ungenutzte deriveZipCity-Funktion aus OrderDetail entfernt." },
    ],
  },
  {
    version: "2.3.95",
    date: "2026-03-10",
    title: "Deploy-Fixes",
    changes: [
      { type: "fix", text: "TypeScript: Ungenutzte Variablen entfernt, CreateCustomer-Typ an CreateCustomerPayload angepasst." },
    ],
  },
  {
    version: "2.3.94",
    date: "2026-03-10",
    title: "Rechnungs- und Objektadresse getrennt",
    changes: [
      { type: "improvement", text: "Bestellungen: Rechnungsadresse und Objektadresse (Shooting-Ort) sind jetzt sauber getrennt – eigene Blöcke in Bearbeitung und Anzeige." },
    ],
  },
  {
    version: "2.3.93",
    date: "2026-03-09",
    title: "Kunden-Exxas-Struktur und Modal-Schließen",
    changes: [
      { type: "feature", text: "Exxas-ähnliche Kunden-/Kontaktstruktur: Anrede, Vorname/Nachname, Adresszusatz, PLZ/Ort/Land, Telefon 2/Mobil/Fax, Website, Abteilung." },
      { type: "improvement", text: "Kunden-Modal: Schließen-Button (X) oben rechts hinzugefügt." },
    ],
  },
  {
    version: "2.3.92",
    date: "2026-03-09",
    title: "E-Mail-Verlauf: Doppelte Route entfernt",
    changes: [
      { type: "fix", text: "Doppelte Backend-Route für E-Mail-Verlauf entfernt. Nur noch eine saubere Implementierung mit Order-Prüfung und sent_at-Normalisierung aktiv." },
    ],
  },
  {
    version: "2.3.91",
    date: "2026-03-09",
    title: "Daueranpassung aktualisiert Kalender still",
    changes: [
      { type: "fix", text: "Wenn im Bestell-Detail nur die Einsatzdauer geändert wird, werden keine Reschedule-E-Mails mehr ausgelöst." },
      { type: "improvement", text: "Dauer-Only-Änderungen aktualisieren weiterhin Kalender, Events und ICS stillschweigend im Hintergrund." },
    ],
  },
  {
    version: "2.3.90",
    date: "2026-03-09",
    title: "Bestelldetails: E-Mail-Log und Dauer-Override",
    changes: [
      { type: "fix", text: "Backend ergänzt die fehlenden Admin-Endpunkte für E-Mail-Verlauf und erneuten Versand von Status-Mails, damit die Bestelldetails in Produktion keine 404 mehr zeigen." },
      { type: "feature", text: "Im Bestell-Detaildialog kann die Einsatzdauer beim Termin jetzt manuell in Minuten überschrieben und mitgespeichert werden." },
      { type: "improvement", text: "Terminblock zeigt die aktuelle Dauer kompakt direkt neben dem aktuellen Termin an." },
    ],
  },
  {
    version: "2.3.89",
    date: "2026-03-09",
    title: "Encoding-Reparatur greift jetzt end-to-end",
    changes: [
      { type: "fix", text: "Backend normalisiert mojibake-beschaedigte Texte jetzt bereits beim API-Eingang, beim DB-Schreiben und beim DB-Lesen." },
      { type: "fix", text: "Kalender-, Mail- und Admin-Daten reparieren typische UTF-8/Latin1-Zeichenfehler zentral über den neuen Text-Normalisierer." },
    ],
  },
  {
    version: "2.3.88",
    date: "2026-03-09",
    title: "E-Mail-Encoding dauerhaft stabilisiert",
    changes: [
      { type: "fix", text: "Backend verwendet für Objekt-/Service-Fallbacks jetzt stabile ASCII-Defaults statt beschädigter Mojibake-Strings." },
      { type: "fix", text: "Mail-Renderdaten enthalten strukturierte Objektfelder (Typ/Fläche/Zimmer/Etagen), damit fehlerhafte Legacy-Textblöcke nicht mehr in E-Mails erscheinen." },
    ],
  },
  {
    version: "2.3.87",
    date: "2026-03-09",
    title: "E-Mail-Encoding: Mojibake in Benachrichtigungen behoben",
    changes: [
      { type: "fix", text: "Kryptische Zeichen (Mojibake) in E-Mail-Benachrichtigungen vollständig behoben - Zimmeranzahl, Fläche, Adresse und Servicezeilen werden jetzt korrekt angezeigt." },
    ],
  },
  {
    version: "2.3.86",
    date: "2026-03-09",
    title: "Google Maps: Optimierungen",
    changes: [
      { type: "improvement", text: "Maps API mit loading=async geladen, Marker auf AdvancedMarkerElement umgestellt." },
      { type: "improvement", text: "Zoom bei Adressauswahl auf Gebäudeansicht (Level 17) gesetzt." },
    ],
  },
  {
    version: "2.3.85",
    date: "2026-03-09",
    title: "Karte & Autocomplete: Vollständig auf Google umgestellt",
    changes: [
      { type: "feature", text: "Karte nutzt jetzt Google Maps statt Leaflet/OpenStreetMap." },
      { type: "feature", text: "Reverse-Geocoding (Kartenklick) nutzt Google Geocoding API." },
      { type: "improvement", text: "Adress-Autocomplete nur noch Google – admin.html (Legacy-Admin) umgestellt." },
      { type: "improvement", text: "Zentrale Konstanten ADDRESS_AUTOCOMPLETE_ENDPOINT im Backend und Clients." },
    ],
  },
  {
    version: "2.3.84",
    date: "2026-03-09",
    title: "Adress-Autocomplete: Umstellung auf Google Places",
    changes: [
      { type: "feature", text: "Adressvorschläge nutzen jetzt Google Places API (Places Autocomplete + Place Details) statt Nominatim/OpenStreetMap." },
      { type: "improvement", text: "Bessere Treffergenauigkeit und strukturierte Adressdaten für Schweizer Adressen. Benötigt GOOGLE_PLACES_API_KEY in der Umgebung." },
    ],
  },
  {
    version: "2.3.83",
    date: "2026-03-09",
    title: "Backend: server.js Syntax-Fehler behoben",
    changes: [
      { type: "fix", text: "Korrupte UTF-8-Zeichen in server.js (Bot-API-Bereich) behoben – Backend startet wieder." },
    ],
  },
  {
    version: "2.3.82",
    date: "2026-03-09",
    title: "Live-Verifikation",
    changes: [
      { type: "improvement", text: "Backend-Tests, Admin-Build und Deploy-Pipeline verifiziert." },
    ],
  },
  {
    version: "2.3.81",
    date: "2026-03-09",
    title: "Deploy: Backend-Container wird mit .env neu erstellt",
    changes: [
      { type: "fix", text: "Deploy-Skript nutzt jetzt 'up -d --force-recreate backend' statt 'restart'. Dadurch wird die NAS-.env (MS_GRAPH_*, ADMIN_PASS, etc.) beim Neustart korrekt in den Container geladen." },
    ],
  },
  {
    version: "2.3.80",
    date: "2026-03-09",
    title: "Admin-Login synchronisiert Env-Passwort automatisch",
    changes: [
      { type: "fix", text: "Backend-Admin-Login: Bestehende admin-account.json wird jetzt bei geändertem ADMIN_PASS automatisch mit einem neuen Passwort-Hash aktualisiert, damit gültige Zugangsdaten nicht mehr als ungültig abgelehnt werden." },
    ],
  },
  {
    version: "2.3.79",
    date: "2026-03-09",
    title: "Adress-Autokomplettierung API-Basis korrigiert",
    changes: [
      { type: "fix", text: "Buchungsfrontend (booking.propus.ch): fetchAddressSuggest nutzte location.origin, andere APIs nutzen API_BASE. Jetzt konsistent API_BASE – Adressvorschläge richten sich an api-booking.propus.ch." },
    ],
  },
  {
    version: "2.3.78",
    date: "2026-03-09",
    title: "Buchung: order is not defined behoben",
    changes: [
      { type: "fix", text: "Buchung abschliessen: customerLang nutzte order.billing - im Buchungsflow existiert order noch nicht. Jetzt korrekt billing?.language." },
    ],
  },
  {
    version: "2.3.77",
    date: "2026-03-09",
    title: "Adress-Suggest: Nominatim-URL korrigiert",
    changes: [
      { type: "fix", text: "Nominatim-URL: Default war \"-\" (ungültig). Jetzt korrekt https://nominatim.openstreetmap.org – Adressvorschläge funktionieren wieder." },
    ],
  },
  {
    version: "2.3.76",
    date: "2026-03-09",
    title: "Adress-Autokomplettierung Hausnummer-Fallback",
    changes: [
      { type: "fix", text: "Adressvorschlaege: Falls Nominatim keine Hausnummer liefert, wird sie aus der Suchanfrage extrahiert (z.B. Albisstrasse 158)." },
    ],
  },
  {
    version: "2.3.75",
    date: "2026-03-09",
    title: "Backend Mojibake-Syntax-Fixes",
    changes: [
      { type: "fix", text: "Verbleibende Mojibake-Trenner in server.js ersetzt (formatServices, manual order, E-Mails)." },
      { type: "fix", text: "Manueller Auftrag: serviceListNoPrice und objectInfo-Struktur korrigiert." },
      { type: "fix", text: "Bot-API: fehlende Klammer bei order_status-Block ergänzt." },
    ],
  },
  {
    version: "2.3.74",
    date: "2026-03-09",
    title: "Encoding-Fixes und Adress-Suggest",
    changes: [
      { type: "fix", text: "Kalender-Eintrag Titel: displayLabel-Trenner in server.js von Mojibake auf ASCII umgestellt (z.B. 8820 Wädenswil - Reto Schärer - #100045)." },
      { type: "fix", text: "Adressvorschläge (z.B. Albisstrasse 158): Backend liefert jetzt countryCode, street, houseNumber, zip, city, complete; Frontend zeigt wieder Vorschläge." },
      { type: "fix", text: "formatServices, buildObjectInfo und Fallbacks: Mojibake-Trenner durch ASCII ersetzt (E-Mails, Kalender-Beschreibungen)." },
    ],
  },
  {
    version: "2.3.73",
    date: "2026-03-09",
    title: "Kundenkonto-Pfeilzeichen Encoding repariert",
    changes: [
      { type: "fix", text: "Im Bereich 'Meine Buchungen' wurde das aufgeklappte/zugeklappte Icon auf stabile ASCII-Zeichen umgestellt, damit kein Zeichenmuell mehr angezeigt wird." },
    ],
  },
  {
    version: "2.3.72",
    date: "2026-03-09",
    title: "Booking-Frontend Cache-Bust für Magic-Link",
    changes: [
      { type: "fix", text: "Script-Asset-Version in `index.html` wurde angehoben, damit Browser garantiert die aktuelle Token-Handling-Logik laden und Admin-Magic-Links korrekt uebernehmen." },
    ],
  },
  {
    version: "2.3.71",
    date: "2026-03-09",
    title: "Kundenportal-Tab bleibt nicht mehr auf about:blank",
    changes: [
      { type: "fix", text: "Magic-Link-Öffnung im Admin verwendet jetzt einen stabilen Popup-Handle und leitet den bereits geöffneten Tab zuverlässig auf das Kundenportal weiter." },
    ],
  },
  {
    version: "2.3.70",
    date: "2026-03-09",
    title: "Backend-Restore und Magic-Link-Recovery",
    changes: [
      { type: "fix", text: "Nach Restore wurde der Admin-Impersonation-Endpunkt erneut sauber eingebaut und die Portal-Ziel-URL robust auf das Kundenportal normalisiert." },
    ],
  },
  {
    version: "2.3.69",
    date: "2026-03-09",
    title: "Backend-Startfix und Fallback-Bereinigung",
    changes: [
      { type: "fix", text: "Backend-Start wurde repariert und fehlerhafte Photographer-Phone-Fallback-Strings in `server.js` bereinigt, damit der API-Prozess stabil hochfährt." },
    ],
  },
  {
    version: "2.3.68",
    date: "2026-03-09",
    title: "Backend-Serverstart stabilisiert",
    changes: [
      { type: "fix", text: "`backend/server.js` startet den HTTP-Server wieder explizit via `app.listen(PORT)`, damit API und Magic-Link-Endpunkte erreichbar bleiben." },
    ],
  },
  {
    version: "2.3.67",
    date: "2026-03-09",
    title: "Magic-Link Ziel-URL auf Kundenportal gehärtet",
    changes: [
      { type: "fix", text: "Backend-Impersonation normalisiert Portal-URLs jetzt robust (admin-Host und /admin.html werden automatisch auf Kundenportal-Ziel korrigiert)." },
    ],
  },
  {
    version: "2.3.66",
    date: "2026-03-09",
    title: "Kundenportal: Admin-Magic-Link pro Kunde",
    changes: [
      { type: "feature", text: "Kundenansicht: 'Kundenportal öffnen' startet jetzt direkt als gewählter Kunde per Admin-Magic-Link (ohne erneuten Login)." },
      { type: "improvement", text: "Kundenportal übernimmt Impersonation-Token aus URL und zeigt sofort die Kundensicht; Link-Parameter werden danach aus der URL bereinigt." },
    ],
  },
  {
    version: "2.3.65",
    date: "2026-03-09",
    title: "Kundenkonto-Erstellung beim Buchen stabilisiert",
    changes: [
      { type: "fix", text: "Buchungs-Frontend: Kunden-API nutzt keine Credential-Cookies mehr, dadurch tritt beim Registrieren kein Browser-Fehler 'Failed to fetch' mehr durch CORS-Credentials-Konflikt auf." },
      { type: "fix", text: "Backend /api/customer/register: Bestehende Buchungs-Kunden ohne Passwort können jetzt ihr Konto vervollständigen (Passwort setzen + Verifikationsmail), statt mit 409 blockiert zu werden." },
    ],
  },
  {
    version: "2.3.64",
    date: "2026-03-09",
    title: "Cache-Busting für Buchungs-Frontend korrigiert",
    changes: [
      { type: "fix", text: "index.html referenziert app.css und script.js jetzt mit neuem Version-Querystring. Dadurch werden nach Deploy keine veralteten Browser-Caches mehr geladen." },
    ],
  },
  {
    version: "2.3.63",
    date: "2026-03-09",
    title: "Schlüsselabholung: Accordion klappt beim Checkbox-Klick nicht mehr zu",
    changes: [
      { type: "fix", text: "Accordion-Header reagierte auf Klicks innerhalb des Panels (Checkbox, Label) und klappte die Schlüsselabholung-Sektion unbeabsichtigt zu. Event-Guard im initAccordion ergänzt." },
    ],
  },
  {
    version: "2.3.62",
    date: "2026-03-09",
    title: "Schlüsselabholung: Hinweisfeld zuverlässig sichtbar",
    changes: [
      { type: "fix", text: "Buchungsformular: Das Hinweis-/Eingabefeld zur Schlüsselabholung wurde in bestimmten Layout-Zuständen abgeschnitten. Accordion- und Sichtbarkeitslogik so abgesichert, dass das Feld beim Aktivieren der Option vollständig sichtbar bleibt." },
    ],
  },
  {
    version: "2.3.61",
    date: "2026-03-09",
    title: "Statusübergang confirmed → done",
    changes: [
      { type: "improvement", text: "Direkter Übergang von „Bestätigt“ zu „Abgeschlossen“ (confirmed → done) erlaubt, ohne Umweg über „Durchgeführt“." },
    ],
  },
  {
    version: "2.3.60",
    date: "2026-03-09",
    title: "Trust Proxy für Reverse-Proxy",
    changes: [
      { type: "fix", text: "Backend: app.set('trust proxy', 1) ergänzt – verhindert express-rate-limit Fehler bei X-Forwarded-For hinter Cloudflare/Nginx." },
    ],
  },
  {
    version: "2.3.59",
    date: "2026-03-09",
    title: "E-Mail erneut senden – erweiterte Auswahl",
    changes: [
      { type: "feature", text: "Dropdown 'E-Mail erneut senden': Bestätigungsanfrage (Link), Terminänderung und Buchung bestätigt gezielt erneut sendbar." },
      { type: "feature", text: "Reschedule speichert last_reschedule_old_date/time – Terminänderung kann nach einer Verschiebung erneut an den Kunden gesendet werden." },
      { type: "feature", text: "Endpoint resend-status-emails: Status-E-Mails (confirmed/paused/provisional) bei unverändertem Status erneut senden." },
    ],
  },
  {
    version: "2.3.58",
    date: "2026-03-05",
    title: "Mojibake im ganzen Code behoben",
    changes: [
      { type: "fix", text: "Kalender-Eintrag Titel zeigte verzerrte Zeichen (Mojibake). displayLabel-Trenner und buildCalendarSubject auf ASCII umgestellt; Frontend normalisiert angezeigte Titel." },
      { type: "fix", text: "calendar.js: En-Dash und Ä in Kalender-Subjects durch ASCII ersetzt (PROVISORISCH - , BESTAETIGT - )." },
    ],
  },
  {
    version: "2.3.57",
    date: "2026-03-05",
    title: "E-Mail-Verlauf: nur Mails dieser Bestellung",
    changes: [
      { type: "fix", text: "E-Mail-Verlauf zeigte teils Mails von anderen/älteren Bestellungsinstanzen. Filter sent_at >= orders.created_at ergänzt – nur Mails seit Erstellung der aktuellen Bestellung werden angezeigt." },
    ],
  },
  {
    version: "2.3.56",
    date: "2026-03-05",
    title: "Dienstleistungen in E-Mails: Mojibake behoben",
    changes: [
      { type: "fix", text: "In E-Mails (Auftragsbestätigung, etc.) erschienen verzerrte Zeichen (Mojibake) zwischen Dienstleistungsbezeichnung und Preis. Trenner zwischen Label und CHF-Preis auf ASCII-Bindestrich umgestellt." },
    ],
  },
  {
    version: "2.3.55",
    date: "2026-03-05",
    title: "E-Mail-Verlauf, Beliebig-Slots, Adress-Autocomplete",
    changes: [
      { type: "fix", text: "E-Mail-Verlauf konnte nicht geladen werden: Backend-Endpoint GET /api/admin/orders/:orderNo/email-log fehlte, wurde ergänzt." },
      { type: "fix", text: "Bei Fotograf 'Beliebig' erschienen keine Slot-Vorschläge. anySlotMode bei time=00:00 aktiviert, API liefert resolvedPhotographer und freeSlots." },
    ],
  },
  {
    version: "2.3.54",
    date: "2026-03-05",
    title: "Adress-Autocomplete repariert",
    changes: [
      { type: "fix", text: "Adressvorschläge (z.B. Rechnungsadresse) erschienen nicht. API-Antwort enthielt kein countryCode; Frontend filterte alle Treffer aus. Backend liefert jetzt countryCode, street, houseNumber, zip, city, complete." },
    ],
  },
  {
    version: "2.3.53",
    date: "2026-03-05",
    title: "Buchungsfehler behoben, Dauer-Anzeige entfernt",
    changes: [
      { type: "fix", text: "Buchung abschliessen schlug mit 'order is not defined' fehl. Ursache: falsche Variable im Backend (billing statt order.billing)." },
      { type: "improvement", text: "Termin-Dauer (z.B. 2.17 Std.) wird in der Zusammenfassung 'Ihre Auswahl' nicht mehr angezeigt, nur noch Datum und Uhrzeit." },
    ],
  },
  {
    version: "2.3.52",
    date: "2026-03-05",
    title: "Druckvorlage: Hinweise & Schlüsselabholung",
    changes: [
      { type: "improvement", text: "Die Druckvorlage zeigt jetzt Hinweise (Notes) und alle Schlüsselabholungs-Infos an, wenn vorhanden." },
    ],
  },
  {
    version: "2.3.51",
    date: "2026-03-05",
    title: "Kalender-Titel: UTF-8 Mojibake behoben",
    changes: [
      { type: "fix", text: "Kalender-Einträge zeigten fehlerhafte Zeichen (Mojibake) statt des Mittelpunkts (·) im Titel. Backend und Frontend korrigiert." },
    ],
  },
  {
    version: "2.3.50",
    date: "2026-03-05",
    title: "Archivierte Bestellungen unten, aufklappbar",
    changes: [
      { type: "improvement", text: "Archivierte Bestellungen erscheinen nicht mehr gemischt in der Liste. Sie werden unten in einem aufklappbaren Bereich gruppiert; standardmäßig zugeklappt." },
    ],
  },
  {
    version: "2.3.49",
    date: "2026-03-04",
    title: "E-Mail-Versand bei unverändertem Status",
    changes: [
      { type: "improvement", text: "„E-Mail(s) senden“ mit Empfänger-Checkboxen (Kunde, Büro, Fotograf, CC) funktioniert jetzt auch, wenn der Status unverändert bleibt. Klick auf „Änderungen speichern“ sendet die Status-Templates an die gewählten Empfänger." },
    ],
  },
  {
    version: "2.3.48",
    date: "2026-03-04",
    title: "Bestellung bearbeiten: Schlüsselabholung als Textarea",
    changes: [
      { type: "fix", text: "Beim Bearbeiten einer Bestellung: Schlüsselabholung-Feld ist jetzt ein Textarea (3 Zeilen), damit längere Texte korrekt eingegeben werden können." },
    ],
  },
  {
    version: "2.3.47",
    date: "2026-03-04",
    title: "E-Mail-Verlauf Endpoint ergänzt",
    changes: [
      { type: "fix", text: "Der Backend-Endpoint GET /api/admin/orders/:orderNo/email-log fehlte. E-Mail-Verlauf in den Bestelldetails lädt jetzt wieder." },
    ],
  },
  {
    version: "2.3.46",
    date: "2026-03-04",
    title: "Schlüsselabholung: Sichtbarkeit & ein Textfeld",
    changes: [
      { type: "improvement", text: "Schlüsselabholung im Buchungsformular: Accordion standardmäßig geöffnet, Position nach 360° Tour, ein Textfeld statt Adresse/Etage/Info." },
      { type: "improvement", text: "Admin-Panel: Checkbox + Textfeld für Schlüsselabholung (Placeholder: Wo und wie kann der Schlüssel abgeholt werden?)." },
      { type: "improvement", text: "Schlüsselabholungs-Infos erscheinen jetzt zuverlässig in E-Mails und Kalendereinträgen (auch bei Admin-Bestellungen)." },
    ],
  },
  {
    version: "2.3.45",
    date: "2026-03-04",
    title: "Status-Änderung: E-Mails nur an Angehakte, Verlauf vollständig",
    changes: [
      { type: "improvement", text: "Bei Status-Änderung mit „E-Mail(s) senden“ werden Mails nur noch an die angeklickten Empfänger gesendet (Kunde, Büro, Fotograf, CC)." },
      { type: "fix", text: "Absage-Mails (Büro, Fotograf, Kunde) erscheinen jetzt im E-Mail-Verlauf, da sie in email_send_log geschrieben werden." },
    ],
  },
  {
    version: "2.3.44",
    date: "2026-03-04",
    title: "Bestätigungslink: Template + CC",
    changes: [
      { type: "improvement", text: "„Bestätigungslink erneut senden“ nutzt jetzt das E-Mail-Template „booking_confirmation_request“ (wie bei Neubuchung). Zusätzlich erhalten alle CC-Empfänger (attendeeEmails) dieselbe Bestätigungsmail." },
    ],
  },
  {
    version: "2.3.43",
    date: "2026-03-04",
    title: "E-Mail-Verlauf: nur Mails der aktuellen Bestellung",
    changes: [
      { type: "fix", text: "E-Mails von älteren Bestellungen mit gleicher Bestellnummer wurden angezeigt. Es werden jetzt nur Mails mit sent_at >= orders.created_at angezeigt (aktuelle Bestellungsinstanz)." },
    ],
  },
  {
    version: "2.3.42",
    date: "2026-03-04",
    title: "Backend server.js repariert",
    changes: [
      { type: "fix", text: "server.js war durch Deploy beschädigt (SyntaxError). Aus Git wiederhergestellt, E-Mail-Verlauf-Endpoint erneut eingefügt." },
    ],
  },
  {
    version: "2.3.41",
    date: "2026-03-04",
    title: "E-Mail-Verlauf: nur Mails dieser Bestellung",
    changes: [
      { type: "improvement", text: "E-Mail-Verlauf zeigt nur noch E-Mails zu dieser Bestellnummer. Beim Harvesting werden auch Mails angezeigt, die vor der finalen Bestellungserstellung versendet wurden." },
    ],
  },
  {
    version: "2.3.40",
    date: "2026-03-04",
    title: "E-Mail-Verlauf Endpoint erneut eingebaut",
    changes: [
      { type: "fix", text: "Der Backend-Endpoint GET /api/admin/orders/:orderNo/email-log fehlte in der Produktion (durch Git-Restore verloren). E-Mail-Verlauf in den Bestelldetails lädt jetzt wieder." },
    ],
  },
  {
    version: "2.3.39",
    date: "2026-03-04",
    title: "Mitarbeiter-Stammdaten werden beim Bearbeiten gespeichert",
    changes: [
      { type: "fix", text: "Beim Speichern im Dialog „Mitarbeiter bearbeiten“ wurden Name, E-Mail, Telefon und Initialen nicht in die Datenbank übernommen. Der PUT-Handler ruft jetzt updatePhotographerCore auf." },
    ],
  },
  {
    version: "2.3.38",
    date: "2026-03-04",
    title: "Telefon aus Mitarbeiter-Einstellungen hat Vorrang",
    changes: [
      { type: "fix", text: "Die Migration überschreibt keine Telefonnummern mehr aus der Config. Werte aus „Mitarbeiter bearbeiten“ bleiben dauerhaft erhalten." },
      { type: "improvement", text: "photographers.config.js wird beim Deploy mitkopiert." },
    ],
  },
  {
    version: "2.3.37",
    date: "2026-03-04",
    title: "Backend server.js wiederhergestellt",
    changes: [
      { type: "fix", text: "server.js war abgeschnitten; aus Git wiederhergestellt, Änderungen (email-log, phone-format) erneut eingefügt." },
    ],
  },
  {
    version: "2.3.36",
    date: "2026-03-04",
    title: "Deploy: phone-format.js mitkopieren",
    changes: [
      { type: "fix", text: "phone-format.js wird beim Deploy jetzt mitkopiert; Backend startet wieder korrekt." },
    ],
  },
  {
    version: "2.3.34",
    date: "2026-03-04",
    title: "E-Mail-Verlauf Endpoint hinzugefügt",
    changes: [
      { type: "fix", text: "Der Backend-Endpoint GET /api/admin/orders/:orderNo/email-log fehlte. E-Mail-Verlauf in den Bestelldetails lädt jetzt korrekt." },
    ],
  },
  {
    version: "2.3.33",
    date: "2026-03-04",
    title: "Telefonnummern: Einheitliches Format +41 xx xxx xx xx",
    changes: [
      { type: "improvement", text: "Telefonnummern werden überall gespeichert und angezeigt im Schweizer Format: +41 xx xxx xx xx (z.B. +41 76 340 70 75). Gilt für Mitarbeiter, Kunden, Kontakte und Bestellungen." },
    ],
  },
  {
    version: "2.3.32",
    date: "2026-03-04",
    title: "Janez Telefon aus Config in DB syncen",
    changes: [
      { type: "fix", text: "Migration aktualisiert: Janez-Telefon wird beim Backend-Start aus photographers.config in die DB übernommen, damit die Nummer +41 76 340 70 75 in der Mitarbeiterliste erscheint." },
    ],
  },
  {
    version: "2.3.31",
    date: "2026-03-04",
    title: "Visuelle Speicherbestätigung, Janez Nummer",
    changes: [
      { type: "improvement", text: "Beim Speichern eines Mitarbeiters erscheint kurz eine grüne Erfolgsmeldung („Änderungen gespeichert“) vor dem Schließen des Modals." },
      { type: "improvement", text: "Janez-Stammdaten: Telefonnummer auf +41 76 340 70 75 angepasst (photographers.config, Konfiguration)." },
    ],
  },
  {
    version: "2.3.30",
    date: "2026-03-04",
    title: "Mitarbeiter bearbeiten: Telefonnummer wird gespeichert",
    changes: [
      { type: "fix", text: "Beim Bearbeiten eines Mitarbeiters wurden Name, E-Mail, Telefon und Initialen nicht in der Datenbank übernommen. Der PUT /settings-Endpoint aktualisiert jetzt die Fotografen-Stammdaten (photographers-Tabelle) korrekt." },
    ],
  },
  {
    version: "2.3.29",
    date: "2026-03-04",
    title: "Bestätigungsmail Kunde & CC, E-Mails Standard, attendeeEmails",
    changes: [
      { type: "feature", text: "Bestätigungsmail geht an Kunde UND CC-Empfänger, wenn attendeeEmails ausgefüllt." },
      { type: "improvement", text: "E-Mails senden ist standardmäßig an; Kunde voreingestellt. Reset-Bug behoben." },
      { type: "improvement", text: "attendeeEmails werden beim manuellen Erstellen von Bestellungen in der DB persistiert." },
    ],
  },
  {
    version: "2.3.28",
    date: "2026-03-04",
    title: "Admin-Login: Passwort-Sync aus ADMIN_PASS",
    changes: [
      { type: "fix", text: "Admin-Login behoben: Wenn admin-account.json einen alten Passwort-Hash hatte (z.B. weil ADMIN_PASS früher leer war), wird beim nächsten Start automatisch aus ADMIN_PASS synchronisiert. Login mit admin / Biel2503! funktioniert wieder." },
    ],
  },
  {
    version: "2.3.27",
    date: "2026-03-04",
    title: "Mitarbeiter-Telefonnummern bleiben nach Neustart erhalten",
    changes: [
      { type: "fix", text: "Die Migration überschreibt keine bestehenden Fotografen-Stammdaten mehr; manuell eingegebene Telefonnummern (und Name, E-Mail, Initialen) bleiben nach Deploy/Neustart erhalten." },
    ],
  },
  {
    version: "2.3.26",
    date: "2026-03-04",
    title: "Deploy: docker-compose.yml wird mitkopiert",
    changes: [
      { type: "fix", text: "docker-compose.yml wird jetzt beim Deploy auf das NAS kopiert; Admin-Container kann damit korrekt neu gebaut/gestartet werden." },
    ],
  },
  {
    version: "2.3.25",
    date: "2026-03-04",
    title: "Bestätigungsmail an Kunde & CC, E-Mails Standard, Speicher-Feedback",
    changes: [
      { type: "feature", text: "Bestätigungsmail mit Link wird jetzt an Kunde UND CC-Empfänger gesendet (nicht nur an den Kunden)." },
      { type: "improvement", text: "E-Mails senden ist bei Bestellungserstellung standardmäßig aktiviert; Kunde ist voreingestellt." },
      { type: "improvement", text: "Nach Speichern einer neuen Bestellung erscheint visuelles Feedback: „Bestellung #… erfolgreich erstellt“ für ca. 1,5 Sekunden." },
    ],
  },
  {
    version: "2.3.24",
    date: "2026-03-04",
    title: "Todo-Sync: Erledigt-Status aus Propus Todo",
    changes: [
      { type: "feature", text: "API-Endpoints für Propus Todo: Bestellung als erledigt synchronisieren (POST /api/todo-sync/orders/:orderNo/complete) und Existenzprüfung (GET /api/todo-sync/orders/:orderNo/exists)." },
    ],
  },
  {
    version: "2.3.23",
    date: "2026-03-04",
    title: "Deploy-Build Fixes",
    changes: [
      { type: "fix", text: "PhotographerSettings-Typ ergänzt (max_radius_km) für Backend-Kompatibilität." },
      { type: "fix", text: "ProductEditModal: TypeScript-Fehler bei compositeOf/includes behoben." },
    ],
  },
  {
    version: "2.3.22",
    date: "2026-03-04",
    title: "Mitarbeiter-Speichern behoben",
    changes: [
      { type: "fix", text: "Stammdaten (Name, E-Mail, Telefon, Initialen) im Mitarbeiter-Dialog wurden nicht gespeichert. Jetzt werden alle Felder korrekt in die Datenbank uebernommen." },
    ],
  },
  {
    version: "2.3.21",
    date: "2026-03-03",
    title: "Hotfix: Resolver-Datei wurde bei Deploy nicht mitkopiert",
    changes: [
      { type: "fix", text: "Deploy-Skript kopiert jetzt auch photographer-resolver.js (plus settings-resolver.js, holidays.js, travel.js). Dadurch greift anySlotMode live korrekt und 'Beliebig' zeigt wieder freie Slots." },
    ],
  },
  {
    version: "2.3.20",
    date: "2026-03-03",
    title: "Live-Skills aus Produkt-Config + aktive Mitarbeiter in Terminvergabe",
    changes: [
      { type: "feature", text: "Produkte unterstützen jetzt mehrere benötigte Skills (required_skills), z.B. Drohnenvideo = Drohne + Video." },
      { type: "improvement", text: "Produkt-Editor hat Skill-Checkboxen für die Terminvergabe, damit Produkte direkt Skills zugeordnet werden können." },
      { type: "fix", text: "Terminvorschlag (Beliebig) nutzt jetzt aktive Mitarbeiter + produktbasierte Skill-Zuordnung aus der DB, statt statischer Heuristik." },
    ],
  },
  {
    version: "2.3.19",
    date: "2026-03-03",
    title: "Skill-Erkennung für Video/Drohne im Wizard behoben",
    changes: [
      { type: "fix", text: "Admin-Bestellwizard: Addon-Codes (z.B. groundVideo, droneVideo) wurden nicht als Skill-Anforderungen an den Fotograf-Resolver übergeben. Maher wird jetzt korrekt vorgeschlagen wenn Video-Addons ausgewählt sind." },
    ],
  },
  {
    version: "2.3.18",
    date: "2026-03-03",
    title: "Fotograf-Vorschlag berücksichtigt jetzt Skills (Beliebig-Modus)",
    changes: [
      { type: "fix", text: "Im Bestellwizard bei 'Beliebig (automatisch)' wurde der Fotograf-Vorschlag ohne Skill-Prüfung ausgewählt. Jetzt werden Skills (Video, Drohne, Matterport) korrekt berücksichtigt: ein Fotograf wird nur vorgeschlagen wenn er freie Slots UND die nötigen Skills hat." },
    ],
  },
  {
    version: "2.3.17",
    date: "2026-03-03",
    title: "Slot-Picker: Kein freier Termin bei Beliebig behoben",
    changes: [
      { type: "fix", text: "Slot-Picker zeigte 'Kein freier Termin' bei Fotograf 'Beliebig (automatisch)', weil kein Zeitfilter angewendet werden sollte. Admin-Browse-Modus (time=00:00) wählt jetzt den Fotografen mit den meisten freien Slots." },
    ],
  },
  {
    version: "2.3.16",
    date: "2026-03-03",
    title: "Passwort-Reset & Slot-Picker Fix",
    changes: [
      { type: "fix", text: "Passwort-Vergessen-Link wurde nicht gesendet, wenn für einen Mitarbeiter noch kein Einstellungs-Eintrag existierte (INNER JOIN → LEFT JOIN)." },
      { type: "improvement", text: "Reset-Link ist jetzt 24 Stunden gültig (vorher: 2 Stunden)." },
      { type: "fix", text: "Slot-Picker im Bestellwizard zeigte 'Kein freier Termin' bei Fotograf 'Beliebig', weil time=00:00 nie in den Slots enthalten war. Jetzt wird bei Browse-Modus (kein Zeitfilter) der Fotograf mit den meisten freien Slots vorgeschlagen." },
    ],
  },
  {
    version: "2.3.15",
    date: "2026-03-03",
    title: "Mitarbeiter deaktivieren / reaktivieren",
    changes: [
      { type: "feature", text: "Mitarbeiter können jetzt deaktiviert werden (nicht gelöscht). Deaktivierte Mitarbeiter erscheinen ausgegraut mit 'Inaktiv'-Badge und werden nicht mehr in der automatischen Terminvergabe berücksichtigt." },
      { type: "feature", text: "Reaktivierung jederzeit möglich per Klick im Bearbeitungs-Modal." },
      { type: "improvement", text: "Bestehende Bestellungen und historische Daten bleiben bei Deaktivierung unverändert." },
    ],
  },
  {
    version: "2.3.14",
    date: "2026-03-03",
    title: "Preis-Zusammenfassung: Neues Quittungs-Layout",
    changes: [
      { type: "improvement", text: "Preis & Zusammenfassung: Neues zweispaltiges Layout mit Live-Kalkulation (Paket, Addons, Schluesselabholung werden automatisch summiert)." },
      { type: "improvement", text: "Subtotal und Total werden bei Paket-/Addon-/Rabatt-Änderungen automatisch neu berechnet (8.1% MWST)." },
      { type: "improvement", text: "Quittungs-Darstellung rechts mit allen Positionen, Rabatt in Gruen, Total in Gold." },
      { type: "fix", text: "Best??tigungs-E-Mails-Checkbox entfernt (ersetzt durch granulare E-Mail-Zielgruppen im Anfangsstatus-Bereich)." },
    ],
  },
  {
    version: "2.3.13",
    date: "2026-03-03",
    title: "Neue Bestellung: Slot-Picker, E-Mail-Ziele, Fotograf-Vorschlag",
    changes: [
      { type: "fix", text: "Slot-Anzeige bei 'Beliebig'-Fotograf: Alle Slots des empfohlenen Fotografen werden angezeigt, mit Hinweis auf den vorgeschlagenen Namen." },
      { type: "fix", text: "Encoding-Fehler (Schl??sselabholung) durch sauberen Neubuild behoben." },
      { type: "improvement", text: "Anfangsstatus als Select-Dropdown statt Balken-Buttons für bessere Übersicht." },
      { type: "feature", text: "E-Mail-Zielgruppen (Kunde, Büro, Fotograf, CC) im Bestellformular hinzugefügt – analog zu Bestelldetail und Kalender." },
      { type: "improvement", text: "Backend: /api/admin/availability gibt bei 'any' neu resolvedPhotographer + freeSlots zurück." },
    ],
  },
  {
    version: "2.3.12",
    date: "2026-03-03",
    title: "Aktueller Mailverlauf + Pending->Completed",
    changes: [
      { type: "fix", text: "E-Mail-Verlauf zeigt pro Bestellung nur noch Mails seit der aktuellen Erstellung (`sent_at >= orders.created_at`). Alte Historie mit gleicher Bestellnummer wird ausgeblendet." },
      { type: "fix", text: "Statusübergang `pending -> completed` ist jetzt erlaubt (Backend- und UI-Transitionsmatrix)." },
    ],
  },
  {
    version: "2.3.11",
    date: "2026-03-03",
    title: "Pending direkt abschliessbar",
    changes: [
      { type: "fix", text: "Statusübergang `pending -> done` ist jetzt für den Admin-Flow erlaubt (Backend + UI-Transitionsmatrix)." },
    ],
  },
  {
    version: "2.3.10",
    date: "2026-03-03",
    title: "Completed direkt archivierbar",
    changes: [
      { type: "fix", text: "Statusübergang `completed -> archived` ist jetzt erlaubt (Backend State-Machine + UI-Statusmatrix konsistent)." },
    ],
  },
  {
    version: "2.3.9",
    date: "2026-03-03",
    title: "Mail-Zielgruppen Default aus",
    changes: [
      { type: "improvement", text: "Im Statusbereich sind Kunde/Büro/Fotograf/CC jetzt standardmäßig nicht vorausgewählt. Auswahl erfolgt bewusst pro Änderung." },
    ],
  },
  {
    version: "2.3.8",
    date: "2026-03-03",
    title: "Mail-Zielgruppen immer sichtbar",
    changes: [
      { type: "improvement", text: "Checkboxen für Kunde/Büro/Fotograf/CC sind im Status-Bereich immer sichtbar. Bei deaktiviertem Hauptschalter sind sie klar erkennbar, aber nicht editierbar." },
    ],
  },
  {
    version: "2.3.7",
    date: "2026-03-03",
    title: "Sortierbare Bestell-Tabelle",
    changes: [
      { type: "feature", text: "Bestellungen-Tabelle ist jetzt per Klick auf Spaltenkopf sortierbar (Bestellung, Kunde, Adresse, Termin, Total, Status)." },
      { type: "improvement", text: "Sortierrichtung wird visuell mit Pfeil im Header angezeigt und per erneutem Klick umgeschaltet." },
    ],
  },
  {
    version: "2.3.6",
    date: "2026-03-03",
    title: "Status-Mails pro Empfänger",
    changes: [
      { type: "feature", text: "Status-Update unterstützt jetzt selektiven Mailversand per Checkboxen für Kunde, Büro, Fotograf und CC." },
      { type: "improvement", text: "Backend verarbeitet neue `sendEmailTargets` beim Admin-Statuspatch und filtert Side-Effects pro Zielgruppe." },
    ],
  },
  {
    version: "2.3.5",
    date: "2026-03-03",
    title: "E-Mail-Verlauf sent_at Backend-Fix",
    changes: [
      { type: "fix", text: "API `/api/admin/orders/:orderNo/email-log` normalisiert `sent_at` jetzt sicher zu String/ISO. Vorher kam in einigen Fällen `{}` zurück, wodurch im UI nur `Gesendet: -` erschien." },
    ],
  },
  {
    version: "2.3.4",
    date: "2026-03-03",
    title: "E-Mail-Verlauf Zeitstempel robust",
    changes: [
      { type: "fix", text: "Zeitstempel im E-Mail-Verlauf werden jetzt robust aus sent_at/sentAt verarbeitet und zuverlässig als Datum/Uhrzeit dargestellt." },
    ],
  },
  {
    version: "2.3.3",
    date: "2026-03-03",
    title: "E-Mail-Verlauf Datum fix",
    changes: [
      { type: "fix", text: "Versanddatum im E-Mail-Verlauf wird jetzt korrekt angezeigt (Postgres-Timestamp-Format mit Mikrosekunden wurde nicht geparst)." },
    ],
  },
  {
    version: "2.3.2",
    date: "2026-03-03",
    title: "E-Mail-Zeit besser sichtbar",
    changes: [
      { type: "improvement", text: "Im E-Mail-Verlauf wird Datum/Uhrzeit pro Eintrag kontraststark angezeigt, damit der Versandzeitpunkt klar erkennbar ist." },
    ],
  },
  {
    version: "2.3.1",
    date: "2026-03-03",
    title: "E-Mail-Verlauf mit Datum/Uhrzeit",
    changes: [
      { type: "fix", text: "Im E-Mail-Verlauf wird pro Eintrag das Versanddatum mit Uhrzeit klar angezeigt (z. B. „Gesendet: 03.03.2026, 17:40“)." },
      { type: "improvement", text: "Zeitstempel-Parsing für Postgres-Format verbessert, damit Versandzeiten zuverlässig formatiert werden." },
    ],
  },
  {
    version: "2.3.0",
    date: "2026-03-03",
    title: "E-Mail-Kontrolle + Zentraler Status-Workflow",
    changes: [
      { type: "feature", text: "Checkbox \u201eE-Mail(s) senden\u201c im Bestell- und Kalender-Modal (Standard: AUS). Admin-Status\u00e4nderungen l\u00f6sen standardm\u00e4\u00dfig keine automatischen Mails aus." },
      { type: "feature", text: "Zentrale OrderStatusSelect-Komponente ersetzt alle Status-Dropdowns im Admin-Panel." },
      { type: "feature", text: "Reaktivierung stornierter Bestellungen: Storniert \u2192 Ausstehend jetzt m\u00f6glich." },
      { type: "improvement", text: "Admin-Override bei Slot-Konflikt: Warnung-Popup bei fremder Buchung, Speichern trotzdem m\u00f6glich." },
      { type: "fix", text: "Encoding-Fix f\u00fcr Fehlermeldungen (Umlaute wurden falsch angezeigt)." },
      { type: "fix", text: "E-Mail-Template-Toggle im Admin korrigiert (aktiv/inaktiv Zustand wurde nicht synchronisiert)." },
      { type: "fix", text: "Review-Job nutzt jetzt den korrekten Template-Key (review_request)." },
    ],
  },
  {
    version: "2.2.12",
    date: "2026-03-02",
    title: "Debug-Instrumentation bereinigt",
    changes: [
      { type: "improvement", text: "Alle temporären Debug-Logs aus OrderTable, OrderDetail, OrdersPage und Backend entfernt." },
    ],
  },
  {
    version: "2.2.11",
    date: "2026-03-02",
    title: "React Error #31 – formatDateTime absichern",
    changes: [
      { type: "fix", text: "formatDateTime(): Gibt immer einen String zurück – verhindert React Error #31 wenn appointmentDate ein Objekt ({}) statt String vom Backend ist." },
    ],
  },
  {
    version: "2.2.10",
    date: "2026-03-02",
    title: "React Error #31 – API-Werte absichern",
    changes: [
      { type: "fix", text: "toDisplayString() für alle Kunden-API-Werte – verhindert Fehler bei Objekt-Werten (z. B. leeres {} von Backend)." },
      { type: "improvement", text: "CustomerViewModal, CustomerModal, CustomerContactsSection, CustomerList: Sichere Anzeige aller Felder." },
    ],
  },
  {
    version: "2.2.9",
    date: "2026-03-02",
    title: "React Error #31 behoben",
    changes: [
      { type: "fix", text: "i18n t(): Liefert immer einen String – verhindert 'Objects are not valid as React child' (Error #31) bei fehlerhaften Übersetzungswerten." },
      { type: "improvement", text: "ErrorBoundary: Robusteres Handling der Fehlermeldung." },
    ],
  },
  {
    version: "2.2.8",
    date: "2026-03-02",
    title: "Popup-Scroll auf allen Plattformen",
    changes: [
      { type: "fix", text: "Alle Modals und Popups (Kundenansicht, Mitarbeiter, Profil, Kalender, Upload, etc.) werden nicht mehr unten abgeschnitten – Overlays sind scrollbar." },
      { type: "improvement", text: "Einheitliches Layout-Pattern für alle Popups: flex + overflow-y-auto statt grid place-items-center." },
    ],
  },
  {
    version: "2.2.7",
    date: "2026-03-02",
    title: "Für 30 Tage merken – Debug",
    changes: [
      { type: "improvement", text: "Debug-Logs für 'Für 30 Tage merken' hinzugefügt – Ausgabe in Browser-Konsole (DevTools) zur Fehleranalyse." },
    ],
  },
  {
    version: "2.2.5",
    date: "2026-03-02",
    title: "Fotograf-Telefon + Mojibake-Fix",
    changes: [
      { type: "feature", text: "Fotograf-Telefonnummer wird in Bestelldetails, Druckansicht und Kalender angezeigt (kein Fallback mehr mit '–')." },
      { type: "improvement", text: "photographers.config.js: Platzhalter-Nummern ergänzt – echte Nummern eintragen für Live-Anzeige." },
      { type: "fix", text: "Mojibake-Fix: Zeichen wie Ã¢â‚¬â€ werden zentral bereinigt (JSON-Response-Sanitizer + Mail-Sanitizing)." },
    ],
  },
  {
    version: "2.2.4",
    date: "2026-03-02",
    title: "E-Mail-Verlauf in Bestelldetails",
    changes: [
      { type: "feature", text: "Bestelldetails: Neuer Bereich 'E-Mail-Verlauf' zeigt alle gesendeten E-Mails (Typ, Empfänger, Zeitstempel) direkt in der Bestellansicht." },
      { type: "feature", text: "Backend: Neuer Endpoint GET /api/admin/orders/:orderNo/email-log liest aus bestehender email_send_log-Tabelle." },
      { type: "improvement", text: "Template-Keys werden als lesbare Labels angezeigt (z. B. 'Bestätigungsanfrage', 'Buchung bestätigt')." },
    ],
  },
  {
    version: "2.2.2",
    date: "2026-03-02",
    title: "Deploy-Workflow: Changelog-Prüfung + DEPLOY.md",
    changes: [
      { type: "improvement", text: "deploy-prod.ps1: Prüft vor jedem Deploy ob ein Changelog-Eintrag für die neue Version vorhanden ist – zeigt Vorlage mit Copy-Paste-Beispiel wenn nicht." },
      { type: "feature",     text: "DEPLOY.md erstellt: Vollständige Deploy-Anleitung mit Checkliste, Changelog-Schema, Rollback-Anleitung, Architektur-Übersicht und Fehlerbehandlung." },
      { type: "fix",         text: "ChangelogPage.tsx: Versionsnummer 2.2.0 → 2.2.1 korrigiert (Script hatte automatisch hochgezählt)." },
    ],
  },
  {
    version: "2.2.1",
    date: "2026-03-02",
    title: "Einheitlicher Bestätigungs-Workflow + CC-Benachrichtigungen",
    changes: [
      { type: "breaking",    text: "Neue Buchungen starten immer als 'Ausstehend' – Kunde erhält Bestätigungs-Link per E-Mail." },
      { type: "feature",     text: "Kunden-Bestätigungslink (3 Tage gültig) für alle neuen Buchungen und Terminänderungen." },
      { type: "feature",     text: "Admin kann Aufträge manuell bestätigen (POST /api/admin/orders/:no/confirm)." },
      { type: "feature",     text: "Nach 24h ohne Bestätigung: automatischer Übergang zu 'Provisorisch' (Hintergrund-Job stündlich)." },
      { type: "feature",     text: "Provisorischer Status blockiert den Kalender-Slot (wie bestätigt)." },
      { type: "feature",     text: "Neues Feld 'Weitere Personen einladen' im Wizard (attendeeEmails) – Termininfo ohne Preise." },
      { type: "feature",     text: "Neue Felder im Wizard: Kontakt vor Ort (Name, Telefon, E-Mail)." },
      { type: "feature",     text: "Kunden-Autocomplete füllt auch Onsite-Name und Onsite-Telefon aus dem Kundenstamm vor." },
      { type: "feature",     text: "4 neue E-Mail-Templates: booking_confirmation_request, booking_change_confirmation_request, attendee_notification, office_confirmation_pending_notice." },
      { type: "feature",     text: "CC-Mails an weitere Personen bei: bestätigt, provisorisch, pausiert, storniert." },
      { type: "improvement", text: "DB-Migration 008: confirmation_token, attendee_emails, onsite_email Spalten zu 'orders'." },
      { type: "improvement", text: "buildTemplateVars: neuer Platzhalter {{statusLabel}} (Status auf Deutsch)." },
      { type: "improvement", text: "sendAttendeeNotifications: neue idempotente Helper-Funktion im template-renderer." },
    ],
  },
  {
    version: "2.1.5",
    date: "2026-02-18",
    title: "Drucktemplate – modernes Design",
    changes: [
      { type: "improvement", text: "PrintOrder vollständig neu gestaltet: 2-Spalten-Layout, PROPUS Gold-Akzente, kompakter Header." },
      { type: "improvement", text: "Druckvorschau zeigt Status-Badge, Auftragsnummer und Datum prominent." },
      { type: "fix",         text: "ZIP/Stadt-Ableitung aus billing.zipcity robuster gemacht." },
    ],
  },
  {
    version: "2.1.4",
    date: "2026-02-15",
    title: "UI-Konsistenz – Status-Labels",
    changes: [
      { type: "fix",         text: "Alle Status-Dropdowns zeigen nun konsequent deutsche Bezeichnungen (kein englischer Key mehr)." },
      { type: "fix",         text: "Status-Filter in Kalender, Aufträge und Dashboard nutzen einheitlich getStatusLabel()." },
      { type: "improvement", text: "normalizeStatusKey() und statusMatches() als zentrale SSOT-Funktionen eingeführt." },
    ],
  },
  {
    version: "2.1.3",
    date: "2026-02-12",
    title: "Kalender-Slot-Matrix umgesetzt",
    changes: [
      { type: "breaking",    text: "Slot-Kollisionsprüfung vor provisional/confirmed: 409 wenn belegt (ohne forceSlot)." },
      { type: "feature",     text: "Einheitliche deleteCalendarEvents-Routine für alle Lösch-Pfade (idempotent)." },
      { type: "improvement", text: "PROVISORISCH und FINAL zählen beide als busy (inkl. 30-Min-Puffer) bei Availability." },
      { type: "fix",         text: "calendar.delete_if_exists verhindert Fehler bei bereits gelöschten Events." },
    ],
  },
  {
    version: "2.1.2",
    date: "2026-02-10",
    title: "Einheitlicher Workflow – E-Mail & Kalender",
    changes: [
      { type: "feature",     text: "sendMailIdempotent: E-Mails werden nie doppelt gesendet (Idempotenz via email_send_log)." },
      { type: "feature",     text: "Mehrsprachige E-Mail-Templates (de-CH, en, sr-latn) mit Fallback." },
      { type: "feature",     text: "DB-Migration 007: template_language-Spalte und preferred_language für Kunden." },
      { type: "improvement", text: "Cron-Jobs nutzen alle sendMailIdempotent (provisional-expiry, reminders, review-requests)." },
    ],
  },
  {
    version: "2.1.0",
    date: "2026-02-05",
    title: "Admin Order Wizard – Kunden-Autocomplete",
    changes: [
      { type: "feature",     text: "Neue Bestellung: Kunden-Autocomplete bei Name, E-Mail und Telefon." },
      { type: "feature",     text: "Autocomplete übernimmt alle Kundendaten (Name, E-Mail, Telefon, Firma, Onsite)." },
      { type: "improvement", text: "Wizard-Validierung erweitert: Telefon, Adresse mit Hausnummer, mind. 1 Dienst." },
      { type: "improvement", text: "Automatische Preisberechnung (Subtotal, MwSt, Total) beim Paket-/Addon-Wechsel." },
    ],
  },
  {
    version: "2.0.0",
    date: "2026-01-28",
    title: "Einheitlicher Workflow (Status, Kalender, E-Mail)",
    changes: [
      { type: "breaking",    text: "State Machine als Single Source of Truth: ALLOWED_TRANSITIONS im Backend definiert." },
      { type: "feature",     text: "Hintergrund-Jobs: provisional-expiry, provisional-reminders, review-requests, calendar-retry." },
      { type: "feature",     text: "Feature Flags für alle Hintergrund-Jobs und E-Mail-Versand." },
      { type: "feature",     text: "Automatisches Staging-Deployment via deploy-prod.ps1 mit SSH-Fallback." },
      { type: "improvement", text: "Docker Build Cache Strategie verbessert (--no-cache für Admin-Container)." },
      { type: "security",    text: "SSH-Public-Key hinterlegt auf NAS, automatischer User-Fallback im Deploy-Script." },
    ],
  },
];
