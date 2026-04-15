# Buchungsflow – Propus Platform

```mermaid
flowchart TD
    A([Benutzer öffnet Buchungsseite]) --> B[LandingPage]
    B --> C[Konfiguration laden]

    subgraph INIT ["Initialisierung"]
        C --> C1[GET /api/config\nMwSt., Feature Flags]
        C --> C2[GET /api/catalog/products\nPakete & Addons]
        C --> C3[GET /api/catalog/photographers\nFotografen-Liste]
    end

    C1 & C2 & C3 --> STEP1

    subgraph STEP1 ["Schritt 1 – Adresse & Objekt"]
        D[Adresse eingeben\nGoogle Maps Autocomplete]
        D --> E[Objekt-Details\nTyp / Fläche / Etagen / Zimmer / Notizen]
        E --> F[Ansprechpartner vor Ort\nName / Tel / E-Mail / Kalendereinladung]
        F --> G[GET /api/travel-zone\nReisezeit-Zone ermitteln]
        G --> H{Reisezonen-Addon\nerforderlich?}
        H -- Ja --> I[Reisezeit-Addon\nautomatisch hinzufügen]
        H -- Nein --> STEP2
        I --> STEP2
    end

    subgraph STEP2 ["Schritt 2 – Leistungen"]
        J[Paket auswählen\nz. B. Standard / Premium]
        J --> K[Addons auswählen\nz. B. Matterport, Video, Schlüsselübergabe]
        K --> L{Schlüssel-\nübergabe?}
        L -- Ja --> M[Zusatz-Adresse &\nHinweise eingeben]
        L -- Nein --> N[Preis berechnen\nbookingPricing.ts]
        M --> N
    end

    STEP2 --> STEP3

    subgraph STEP3 ["Schritt 3 – Termin & Fotograf"]
        O[Fotograf wählen\noder 'Beliebig']
        O --> P[Datum auswählen\nKalender-Widget]
        P --> Q[GET /api/availability\nVerfügbare Zeiten laden]
        Q --> R{Slot verfügbar?}
        R -- Nein --> P
        R -- Ja --> S[Uhrzeit auswählen\nAM / PM]
        S --> T{Provisorische\nBuchung?}
        T -- Ja --> U[Provisional-Flag\nsetzen]
        T -- Nein --> STEP4
        U --> STEP4
    end

    subgraph STEP4 ["Schritt 4 – Rechnungsdaten"]
        V[Rechnungskontakt\nName / E-Mail / Tel / Firma / Adresse]
        V --> W{Alternative\nRechnungsadresse?}
        W -- Ja --> X[Alt. Adresse eingeben]
        W -- Nein --> Y[Rabattcode\noptional]
        X --> Y
        Y --> Z{Code\neingegeben?}
        Z -- Ja --> AA[POST /api/admin/orders/discount-check\nCode validieren]
        Z -- Nein --> AB
        AA --> AB[AGB akzeptieren]
    end

    STEP4 --> SUBMIT

    subgraph SUBMIT ["Buchung einreichen"]
        AC[Formular-Validierung\nalle 4 Schritte]
        AC --> AD[POST /api/booking\nBookingPayload senden]
    end

    subgraph BACKEND ["Backend-Verarbeitung"]
        AE[Eingaben normalisieren]
        AE --> AF{Fotograf\n= Beliebig?}
        AF -- Ja --> AG[resolveAnyPhotographer\nVerfügbarkeit / Skills / Auslastung]
        AF -- Nein --> AH[Fotograf prüfen\nSkills & Verfügbarkeit]
        AG & AH --> AI[Preis validieren\n& neu berechnen]
        AI --> AJ[Slot final prüfen\nKalenderdaten abgleichen]
        AJ --> AK{Slot noch\nfrei?}
        AK -- Nein --> AL[409 Conflict\nSlot vergeben]
        AL --> P
        AK -- Ja --> AM[Auftragsnummer generieren\nnextOrderNumber]
        AM --> AN[Kalendereinträge anlegen\nFotograf & Büro]
        AN --> AO[Rabattcode markieren\nals verwendet]
        AO --> AP[Auftrag speichern\nbooking.orders DB]
    end

    SUBMIT --> BACKEND

    subgraph EMAILS ["E-Mails versenden"]
        AQ[E-Mail an Fotograf\nTermin & Details]
        AR[E-Mail an Kunde\nBestätigungs-Link Magic Link]
        AS[Kalendereinladungen\nan Ansprechpartner vor Ort]
    end

    AP --> EMAILS
    EMAILS --> AT[ThankYouScreen\nAuftragsnummer anzeigen]

    subgraph CONFIRM ["Bestätigung durch Kunden"]
        AT --> AU{Kunde klickt\nBestätigungs-Link\n3-Tage-Token}
        AU -- Bestätigt --> AV[GET /api/booking/confirm/:token\nStatus → confirmed]
        AU -- Kein Klick nach 3 Tagen --> AW[Status → provisional\nautomatische Hochstufung]
        AW --> AX{Später bestätigt?}
        AX -- Ja --> AV
    end

    subgraph STATUS ["Auftrags-Statusmaschine"]
        AV --> AY[confirmed\nBestätigt]
        AY --> AZ{Weiterer Verlauf}
        AZ -- Shooting abgeschlossen --> BA[completed]
        AZ -- Fotos geliefert --> BB[done]
        AZ -- Umbuchung --> BC[paused]
        BC --> AY
        AZ -- Stornierung --> BD[cancelled]
        BA & BB & BD --> BE[archived]
    end

    style INIT fill:#e8f4f8,stroke:#4a9aba
    style STEP1 fill:#e8f8e8,stroke:#4aba4a
    style STEP2 fill:#f8f4e8,stroke:#baaa4a
    style STEP3 fill:#f4e8f8,stroke:#9a4aba
    style STEP4 fill:#f8e8e8,stroke:#ba4a4a
    style SUBMIT fill:#e8e8f8,stroke:#4a4aba
    style BACKEND fill:#fff3e0,stroke:#ff9800
    style EMAILS fill:#fce4ec,stroke:#e91e63
    style CONFIRM fill:#e0f2f1,stroke:#009688
    style STATUS fill:#f3e5f5,stroke:#9c27b0
```

## Legende

| Symbol | Bedeutung |
|--------|-----------|
| Abgerundetes Rechteck `([...])` | Start / Ende |
| Rechteck `[...]` | Aktion / Schritt |
| Raute `{...}` | Entscheidung |
| Sechseck `{{...}}` | Datenspeicher |

## Status-Übergänge im Überblick

```
pending
  ├─► confirmed   (Kunde bestätigt innerhalb von 3 Tagen)
  └─► provisional (3 Tage ohne Bestätigung → automatisch)
          └─► confirmed (Kunde bestätigt nachträglich)

confirmed
  ├─► paused     (Umbuchung)
  │     └─► confirmed (Umbuchung bestätigt)
  ├─► completed  (Shooting erledigt)
  │     └─► done (Fotos geliefert)
  └─► cancelled  (Stornierung)

alle → archived  (Abschluss / Archivierung)
```

## API-Endpunkte

| Schritt | Methode | Endpunkt | Beschreibung |
|---------|---------|----------|--------------|
| Init | GET | `/api/config` | MwSt., Feature Flags |
| Init | GET | `/api/catalog/products` | Pakete & Addons |
| Init | GET | `/api/catalog/photographers` | Fotografen-Liste |
| Schritt 1 | GET | `/api/travel-zone` | Reisezeit-Zone |
| Schritt 3 | GET | `/api/availability` | Verfügbare Slots |
| Schritt 4 | POST | `/api/admin/orders/discount-check` | Rabattcode prüfen |
| Einreichen | POST | `/api/booking` | Buchung erstellen |
| Bestätigen | GET | `/api/booking/confirm/:token` | Buchung bestätigen |
