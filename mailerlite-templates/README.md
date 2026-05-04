# Propus E-Mail-Templates

Wiederverwendbare HTML-Email-Templates für **MailerLite** (Subscribe-Flow,
Kampagnen, Automationen) und für den transaktionalen Booking-Versand
(`propus-booking-confirmation.html`, läuft via SMTP aus `app/booking`).

Alle Templates folgen dem Propus-Design-System (Farben, Typo, Layout-Regeln) –
siehe `DESIGN-SYSTEM.md` weiter unten in diesem Verzeichnis (in dieser
Lieferung als Inline-Referenz hier dokumentiert).

## Übersicht

| Template | Zweck | Anrede | Trigger |
|---|---|---|---|
| `doi-confirm.html` | Double-Opt-In-Bestätigung Newsletter | Sie | Subscriber-Add (DOI) |
| `welcome-voucher.html` | Welcome-Mail nach DOI mit 10 %-Voucher | Du | DOI bestätigt |
| `welcome-reminder.html` | Erinnerung 3 Tage nach Welcome ohne Einlösung | Du | Voucher-Field unverändert |
| `newsletter-master.html` | Modulares Master-Template Monats-Newsletter | Du | Manuell pro Ausgabe |
| `saison-kampagne.html` | Saison-Launch (Sommer/Winter), 3 Touren | Du | Manuell pro Saison |
| `last-minute.html` | Restplätze, eine Tour fokussiert, Detail-Tabelle | Du | Manuell bei < X Plätzen |
| `pre-trip-inspiration.html` | 14 Tage vor Abreise, Packliste, Treffpunkt | Du | `tour_date - 14d` |
| `post-trip-review.html` | 2 Tage nach Tour, Google-Review-CTA | Du | `tour_date + 2d` |
| `win-back.html` | 9–12 Monate nach letzter Buchung, 3 neue Touren | Du | Inaktivitäts-Segment |
| `bkbn-intro.html` | B2B-Erstkontakt BKBN-Liste, 1:1-Optik | Sie | BKBN-Import-Script |
| `bkbn-followup-case.html` | B2B-Follow-up nach 14 Tagen, Case-Karte | Sie | BKBN ohne Reply |
| `bkbn-akquise-campaign.html` | Aktive Akquise-Kampagne BKBN → Conversion | Sie | Manuell, Group "BKBN" |
| `geburtstag.html` | Geburtstags-Voucher 15 % | Du | Date-Anniversary `birthday` |
| `jahres-rueckblick.html` | Dezember-Rückblick, Stats + 3 Touren | Du | Manuell, einmal jährlich |
| `fruehbucher.html` | Sommer-Launch Januar mit Earlybird-Code | Du | Manuell, einmal jährlich |
| `re-permission.html` | DSGVO-Re-Permission nach 12 M Inaktivität | Du | Inaktivitäts-Segment |
| `abmelde-bestaetigung.html` | Bestätigungs-Mail nach Unsubscribe | Du | Unsubscribe-Event |
| `propus-booking-confirmation.html` | Transaktionale Buchungsbestätigung | Sie | Booking-Service-SMTP |

## Design-System (kurz)

**Farben** (verbindlich):

```
Paper      #F4F1EA   Seitenhintergrund
Card       #FFFFFF   Container-Innenfläche
Strip      #F7F6F3   versenkte Streifen
Ink        #141413   Primärtext, Primär-Button
Ink-2      #3C3B38   Body-Text auf Card
Ink-3      #6B6962   Meta, Sekundärtext
Ink-4      #9A968C   Footer-Mikrotext
Border     #EAE6DD   1px Card-Rahmen
Gold-50    #FBF7EE   Akzent-Box-Hintergrund
Gold-line  #C5A073   1px Trennlinien
Gold-600   #B68E20   Eyebrow-Caps, Hover-Border
```

**Typografie:**
- Stack: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Mono: `'JetBrains Mono', 'Courier New', Courier, monospace` (Codes, IDs)
- Body 16 px / 1.55–1.7 · H1 32 px / 1.15 / `-0.03em` · H2 22–26 px
- Eyebrow 11 px 600 `0.2em` Caps `#B68E20` + 70×1 px Gold-Linie
- Tabular-Nums für Preise, Daten, Nummerierungen

**Layout:**
- 600 px Container (Standard) / 560 px (B2B 1:1-Optik)
- XHTML 1.0, `lang="de-CH"`, ausschliesslich `<table role="presentation">`
- Inline-Styles, `<style>` nur für `:hover` und `@media (max-width: 600px)`
- Bulletproof-Buttons mit MSO-VML-Fallback
- Primär-Button: `#141413` bg, 12 px Radius, Hover `#1F1F1F` + Border `#B68E20`

**Tonalität:**
- Schweizer Hochdeutsch, **kein ß**.
- Ruhig, ehrlich, sachlich. Kurze Sätze. Keine Marketing-Floskeln.
- Sie-Form: transaktional, B2B. Du-Form: B2C-Newsletter.
- Keine Emoji.

## MailerLite-Tags

- `{$name}`, `{$email}`, `{$unsubscribe}`, `{$url}` — Standard.
- `{$fields.<name>}` — Custom-Fields. Im Account vorhanden / per
  Import-Script gesetzt:
  - `name`, `company` (BKBN-Import: `scripts/bkbn-import-neue-to-mailerlite.py`)
  - `voucher_code`, `birthday_code`, `birthday`
  - `tour_name`, `tour_date`, `tour_image_url` (Booking-Lifecycle-Mails)
- Conditional: `{% if subscriber.fields.<x> %} … {% else %} … {% endif %}`

## Import in MailerLite

1. MailerLite → Templates → **Create new** → **Custom HTML**.
2. HTML-Datei reinkopieren.
3. Platzhalter (siehe Kommentar am Ende jeder Datei) durch echte URLs/Texte
   ersetzen oder über Custom-Fields/Conditionals dynamisch lösen.
4. Test-Send an interne Adresse, in Outlook/Gmail/Apple-Mail prüfen.
5. Erst dann als Master speichern.

## Verwandte Repo-Stellen

- Subscribe-Flow: `website/src/pages/api/newsletter/subscribe.ts`
- Helper + Tests: `website/src/lib/newsletter.ts`, `newsletter.test.ts`
- BKBN-Import: `scripts/bkbn-import-neue-to-mailerlite.py`
- BKBN-Adjust: `scripts/bkbn-kontaktliste-mailerlite-adjust.py`
- ENV-Wiring: `docker-compose.vps.yml`, `.env.vps.example`,
  `website/.env.example`, `scripts/mailerlite.env.example`

## Anti-Patterns

- Keine Gradienten, keine Pastell-Boxen, keine Emoji.
- Kein Tracking-Pixel, keine externen Analytics, kein JavaScript.
- Keine grellen Status-Farben (Rot/Grün) als Button-Primär.
- Kein Lorem Ipsum — echte Copy oder klar markierte
  `UPPER_SNAKE_CASE`-Platzhalter.
