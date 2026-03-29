# Propus Platform – Kurzüberblick und Textpflege

Dieses Dokument fasst die **technische Gliederung** der Plattform zusammen und zeigt, **wo deutschsprachige Texte** gepflegt werden. Es ergänzt die Einstiegsdoku im [README.md](../README.md).

## Architektur (übergeordnet)

```mermaid
flowchart LR
  subgraph client [Browser]
    SPA[React_SPA_platform_frontend]
  end
  subgraph platform [platform]
    Entry[server_js]
    CoreAPI[Core_API]
  end
  subgraph booking [booking]
    BookingAPI[Express_Booking]
  end
  subgraph tours [tours]
    ToursApp[Express_EJS_Tour_Manager]
  end
  subgraph data [PostgreSQL]
    DB[(propus_DB)]
  end
  SPA --> Entry
  Entry --> CoreAPI
  Entry --> BookingAPI
  Entry --> ToursApp
  CoreAPI --> DB
  BookingAPI --> DB
  ToursApp --> DB
```

- **`platform/server.js`**: zentraler HTTP-Einstieg; bündelt Core-Routen, Buchungs-App und Tour-Manager (typisch unter `/tour-manager`).
- **`booking/`**: Haupt-API und Geschäftslogik des Buchungstools (Express).
- **`tours/`**: Tour Manager (Express mit EJS-Templates).
- **`core/`**: gemeinsame SQL-Migrationen und Migration Runner.
- **`auth/`**: Logto-Anbindung (OIDC) und Sitzungsverwaltung.

Datenbank **eine Instanz**, logisch getrennte Schemas (u. a. `core`, `booking`, `tour_manager`); Module setzen `search_path` passend.

## Wo Texte liegen (Priorität für Deutsch)

| Priorität | Bereich | Pfad(e) |
|-----------|---------|---------|
| 1 | Repo-Einstieg, Setup, Architektur | [README.md](../README.md) |
| 2 | Admin- und Portal-UI (Übersetzungs-Keys) | [platform/frontend/src/i18n/de.json](../platform/frontend/src/i18n/de.json) |
| 3 | In-App-Changelog / Release-Notizen | [platform/frontend/src/data/changelogData.ts](../platform/frontend/src/data/changelogData.ts) |
| 4 | Statische Shell (Seitentitel etc.) | [platform/frontend/index.html](../platform/frontend/index.html) |
| 5 | Sichtbare Build-Version | [platform/frontend/public/VERSION](../platform/frontend/public/VERSION) |
| 6 | E-Mails und ähnliche Vorlagen | `booking/templates/` (u. a. E-Mail-Texte) |
| 7 | Legacy-Duplikat (bei Parität) | `booking/admin-panel/src/i18n/de.json` – nur nötig, wenn dieser Baum noch parallel gepflegt wird |

**Hinweis:** UI-Texte werden über **Keys** in `de.json` (und weiteren Sprachen) geladen; nur die **Werte** übersetzen, Keys und Platzhalter wie `{{name}}` unverändert lassen.

## Routen-Landkarte (Frontend)

Die sichtbaren Bereiche der React-App sind in [platform/frontend/src/App.tsx](../platform/frontend/src/App.tsx) an den Routen erkennbar (Dashboard, Bestellungen, Kunden, Einstellungen, Buchungs-Wizard, Portal usw.). Änderungen an Menü- oder Seitentiteln hängen typischerweise an denselben i18n-Keys wie die Navigation.

## Pflegeempfehlung

1. Fachliche Begriffe (EXXAS, Logto, Produktnamen) **einheitlich** schreiben.
2. **Du/Sie**: Im internen Admin ist „du“ bei Einstellungstexten üblich; kundenorientierte Fließtexte oft „Sie“ – bei großen Umbauten Stil vereinheitlichen.
3. Nach inhaltlichen Änderungen kurz prüfen, ob **Changelog** und ggf. **README** mitgezogen werden sollen.
