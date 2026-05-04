# Propus E-Mail-Design-System

Design-Tokens und Komponenten-Snippets für künftige MailerLite-Templates.
**Markenagnostisch nutzbar** — Use-Case-Templates (Auftragsbestätigung,
Liefer-Mail, Newsletter usw.) werden separat gebaut, sobald die Customer
Journey für Propus-Immobilien-Media aus dem CMS verifiziert ist.

> Hinweis: Ein früherer Versuch (PR #279, gemerged in `4ba9eb3`..`13be0ee`,
> dann via Cleanup-PR entfernt) hatte 18 Templates auf Basis eines falschen
> Geschäfts-Kontexts angelegt (Reise-/Tour-Anbieter statt Immobilien-Media).
> Dieses Dokument ist die übertragbare Substanz daraus — Farben, Typografie,
> Komponenten — ohne die fehlerhaften Use-Case-Annahmen.

---

## Farb-Tokens

```
Paper      #F4F1EA   Seitenhintergrund (warmes Off-White)
Card       #FFFFFF   Container-Innenfläche
Strip      #F7F6F3   versenkte Streifen / Detail-Boxen
Ink        #141413   Primärtext, Primär-Button
Ink-2      #3C3B38   Body-Text auf Card
Ink-3      #6B6962   Meta, Sekundärtext
Ink-4      #9A968C   Footer-Mikrotext
Border     #EAE6DD   1px Card-Rahmen
Gold-50    #FBF7EE   Akzent-Box-Hintergrund
Gold-line  #C5A073   1px Trennlinien, Unterstreichungen
Gold-600   #B68E20   Eyebrow-Caps, Hover-Border, Akzent
```

**Akzent-Logik:** Gold ist niemals Flächen-Füllung — nur Linien
(Eyebrow-Divider 70×1 px), Unterstreichungen
(`text-decoration-color: #C5A073`), Hover-Border auf primären Buttons,
Caps-Labels, schmale Akzent-Border (`border-left: 3px solid #B68E20`) auf
Info-Bändern.

## Typografie

- **Stack:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Mono:** `'JetBrains Mono', 'Courier New', Courier, monospace`
- Body 16 px / line-height 1.55–1.7
- Headline 32 px / 1.15 / `letter-spacing: -0.03em`
- H2 22–26 px / 1.3 / `-0.02em`
- Eyebrow 11 px / 600 / `letter-spacing: 0.2em` / Caps / `#B68E20`
- Meta 12–13 px / `#6B6962`
- Footer 11 px / `#9A968C`
- Ziffern: `font-variant-numeric: tabular-nums` für Preise, Daten,
  Auftrags-/Rechnungs-Nummern

## Layout-Regeln

- **Container:** 600 px Standard (transaktional, Newsletter); **560 px** für
  1:1-Mail-Optik (B2B-Outreach mit Outlook-Signatur-Look)
- **Padding:** `48px 32px` Hero-Sektionen, `24–40px 32px` zwischen Sektionen.
  Mobile (`@media (max-width: 600px)`) auf `24px` horizontal reduzieren
- **DOCTYPE:** XHTML 1.0 Transitional, `lang="de-CH"`,
  `meta charset=utf-8`, `meta viewport`, `meta color-scheme="light"`,
  `meta x-apple-disable-message-reformatting`
- **Markup:** ausschliesslich `<table role="presentation">`, keine
  Flexbox/Grid. Alle Layout-Styles **inline**. `<style>`-Block nur für
  `:hover` und `@media (max-width: 600px)`
- **Bilder:** `width="…" height="…" alt="…"` +
  `style="display:block; max-width:100%; height:auto;"`

## Wiederverwendbare Komponenten-Snippets

### Eyebrow + Gold-Linie

```html
<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size:11px; font-weight:600; letter-spacing:0.2em; text-transform:uppercase; color:#B68E20;">EYEBROW_LABEL</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 24px 0;">
  <tr><td style="width:70px; height:1px; border-top:1px solid #C5A073; font-size:0; line-height:0;">&nbsp;</td></tr>
</table>
```

### Akzent-Info-Band

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBF7EE; border-left:3px solid #B68E20;">
  <tr><td style="padding:18px 22px; font-family:'Inter',sans-serif; font-size:14px; line-height:1.6; color:#3C3B38;">CONTENT</td></tr>
</table>
```

### Section-Divider

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="border-top:1px solid #EAE6DD; height:1px; font-size:0; line-height:0;">&nbsp;</td></tr>
</table>
```

### Bulletproof-Button (mit MSO-VML-Fallback)

```html
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="HREF" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="25%" stroke="f" fillcolor="#141413">
  <w:anchorlock/>
  <center style="color:#FFFFFF;font-family:'Inter',Arial,sans-serif;font-size:15px;font-weight:600;">LABEL</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="border-radius:12px; background:#141413;">
      <a href="HREF" style="display:inline-block; padding:14px 28px; font-family:'Inter',sans-serif; font-size:15px; font-weight:600; line-height:1; color:#FFFFFF; text-decoration:none; border-radius:12px; border:1px solid #141413;">LABEL</a>
    </td>
  </tr>
</table>
<!--<![endif]-->
```

### Nummerierte Items (Gold-Mono-Nummer + Body)

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td valign="top" style="padding:0 0 16px 0; width:40px; font-family:'JetBrains Mono','Courier New',Courier,monospace; font-size:13px; font-weight:600; color:#B68E20; font-variant-numeric:tabular-nums;">01</td>
    <td valign="top" style="padding:0 0 16px 0; font-family:'Inter',sans-serif; font-size:15px; line-height:1.6; color:#3C3B38;">CONTENT</td>
  </tr>
</table>
```

### Globaler `<style>` (im `<head>`)

```html
<style>
  a:hover { text-decoration-color: #B68E20 !important; }
  .btn-primary:hover { background: #1F1F1F !important; border-color: #B68E20 !important; }
  @media (max-width: 600px) {
    .container { width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
    .h1 { font-size: 28px !important; }
  }
</style>
```

## MailerLite-Tags

- `{$name}`, `{$email}`, `{$unsubscribe}`, `{$url}` — Standard
- `{$fields.<name>}` — Custom-Fields
- Conditional: `{% if subscriber.fields.<x> %} … {% else %} … {% endif %}`
- Vor Versand klären, ob die referenzierten Custom-Fields im Account
  existieren

## Tonalität

- Schweizer Hochdeutsch, **kein ß**
- Ruhig, sachlich, Schweizer Understatement; kurze Sätze; konkrete Zahlen
  statt Superlative; keine Marketing-Floskeln; keine Emoji
- Sentence case für Headlines und Buttons; UPPERCASE nur für Eyebrow-Labels
- Sie-Form: transaktional, B2B
- Du-Form: nur bei explizit B2C-orientierten Mails

## Anti-Patterns (nie tun)

- Keine Gradienten oder Pastell-Boxen als Flächen
- Keine Emoji
- Keine grellen Status-Farben (Rot/Grün) als Button-Primärfarbe
- Kein Tracking-Pixel ausserhalb von MailerLite, keine externen Analytics,
  kein JavaScript
- Keine Dekorations-SVGs, keine Pattern-Hintergründe
- Kein Lorem Ipsum — echte deutsche Copy oder klar markierter Platzhalter
  (`UPPER_SNAKE_CASE`)

## Vor jeder neuen Template-Implementierung

1. Customer Journey aus dem CMS lesen (`website/src/pages/dienstleistungen/`,
   Service-Definitionen in `website/src/lib/cms/`) — verifizieren, welche
   Touchpoints es im Propus-Geschäft (Immobilien-Media: Bodenfotos,
   Luftaufnahmen, 360° Rundgang, Grundrisse, Video, Staging,
   Visualisierung, Retusche) tatsächlich gibt
2. MailerLite-Group-Liste prüfen (Architekten & Planer,
   Liegenschaftsverwaltungen, Makler, Bestandskunden, Interessenten,
   Kunden, Newsletter Allgemein, BKBN, LinkedIn) — Group-Namen sind der
   härteste Realitäts-Check für den Geschäfts-Kontext
3. Pro Template: Use-Case + Trigger + Anrede-Modus + Ziel-Group definieren
   **bevor** HTML geschrieben wird
4. Bei Unsicherheit über Geschäftsmodell oder Begriff (z. B. «Booking» kann
   in diesem Repo Foto-Shoot-Buchung statt Reise-Buchung bedeuten):
   zurückfragen statt annehmen
