# Setup

Schritt-für-Schritt-Anleitung für Phase 0 → 1 → 2.

## 1. Repo vorbereiten

```bash
cd Y:\propus-platform\propus-platform
git checkout -b feature/assistant
```

Kopiere den Inhalt von `platform-integration/` in dein Repo:

```
propus-assistant/platform-integration/migrations/        → propus-platform/migrations/
propus-assistant/platform-integration/app/               → propus-platform/app/src/app/
propus-assistant/platform-integration/lib/               → propus-platform/app/src/lib/
propus-assistant/platform-integration/components/        → propus-platform/app/src/components/
```

> **Hinweis:** Pfade ggf. an deine Repo-Struktur anpassen. Du nutzt App Router unter `app/src/app/(admin)/orders/[id]/` — die Assistant-Route landet entsprechend unter `app/src/app/(admin)/assistant/`.

## 2. NPM-Pakete

```bash
cd app
npm install @anthropic-ai/sdk
```

Das ist die einzige neue Dependency. Whisper läuft direkt über `fetch` ohne SDK.

## 3. ENV-Variablen

In deine bestehende `.env` (oder `.env.local`):

```env
# AI
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Microsoft Graph (existieren bereits laut Memory)
MS_GRAPH_TENANT_ID=8aee6efb-b620-459d-95b1-0ea7ff434458
MS_GRAPH_CLIENT_ID=e23a0d84-9f8d-47ce-9a1c-73be8809d787
MS_GRAPH_CLIENT_SECRET=...

# MailerLite
MAILERLITE_API_KEY=...

# Home Assistant
HA_BASE_URL=https://smartzh.janez.ch
HA_LONG_LIVED_TOKEN=...

# Paperless (optional)
PAPERLESS_BASE_URL=https://paperless.janez.ch
PAPERLESS_API_TOKEN=...
```

## 4. Datenbank-Migration

```bash
psql $DATABASE_URL -f migrations/001_assistant_tables.sql
```

Das legt vier Tabellen an:
- `assistant_conversations`
- `assistant_messages`
- `assistant_tool_calls`
- `assistant_audit_log`

## 5. DB-Client einsetzen

In folgenden Files steht ein `query()`-Stub mit `throw new Error('DB-Client nicht konfiguriert ...')`:

- `lib/assistant/tools/orders.ts`
- `lib/assistant/tools/tours.ts`
- `lib/assistant/audit.ts`

Ersetze den Stub mit deinem tatsächlichen DB-Client. Beispiel mit `pg`:

```typescript
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows;
}
```

Wenn du bereits einen zentralen DB-Helper hast (irgendwo in `lib/db.ts` o.ä.), importiere von dort.

## 6. Auth-Helper anbinden

In `app/api/assistant/route.ts`:

```typescript
async function getCurrentUser(req: NextRequest) {
  // Single-User-Setup (Janez):
  return { id: 'janez', email: 'janez@propus.ch', name: 'Janez' };
}
```

Ersetze das durch deinen bestehenden Auth-Mechanismus (NextAuth, Clerk, eigenes JWT, …).

## 7. Schema-Abgleich

Die SQL-Queries in `tools/orders.ts` und `tools/tours.ts` gehen von Spaltennamen wie `customer_name`, `property_address`, `scheduled_at`, `status` etc. aus. Gleiche das mit deinem tatsächlichen Schema ab — vermutlich heisst manches anders.

Tipp: Lass Cursor / Claude Code einmal über das Repo laufen mit der Aufforderung: "Passe die Queries in `lib/assistant/tools/` an unser tatsächliches Schema an. Schaue dir das Schema in `prisma/schema.prisma` oder den Migrations an."

## 8. Floating Button aktivieren (optional)

In `app/src/app/(admin)/layout.tsx`:

```tsx
import { FloatingVoiceButton } from '@/components/global/FloatingVoiceButton';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FloatingVoiceButton />
    </>
  );
}
```

## 9. Erstes Test-Deployment

```bash
npm run build
# wenn lokal grün: deine bestehende Deploy-Pipeline (workflow_dispatch)
```

Dann: `https://admin-booking.propus.ch/assistant` öffnen, Mikro halten, "Welche Aufträge habe ich heute?" sagen.

## 10. Mobile-App

Siehe [DEPLOYMENT.md](DEPLOYMENT.md) für den Mobile-Teil.

```bash
cd mobile
npm install
npx expo start
```

Auf dem Handy die Expo Go App installieren, QR-Code scannen → läuft.
