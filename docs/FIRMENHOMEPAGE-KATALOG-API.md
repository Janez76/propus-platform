# Firmenhomepage – Anbindung Produktkatalog & Preise (Propus Booking API)

**Stand:** 2026-03-30  
**Zweck:** Technische Spezifikation zum Weitergeben an Webagenturen oder eigene Entwicklung. Beschreibt, wie eine **eigene Firmenhomepage** (fremde Domain) Produkte, Kategorien und Preisinformationen aus der Propus-Plattform beziehen kann.

---

## 1. Überblick

- Daten kommen aus derselben **PostgreSQL-Datenbank** wie Admin und Buchungs-Wizard.
- Änderungen im Admin erscheinen beim nächsten Abruf von `/api/catalog/products` (kein manueller Sync).
- Öffentliche Lese-APIs sind **ohne Login** nutzbar (`GET`).

---

## 2. Basis-URLs

| Kontext | Basis-URL | Beispiel |
|--------|-----------|----------|
| Öffentliche API (empfohlen für fremde Origin) | `https://api-booking.propus.ch` | `https://api-booking.propus.ch/api/catalog/products` |
| Relativ zur Buchungs-SPA | Origin von `https://booking.propus.ch` | `/api/catalog/products` |

*Hinweis:* In eurer Infrastruktur können mehrere Hostnames auf dieselbe Anwendung zeigen; für eine **externe** Homepage ist eine **absolute HTTPS-URL** zur API-Domain am stabilsten.

---

## 3. Endpunkte

### 3.1 Produktkatalog (Hauptquelle)

| Eigenschaft | Wert |
|-------------|------|
| **Methode** | `GET` |
| **Pfad** | `/api/catalog/products` |
| **Authentifizierung** | keine |
| **Query-Parameter** | keine |
| **Cache-Control (Antwort)** | `no-store` |
| **Erfolg** | HTTP 200, JSON |
| **Fehler** | HTTP 500, JSON `{ "error": "…" }` |

**Antwortkörper (Erfolg):**

```json
{
  "ok": true,
  "categories": [],
  "packages": [],
  "addons": [],
  "products": []
}
```

- Es werden nur **aktive** Produkte und Kategorien geliefert (`active = true` im Backend).

**Referenz im Code:** `booking/server.js` – Route `GET /api/catalog/products`.

---

### 3.2 Konfiguration (MWST, Rundung, Termin-Defaults)

| Eigenschaft | Wert |
|-------------|------|
| **Methode** | `GET` |
| **Pfad** | `/api/config` |
| **Authentifizierung** | keine |
| **Cache-Control** | `private, max-age=60` (Browser darf bis 60 s cachen) |

**Relevante Felder für Preisdarstellung:**

| Feld | Bedeutung |
|------|-----------|
| `vatRate` | MWST-Satz (z. B. `0.081` für 8.1 %) |
| `chfRoundingStep` | Rundungsschritt in CHF (z. B. `0.05`) |
| `keyPickupPrice` | Preis Schlüsselübergabe (falls relevant) |
| `lookaheadDays` / `minAdvanceHours` | nur nötig, wenn ihr Terminlogik spiegelt |

**Wichtig – Sicherheit:** Die Antwort enthält auch `googleMapsKey` und `googleMapId`. Wenn die Homepage **keine** Google Maps über diese API braucht, `/api/config` **nicht** im Browser aufrufen oder serverseitig filtern und nur benötigte Felder weiterreichen.

**Referenz im Code:** `booking/server.js` – Route `GET /api/config`.

---

### 3.3 Optional: Fotografenliste

| Eigenschaft | Wert |
|-------------|------|
| **Methode** | `GET` |
| **Pfad** | `/api/catalog/photographers` |
| **Cache-Control** | `no-store` |

**Antwort (vereinfacht):**

```json
{
  "ok": true,
  "photographers": [
    { "key": "…", "name": "…", "initials": "…", "image": "…" }
  ]
}
```

**Referenz im Code:** `booking/server.js` – Route `GET /api/catalog/photographers`.

---

## 4. CORS (Aufruf aus dem Browser einer anderen Domain)

Das Booking-Backend setzt global CORS mit **`origin: "*"`** und erlaubt u. a. `GET`, `POST`, … sowie Header `Content-Type`, `Authorization`.

**Praxis:** Ein einfaches `fetch("https://api-booking.propus.ch/api/catalog/products")` vom Browser der Firmenhomepage ist **ohne** Cookies/Credentials üblich und CORS-kompatibel.

**Referenz im Code:** `booking/server.js` – `app.use(cors({ origin: "*", … }))`.

---

## 5. Datenmodell (Felder)

### 5.1 `categories`

Aus Tabelle `service_categories`, typische Felder:

- `key`, `name`, `description`
- `kind_scope`: `"addon"` | `"both"` | `"package"`
- `sort_order`, `active`
- `show_in_frontpanel` (falls gesetzt)

### 5.2 `packages` (für Pakete, UI-optimiert)

Pro Eintrag u. a.:

| Feld | Bedeutung |
|------|-----------|
| `key` | Produktcode (`products.code`) |
| `label` | Anzeigename |
| `description` | Text |
| `categoryKey` | Zuordnung zur Kategorie |
| `sortOrder` | Sortierung |
| `price` | Zahl (vereinfacht aus erster aktiver Regel) |
| `pricingType` | `"fixed"` \| `"perFloor"` \| `"perRoom"` \| `"byArea"` \| `"conditional"` |

### 5.3 `addons` (Zusatzleistungen, UI-optimiert)

Pro Eintrag u. a.:

| Feld | Bedeutung |
|------|-----------|
| `id` | Produktcode |
| `group` | Gruppe (`group_key`) |
| `label` | Anzeigename |
| `categoryKey`, `sortOrder` | Struktur |
| `pricingType` | wie bei Packages |
| `price` / `unitPrice` | je nach Regeltyp |
| `pricingNote` | z. B. bei Flächenstaffeln erklärender Text |
| `conditions` | bei `conditional` die Regel-Konfiguration |

### 5.4 `products` (Rohdaten inkl. aller Preisregeln)

Jedes Objekt entspricht im Wesentlichen einem Produkt aus `products` plus Array `rules`:

Jede Regel enthält u. a.:

- `rule_type` (z. B. `fixed`, `per_floor`, `per_room`, `area_tier`, `conditional`)
- `config_json` (Objekt, regeltypabhängig)
- `priority`, `valid_from`, `valid_to`, `active`

**Produkt `kind`:** `package` | `addon` | `service` | `extra`

**Referenz im Code:** `booking/db.js` – `listProductsWithRules`, `listServiceCategories`; Aufbereitung `formatCatalogProducts` / `mapRuleToPricingMeta` in `booking/server.js`.

---

## 6. Preise: Marketing vs. exakter Buchungspreis

### 6.1 Was `packages` / `addons` liefern

Die Arrays werden aus den Produkten und der **ersten Preisregel mit `active !== false`** gebildet (Sortierung der Regeln: Priorität, dann ID).

Die Abbildung ist für **Listen und „ab … CHF“** gedacht:

- Bei **`area_tier`** u. a.: ein Startpreis-Feld plus **`pricingNote`** (Staffeltext), nicht automatisch der Preis für jede beliebige m²-Zahl.
- Bei **`per_floor`** / **`per_room`**: eher **`unitPrice`** als Endpreis.

### 6.2 Exakter Preis wie im Buchungs-Wizard

Die vollständige Berechnung (Kontext: Fläche, Stockwerke, Zimmer/Pieces, gewähltes Paket, Addons, Rundung, ggf. mehrere Regeln, Rabatte) liegt serverseitig in **`booking/pricing.js`**.

Es gibt **keinen** in dieser Dokumentation festgeschriebenen öffentlichen Endpunkt der Form „Quote für beliebige Eingaben“. Wer auf der Homepage **identische** Endpreise wie in der Buchung braucht, sollte mit dem Backend-Team einen **dedizierten API-Endpunkt** planen, der die bestehende Pricing-Logik wiederverwendet.

---

## 7. Empfohlene Integration

1. **Serverseitig fetchen** (empfohlen): Homepage-Backend (PHP, Node, Edge, …) ruft `GET …/api/catalog/products` auf und rendert HTML. Vorteile: kein CORS-Thema, kontrolliertes Caching, kein unnötiges Leaken von API-Keys aus `/api/config`.
2. **Clientseitig fetchen:** mit `fetch`; wegen `no-store` auf dem Katalog kann die Homepage **eigenes kurzes Caching** (z. B. 1–5 Minuten im Speicher oder über CDN-Regeln) implementieren, um Last zu reduzieren.
3. **Fehlerbehandlung:** Timeouts (z. B. 10–20 s), bei 500 nutzerfreundlicher Fallback-Text.
4. **Rate / Fair Use:** Im referenzierten Server-Code ist für diese Routen kein explizites Rate-Limit dokumentiert; trotzdem nur bei Bedarf abrufen (nicht pro Scroll-Event).

---

## 8. Minimalbeispiele

### 8.1 JavaScript (Browser)

```javascript
const API = "https://api-booking.propus.ch";

async function loadCatalog() {
  const res = await fetch(`${API}/api/catalog/products`, { method: "GET" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data; // .categories, .packages, .addons, .products
}
```

### 8.2 cURL

```bash
curl -sS "https://api-booking.propus.ch/api/catalog/products"
```

---

## 9. TypeScript-Typen (Referenz im Monorepo)

Als Orientierung für die erwartete Form (kann um zusätzliche DB-Felder erweitert sein):

- Datei: `platform/frontend/src/api/bookingPublic.ts`
- Typen: `CatalogData`, `CatalogProduct`, `CatalogCategory`, `CatalogPackage`, `CatalogAddon`

---

## 10. Kontakt / Änderungen

- API-Verhalten folgt dem deployten Stand von **propus-platform** (`booking/server.js`, `booking/db.js`, `booking/pricing.js`).
- Bei Bedarf an **Quote-API** oder **angepassten Feldern** Backend-Erweiterung mit dem Plattform-Team abstimmen.

---

*Ende der Spezifikation*
