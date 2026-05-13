---
tags:
  - linear
  - workflow
  - propus
  - tooling
aliases:
  - Linear Workflow
  - Issue Tracking
created: 2026-05-13
last-updated: 2026-05-13
status: aktiv
workspace: propus1
team-key: PRO
linear-url: https://linear.app/propus1
github-repo: Janez76/propus-platform
review-cadence: wöchentlich (Montag morgens)
---
> [!info] Lebende Notiz
> Diese Notiz wird **laufend ergänzt**. Immer wenn ein neuer Workflow-Aspekt auftaucht, eine Konvention sich ändert oder ein Projekt dazukommt: hier eintragen und `last-updated` im Frontmatter aktualisieren.
> Letzter Stand: **2026-05-13** (Initial-Setup)

# Linear — Workflow & Pflege

Zentraler Issue-Tracker für die [[Propus Platform]]. Ersetzt informelle Todo-Listen und punktuelle Notizen. Ziel: jede Änderung am Code hat ein Issue, jedes Issue hat einen Branch, jeder PR schliesst Issues.

## Workspace-Übersicht

- **Workspace:** [propus1](https://linear.app/propus1)
- **Team:** `Propus1` (Identifier `PRO` → Issues heissen `PRO-1`, `PRO-2`, …)
- **GitHub:** `Janez76/propus-platform` *(Integration einzurichten — siehe [[#Setup Checkliste]])*

## Aktive Projekte

| Projekt | Status | Priorität | Modul-Fokus |
|---|---|---|---|
| [Bulk-Save & Verknüpfungen v1.1](https://linear.app/propus1/project/bulk-save-and-verknupfungen-v11-ac76886cfaa7) | In Arbeit | Hoch | kanban · verknuepfungen |
| [Tour Manager v2](https://linear.app/propus1/project/tour-manager-v2-568bbb7658fe) | Backlog | Mittel | tour-manager |
| [Finanzmodul Refinements](https://linear.app/propus1/project/finanzmodul-refinements-5c79b32abd11) | Backlog | Mittel | finanzen |
| [Booking System v2](https://linear.app/propus1/project/booking-system-v2-a0d2c22f2bf4) | Backlog | Niedrig | booking |

Siehe auch: [[Propus Platform - Roadmap]] · [[Tour Manager - Statusmachine]] · [[Finanzmodul - Mahnstufen]]

## Setup-Checkliste

- [ ] Status-Namen auf Deutsch umbenennen (siehe [[#Statuses (Workflow)]])
- [ ] GitHub-Integration aktivieren: `Settings → Integrations → GitHub`
  - [ ] Repo `Janez76/propus-platform` autorisieren
  - [ ] Auto-Branch-Erstellung aktivieren (`Cmd+Shift+.` im Issue)
  - [ ] Status-Mapping: PR open → `In Review`, PR merged to master → `Erledigt`
- [ ] Default-Onboarding-Issues `PRO-1` bis `PRO-4` löschen
- [ ] Slack-Integration (optional, später)
- [ ] Browser-Bookmark auf [Inbox](https://linear.app/propus1/inbox) setzen

## Statuses (Workflow)

In Linear: `Settings → Teams → Propus1 → Workflow`

| Englisch (Default) | Deutsch (umbenennen auf) | Bedeutung |
|---|---|---|
| Backlog | `Backlog` *(lassen)* | Ideen, irgendwann |
| Todo | `Geplant` | Im aktuellen Fokus |
| In Progress | `In Arbeit` | Aktiv dran |
| In Review | `In Review` *(lassen)* | PR offen, Testing läuft |
| Done | `Erledigt` | Auf master gemerged & deployed |
| Canceled | `Verworfen` | Nicht mehr relevant |
| Duplicate | `Duplikat` | Mit anderem Issue verlinkt |

> [!tip] Status-Umbenennung
> Bricht die GitHub-Integration **nicht** — Linear arbeitet intern mit Status-Typen (`backlog`, `unstarted`, `started`, `completed`, `canceled`), nicht mit Namen.

## Labels

### Modul-Gruppe (exklusiv — nur **eines** pro Issue)

Goldener Modul-Tag identifiziert, welcher Teil des Codes betroffen ist.

`booking` · `kanban` · `kunden` · `finanzen` · `tour-manager` · `galerie` · `rechte-rollen` · `verknuepfungen` · `email-system` · `auth` · `infra`

### Typ-Labels (mehrere erlaubt)

`Bug` · `Feature` · `Improvement` · `UI` · `Refactor` · `DB` · `Docs`

> [!note] Neue Labels
> Wenn ein Issue weder zu Modul noch zu Typ passt: kurz hier eintragen und Label in Linear anlegen. Konvention: Module **kleingeschrieben mit Bindestrich**, Typen **gross**.

## Konventionen

### Issue-Titel

`<Modul-Präfix>: <konkrete Aktion>`

Beispiele:
- ✅ `Bulk-Save: Edge-Cases bei leeren Slots prüfen`
- ✅ `Mahnstufen-Automation (1./2./3. Mahnung)`
- ❌ `Fix bug` *(zu unspezifisch)*
- ❌ `Verbessere die Anwendung` *(kein Modul, keine Aktion)*

### Issue-Beschreibung (Template)

```markdown
## Ziel
<Was soll am Ende funktionieren?>

## Akzeptanzkriterien
- [ ] Kriterium 1
- [ ] Kriterium 2

## Stack / DB
<Falls relevant: betroffene Tabellen, Endpoints, Komponenten>

## Referenzen
<Links auf andere Issues, Docs, Slack-Threads, Mails>
```

### Branches & PRs

- Branch: Linear generiert via `Cmd+Shift+.` → z.B. `janezsmirmaul/pro-12-titel`
- PR-Titel: `PRO-12: <Issue-Titel>` *(Linear erkennt automatisch und verlinkt)*
- PR-Body: `Closes PRO-12` am Ende → Status springt bei Merge automatisch auf `Erledigt`

### Prioritäten

| Stufe | Wann |
|---|---|
| `Urgent` (1) | Production down, Datenverlust, Sicherheits-Bug |
| `High` (2) | Kunde wartet, blockiert anderes |
| `Medium` (3) | Nächste 2–4 Wochen |
| `Low` (4) | Nice-to-have, irgendwann |
| `No priority` | Ideen, Triage nötig |

## Routinen

### Tagesbeginn (5 min)

1. [Inbox](https://linear.app/propus1/inbox) öffnen → neue Issues triagieren *(Projekt + Modul + Priorität zuweisen)*
2. [Meine Issues](https://linear.app/propus1/my-issues) → was ist `In Arbeit`?
3. Wenn nichts aktiv: nächstes `Geplant`-Issue mit höchster Priorität ziehen

### Spontane Idee (während der Arbeit)

- **In Linear**: `C` drücken (egal wo) → Titel + Modul-Label → Enter → fertig
- **Mobil**: Linear-App → "+" Button
- **In Obsidian**: hier unter [[#Inbox aus Obsidian]] eintragen, später nach Linear migrieren

### Wöchentliches Review (Montag, 15 min)

- [ ] Alle Issues in `In Arbeit` durchgehen — wirklich noch aktiv?
- [ ] `In Review` checken — was kann auf `Erledigt`?
- [ ] Projekt-Prioritäten gegen [[Propus Platform - Roadmap]] abgleichen
- [ ] `last-updated`-Frontmatter dieser Notiz aktualisieren
- [ ] Wenn neue Konvention entstanden ist → unten ins [[#Changelog]]

### Nach Production-Deploy

- [ ] Gemergete PRs → zugehörige Issues auf `Erledigt`
- [ ] [[Deploy-Log]] (falls existiert) verlinken
- [ ] Wenn Bug aufgetaucht: sofort neues Issue mit `Bug`-Label + Priorität `Urgent` oder `High`

## Inbox aus Obsidian

Schnellnotizen, die noch nicht in Linear sind. Migration beim wöchentlichen Review.

> Format: `- [ ] <Idee> #modul/<modul-name>`

- [ ] *Beispiel: Galerie-Sortierung per Drag&Drop überarbeiten* #modul/galerie
- [ ] *(weitere Ideen hier eintragen)*

## Verknüpfte Notizen

- [[Propus Platform - Roadmap]] — strategische Sicht über alle Quartale
- [[Propus Platform - Architektur]] — Stack, Komponenten, Datenmodell
- [[Tour Manager - Statusmachine]] — Quelle für Tour-Manager-Issues
- [[Finanzmodul - Mahnstufen]] — Logik für Mahnstufen-Automation
- [[Email Design System]] — verbindlich für alle Mail-Issues
- [[Backpanel UI Design System]] — verbindlich für alle UI-Issues
- [[GitHub Actions - Deploy]] — manueller Trigger nach Issue-Abschluss

## Changelog

> Hier festhalten, wenn sich Konventionen, Labels oder Routinen ändern.

- **2026-05-13** — Initial-Setup. Workspace `propus1`, Team `Propus1` (PRO), 16 Labels, 4 Projekte, 5 Beispiel-Issues angelegt. GitHub-Integration noch offen.
