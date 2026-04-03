# Propus Platform — [MODUL-NAME] Flow

> **Automatisch mitpflegen:** Bei Änderungen an [MODUL-NAME] dieses Dokument aktualisieren.
> Cursor-Regel `.cursor/rules/data-fields.mdc` erinnert daran.

*Zuletzt aktualisiert: [DATUM]*

---

## Inhaltsverzeichnis

1. [Übersicht](#1-übersicht)
2. [Endpunkte](#2-endpunkte)
3. [Datenbank-Tabellen](#3-datenbank-tabellen)
4. [Flow-Diagramm](#4-flow-diagramm)
5. [Bekannte Lücken / TODOs](#5-bekannte-lücken--todos)

---

## 1. Übersicht

[Kurze Beschreibung was dieses Modul macht, welche Systeme beteiligt sind]

---

## 2. Endpunkte

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `POST` | `/api/...` | Admin | |
| `GET` | `/api/...` | — | |

---

## 3. Datenbank-Tabellen

### `schema.tabelle_name`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `created_at` | TIMESTAMPTZ | |

---

## 4. Flow-Diagramm

```
Auslöser / Trigger
  │
  ├── Schritt 1: ...
  │     → DB-Operation
  │
  ├── Schritt 2: ...
  │     → Externe API
  │
  └── Schritt 3: ...
        → E-Mail / Webhook
```

---

## 5. Bekannte Lücken / TODOs

| # | Beschreibung | Status |
|---|---|---|
| 1 | | Offen |

---

## Nach Fertigstellung

1. Dieses Template löschen / umbenennen nach `FLOWS_[MODUL].md`
2. In `DATA_FIELDS.md` in die Tabelle eintragen
3. In `.cursor/rules/data-fields.mdc` das Mapping erweitern
4. `git add docs/FLOWS_[MODUL].md DATA_FIELDS.md .cursor/rules/data-fields.mdc`
