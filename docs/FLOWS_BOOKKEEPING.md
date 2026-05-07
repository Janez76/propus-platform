# FLOWS_BOOKKEEPING

Buchhaltungs-Pipeline (Block 4 — `propus-bookkeeper`). End-to-End-Flow von Beleg-Scan → Paperless → KI-Cascade → manuelle Approval → bexio-Push.

> **Stack-Source-of-Truth:**
> - Bookkeeper-Service-Code: `Y:\Arhive\propus-bookkeeper\` (separater Repo, nicht in propus-platform)
> - Paperless-Stack: `Y:\Arhive\Paperless\` (siehe `docs/BUCHHALTUNG-PIPELINE.md` dort)
> - Setup-Anleitung: `propus-platform/PAPERLESS_BUCHHALTUNG_SETUP.md`

---

## 1. Beleg-Eingang

| Quelle | Pfad/Mechanismus |
|---|---|
| Drucker-Scan | SMB-Share `\\192.168.1.5\paperless-buchhaltung` → `/volume1/scanpropus/buchhaltung-propus/` |
| iOS-Shortcut | dito (Foto → PDF → SMB-Upload) |
| Mail-Anhang `belege@propus.ch` | (geplant Block 4-Erweiterung via MS Graph) |

Paperless konsumiert rekursiv, Workflow `Buchhaltung Auto-Tag` (id=2) tagged automatisch:
- Tags: `buchhaltung` (475), `Propus` (470), `verbuchung-pending` (476)
- Document Type: `Buchhaltungsbeleg` (681)
- Storage Path: `Buchhaltung/{Jahr}/{Monat}/{Korrespondent}/{Doctype}_{Title}` (1)
- Custom Fields default: `verbuchungs_status=pending`, `waehrung=CHF`, `confidence=0`
- Permissions: nur Admin + `bookkeeper-service` (id=6) — `paperless-ai-bot` (7) und `paperless-gpt-bot` (8) sehen Buchhaltungsbelege NICHT (Datenschutz für die KI-Pipelines).

---

## 2. KI-Cascade (Container `propus-bookkeeper`, NAS)

Container pollt alle 60s nach `tags__id__all=475,476` (= buchhaltung + pending).

**Architektur (Variante B, Stand 2026-05-05):**

```
Sonnet 4.6 (combined classify+extract in 1 Call)
    │
    ├─ confidence ≥ 95 + alle Pflichtfelder    → write-back, Tag-Swap pending→vorgeschlagen
    │
    └─ confidence < 95 ODER Pflichtfeld fehlt  → Opus 4.7 mit adaptive Thinking
                                                 │
                                                 ├─ confidence ≥ 70                    → write-back
                                                 │
                                                 └─ confidence < 70 + PDF verfügbar    → Vision-Cross-Check
                                                                                          (Sonnet mit PDF direkt)
                                                                                          → wähle besseres Resultat
```

**Vision-Fallback** (Pre-Cascade): wenn OCR-Text < 300 Zeichen → direkt Vision (überspringt Sonnet-Text-Pfad).

**Routing nach Klassifikation:**
- `is_buchhaltungsbeleg=true` → Cascade extrahiert, Tag `verbuchung-vorgeschlagen` (477)
- `is_buchhaltungsbeleg=false, is_geschaeftsdokument=true` → `release_to_general` (alle Buchhaltungs-Tags entfernt, paperless-ai-Pipeline übernimmt)
- `is_buchhaltungsbeleg=false, is_privatpost=true` → Tag `Privat` (469), Permissions geöffnet
- sonst → Tag `verbuchung-spam` (482)
- Belegart `bankauszug` → Sonderpfad `mark_abgleich` → Tag `verbuchung-abgleich` (483), kein bexio-Push

**Duplikat-Detection:** nach erfolgreicher Extraktion läuft `find_related()` — gleicher Lieferant + gleiche Beleg-Nr ODER identischer Betrag innerhalb 90 Tagen → Tag `duplikat-pruefen` (484), Notiz mit verwandten Doc-IDs.

---

## 3. Manuelle Approval (Admin-UI in propus-platform)

URL: <https://admin-booking.propus.ch/admin/finance/bookkeeper>

Backend-Proxy (Express): `booking/bookkeeper-routes.js` mit `requireAdmin`. Nutzt `PAPERLESS_BOOKKEEPER_URL` + `PAPERLESS_BOOKKEEPER_TOKEN` (in `.env.vps` auf dem VPS — single source of truth).

**Endpoint-Übersicht:**

| Endpoint | Zweck |
|---|---|
| `GET /api/admin/bookkeeper/counts` | Status-Counts pro Stage |
| `GET /api/admin/bookkeeper/documents?status=…&min_confidence=…` | Liste-View pro Tab + Confidence-Filter |
| `GET /api/admin/bookkeeper/documents/:id` | Detail (Paperless-Passthrough) |
| `PATCH /api/admin/bookkeeper/documents/:id` | Inline-Edit Custom Fields (Backend merged automatisch — Paperless PATCH ist sonst Replace) |
| `DELETE /api/admin/bookkeeper/documents/:id?also_bexio=1` | Paperless-Trash + optional bexio-Storno |
| `POST /api/admin/bookkeeper/documents/:id/approve` | Tag-Swap vorgeschlagen → approved |
| `POST /api/admin/bookkeeper/documents/:id/reject` | → pending (Re-Cascade) |
| `POST /api/admin/bookkeeper/documents/:id/spam` | → spam |
| `GET /api/admin/bookkeeper/preflight/:id` | Pre-Flight-Check vor bexio-Push (Konten-Existenz, MwSt-Schema) |
| `POST /api/admin/bookkeeper/feedback` | User-Korrektur in `core.bookkeeper_feedback` (KI-Training) |
| `GET /api/admin/bookkeeper/feedback` | Feedback-Liste (Audit + Training-Tab in UI) |
| `POST /api/admin/bookkeeper/recascade` | Bulk-Re-Cascade aller Belege eines Status |

OpenAPI-Dokumentation: [`docs/openapi/openapi.yaml`](openapi/openapi.yaml) (Tag `bookkeeper`).

**UI-Flow:**

1. User landet auf der Übersichts-Page mit Status-Counts.
2. Klickt Tab „Approval-Queue" (Tag `vorgeschlagen`).
3. Sieht Liste mit Datum, Lieferant, Betrag, Soll/Haben, Confidence-Badge (grün ≥85, gelb 70–84, rot <70).
4. Optional: Inline-Edit (Edit-Icon) öffnet Form-Grid mit allen Custom Fields → Save-Button patcht Paperless + persistiert Korrektur als Training-Sample.
5. Bei korrekter Extraktion: 1-Klick-Approve (Tag-Swap → approved). Bulk-Approve via Checkboxen.
6. Bei falscher Klassifikation: Re-Cascade-Button (zurück auf pending) ODER Spam-Tag.
7. Bei Doppel-Beleg: Delete (Trash) bzw. Delete + bexio-Storno (nur bei verbucht).

---

## 4. bexio-Push (Container, alle 60s)

Container pollt zusätzlich `tags__id__all=475,478` (approved). Für jeden:

1. **Pflichtfeld-Check** — datum/betrag/soll/haben/lieferant müssen vorhanden sein, sonst Pipeline-Exception → Tag `verbuchung-fehler`.
2. **Payload-Build** (`booking/bookkeeper-routes.js`-Helper + Container-Code):
   - `type: manual_single_entry`
   - `date: <belegdatum>`
   - `reference_nr: PL-<paperless_doc_id>`
   - `entries[]`: pro mwst_aufteilung-Position eigene Buchung mit `debit_account` (= mwst_position.konto fallback ext.soll_konto), `credit_account` (= ext.haben_konto), `tax_id` aus `_PRE_TAX_VM`/`_PRE_TAX_VB`-Map (siehe `src/bexio.py`), `amount = netto + mwst`.
3. **POST** `https://api.bexio.com/3.0/accounting/manual_entries`
4. **Response-Buchungs-ID** wird in Custom Field `bexio_buchungs_id` (14) geschrieben.
5. **Tag-Swap** approved → verbucht (479).

**Bexio-Konten-Konvention** (verifiziert aus dem Propus-Mandanten):
- `1021` UBS Geschäftskonto (Hauptkonto) — NICHT 1020 (Default „Muster Bank")
- `1022` UBS Online Shop (manuell anzulegen — bexio-API blockt Account-Creation)
- `1500–1530` Anlagenklasse mit konkreten Geschäftsfahrzeugen (`1511` Jeep ZG 75 001, `1512` VW Polo ZG 108 013)
- `6571–6573` für SaaS / Cloud / KI-Services (statt eines pauschalen 6500)
- `6650` Repräsentation (statt 6470 — existiert nicht)
- `8900` Direkte Steuern Bund + Kanton Zug

**Vorsteuer-IDs** (Schweizer MwSt, Stand 2026):
- VM81 (id=21) / VM26 (id=20) — Material/Aufwand-Konten 4xxx-6xxx
- VB81 (id=24) / VB26 (id=23) — Investitions-Konten 1xxx
- V00 (id=7) — befreit
- Auswahl per `_tax_rate_to_id(satz, soll_konto)` automatisch.

**DRY_RUN** (`BOOKKEEPER_DRY_RUN=true` Default): Container loggt den Payload, schreibt in `notiz_ai` ein „[approved-dryrun]"-Hinweis, aber pusht NICHT nach bexio. Erst nach Setzen auf `false` werden echte Buchungen erzeugt.

---

## 5. Self-Learning

`Y:\Arhive\propus-bookkeeper\scripts\generate_few_shot.py` (idempotent, Cron-fähig):

**Input-Quellen:**
1. `core.bookkeeper_feedback` (DB-Tabelle, Migration 060) — User-Korrekturen via Inline-Edit
2. Historische `verbucht`/`approved`-Belege aus Paperless — pro Lieferant das häufigste soll/haben-Mapping

**Output:**
- Schreibt zwei Marker-Blocks in `prompts/extractor.txt`:
  - `<!-- SUPPLIER-MEMORY START/END -->` mit „Bekannte Lieferanten"-Tabelle (Mapping aus 60+ Approvals)
  - `<!-- FEW-SHOT-BLOCK START/END -->` mit Korrektur-Lerntag

**Empfohlener Cron** (auf NAS):
```cron
0 4 * * * cd /volume1/docker/propus-bookkeeper && /usr/bin/python3 scripts/generate_few_shot.py && /usr/bin/docker compose up -d --build
```

---

## 6. Status-Tags Quick-Reference

| Tag | ID | Beschreibung |
|---|---|---|
| `buchhaltung` | 475 | Marker — Pipeline-Mitglied |
| `Propus` | 470 | Propus-GmbH-Bezug |
| `verbuchung-pending` | 476 | Cascade-Queue |
| `verbuchung-vorgeschlagen` | 477 | KI fertig, wartet auf Approval |
| `verbuchung-approved` | 478 | freigegeben für bexio-Push |
| `verbuchung-verbucht` | 479 | erfolgreich in bexio |
| `verbuchung-fehler` | 480 | Pipeline-Crash (manuell prüfen) |
| `verbuchung-privat` | 481 | Privatentnahme (gemischter Beleg) |
| `verbuchung-spam` | 482 | Werbung / kein Beleg |
| `verbuchung-abgleich` | 483 | Bankauszug — nur Referenz, kein Push |
| `duplikat-pruefen` | 484 | KI hat Duplikat-Verdacht |
| `Privat` | 469 | Privatpost (nicht Propus-bezogen, an Mitarbeiter) |

---

## 7. Querverweise

- Setup-Anleitung: [PAPERLESS_BUCHHALTUNG_SETUP.md](../PAPERLESS_BUCHHALTUNG_SETUP.md)
- Ablage-Konventionen: [Y:\Arhive\Paperless\docs\ABLAGE-CHECKLIST.md](file:///Y:/Arhive/Paperless/docs/ABLAGE-CHECKLIST.md)
- Stack-Delta für Paperless: [Y:\Arhive\Paperless\docs\BUCHHALTUNG-PIPELINE.md](file:///Y:/Arhive/Paperless/docs/BUCHHALTUNG-PIPELINE.md)
- OpenAPI: [openapi.yaml#bookkeeper](openapi/openapi.yaml)

## Changelog

| Datum | Änderung |
|---|---|
| 2026-05-06 | Slug `lieferantenrechnung` → `lief_rechnung` umbenannt — Paperless `value_select` ist varchar(16), Original-Slug (19 Zeichen) crashte in 136/159 Cascade-Calls auf HTTP 500 (`StringDataRightTruncation`). Fix: Schema-PATCH auf Custom Field 2 (Label bleibt „Lieferantenrechnung"), Bookkeeper-Code/Prompts angepasst, 174 `fehler`-Belege per bulk_edit zurück auf `pending` gestellt. Self-Healing-Alias im Bookkeeper fängt LLM-Antworten mit altem Slug ab. |
| 2026-05-05 | Erste Version — End-to-End-Pipeline live, Variante B (Sonnet→Opus), Threshold 95, Vision-Cross-Check, Self-Learning, Admin-UI, 11 Backend-Endpoints, OpenAPI-Doku |
