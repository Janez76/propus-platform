# Propus Codestudio – Landingpage

Einseitige Marketing-Site für **Propus Codestudio**, die Webdev-Sparte der Propus GmbH (Zug).  
Zielgruppe: KMU in der Deutschschweiz – Immobilienmakler, Verwaltungen, Dienstleister.

Gebaut mit **Astro 5**, **Tailwind CSS v4**, **TypeScript (strict)** und einer schlanken **React-Insel** für das FAQ-Accordion. Dark-Mode-first, Swiss-minimalist, DM Serif Display + DM Sans.

> MVP: kein Backend, kein Deployment. Kontaktformular ist UI-only und zeigt eine Hinweis-Alert.

---

## Features

- 9 Sections: Hero, Leistungen, Referenzen, Prozess, Preise, Über uns, FAQ, Kontakt, Footer
- Rechtliche Seiten `/impressum` und `/datenschutz` (revDSG-Gerüst)
- SEO: Meta-Tags, Open Graph, Twitter Cards, JSON-LD (`Organization`), Sitemap via `@astrojs/sitemap`
- Responsive (Mobile-first), Sticky-Nav mit Scroll-Blur, FAQ als React-Insel via `client:visible`
- Design-Tokens als Tailwind-v4 `@theme`-Variablen in `src/styles/global.css`

---

## Setup

Voraussetzungen: Node.js 20+, npm 10+.

```bash
cd propus-codestudio
npm install
npm run dev
```

Der Dev-Server bindet an `0.0.0.0:4321`, ist also im lokalen Netzwerk erreichbar.

### Lokal öffnen

- Auf dem Entwicklungsrechner: <http://localhost:4321>
- Vom Handy / Tablet im selben WLAN: `http://<IP-des-PC>:4321`

### Eigene IP unter Windows herausfinden

```powershell
ipconfig
```

Gesucht: der Wert bei **IPv4-Adresse** unter dem aktiven Adapter (WLAN oder Ethernet), z. B. `192.168.1.42`.  
Dann `http://192.168.1.42:4321` im Browser öffnen.

Falls der Zugriff blockiert ist, einmalig die Windows-Firewall-Abfrage für Node.js zulassen (Private Netzwerke genügt).

---

## Scripts

| Script            | Wirkung                                             |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Dev-Server auf `0.0.0.0:4321` (LAN-ready)           |
| `npm run build`   | Produktions-Build nach `./dist`                     |
| `npm run preview` | Statischen Build lokal prüfen (`0.0.0.0:4321`)      |

---

## Struktur

```
propus-codestudio/
├── astro.config.mjs         # React + sitemap + @tailwindcss/vite, server host:true
├── tsconfig.json            # strict
├── package.json
├── .env.example             # Phase-2-Keys (leer)
├── public/
│   ├── favicon.svg
│   └── cases/               # SVG-Platzhalter für Referenzen
└── src/
    ├── layouts/Layout.astro # Meta-Tags, JSON-LD, Nav/Footer-Slots
    ├── components/
    │   ├── Nav.astro
    │   ├── Hero.astro
    │   ├── Services.astro
    │   ├── Cases.astro
    │   ├── Process.astro
    │   ├── Pricing.astro
    │   ├── About.astro
    │   ├── FAQ.tsx          # React-Insel (client:visible)
    │   ├── Contact.astro    # Form-UI + Alert
    │   └── Footer.astro
    ├── pages/
    │   ├── index.astro
    │   ├── impressum.astro
    │   └── datenschutz.astro
    └── styles/global.css    # Tailwind v4 @theme + Base-Styles
```

### Design-Tokens

Alle Farben, Fonts und Container-Grössen liegen in `src/styles/global.css` im `@theme`-Block und stehen automatisch als Tailwind-Utilities zur Verfügung:

- Farben: `bg-propus-bg`, `text-propus-fg`, `text-propus-muted`, `text-propus-gold`, `bg-propus-gold-hover`, `border-propus-border`
- Fonts: `font-serif` (DM Serif Display), `font-sans` (DM Sans)
- Container: `.propus-container` (max 1200px), Sections via `.propus-section`

---

## TODOs für Phase 2

- [ ] Kontaktformular verkabeln (Resend für Mail-Versand, Cloudflare Turnstile gegen Bots)
- [ ] MailerLite-Integration für optionales Newsletter-Opt-in
- [ ] Echte Screenshots statt SVG-Platzhaltern in `public/cases/`
- [ ] Foto von Janez in `About.astro` einsetzen
- [ ] Dritten Referenz-Case (`TODO: Case 3`) ersetzen
- [ ] Telefonnummer in Footer, Kontakt und Impressum eintragen
- [ ] Impressum komplettieren (UID, Handelsregisternummer, Adresse)
- [ ] Datenschutzerklärung finalisieren (konkrete Dienstleister, Cookies, Analytics)
- [ ] Cal.com-Link in Kontaktsektion aktivieren
- [ ] `og-default.png` (1200×630) erstellen und in `public/` ablegen
- [ ] Deployment einrichten (Cloudflare Pages oder Vercel) inkl. eigenem Domain-Setup `codestudio.propus.ch`
- [ ] LinkedIn-Profil-Link im Footer setzen
- [ ] Light-Mode-Toggle (optional, nicht Teil des MVP)

---

## Lizenz

Interner Code der Propus GmbH. Weiterverwendung nur mit schriftlicher Zustimmung.
