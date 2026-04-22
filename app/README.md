This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## So bearbeitest du eine Bestellung (Admin)

1. Anmelden unter `/login` (E-Mail, Magic-Link) – Zielrolle: `admin` oder `super_admin` (Schreibrechte in `booking` über `user_roles`).
2. In der **Bestelldetails**-Ansicht erscheint pro Tab (Termin, Objekt, Leistungen, **Übersicht** …) ggf. **„Bearbeiten“**; Tabs wie Verlauf, Dateien, Kommunikation haben teils andere Aktionen (z. B. senden, filtern) statt eines globalen Speichern-Buttons.
3. Nach Bearbeiten **„Speichern“** – Validierung (Zod); bei Erfolg kurzer Hinweis und Eintrag in `booking.order_event_log` / Status-Audit wo zutreffend.
4. **Termin:** 15-Min-Raster, Konflikt mit gleichem Fotograf/Tag, optionaler Mailversand (Workflow) bei definierten Status-Übergängen.
5. **Leistungen:** Katalog, Mengen, optional Preis-Override, Dauer-Override; `orders.total` wird live neu berechnet.
6. **Verlauf:** optional nach Ereignistyp / Datum filtern, CSV unter `/orders/<id>/verlauf/export` (Admin-Session nötig).

### Migration (Kommunikation: interne Nachrichten, Soft-Delete)

Schema-Migration: `../core/migrations/042_order_chat_internal_and_soft_delete.sql` (Spalten an `booking.order_chat_messages`).

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
