# Deploy Admin-New (Port 8092)

## 1) Build and run on NAS

```bash
cd /volume1/docker/Buchungstool/admin-panel
docker compose build --no-cache
docker compose up -d
```

## 2) Test

- New panel: `http://192.168.1.5:8092`
- Existing panel: `http://192.168.1.5:8091`

## 3) Port switch (final cutover)

After functional approval:

1. Stop old admin container on 8091
2. Change compose mapping for admin-new from `8092:80` to `8091:80`
3. `docker compose up -d --force-recreate`

## 4) Rollback

- Re-enable old admin container on 8091
- Keep admin-new on 8092 for hotfixes
