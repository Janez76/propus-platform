# Google Business Profile API – OAuth Setup (einmalig)

Bevor das Review-Panel im Admin aktiviert werden kann, müssen einmalig folgende Schritte
in der Google Cloud Console durchgeführt werden.

---

## 1. Google Cloud Projekt öffnen / erstellen

1. Gehe zu https://console.cloud.google.com
2. Wähle ein bestehendes Projekt oder erstelle ein neues (z. B. „Propus Admin")

---

## 2. APIs aktivieren

Aktiviere folgende zwei APIs unter **APIs & Dienste → Bibliothek**:

- **Google Business Profile API**
- **Google My Business Account Management API**

Falls du eine Fehlermeldung "Zugriff nicht aktiviert" erhältst, musst du zunächst
Zugriff auf die Business Profile API bei Google beantragen:
https://developers.google.com/my-business/content/prereqs
(Bearbeitungszeit: 1–5 Werktage)

---

## 3. OAuth-Consent-Screen konfigurieren

1. APIs & Dienste → **OAuth-Zustimmungsbildschirm**
2. User Type: **Intern** (wenn Google Workspace) oder **Extern**
3. App-Name: z. B. „Propus Admin Panel"
4. Scope hinzufügen: `https://www.googleapis.com/auth/business.manage`
5. Testnutzer hinzufügen (deine Google-Konto-E-Mail, die Propus GmbH verwaltet)

---

## 4. OAuth 2.0 Client ID erstellen

1. APIs & Dienste → **Anmeldedaten** → „+ Anmeldedaten erstellen" → **OAuth-Client-ID**
2. Anwendungstyp: **Webanwendung**
3. Name: z. B. „Propus Admin Reviews"
4. Autorisierte Weiterleitungs-URIs:
   ```
   https://admin-booking.propus.ch/api/admin/gbp/callback
   ```
   (Für lokale Entwicklung zusätzlich: `http://localhost:3000/api/admin/gbp/callback`)
5. Speichern → **Client ID** und **Client Secret** werden angezeigt

---

## 5. Account ID und Location ID ermitteln

Nach dem ersten erfolgreichen Login (Button „Mit Google verbinden" im Admin) werden
Account ID und Location ID automatisch erkannt und in der DB gespeichert.

Du kannst sie auch manuell ermitteln:

```bash
# Account ID: GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts
# Location ID: GET https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{accountId}/locations
```

---

## 6. ENV-Variablen setzen

In `.env` (lokal) und `.env.prod` (VPS):

```env
GBP_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GBP_CLIENT_SECRET=GOCSPX-...
GBP_REDIRECT_URI=https://admin-booking.propus.ch/api/admin/gbp/callback
```

`GBP_ACCOUNT_ID` und `GBP_LOCATION_ID` werden nach dem ersten Login automatisch in der DB
gespeichert und müssen nicht gesetzt werden.

---

## 7. Erster Login im Admin

1. Im Admin-Panel zu **Reviews & Feedback** navigieren
2. Auf **„Mit Google verbinden"** klicken
3. Google-Login mit dem Propus-GmbH-Konto durchführen
4. Zustimmung erteilen
5. Weiterleitung zurück zum Admin → Verbindung ist aktiv

Der Refresh Token wird in der Datenbank gespeichert und automatisch erneuert.
Ein erneuter Login ist nur nötig, wenn der Token widerrufen wurde.

---

## Trennen / Neu verbinden

Im Admin-Panel → Reviews & Feedback → „Google-Verbindung trennen"
Danach kann der Login-Prozess erneut gestartet werden.
