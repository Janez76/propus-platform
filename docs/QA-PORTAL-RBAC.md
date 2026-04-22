# QA-Checkliste: Kundenportal & RBAC (2025)

Nach Deploy von Migration `086` und App/Backend: für jede Rolle kurz prüfen.

## Rollen

1. **super_admin / admin**  
   - Admin-Panel: alle sichtbaren Menüpunkte erreichbar, keine Redirects auf `/dashboard` ohne Grund.  
   - Finance: „Neue Rechnung“ / Storno sichtbar.

2. **employee**  
   - Nur Pfade laut `effectiveCanAccessPath` / Sidebar.

3. **tour_manager**  
   - Dashboard, Orders, Kalender, Kunden (lesen), Touren, Reviews.  
   - **Kein** Finance, **kein** Einstellungen-Block ohne Permission.  
   - Direktaufruf z. B. `/admin/finance/invoices` → Redirect (RouteGuard).

4. **customer_admin** (Portal)  
   - `/account/team` sichtbar, Team-APIs nutzbar.  
   - Fremde `orderNo` in URLs → 404/403 laut API.

5. **customer_user** (Portal)  
   - **Kein** Tab Team (ohne `portal.team.manage`).

## API (Stichprobe)

- Ohne Recht: `GET /api/admin/...` → 403.  
- Kunde: `GET /api/customer/orders/<fremdeId>` → 404.

## IDOR

- Two-Kunden-Accounts: Bestellung von Firma A mit Session von B nicht abrufbar.
