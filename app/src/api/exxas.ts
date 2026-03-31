/**
 * EXXAS API Integration
 * Basis-URL: https://api.exxas.net/cloud/{sysId}/api/v2
 * Auth: Authorization: ApiKey <apiKey>
 */

import { getSystemSettings, patchSystemSettings } from "./settings";

export const EXXAS_APP_SETTING_KEY = "integration.exxas.config" as const;

export const EXXAS_BASE_URL = "https://api.exxas.net";
export const EXXAS_SYS_ID = "D239DEE32E17B4B49567C7650FDF2160";
export const EXXAS_API_V2 = `${EXXAS_BASE_URL}/cloud/${EXXAS_SYS_ID}/api/v2`;
export const EXXAS_DEFAULT_ENDPOINT = `${EXXAS_API_V2}/customers?limit=1`;

export interface ExxasConfig {
  apiKey: string;
  appPassword: string;
  enabled: boolean;
}

export interface ExxasFieldMapping {
  localField: string;
  exxasField: string;
  exxasCategory: string;
}

export interface ExxasMappingConfig {
  customers: ExxasFieldMapping[];
  contacts: ExxasFieldMapping[];
  orders: ExxasFieldMapping[];
  enabled: boolean;
  apiKey: string;
  appPassword: string;
  endpoint: string;
  authMode: "apiKey" | "bearer";
  lastSyncAt?: string;
}

/** Lokale Felder unseres Buchungstools */
export const LOCAL_CUSTOMER_FIELDS = [
  { key: "name", labelKey: "exxas.local.customer.name" },
  { key: "first_name", labelKey: "exxas.local.customer.first_name" },
  { key: "salutation", labelKey: "exxas.local.customer.salutation" },
  { key: "email", labelKey: "exxas.local.customer.email" },
  { key: "phone", labelKey: "exxas.local.customer.phone" },
  { key: "phone_2", labelKey: "exxas.local.customer.phone_2" },
  { key: "phone_mobile", labelKey: "exxas.local.customer.phone_mobile" },
  { key: "phone_fax", labelKey: "exxas.local.customer.phone_fax" },
  { key: "company", labelKey: "exxas.local.customer.company" },
  { key: "street", labelKey: "exxas.local.customer.street" },
  { key: "address_addon_1", labelKey: "exxas.local.customer.address_addon_1" },
  { key: "address_addon_2", labelKey: "exxas.local.customer.address_addon_2" },
  { key: "address_addon_3", labelKey: "exxas.local.customer.address_addon_3" },
  { key: "po_box", labelKey: "exxas.local.customer.po_box" },
  { key: "zip", labelKey: "exxas.local.customer.zip" },
  { key: "city", labelKey: "exxas.local.customer.city" },
  { key: "country", labelKey: "exxas.local.customer.country" },
  { key: "website", labelKey: "exxas.local.customer.website" },
  { key: "notes", labelKey: "exxas.local.customer.notes" },
] as const;

export const LOCAL_CONTACT_FIELDS = [
  { key: "name", labelKey: "exxas.local.contact.name" },
  { key: "first_name", labelKey: "exxas.local.contact.first_name" },
  { key: "last_name", labelKey: "exxas.local.contact.last_name" },
  { key: "salutation", labelKey: "exxas.local.contact.salutation" },
  { key: "role", labelKey: "exxas.local.contact.role" },
  { key: "email", labelKey: "exxas.local.contact.email" },
  { key: "phone", labelKey: "exxas.local.contact.phone" },
  { key: "phone_direct", labelKey: "exxas.local.contact.phone_direct" },
  { key: "phone_mobile", labelKey: "exxas.local.contact.phone_mobile" },
  { key: "department", labelKey: "exxas.local.contact.department" },
] as const;

export const LOCAL_ORDER_FIELDS = [
  { key: "orderNo", labelKey: "exxas.local.order.orderNo" },
  { key: "date", labelKey: "exxas.local.order.date" },
  { key: "status", labelKey: "exxas.local.order.status" },
  { key: "totalGross", labelKey: "exxas.local.order.totalGross" },
  { key: "totalNet", labelKey: "exxas.local.order.totalNet" },
  { key: "vatAmount", labelKey: "exxas.local.order.vatAmount" },
  { key: "description", labelKey: "exxas.local.order.description" },
  { key: "objectAddress", labelKey: "exxas.local.order.objectAddress" },
  { key: "photographerName", labelKey: "exxas.local.order.photographerName" },
  { key: "productName", labelKey: "exxas.local.order.productName" },
  { key: "billingCompany", labelKey: "exxas.local.order.billingCompany" },
  { key: "billingName", labelKey: "exxas.local.order.billingName" },
  { key: "billingStreet", labelKey: "exxas.local.order.billingStreet" },
  { key: "billingZipcity", labelKey: "exxas.local.order.billingZipcity" },
  { key: "billingPLZ", labelKey: "exxas.local.order.billingPLZ" },
  { key: "billingOrt", labelKey: "exxas.local.order.billingOrt" },
  { key: "notes", labelKey: "exxas.local.order.notes" },
] as const;

/** EXXAS-Felder nach Kategorie */
export const EXXAS_CONTACT_FIELDS = [
  { key: "kt_vorname", label: "kt_vorname", description: "Vorname" },
  { key: "kt_nachname", label: "kt_nachname", description: "Nachname (Pflichtfeld)" },
  { key: "kt_email", label: "kt_email", description: "E-Mail-Adresse" },
  { key: "kt_direkt", label: "kt_direkt", description: "Telefon Direkt" },
  { key: "kt_mobile", label: "kt_mobile", description: "Mobiltelefon" },
  { key: "kt_anrede", label: "kt_anrede", description: "Anrede" },
  { key: "kt_funktion", label: "kt_funktion", description: "Funktion / Stelle" },
  { key: "kt_abteilung", label: "kt_abteilung", description: "Abteilung" },
  { key: "kt_briefanrede", label: "kt_briefanrede", description: "Briefanrede" },
  { key: "kt_suchname", label: "kt_suchname", description: "Suchname" },
  { key: "details", label: "details", description: "Details / Notizen" },
  { key: "optional1", label: "optional1", description: "Freifeld 1" },
  { key: "optional2", label: "optional2", description: "Freifeld 2" },
  { key: "optional3", label: "optional3", description: "Freifeld 3" },
];

export const EXXAS_ADDRESS_FIELDS = [
  { key: "firmenname", label: "firmenname", description: "Firmenname / Nachname (Pflichtfeld)" },
  { key: "vorname", label: "vorname", description: "Vorname" },
  { key: "suchname", label: "suchname", description: "Suchname (Pflichtfeld)" },
  { key: "anrede", label: "anrede", description: "Anrede" },
  { key: "firmenzusatz", label: "firmenzusatz", description: "Firmenzusatz" },
  { key: "strasse", label: "strasse", description: "Strasse" },
  { key: "plz", label: "plz", description: "PLZ" },
  { key: "ort", label: "ort", description: "Ort / Stadt" },
  { key: "land", label: "land", description: "Land (z.B. CH) (Pflichtfeld)" },
  { key: "telefon1", label: "telefon1", description: "Telefon 1" },
  { key: "telefon2", label: "telefon2", description: "Telefon 2" },
  { key: "mobile", label: "mobile", description: "Mobile" },
  { key: "email", label: "email", description: "E-Mail" },
  { key: "website", label: "website", description: "Website" },
  { key: "bemerkungen", label: "bemerkungen", description: "Bemerkungen" },
  { key: "optional1", label: "optional1", description: "Freifeld 1" },
  { key: "optional2", label: "optional2", description: "Freifeld 2" },
  { key: "optional3", label: "optional3", description: "Freifeld 3" },
];

export const EXXAS_CUSTOMER_FIELDS = [
  { key: "nummer", label: "nummer", description: "Kundennummer" },
  { key: "briefanrede", label: "briefanrede", description: "Briefanrede" },
  { key: "rabatt", label: "rabatt", description: "Rabatt %" },
  { key: "ustNr", label: "ustNr", description: "USt-Nummer" },
  { key: "kreditlimite", label: "kreditlimite", description: "Kreditlimite" },
  { key: "bemerkungen", label: "bemerkungen", description: "Bemerkungen" },
  { key: "aktiv", label: "aktiv", description: "Aktiv (boolean)" },
  { key: "optional1", label: "optional1", description: "Freifeld 1" },
  { key: "optional2", label: "optional2", description: "Freifeld 2" },
  { key: "optional3", label: "optional3", description: "Freifeld 3" },
  { key: "optional4", label: "optional4", description: "Freifeld 4" },
  { key: "optional5", label: "optional5", description: "Freifeld 5" },
];

export const EXXAS_DOCUMENT_FIELDS = [
  { key: "typ", label: "typ", description: "Typ: o=Auftrag, r=Rechnung, a=Angebot, s=Lieferschein, p=Auftragsbestätigung, l=Gutschrift" },
  { key: "nummer", label: "nummer", description: "Dokumentnummer" },
  { key: "bezeichnung", label: "bezeichnung", description: "Bezeichnung / Titel" },
  { key: "beschreibung", label: "beschreibung", description: "Beschreibung / Details" },
  { key: "dokDatum", label: "dokDatum", description: "Dokumentdatum (datetime)" },
  { key: "termin", label: "termin", description: "Termin / Fälligkeitsdatum (datetime)" },
  { key: "zahlungstermin", label: "zahlungstermin", description: "Zahlungstermin (datetime)" },
  { key: "preisBrutto", label: "preisBrutto", description: "Brutto-Preis (float)" },
  { key: "preisNetto", label: "preisNetto", description: "Netto-Preis (float)" },
  { key: "totalRabatt", label: "totalRabatt", description: "Gesamt-Rabatt (float)" },
  { key: "rabatt", label: "rabatt", description: "Rabatt % (float)" },
  { key: "mwstArt", label: "mwstArt", description: "MwSt-Art: 0=exkl., 1=inkl." },
  { key: "status", label: "status", description: "Status: ak=Aktiv, ab=Abgeschlossen, ar=Archiviert, op=Offen, bz=Bezahlt" },
  { key: "ad_firmenname", label: "ad_firmenname", description: "Adress-Firma (im Dokument)" },
  { key: "ad_vorname", label: "ad_vorname", description: "Adress-Vorname (im Dokument)" },
  { key: "ad_strasse", label: "ad_strasse", description: "Adress-Strasse (im Dokument)" },
  { key: "ad_plz", label: "ad_plz", description: "Adress-PLZ (im Dokument)" },
  { key: "ad_ort", label: "ad_ort", description: "Adress-Ort (im Dokument)" },
  { key: "ad_land", label: "ad_land", description: "Adress-Land (im Dokument)" },
  { key: "kt_vorname", label: "kt_vorname", description: "Kontakt-Vorname (im Dokument)" },
  { key: "kt_nachname", label: "kt_nachname", description: "Kontakt-Nachname (im Dokument)" },
  { key: "kt_email", label: "kt_email", description: "Kontakt-E-Mail (im Dokument)" },
  { key: "optional1", label: "optional1", description: "Freifeld 1" },
  { key: "optional2", label: "optional2", description: "Freifeld 2" },
  { key: "optional3", label: "optional3", description: "Freifeld 3" },
  { key: "optional4", label: "optional4", description: "Freifeld 4" },
  { key: "optional5", label: "optional5", description: "Freifeld 5" },
];

export const EXXAS_ARTICLE_FIELDS = [
  { key: "nummer", label: "nummer", description: "Artikelnummer" },
  { key: "lang1Titel", label: "lang1Titel", description: "Titel (Deutsch)" },
  { key: "lang1Bezeichnung", label: "lang1Bezeichnung", description: "Bezeichnung (Deutsch)" },
  { key: "lang2Titel", label: "lang2Titel", description: "Titel (Englisch)" },
  { key: "lang2Bezeichnung", label: "lang2Bezeichnung", description: "Bezeichnung (Englisch)" },
  { key: "herstellerNr", label: "herstellerNr", description: "Herstellernummer" },
];

/** Alle EXXAS-API-Property-Namen mit Kategorie (Referenz-Tabelle in den Einstellungen). */
export const EXXAS_ALL_FIELDS = [
  ...EXXAS_CONTACT_FIELDS.map((f) => ({ ...f, category: "contact" as const })),
  ...EXXAS_ADDRESS_FIELDS.map((f) => ({ ...f, category: "address" as const })),
  ...EXXAS_CUSTOMER_FIELDS.map((f) => ({ ...f, category: "customer" as const })),
  ...EXXAS_DOCUMENT_FIELDS.map((f) => ({ ...f, category: "document" as const })),
  ...EXXAS_ARTICLE_FIELDS.map((f) => ({ ...f, category: "article" as const })),
];

function buildEndpoint(apiKey: string, explicitEndpoint?: string): string {
  const custom = String(explicitEndpoint || "").trim();
  if (custom) return custom;
  const sysId = extractSysIdFromToken(apiKey) ?? EXXAS_SYS_ID;
  return `${EXXAS_BASE_URL}/cloud/${sysId}/api/v2/customers?limit=1`;
}

/** API-Verbindung testen (genau 1 Request, ohne Retry-Schleife) */
export async function testExxasConnection(
  apiKey: string,
  appPassword: string,
  endpoint?: string,
  authMode: "apiKey" | "bearer" = "apiKey"
): Promise<{ ok: boolean; message: string }> {
  try {
    const url = buildEndpoint(apiKey, endpoint);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authMode === "bearer" ? `Bearer ${apiKey}` : `ApiKey ${apiKey}`,
    };
    if (appPassword) {
      headers["X-App-Password"] = appPassword;
    }

    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, message: "Verbindung erfolgreich" };
    const text = await res.text().catch(() => "");
    return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 120)}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Verbindungsfehler" };
  }
}

/** Hilfsfunktion: SysId aus JWT dekodieren (best-effort) */
function extractSysIdFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.sysId ?? null;
  } catch {
    return null;
  }
}

function exxasConfigDefaults(): ExxasMappingConfig {
  return {
    enabled: false,
    apiKey: "",
    appPassword: "",
    endpoint: EXXAS_DEFAULT_ENDPOINT,
    authMode: "apiKey",
    customers: [],
    contacts: [],
    orders: [],
  };
}

/** Teilobjekte aus API/Storage in ein vollstaendiges ExxasMappingConfig ueberfuehren */
export function normalizeExxasConfigPartial(parsed: Partial<ExxasMappingConfig> | null | undefined): ExxasMappingConfig {
  const defaults = exxasConfigDefaults();
  if (!parsed || typeof parsed !== "object") return defaults;
  return {
    ...defaults,
    ...parsed,
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    endpoint: String(parsed.endpoint || defaults.endpoint),
    authMode: parsed.authMode === "bearer" ? "bearer" : "apiKey",
  };
}

function serverExxasConfigIsPresent(raw: unknown): boolean {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  if (String(o.apiKey || "").trim()) return true;
  if (String(o.lastSyncAt || "").trim()) return true;
  for (const key of ["customers", "contacts", "orders"] as const) {
    const arr = o[key];
    if (Array.isArray(arr) && arr.length > 0) return true;
  }
  return false;
}

/** Exxas-Konfiguration aus localStorage laden */
export function loadExxasConfig(): ExxasMappingConfig {
  try {
    const raw = localStorage.getItem("exxas_config");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ExxasMappingConfig>;
      return normalizeExxasConfigPartial(parsed);
    }
  } catch {
    // ignore
  }
  return exxasConfigDefaults();
}

/** Server (app_settings) mit localStorage mergen: Server gewinnt, wenn dort Eintraege existieren */
export async function loadExxasConfigMerged(token: string | undefined): Promise<ExxasMappingConfig> {
  const local = loadExxasConfig();
  if (!token) return local;
  try {
    const settings = await getSystemSettings(token);
    const server = settings[EXXAS_APP_SETTING_KEY];
    if (serverExxasConfigIsPresent(server)) {
      const merged = normalizeExxasConfigPartial(server as Partial<ExxasMappingConfig>);
      saveExxasConfig(merged);
      return merged;
    }
  } catch {
    // Netzwerk: lokaler Cache
  }
  return local;
}

/** Exxas-Konfiguration in localStorage speichern */
export function saveExxasConfig(config: ExxasMappingConfig): void {
  localStorage.setItem("exxas_config", JSON.stringify(config));
}

/** Speichert in localStorage und in der Datenbank (app_settings), wenn Admin-Token vorhanden */
export async function saveExxasConfigMerged(config: ExxasMappingConfig, token: string | undefined): Promise<void> {
  saveExxasConfig(config);
  if (!token) return;
  await patchSystemSettings(token, { [EXXAS_APP_SETTING_KEY]: config });
}
