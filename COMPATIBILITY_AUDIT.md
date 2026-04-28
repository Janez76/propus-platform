# Plattform-Kompatibilität & Kontrast — Audit (Phase 1)

**Branch:** `claude/audit-platform-compatibility-mCdJt`
**Status:** Phase 1 abgeschlossen — keine Code-Änderungen vorgenommen.
**Nächster Schritt:** Auf Freigabe des Users warten, dann Phase 2 (Fixes) ausführen.

---

## 1. Zusammenfassung

| Schweregrad | Anzahl |
|---|---:|
| **BLOCKER** | 16 |
| **WARNING** | 8 |
| **INFO / OK** | 18 |

**Kategorienverteilung der Blocker:**

| Kategorie | Blocker |
|---|---:|
| Farbkontrast (WCAG AA) | 10 |
| Schriften (Webfont-Lieferung) | 2 |
| E-Mail-Kompatibilität (Outlook/Gmail) | 4 |

**Kritischste Befunde:**

1. `propus-email.css` ist in seiner aktuellen Form **nicht E-Mail-tauglich** (CSS-Variablen, Flexbox, `@import`, `position: fixed`) — funktioniert nur als Browser-Preview, würde in Outlook/Gmail komplett zerbrechen.
2. Gold `#B68E20` erreicht auf hellen Hintergründen **nirgends** WCAG AA für Body-Text und nur teilweise für Großtext.
3. Sekundär-Text-Farben (`#aaaaaa`, `#bbbbbb`, `#cccccc`, `#9ca3af`) sind durchgehend zu hell.

---

## 2. Inventar der gescannten Dateien

| Datei | Typ | Befunde |
|---|---|---:|
| `booking/templates/emails.js` | E-Mail-Generator (JS) | 3 |
| `booking/templates/propus-email.css` | E-Mail CSS (Preview) | 5 |
| `booking/admin.html` | Web-App HTML | 4 |
| `booking/verify-email.html` | Web-App HTML | 2 |
| `booking/anleitung.html` | Web-App HTML | 2 |
| `booking/docker-nginx-fallback-index.html` | Fallback HTML | 0 |
| `infra/cloudflare-502.html` | Error Page | 0 |
| `tours/lib/renewal-invoice-pdf.js` | PDF-Generator (PDFKit) | 0 |
| `tours/views/customer/cleanup-action.ejs` | EJS-Template | 0 |
| `tours/views/customer/cleanup-error.ejs` | EJS-Template | 0 |
| `tours/views/customer/thank-you-yes.ejs` | EJS-Template | 0 |
| `tours/views/customer/thank-you-no.ejs` | EJS-Template | 0 |
| `tours/views/customer/error.ejs` | EJS-Template | 0 |
| `app/src/index.css` | Theme Tokens | 4 |
| `app/src/app/globals.css` | Next.js Global CSS | 2 |
| `app/src/styles/handoff/*.css` | Admin-UI CSS | 3 |
| `app/src/lib/selekto/emailPreviewShell.ts` | E-Mail-Preview iframe | 1 |
| `website/src/styles/global.css` | Astro Website CSS | 0 |
| `website-propus-codestudio/src/styles/global.css` | Codestudio CSS | 0 |

**Nicht gefunden:** DOCX-Generator (kein `python-docx` / `docxtpl` im Repo).

---

## 3. SCHRIFTEN

### Befunde

| Datei | Schwere | Befund | Fix-Vorschlag |
|---|---|---|---|
| `booking/admin.html` | **BLOCKER** | Manrope via Google Fonts CDN, Fallback nur `'Inter', system-ui` — `Inter` ist kein Systemfont. Bei CDN-Ausfall bleibt nur `system-ui`. Kein `Arial`/`Helvetica` als finaler Fallback. | Stack erweitern: `Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Optional: Manrope self-hosten. |
| `booking/templates/propus-email.css` | **BLOCKER** | `@import url("https://fonts.googleapis.com/...")` für Montserrat + Roboto. Heading-Fallback nur `sans-serif`. | `@import` aus E-Mail-CSS entfernen — wird von Gmail/Outlook gestrippt. Auf System-Stack umstellen oder Webfont per `<link>` im `<head>` mit vollem System-Fallback. |
| `app/src/lib/selekto/emailPreviewShell.ts` | WARNING | Inter via Google Fonts CDN in iframe-Vorschau. Inkonsistent mit dem self-hosted Inter im Rest des Projekts. | Auf `@fontsource/inter` aus dem Bundle umstellen. |
| `booking/templates/emails.js` | **OK** | Reiner System-Stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`. | — |
| `tours/lib/renewal-invoice-pdf.js` | **OK** | PDFKit `Helvetica` / `Helvetica-Bold` (Standard-PDF-Font, immer eingebettet). | — |
| `website/src/styles/global.css` | **OK** | Inter self-hosted via `@font-face`, alle benötigten Weights. | — |
| `website-propus-codestudio/src/styles/global.css` | **OK** | `@fontsource/inter` als NPM-Bundle. | — |
| `tours/views/customer/*.ejs` | **OK** | `system-ui, -apple-system, sans-serif`. | — |
| `infra/cloudflare-502.html` | **OK** | Vollständiger System-Stack. | — |

### Zusammenfassung Schriften

- **2 Blocker** betreffen Auslieferungswege (CDN, `@import`) — beide leicht behebbar.
- Print- und PDF-Pfad ist sauber (PDFKit-Standard-Fonts).
- Self-hosted Inter im Website-Bereich ist vorbildlich.

---

## 4. FARBKONTRAST (WCAG 2.1 AA)

**Schwellen:** Body-Text ≥ 4.5:1, Großtext (≥ 18 pt oder ≥ 14 pt bold) ≥ 3:1.

### Vollständige Kontrast-Tabelle

| # | Vordergrund | Hex | Hintergrund | Hex | Ratio | Body | Large | Schwere |
|---|---|---|---|---|---:|:---:|:---:|:---:|
| C01 | Gold (App light) | `#B68E20` | Paper | `#F4F1EA` | 2.57:1 | ❌ | ❌ | **BLOCKER** |
| C02 | Gold (App light) | `#B68E20` | White | `#FFFFFF` | 2.90:1 | ❌ | ❌ | **BLOCKER** |
| C03 | White (CTA-Text) | `#FFFFFF` | Gold `#B68E20` | — | 2.90:1 | ❌ | ❌ | **BLOCKER** |
| C04 | text-label | `#aaaaaa` | White | `#FFFFFF` | 2.42:1 | ❌ | ❌ | **BLOCKER** |
| C05 | text-sublabel | `#bbbbbb` | White | `#FFFFFF` | 1.90:1 | ❌ | ❌ | **BLOCKER** |
| C06 | text-fine | `#cccccc` | White | `#FFFFFF` | 1.61:1 | ❌ | ❌ | **BLOCKER** |
| C07 | footer-text (email) | `#aaaaaa` | Footer-BG | `#F7F6F3` | 2.18:1 | ❌ | ❌ | **BLOCKER** |
| C08 | Email-Footer | `#9ca3af` | `#fafaf9` | — | 2.40:1 | ❌ | ❌ | **BLOCKER** |
| C09 | Eyebrow `rgba(255,255,255,0.85)` | — | Gradient-Header `~#9e8649` | — | ~2.9:1 | ❌ | ❌ | **BLOCKER** |
| C10 | ink-4 / subtle | `#9A968C` | Paper `#F4F1EA` | — | 2.65:1 | ❌ | ❌ | **BLOCKER** |
| C11 | Gold (Booking) | `#9e8649` | bg-page `#f4f1e8` | — | 3.11:1 | ❌ | ✅ | WARNING |
| C12 | Gold (Booking) | `#9e8649` | White | `#FFFFFF` | 3.53:1 | ❌ | ✅ | WARNING |
| C13 | White (Btn-Text) | `#FFFFFF` | Gold `#9e8649` | — | 3.53:1 | ❌ | ✅ | WARNING |
| C14 | text-muted (email) | `#8a8680` | bg-page `#F1F2EA` | — | 3.14:1 | ❌ | ✅ | WARNING |
| C15 | gold-text | `#7a6520` | White | `#FFFFFF` | 5.64:1 | ✅ | ✅ | OK |
| C16 | gold-label | `#8a7418` | White | `#FFFFFF` | 4.52:1 | ✅ | ✅ | OK |
| C17 | Email Body Text | `#6b7280` | White | `#FFFFFF` | 4.90:1 | ✅ | ✅ | OK |
| C18 | Email H1 | `#1f2937` | White | `#FFFFFF` | ~14:1 | ✅ | ✅ | OK |
| C19 | Gold PDF | `#B68E20` | Dark Header `#1C1C1C` | — | 5.84:1 | ✅ | ✅ | OK |
| C20 | Gold dark-mode | `#C9A22A` | Dark BG `#0F1012` | — | 8.14:1 | ✅ | ✅ | OK |
| C21 | Ink | `#141413` | Paper `#F4F1EA` | — | 16.4:1 | ✅ | ✅ | OK |

**Bilanz:** 10 Blocker · 4 Warnings · 7 OK.

### Muster

- **Gold `#B68E20` auf hell** ist die Wurzel von 5 Blockern (C01–C03 + indirekt C09). Auf dunklem Hintergrund (C19, C20) funktioniert das gleiche Gold problemlos.
- **Graustufen-Sekundärtext** (`#aaa`, `#bbb`, `#ccc`, `#9ca3af`) ist durchgehend zu hell — typisches "ästhetisch zurückhaltend, aber unlesbar".
- Die Variante `#7a6520` / `#8a7418` zeigt, dass dunkleres Gold WCAG AA erfüllen kann, ohne die Brand zu verlieren.

---

## 5. LAYOUT

| Datei | Zeile | Schwere | Befund | Fix-Vorschlag |
|---|---:|---|---|---|
| `booking/templates/propus-email.css` | 69 | **BLOCKER (E-Mail)** | `position: fixed` auf `.theme-toggle` — in E-Mail-Clients vollständig unsupported. | Theme-Toggle nur in Browser-Preview rendern (mit Wrapper-Klasse), aus E-Mail-Output entfernen. |
| `booking/admin.html` | 370, 376 | WARNING | Zwei identische `@media print` Blöcke, redundant. Kein `page-break-inside: avoid` auf Karten/Tabellenzeilen. | Blöcke zusammenführen, `break-inside: avoid` auf relevante Container. |
| `booking/verify-email.html` | div. | WARNING | `max-height: calc(100vh - …)` und `max-width: min(280px, 82vw)` in Modals. Für Web OK, aber Print/PDF nutzt Browser-Viewport. | Print-Stylesheet mit festen Maßen ergänzen oder `@media print` Override. |
| `booking/anleitung.html` | 3420 | WARNING | `font-size: clamp(2.4rem, 5.5vw, 4.2rem)` — viewport-abhängige Schriftgröße. | Für Print-Output viewport-Units durch feste rem-/pt-Werte überschreiben. |
| `booking/admin.html` | — | INFO | Print-CSS korrekt mit `@page { size: A4 }`, system-safe Font `Arial`. | — |
| `tours/lib/renewal-invoice-pdf.js` | — | INFO | Feste A4-Seite, keine viewport-Units, PDFKit. | — |
| `booking/templates/propus-email.css` | — | INFO | Kein `@page`, kein `page-break` — für E-Mail OK, als Print-Referenz unvollständig. | Optional separate Print-Variante. |

---

## 6. PLATTFORM-KONSISTENZ

### HTML-Grundlagen

| Prüfung | Status |
|---|:---:|
| DOCTYPE html5 in allen 5 HTML-Dateien | ✅ |
| `charset="UTF-8"` | ✅ |
| `viewport` Meta | ✅ |
| `color-scheme` Meta in `admin.html`, `verify-email.html`, `anleitung.html` | ❌ fehlt |
| EJS-Templates: DOCTYPE / charset / viewport | ✅ |

**Fix:** `<meta name="color-scheme" content="light dark">` in den drei Booking-HTMLs ergänzen — sonst kann iOS den Dark-Mode falsch umschalten.

### E-Mail (`emails.js` generierte Mails)

| Prüfung | Status | Anmerkung |
|---|:---:|---|
| Tabellen-Layout als äußere Struktur | ✅ | |
| max-width 600px | ✅ | |
| Inline CSS | ✅ | |
| `x-apple-disable-message-reformatting` | ✅ | |
| MSO-Conditionals (`<!--[if mso]>`) | ❌ | **BLOCKER** — `border-radius: 16px` auf äußerer Tabelle wird in Outlook ignoriert (kosmetische Degradation). |
| `box-shadow` auf Tabelle | ⚠️ | **BLOCKER** — Outlook ignoriert (kosmetisch). |
| `linear-gradient` Header-Hintergrund | ⚠️ | WARNING — Outlook fällt auf erste Stop-Farbe zurück; kein `bgcolor`-Fallback gesetzt. |
| Bilder im E-Mail-HTML | ✅ | Keine vorhanden — keine CID/Pfad-Probleme. |

### `propus-email.css` (E-Mail-Preview-Template)

| Prüfung | Status | Anmerkung |
|---|:---:|---|
| CSS `var(--…)` Custom Properties | ❌ | **BLOCKER** — Outlook 2007–2019 unterstützt keine CSS-Variablen → kompletter Style-Ausfall. |
| `display: flex` an 8+ Stellen | ❌ | **BLOCKER** — Outlook bricht Layout. |
| `@import url(Google Fonts)` | ❌ | **BLOCKER** — wird von Gmail/Outlook gestrippt. |
| `@media (prefers-color-scheme: dark)` | ✅ | Vorhanden. |
| `.dark-mode` Klasse | ✅ | Vorhanden. |

**Empfehlung:** `propus-email.css` ist als Browser-Preview-Stylesheet zu behandeln, **nicht** als E-Mail-Template. Der versendbare HTML-Inhalt muss aus `emails.js` (oder einem MJML-Build) kommen.

### PDF (`renewal-invoice-pdf.js`)

| Prüfung | Status |
|---|:---:|
| PDFKit mit Helvetica/Helvetica-Bold (Standard-PDF-Fonts) | ✅ |
| Feste A4-Seitengröße | ✅ |
| Kein externes CSS, keine viewport-Units | ✅ |
| Kein SVG mit externen Referenzen | ✅ |
| SwissQRBill mit `fontName: 'Helvetica'` | ✅ |

### DOCX

Nicht zutreffend — kein DOCX-Generator im Repo gefunden.

---

## 7. PLATTFORM-SPEZIFISCHE FALLEN

### Outlook (Desktop, Windows)

- `emails.js`: kein VML-Fallback für `border-radius` → runde Ecken fallen weg (akzeptabel).
- `emails.js`: kein `bgcolor`-Attribut-Fallback für Gradient-Header → wird zum ersten Gradient-Stop (akzeptable Degradation, ungetestet).
- `propus-email.css`: Flex / CSS-Vars / `@import` → fataler Layout-Bruch, sobald direkt in Outlook geöffnet.

### iOS Mail

- `emails.js`: `x-apple-disable-message-reformatting` vorhanden ✅
- `propus-email.css`: `@media (prefers-color-scheme: dark)` vorhanden ✅
- `booking/admin.html`, `verify-email.html`, `anleitung.html`: kein `<meta name="color-scheme">` → iOS kann Dark-Mode falsch umschalten.

### Gmail Mobile

- `emails.js`: max-width 600px ✅, kein `<style>` im `<head>` (alle inline) ✅
- `propus-email.css`: `<style>` im Head ohne Inline-Backup → Gmail Mobile kann den Style ignorieren.

### Adobe Acrobat / PDF-Renderer

- `renewal-invoice-pdf.js`: kein CSS3 verwendet (PDFKit direkt) ✅
- Kein `gap`, kein `aspect-ratio` im PDF-Pfad ✅

### Windows vs Mac

- `booking/admin.html`: Manrope-Fallback `'Inter', system-ui, -apple-system` — `-apple-system` ist Mac-only; auf Windows greift `system-ui` (Segoe UI). Kein expliziter `Arial`-Fallback. Minor.
- `verify-email.html`, `anleitung.html`: `-apple-system, Segoe UI, Roboto, Helvetica, Arial` → korrekte plattformübergreifende Reihenfolge ✅

---

## 8. Fix-Vorschläge für Phase 2

### Kontrast — nahe Brand-Werte

| Problem | Vorschlag | Neue Ratio |
|---|---|---:|
| Gold `#B68E20` auf Hell (Body-Text) | Auf `#7A5E10` abdunkeln | 5.0:1 auf Paper ✅ |
| Weißer Text auf Gold-Buttons | Stattdessen `#1C1B18` (Ink) auf Gold-BG | 4.7:1 auf `#B68E20` ✅ |
| `#aaaaaa` Sekundärtext | Auf `#767676` abdunkeln | 4.54:1 auf Weiß ✅ |
| `#9ca3af` E-Mail-Footer | Auf `#6b7280` abdunkeln | 4.90:1 auf Weiß ✅ |
| `#bbbbbb`, `#cccccc` Mikrotext | Mindestens `#767676`, oder Verwendung auf Großtext einschränken | 4.54:1 ✅ |

### E-Mail

- MSO-Conditionals für `border-radius` ergänzen (oder akzeptieren, dass Outlook eckig rendert).
- `bgcolor`-Attribut auf der Header-`<td>` als Fallback für den Gradient setzen.
- `propus-email.css` klar als Preview-Stylesheet kennzeichnen, nicht als versendbares Template behandeln.

### HTML-Grundlagen

- `<meta name="color-scheme" content="light dark">` in den drei Booking-HTMLs ergänzen.

### Schriften

- `booking/admin.html`: Fallback-Stack erweitern (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`).
- `propus-email.css`: `@import` entfernen, Fonts via `<link>` im `<head>` oder System-Stack.
- `emailPreviewShell.ts`: auf `@fontsource/inter` umstellen.

---

## 9. Verifikation

- Phase 1 hat **keine Code-Änderungen** vorgenommen — keine Tests notwendig.
- Diese Audit-Datei wird per `git diff` reviewt.
- Nach Commit: PR auf Branch `claude/audit-platform-compatibility-mCdJt` erstellen.

---

## 10. Freigabe-Anfrage

**Phase 2 wartet auf explizites "Go".**

Empfohlene Reihenfolge:
1. Schriften (kleine, isolierte Änderungen)
2. Kontrast (Token-Anpassungen in `app/src/index.css`, `globals.css`, `propus-email.css`, `emails.js`)
3. Layout (Print-Stylesheets, `position: fixed` aus E-Mail entfernen)
4. Plattform-Hardening (MSO-Conditionals, `color-scheme` Meta)

Pro Schritt einzelner Commit mit aussagekräftiger Message; abschließend `FIXES_APPLIED.md` als Änderungsprotokoll.
