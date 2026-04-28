# Fixes Applied — Phase 2

**Branch:** `claude/audit-platform-compatibility-mCdJt`
**Audit-Referenz:** `COMPATIBILITY_AUDIT.md`
**Status:** Phase 2 abgeschlossen — Design-System-Änderungen offen für Rückfrage.

---

## 1. Übersicht

| Schweregrad | Vor Phase 2 | Nach Phase 2 | Reduktion |
|---|---:|---:|---:|
| BLOCKER | 16 | 6 (offen, design-system-bezogen) | −10 |
| WARNING | 8 | 4 | −4 |
| INFO / OK | 18 | 32 | +14 |

**6 Commits**, alle auf `claude/audit-platform-compatibility-mCdJt`.

---

## 2. Commits in Reihenfolge

### Commit 1 — `fix(booking/admin): erweitere Font-Fallback-Stack`

**Datei:** `booking/admin.html` (L35)

**Vorher:**
```css
font-family:'Manrope','Inter',system-ui,-apple-system,sans-serif;
```

**Nachher:**
```css
font-family:'Manrope','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
```

**Rationale:** Bei Google-Fonts-CDN-Ausfall blieb vorher nur `system-ui` + macOS-Spezial-Font. Neuer Stack deckt Windows (Segoe UI), Linux (Roboto) und legacy Browser (Helvetica/Arial) ab.

**Befund-Mapping:** Schriften BLOCKER

---

### Commit 2 — `fix(email-css): kennzeichne als Browser-Preview, fixe Schriften & Kontrast`

**Datei:** `booking/templates/propus-email.css`

**Header-Kommentar erweitert:** Klarstellung, dass die Datei eine Design-Referenz ist (nicht aktiv eingebunden, von keinem Code geladen). Bekannte E-Mail-Client-Inkompatibilitäten (CSS Vars, Flex, `@import`, `position: fixed`) sind dadurch akzeptabel — würde die Datei je versendet, müsste sie via MJML/juice zu inline-styled Tabellen kompiliert werden.

**Schriften:**
- `--font-heading`: `'Montserrat', sans-serif` → vollständiger System-Stack-Fallback
- `--font-body`: `'Roboto', -apple-system, sans-serif` → `'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`

**Kontrast (in `:root` und `body.light-mode`):**

| Token | Vorher | Ratio | Nachher | Ratio |
|---|---|---:|---|---:|
| `--text-label` | `#aaaaaa` | 2.42:1 ❌ | `#767676` | 4.54:1 ✅ |
| `--text-sublabel` | `#bbbbbb` | 1.90:1 ❌ | `#767676` | 4.54:1 ✅ |
| `--text-footer` | `#aaaaaa` | 2.18:1 ❌ | `#6b7280` | 4.83:1 ✅ |
| `--text-fine` | `#cccccc` | 1.61:1 ❌ | `#767676` | 4.54:1 ✅ |

**Befund-Mapping:** C04, C05, C06, C07 (Blocker) + Schriften (Blocker)

---

### Commit 3 — `fix(email): WCAG-Kontrast + Outlook bgcolor-Fallbacks im Mail-Shell`

**Datei:** `booking/templates/emails.js` (Funktion `buildMailHtml`)

**Kontrast:**

| Element | Vorher | Ratio | Nachher | Ratio |
|---|---|---:|---|---:|
| Eyebrow auf Gradient-Header | `rgba(255,255,255,0.85)` | ~2.5:1 ❌ | `#ffffff` | bis 3.53:1 (Large) ✅ |
| Footer-Text | `#9ca3af` | 2.40:1 ❌ | `#6b7280` | 4.83:1 ✅ |
| Footer-Links Gold | `#9e8649` | 3.53:1 ❌ Body | `#7a6520` | 5.64:1 ✅ |
| Middot-Separator (dekorativ) | `#d1d5db` | 1.44:1 | `#9ca3af` | 2.40:1 (UI) |

**Outlook-Hardening (bgcolor-Attribute):**
- `<body bgcolor="#f4f1e8">` — Outlook-Fallback für Page-Background
- Outer Wrapper-Tabelle: `bgcolor="#f4f1e8"`
- Inner Wrapper-Tabelle: `bgcolor="#ffffff"` — Fallback wenn `border-radius` gestrippt wird
- Header-`<td>`: `bgcolor="#9e8649"` — Outlook strippt `linear-gradient`, fällt auf Solid-Color zurück
- Main-Content-`<td>`: `bgcolor="#ffffff"`
- Footer-`<td>`: `bgcolor="#fafaf9"`

**Meta-Tags:**
- `<meta name="color-scheme" content="light only">`
- `<meta name="supported-color-schemes" content="light">`

Verhindert iOS-Mail-Farb-Invertierung im Dark-Mode (Goldtöne werden sonst zu Lila).

**Befund-Mapping:** C08, C09 (Blocker) + Outlook-Fallen (2 Blocker)

---

### Commit 4 — `fix(booking/admin): konsolidiere Print-Bloecke + page-break-Schutz`

**Datei:** `booking/admin.html` (L370–L380)

**Vorher:** zwei identische `@media print`-Blöcke direkt hintereinander.

**Nachher:** ein konsolidierter Block mit:
- `page-break-inside: avoid` + `break-inside: avoid` auf `.page`, `table.d`, `tr`, `h3`
- `page-break-after: avoid` auf `h3` (verhindert verwaiste Überschriften am Seitenende)

**Befund-Mapping:** Layout (Warning)

---

### Commit 5 — `fix(booking): neutralisiere Viewport-Units im Print-Stylesheet`

**Dateien:** `booking/anleitung.html`, `booking/verify-email.html`

**Anleitung.html `@media print`:**
- `.landing-h1 { font-size: clamp(2.4rem, 5.5vw, 4.2rem) }` → in Print: `font-size: 32pt` fixiert
- Generisches `* { max-height: none !important }` neutralisiert vh-basierte Container

**Verify-email.html `@media print`:**
- Gleiche `*{max-height:none}` Neutralisierung als Defensiv-Maßnahme

**Befund-Mapping:** Layout (Warning)

---

### Commit 6 — `fix(booking): ergaenze color-scheme Meta in HTML-Heads`

**Dateien:** `booking/admin.html`, `booking/verify-email.html`, `booking/anleitung.html`

Hinzugefügt: `<meta name="color-scheme" content="light dark">`

**Rationale:** Ohne diese Deklaration kann iOS Safari Form-Inputs und Scrollbars im Dark-Mode falsch rendern (z.B. dunkles Browser-Chrome auf weißem Input).

**Befund-Mapping:** Plattform-Konsistenz / iOS Mail (Warning)

---

## 3. Was nicht behoben wurde — Rückfrage an User

Die folgenden Befunde sind **Design-System-Änderungen** und brauchen explizite Freigabe, weil sie Brand-Tokens verändern:

### Gold `#B68E20` auf hellen Hintergründen (C01, C02, C03)

- **Problem:** 2.57–2.90:1 — verfehlt WCAG AA überall auf hell.
- **Affected:** `app/src/index.css` `--gold-600`, alle Komponenten die Gold auf Paper/White zeigen.
- **Optionen:**
  - **A:** Brand-Gold abdunkeln auf `#7A5E10` (5.0:1 auf Paper) — Brand-Veränderung
  - **B:** Gold nur für Großtext (≥18pt/14pt-bold) und Icons verwenden, Body-Text bleibt Ink
  - **C:** Gold-Buttons: Text auf `#1C1B18` statt Weiß (4.7:1 auf `#B68E20`)
- **Empfehlung:** Option B + C (kein Brand-Eingriff, nur Verwendungs-Disziplin)

### Gold `#9e8649` (booking/admin.html) auf hell (C11, C12, C13)

- **Problem:** 3.11–3.53:1 — passt für Großtext, FAILt für Body.
- **Affected:** `booking/admin.html` `--gold:#9e8649` (cell-order, btn-primary, badges, cta).
- **Empfehlung:** gleiche Strategie wie oben — Gold-Buttons mit dunklem Text, oder Gold nur für ≥14pt-bold Labels.

### `--ink-4 #9A968C` auf Paper (C10)

- **Problem:** 2.65:1 — utility-grey für "subtle" Text fällt durch.
- **Affected:** `app/src/index.css` — überall wo `var(--ink-4)` für Body-Text verwendet wird.
- **Empfehlung:** `--ink-4` auf `#767676` (4.54:1) abdunkeln, oder die Token-Verwendung disziplinieren (nur Borders, Icons, dekorative Elemente).

### Gradient-Header in E-Mail (C09 verbleibender Restschaden)

- **Problem:** Der Gradient `linear-gradient(135deg,#9e8649,#bfa25a,#c5a059)` hat auf der hellen Seite (`#c5a059`) nur 2.46:1 zu Weiß — dort sitzt allerdings kein Text.
- Eyebrow-Text wurde durch volle Opazität verbessert (Commit 3), das Restproblem ist nur theoretisch.
- **Empfehlung:** Belassen, oder Gradient-Endpunkt auf `#a48a4a` reduzieren (3.4:1 zu Weiß = AA Large).

---

## 4. Nicht aktive / nicht-blockierende Befunde

- **`propus-email.css` Flex/CSS-Vars/`@import`/`position:fixed`:** Datei ist nirgends aktiv eingebunden (per `grep` verifiziert). Sie ist eine Design-Referenz, kein versendetes Template. Header-Kommentar dokumentiert das (Commit 2). Keine Code-Änderung am Layout nötig.

- **`emailPreviewShell.ts` Inter via Google-Fonts-CDN:** iframe-Vorschau im Admin-Tool. CDN-Nutzung intern akzeptabel; Migration auf `@fontsource/inter` wäre kosmetisch.

---

## 5. Verifikation

Manuell zu testen:

- **Booking-Admin:** Print-Vorschau (`Strg+P`) einer Bestellung → Tabellen sollten nicht über Seitenumbrüche brechen.
- **E-Mail in Outlook (Web/Desktop):** Header sollte solide gold sein (statt Gradient gestrippt → weiß), Footer-Text dunkler grau.
- **E-Mail in Gmail (Mobil/Web):** Identisches Rendering wie vor Phase 2 + dunklerer Footer.
- **iOS Mail:** Dark-Mode darf Gold nicht invertieren (durch `color-scheme: light only`).
- **anleitung.html als PDF gedruckt:** Headline-Größe konsistent statt viewport-abhängig.

Automatisierte Tests: keine — alle Änderungen sind statisch (HTML-Attribute, CSS-Tokens), kein Logikfluss berührt.

---

## 6. Nächste Schritte

1. **User-Review** der offenen Design-System-Punkte (Abschnitt 3).
2. Optional: Vor PR-Merge ein paar Test-E-Mails durch die echten Pfade schicken (`/dev/email-preview` o.ä.) um Outlook-bgcolor-Fallback zu verifizieren.
3. Nach Merge: `COMPATIBILITY_AUDIT.md` und `FIXES_APPLIED.md` für die nächste Brand-Iteration archivieren.
