# Admin-Panel (Propus)

React 19 + TypeScript + Vite. API-Aufrufe gehen im Entwicklungsmodus über einen Vite-Proxy ans Backend.

## Lokal starten

1. **Backend** (Terminal 1), aus dem Repo-Root:

   ```bash
   cd backend
   npm install
   npm start
   ```

   Standard-Port: **3001** (siehe `backend/server.js` / Umgebungsvariable `PORT`).

2. **Admin-Panel** (Terminal 2):

   ```bash
   cd admin-panel
   npm install
   npm run dev
   ```

   - UI: **http://localhost:5174** (Port in `vite.config.ts`)
   - Unter `npm run dev` leitet Vite **`/api`** und **`/auth`** an **http://127.0.0.1:3001** weiter (`BACKEND_PORT`, Standard `3001`).

3. **Optional: Buchungsseite statisch** (ohne Vite), z. B.:

   ```bash
   cd ..   # Repo-Root
   npx serve . --listen 5500
   ```

   Dann muss die Buchungsseite das Backend unter derselben Origin oder per konfiguriertem `API_BASE` erreichen (lokal oft Proxy oder direkt `http://localhost:3001` je nach Setup).

**Hinweis:** Ohne laufendes Backend schlagen Login und alle `/api/admin/...`-Aufrufe fehl (JSON-Fehler oder HTML-Antwort).

### Mit Docker (lokal)

**Kompletter Stack** (Postgres, Backend, statische Buchungsseite, gebautes Admin — alles Container): vom Repo-Root:

```bash
docker compose -f docker-compose.desktop.yml up --build
```

Siehe [`../README.md`](../README.md) (Abschnitt „Lokal mit Docker“) für URLs und Ports.

**Admin-Login (Docker-Desktop-Compose):** Benutzer **`admin`**, Passwort **`localdev12`**. Überschreiben nur über **`BUCHUNGSTOOL_DESKTOP_ADMIN_PASS`** (nicht die Windows-Umgebungsvariable `ADMIN_PASS`). Account wird in `admin_users` angelegt bzw. synchronisiert.

---

1. **Nur Postgres im Container** (vom Repo-Root):

   ```bash
   docker compose -f docker-compose.local.yml up -d postgres
   ```

2. **Backend auf dem Host** wie oben (`cd backend` → `npm install` → `npm start`), mit passender `DATABASE_URL` in `backend/.env`, z. B.:

   ```text
   DATABASE_URL=postgresql://propus:propus@127.0.0.1:5432/buchungstool
   ```

   (Zugangsdaten entsprechen `docker-compose.local.yml`.)

3. **Optional: Admin als gebautes Nginx-Image** (statischer Build, kein Vite-HMR), aus `admin-panel`:

   ```bash
   docker compose up -d
   ```

   Laut `admin-panel/docker-compose.yml` typischerweise **http://localhost:8092** — die API muss weiterhin erreichbar sein (lokal oft Backend auf **3001**; ggf. Vite-Proxy entfällt, dann `VITE_API_BASE` / gleiche Origin je nach Deployment).

Die Root-Datei `docker-compose.yml` (Frontend/Backend/Postgres/Monitoring mit Synology-Pfaden) ist für die Produktions-NAS gedacht, nicht für einen typischen lokalen Dev-PC.

---

# React + TypeScript + Vite (Vorlage)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
