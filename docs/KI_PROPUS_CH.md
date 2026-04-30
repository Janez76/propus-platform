# ki.propus.ch — Routing & Deploy-Checkliste

Ziel: **`ki.propus.ch`** zeigt dieselbe Plattform wie der Admin-Einstieg (Next.js auf Port **3001**, Express intern **3100** im Docker-Setup), sodass Mobile und ggf. Web die Pfade `/api/assistant`, `/api/assistant/transcribe` usw. ohne andere Domain erreichen.

## DNS (Cloudflare)

| Typ | Name | Inhalt | Proxy |
|-----|------|--------|-------|
| A | `ki` | `87.106.24.107` (VPS) | Proxied empfohlen (orange Wolke) |

TLS: Cloudflare „Full (strict)“ oder entsprechendes Origin-Zertifikat am VPS.

## Reverse-Proxy (Nginx auf dem VPS)

**Prinzip:** Gleicher `upstream` wie für `admin-booking.propus.ch` → `127.0.0.1:3001` (Next standalone). Kein separates Express nach außen nötig; Next rewritet APIs nach Bedarf an `PLATFORM_INTERNAL_URL`.

Beispiel-Snippet (an bestehende Site-Konfiguration anpassen):

```nginx
# upstream propus_next { server 127.0.0.1:3001; }

server {
    listen 443 ssl http2;
    server_name ki.propus.ch;

    # ssl_certificate ... (wie bestehende Propus-Sites)

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Nach Änderung: `nginx -t && systemctl reload nginx` (oder euer Deploy-Prozess).

## Anwendung / Next.js

Assistant-Endpunkte liegen in der **Next.js-App** (`app/src/app/api/assistant/...`). Es sind **keine** zusätzlichen `next.config.ts`-Rewrites nur für `ki` nötig, solange Host und Pfad wie auf der Haupt-Admin-Domain bedient werden.

## Manuelle Checks nach Rollout

1. `curl -sI https://ki.propus.ch/` → HTTP 200/307 wie bei Admin-Host.
2. Mit gültigem Mobile-Token: `curl -s -H "Authorization: Bearer …" https://ki.propus.ch/api/assistant/settings` → JSON mit Settings.
3. Optional: Browser `/assistant` unter derselben Domain nur wenn ihr dieselbe Next-Instanz ausliefert (Cookies/Login wie Admin-Domain).

## SSH (VPS)

Deployment erfolgt wie in `docs/DEPLOY-FLOW.md` / eurem üblichen Platform-Container-Update — keine zusätzliche App, nur DNS + Nginx `server_name`.
