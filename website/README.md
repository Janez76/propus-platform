# Astro Starter Kit: Minimal

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

---

## Interne Guidelines (`/guideline`)

Geschützter Bereich für Team-Anleitungen (Cookie-Session, kein öffentliches Indexieren).

**Umgebungsvariabellen**

| Variable | Beschreibung |
|----------|----------------|
| `GUIDELINE_SECRET` | HMAC-Secret für Session-Cookie (wie `PROPUS_ADMIN_SECRET`) |
| `GUIDELINE_PASSWORD` | Ein gemeinsames Passwort für den Internbereich |
| `GUIDELINE_CSRF_ORIGINS` | Optional, komma-separiert — zusätzliche Origins für Login-POST (z. B. `https://guideline.propus.ch`, wenn die Subdomain auf dieselbe App zeigt) |

**Inhalt**

- Markdown: [`src/content/guideline/`](src/content/guideline/) (Dateien `.md`, Frontmatter `title`, optional `order`, `category`).
- Binärdateien (PDF, Office, …): unter [`private-guideline-assets/`](private-guideline-assets/) ablegen, Einträge in `manifest.json` (siehe [`private-guideline-assets/README.md`](private-guideline-assets/README.md)). Nicht unter `public/` — Downloads laufen nur mit Session über `/api/guideline/download`.

**Quelle „Propus_Anleitungen“:** Markdown nach `src/content/guideline/` kopieren oder synchronisieren; Dateien nach `private-guideline-assets/files/` und Manifest pflegen.

**Docker / VPS:** Das Runtime-Image kopiert `private-guideline-assets/` mit. In [`docker-compose.vps.yml`](../docker-compose.vps.yml) werden `WEBSITE_GUIDELINE_SECRET`, `WEBSITE_GUIDELINE_PASSWORD` und optional `WEBSITE_GUIDELINE_CSRF_ORIGINS` an den Website-Container durchgereicht (`GUIDELINE_*` im Container).

**Hostname:** `guideline.propus.ch` kann auf dieselbe Website zeigen; Root `/` leitet intern nach `/guideline/`.
