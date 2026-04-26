# Claude Design Handoff Mapping

Diese Datei dokumentiert die verbindliche Zuordnung des Handoff-Ordners
`Y:\bestellungen-handoff\bestellungen\project` zu den produktiven React-/API-Stellen.

## Seitenzuordnung

| Handoff | Produktive Route | Frontend |
|---|---|---|
| `Dashboard.html` | `/dashboard` | `app/src/components/dashboard-v2/DashboardV2.tsx` |
| `Bestellungen.html` | `/orders` | `app/src/pages-legacy/OrdersPage.tsx` |
| `Bestellung Detail.html` | `/orders/:id` | `app/src/app/(admin)/orders/[id]/*` |
| `Kalender.html` | `/calendar` | `app/src/pages-legacy/CalendarPage.tsx` |
| `Kunden.html` | `/customers` | `app/src/pages-legacy/CustomersPage.tsx` |
| `Mitarbeiter.html` | `/settings/team` | `app/src/pages-legacy/EmployeesPage.tsx` |
| `Touren.html` | `/admin/tours` + `/admin/tours/list` | `app/src/pages-legacy/tours/admin/*` |
| `Rechnungen.html` | `/admin/finance/invoices` | `app/src/pages-legacy/admin/invoices/*` |
| `Tickets.html` | `/admin/tickets` | `app/src/pages-legacy/tours/admin/AdminTicketsPage.tsx` |
| `Uploads.html` | `/upload` | `app/src/pages-legacy/UploadsPage.tsx` |
| `Galerien.html` | `/admin/listing` | `app/src/pages-legacy/admin/listing/*` |
| `Bildauswahl.html` | `/admin/selekto` | `app/src/pages-legacy/selekto/*` |
| `Bewertungen.html` | `/reviews` | `app/src/pages-legacy/ReviewsPage.tsx` |

## API-Basen

- Booking Admin: `/api/admin/*` (`booking/server.js`)
- Tours Admin: `/api/tours/admin/*` (`tours/routes/admin-api.js`)
- Listing Public: `/api/listing/*` (`tours/routes/gallery-public-api.js`)
- Gallery Admin: `/api/tours/admin/galleries/*` (`tours/routes/gallery-admin-api.js`)

## Umsetzungsregeln

- Handoff-Layout und Interaktionsmuster sind das Zielbild.
- Produktive Daten kommen immer aus API-Endpunkten, nicht aus `admin-data.js`.
- Rollen-/Berechtigungsregeln der bestehenden App bleiben bestehen.
- Zentrale Routenregeln bleiben bestehen (`/customers`, `/settings/companies`, `/admin/finance/*`).
