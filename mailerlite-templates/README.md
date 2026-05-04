# Propus E-Mail-Templates

**Status: in Vorbereitung — keine produktiven Templates vorhanden.**

Aktueller Inhalt:

- `DESIGN-SYSTEM.md` — Farb-Tokens, Typografie-Skala, Komponenten-Snippets
  und Tonalitäts-Regeln. Markenagnostisch nutzbar als Referenz.

## Geplante nächste Schritte

Konkrete HTML-Templates pro Use-Case folgen, nachdem die Customer Journey
aus dem CMS verifiziert ist (siehe Checkliste am Ende von
`DESIGN-SYSTEM.md`). Wahrscheinlicher Use-Case-Stack für
Immobilien-Media-Geschäft (zur Diskussion, nicht festgeschrieben):

- Auftragsbestätigung nach Shoot-Buchung (Sie-Form, Asset-Liste,
  Termin-Block)
- Termin-Erinnerung 1–2 Tage vor Shoot (Treffpunkt, Vorbereitungs-Hinweise)
- Liefer-Mail nach Asset-Aufbereitung (Download-Link, Vorschaubild,
  Nutzungs-Hinweise)
- Nachfass-/Review-Mail nach Lieferung (Google-Review oder direktes
  Feedback)
- Newsletter mit Referenz-Objekten und Branchen-Cases (eine Variante pro
  Zielgruppe — Architekten & Planer, Liegenschaftsverwaltungen, Makler)
- B2B-Akquise-Mails pro Zielgruppe (Sie-Form, 1:1-Optik, Outlook-Signatur)
- Re-Permission / Abmelde-Bestätigung (System)

## Verwandte Repo-Stellen

- Subscribe-Flow: `website/src/pages/api/newsletter/subscribe.ts`
- Helper + Tests: `website/src/lib/newsletter.ts`,
  `website/src/lib/newsletter.test.ts`
- ENV-Wiring: `docker-compose.vps.yml`, `.env.vps.example`,
  `website/.env.example`, `scripts/mailerlite.env.example`
- BKBN-Skripte: `scripts/bkbn-import-neue-to-mailerlite.py`,
  `scripts/bkbn-kontaktliste-mailerlite-adjust.py`
