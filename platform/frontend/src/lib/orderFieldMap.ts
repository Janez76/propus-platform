export type OrderFieldSection =
  | "company"
  | "internalContact"
  | "onsiteContact"
  | "billing"
  | "object"
  | "schedule"
  | "services"
  | "pricing";

export type OrderFieldStatus = "green" | "yellow" | "red";

export type OrderFieldEntry = {
  dbPath: string;
  targetPath: string;
  adminFormKey: string | null;
  apiPayloadKey: string;
  dbWriteKey: string;
  frontId: string | null;
  section: OrderFieldSection;
  label: string;
  businessCategory: string;
  note?: string;
};

export const ORDER_FIELD_MAP: OrderFieldEntry[] = [
  { section: "company", label: "Firma / Kunde", businessCategory: "Firma", frontId: "billCompany", adminFormKey: "company", apiPayloadKey: "company", dbPath: "billing.company", targetPath: "company.name", dbWriteKey: "billing.company", note: "Firmenname bzw. Kunde auf Unternehmensebene." },
  { section: "internalContact", label: "Interner Kundenkontakt: Name", businessCategory: "Interner Kontakt", frontId: "billName", adminFormKey: "customerName", apiPayloadKey: "customerName", dbPath: "billing.name", targetPath: "internalContact.name", dbWriteKey: "billing.name", note: "Ansprechpartner beim Kunden bzw. in der Firma." },
  { section: "internalContact", label: "Interner Kundenkontakt: E-Mail", businessCategory: "Interner Kontakt", frontId: "billEmail", adminFormKey: "customerEmail", apiPayloadKey: "customerEmail", dbPath: "billing.email", targetPath: "internalContact.email", dbWriteKey: "billing.email", note: "Wird für Kommunikation und Bestellbestätigungen genutzt." },
  { section: "internalContact", label: "Interner Kundenkontakt: Telefon", businessCategory: "Interner Kontakt", frontId: "billPhone", adminFormKey: "customerPhone", apiPayloadKey: "customerPhone", dbPath: "billing.phone", targetPath: "internalContact.phone", dbWriteKey: "billing.phone", note: "Telefon des internen Ansprechpartners beim Kunden." },
  { section: "billing", label: "Rechnungsadresse Strasse", businessCategory: "Rechnung", frontId: "billStreet", adminFormKey: "billingStreet", apiPayloadKey: "billingStreet", dbPath: "billing.street", targetPath: "billingAddress.street", dbWriteKey: "billing.street", note: "Historisch mit Objekt-Strasse verwechselt." },
  { section: "billing", label: "Rechnungsadresse PLZ", businessCategory: "Rechnung", frontId: "billZip", adminFormKey: "billingZip", apiPayloadKey: "billingZip", dbPath: "billing.zip", targetPath: "billingAddress.zip", dbWriteKey: "billing.zip" },
  { section: "billing", label: "Rechnungsadresse Ort", businessCategory: "Rechnung", frontId: "billCity", adminFormKey: "billingCity", apiPayloadKey: "billingCity", dbPath: "billing.city", targetPath: "billingAddress.city", dbWriteKey: "billing.city" },
  { section: "billing", label: "Rechnungsadresse PLZ/Ort", businessCategory: "Rechnung", frontId: "billZipCity", adminFormKey: "billingZipcity", apiPayloadKey: "billingZipcity", dbPath: "billing.zipcity", targetPath: "billingAddress.zipcity", dbWriteKey: "billing.zipcity", note: "Wird bei Bedarf aus PLZ + Ort zusammengesetzt." },
  { section: "billing", label: "Rechnung: Hinweise", businessCategory: "Rechnung", frontId: "billNotes", adminFormKey: "notes", apiPayloadKey: "notes", dbPath: "billing.notes", targetPath: "billingAddress.notes", dbWriteKey: "billing.notes" },
  { section: "billing", label: "Abweichende Rechnung: Firma", businessCategory: "Rechnung", frontId: "billInvoiceCompany", adminFormKey: "invoiceCompany", apiPayloadKey: "invoiceCompany", dbPath: "billing.invoice_company", targetPath: "billingAddress.invoiceCompany", dbWriteKey: "billing.invoiceCompany", note: "Frontpanel: snake_case, Admin/PATCH: camelCase. OrderDetail liest beide." },
  { section: "billing", label: "Abweichende Rechnung: Strasse", businessCategory: "Rechnung", frontId: "billInvoiceStreet", adminFormKey: "invoiceStreet", apiPayloadKey: "invoiceStreet", dbPath: "billing.invoice_street", targetPath: "billingAddress.invoiceStreet", dbWriteKey: "billing.invoiceStreet", note: "Frontpanel: snake_case, Admin: camelCase." },
  { section: "billing", label: "Abweichende Rechnung: PLZ", businessCategory: "Rechnung", frontId: "billInvoiceZip", adminFormKey: "invoiceZip", apiPayloadKey: "invoiceZip", dbPath: "billing.invoice_zip", targetPath: "billingAddress.invoiceZip", dbWriteKey: "billing.invoiceZip" },
  { section: "billing", label: "Abweichende Rechnung: Ort", businessCategory: "Rechnung", frontId: "billInvoiceCity", adminFormKey: "invoiceCity", apiPayloadKey: "invoiceCity", dbPath: "billing.invoice_city", targetPath: "billingAddress.invoiceCity", dbWriteKey: "billing.invoiceCity" },
  { section: "billing", label: "Abweichende Rechnung: Anrede", businessCategory: "Rechnung", frontId: "billInvoiceSalutation", adminFormKey: "invoiceSalutation", apiPayloadKey: "invoiceSalutation", dbPath: "billing.invoice_salutation", targetPath: "billingAddress.invoiceSalutation", dbWriteKey: "billing.invoiceSalutation" },
  { section: "billing", label: "Abweichende Rechnung: Vorname", businessCategory: "Rechnung", frontId: "billInvoiceFirstName", adminFormKey: "invoiceFirstName", apiPayloadKey: "invoiceFirstName", dbPath: "billing.invoice_first_name", targetPath: "billingAddress.invoiceFirstName", dbWriteKey: "billing.invoiceFirstName" },
  { section: "billing", label: "Abweichende Rechnung: Name", businessCategory: "Rechnung", frontId: "billInvoiceName", adminFormKey: "invoiceName", apiPayloadKey: "invoiceName", dbPath: "billing.invoice_name", targetPath: "billingAddress.invoiceName", dbWriteKey: "billing.invoiceName" },
  { section: "billing", label: "Abweichende Rechnung: E-Mail", businessCategory: "Rechnung", frontId: "billInvoiceEmail", adminFormKey: "invoiceEmail", apiPayloadKey: "invoiceEmail", dbPath: "billing.invoice_email", targetPath: "billingAddress.invoiceEmail", dbWriteKey: "billing.invoiceEmail" },
  { section: "billing", label: "Abweichende Rechnung: Telefon", businessCategory: "Rechnung", frontId: "billInvoicePhone", adminFormKey: "invoicePhone", apiPayloadKey: "invoicePhone", dbPath: "billing.invoice_phone", targetPath: "billingAddress.invoicePhone", dbWriteKey: "billing.invoicePhone" },
  { section: "billing", label: "Abweichende Rechnung: Mobil", businessCategory: "Rechnung", frontId: "billInvoiceMobile", adminFormKey: "invoiceMobile", apiPayloadKey: "invoiceMobile", dbPath: "billing.invoice_mobile", targetPath: "billingAddress.invoiceMobile", dbWriteKey: "billing.invoiceMobile" },
  { section: "object", label: "Objektadresse", businessCategory: "Objektdaten", frontId: "address", adminFormKey: "address", apiPayloadKey: "address", dbPath: "address", targetPath: "objectAddress.text", dbWriteKey: "address" },
  { section: "object", label: "Objektart", businessCategory: "Objektdaten", frontId: "type", adminFormKey: "objectType", apiPayloadKey: "objectType", dbPath: "object.type", targetPath: "object.type", dbWriteKey: "object.type" },
  { section: "object", label: "Wohn-/Nutzflaeche", businessCategory: "Objektdaten", frontId: "area", adminFormKey: "area", apiPayloadKey: "area", dbPath: "object.area", targetPath: "object.area", dbWriteKey: "object.area" },
  { section: "object", label: "Etagen/Ebene", businessCategory: "Objektdaten", frontId: "floors", adminFormKey: "floors", apiPayloadKey: "floors", dbPath: "object.floors", targetPath: "object.floors", dbWriteKey: "object.floors" },
  { section: "object", label: "Zimmer", businessCategory: "Objektdaten", frontId: "rooms", adminFormKey: "rooms", apiPayloadKey: "rooms", dbPath: "object.rooms", targetPath: "object.rooms", dbWriteKey: "object.rooms" },
  { section: "object", label: "Objektbeschreibung", businessCategory: "Objektdaten", frontId: "objDesc", adminFormKey: "desc", apiPayloadKey: "desc", dbPath: "object.desc", targetPath: "object.desc", dbWriteKey: "object.desc" },
  { section: "onsiteContact", label: "Vor-Ort-Kontakt: Name", businessCategory: "Vor-Ort-Kontakt", frontId: "onsiteName", adminFormKey: "onsiteName", apiPayloadKey: "onsiteName", dbPath: "billing.onsiteName", targetPath: "onsiteContact.name", dbWriteKey: "billing.onsiteName", note: "Kann im Admin aus bestehenden Kundenkontakten vorausgefüllt werden." },
  { section: "onsiteContact", label: "Vor-Ort-Kontakt: Telefon", businessCategory: "Vor-Ort-Kontakt", frontId: "onsitePhone", adminFormKey: "onsitePhone", apiPayloadKey: "onsitePhone", dbPath: "billing.onsitePhone", targetPath: "onsiteContact.phone", dbWriteKey: "billing.onsitePhone", note: "Kann im Admin aus bestehenden Kundenkontakten vorausgefüllt werden." },
  { section: "schedule", label: "Termin-Datum", businessCategory: "Termin", frontId: "shootDate", adminFormKey: "date", apiPayloadKey: "date", dbPath: "schedule.date", targetPath: "schedule.date", dbWriteKey: "schedule.date" },
  { section: "schedule", label: "Termin-Zeit", businessCategory: "Termin", frontId: null, adminFormKey: "time", apiPayloadKey: "time", dbPath: "schedule.time", targetPath: "schedule.time", dbWriteKey: "schedule.time", note: "Im Frontpanel als Slot-Auswahl ohne feste Input-ID." },
  { section: "schedule", label: "Fotograf", businessCategory: "Termin", frontId: null, adminFormKey: "photographerKey", apiPayloadKey: "photographerKey", dbPath: "photographer.key", targetPath: "schedule.photographerKey", dbWriteKey: "photographer.key", note: "Im Frontpanel indirekt ueber Fotograf-/Praeferenz-Auswahl." },
  { section: "services", label: "Paket: Cinematic Duo", businessCategory: "Paket", frontId: "impression:cinematic", adminFormKey: null, apiPayloadKey: "package", dbPath: "services.package", targetPath: "services.package", dbWriteKey: "services.package", note: "Radio-Option innerhalb der Paketgruppe." },
  { section: "services", label: "Paket: Bestseller", businessCategory: "Paket", frontId: "impression:bestseller", adminFormKey: null, apiPayloadKey: "package", dbPath: "services.package", targetPath: "services.package", dbWriteKey: "services.package", note: "Radio-Option innerhalb der Paketgruppe." },
  { section: "services", label: "Paket: The Full View", businessCategory: "Paket", frontId: "impression:fullview", adminFormKey: null, apiPayloadKey: "package", dbPath: "services.package", targetPath: "services.package", dbWriteKey: "services.package", note: "Radio-Option innerhalb der Paketgruppe." },
  { section: "services", label: "Camera Shooting: Foto 10", businessCategory: "Hauptleistung", frontId: "cam:foto10", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.primary[]", dbWriteKey: "services.addons", note: "Fachlich Hauptleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Camera Shooting: Foto 20", businessCategory: "Hauptleistung", frontId: "cam:foto20", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.primary[]", dbWriteKey: "services.addons", note: "Fachlich Hauptleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Camera Shooting: Foto 30", businessCategory: "Hauptleistung", frontId: "cam:foto30", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.primary[]", dbWriteKey: "services.addons", note: "Fachlich Hauptleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Drone Shooting: Foto 4", businessCategory: "Hauptleistung", frontId: "dronePhoto:foto4", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.primary[]", dbWriteKey: "services.addons", note: "Fachlich Hauptleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Drone Shooting: Foto 8", businessCategory: "Hauptleistung", frontId: "dronePhoto:foto8", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.primary[]", dbWriteKey: "services.addons", note: "Fachlich Hauptleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Drone Shooting: Foto 12", businessCategory: "Hauptleistung", frontId: "dronePhoto:foto12", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.primary[]", dbWriteKey: "services.addons", note: "Fachlich Hauptleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "360° Tour", businessCategory: "Zusatzleistung", frontId: "tourToggle", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Checkbox, fachlich Zusatzleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Schluesselabholung aktivieren", businessCategory: "Option", frontId: "keyPickupToggle", adminFormKey: null, apiPayloadKey: "keyPickup", dbPath: "keyPickup", targetPath: "services.options.keyPickup.enabled", dbWriteKey: "keyPickup", note: "Checkbox steuert das Key-Pickup-Objekt im Payload." },
  { section: "services", label: "Schluesselabholung Hinweis", businessCategory: "Option", frontId: "keyInfo", adminFormKey: "keyPickupAddress", apiPayloadKey: "keyPickup", dbPath: "keyPickup.address", targetPath: "services.options.keyPickup.address", dbWriteKey: "keyPickup.address", note: "Textarea-Inhalt wird in keyPickup.address gespeichert." },
  { section: "services", label: "Grundriss aus Tour", businessCategory: "Zusatzleistung", frontId: "fpTour", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Checkbox, fachlich Zusatzleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Grundriss ohne Tour", businessCategory: "Zusatzleistung", frontId: "fpNoTour", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Checkbox, fachlich Zusatzleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Grundriss nach Skizze", businessCategory: "Zusatzleistung", frontId: "fpSketch", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Checkbox, fachlich Zusatzleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Ground Video: Reel 30 Sek", businessCategory: "Zusatzleistung", frontId: "groundVideo:reel30", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Radio-Option, fachlich Zusatzleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Ground Video: Clip 1-2 Min", businessCategory: "Zusatzleistung", frontId: "groundVideo:clip12", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Radio-Option, fachlich Zusatzleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Drone Video: Reel 30 Sek", businessCategory: "Zusatzleistung", frontId: "droneVideo:reel30", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Radio-Option, fachlich Zusatzleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Drone Video: Clip 1-2 Min", businessCategory: "Zusatzleistung", frontId: "droneVideo:clip12", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Radio-Option, fachlich Zusatzleistung, technisch im Container services.addons gespeichert." },
  { section: "services", label: "Staging: Wohnbereich", businessCategory: "Zusatzleistung", frontId: "stLiving", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Checkbox, Menge wird im Frontpanel ueber qty-stLiving gefuehrt; technisch in services.addons gespeichert." },
  { section: "services", label: "Staging: Gewerbe", businessCategory: "Zusatzleistung", frontId: "stBusiness", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Checkbox, Menge wird im Frontpanel ueber qty-stBusiness gefuehrt; technisch in services.addons gespeichert." },
  { section: "services", label: "Staging: Renovation", businessCategory: "Zusatzleistung", frontId: "stRenov", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.additional[]", dbWriteKey: "services.addons", note: "Checkbox, Menge wird im Frontpanel ueber qty-stRenov gefuehrt; technisch in services.addons gespeichert." },
  { section: "services", label: "Express 24h", businessCategory: "Zusatzleistung", frontId: "express24", adminFormKey: null, apiPayloadKey: "addons", dbPath: "services.addons", targetPath: "services.options.express24", dbWriteKey: "services.addons", note: "Checkbox, fachlich Zusatzleistung, technisch im Container services.addons gespeichert." },
  { section: "pricing", label: "Rabattcode", businessCategory: "Preislogik", frontId: "discountCode", adminFormKey: "discountCode", apiPayloadKey: "discountCode", dbPath: "discountCode", targetPath: "pricing.discountCode", dbWriteKey: "discountCode" },
  { section: "pricing", label: "Zwischensumme", businessCategory: "Preislogik", frontId: null, adminFormKey: "subtotal", apiPayloadKey: "subtotal", dbPath: "pricing.subtotal", targetPath: "pricing.subtotal", dbWriteKey: "pricing.subtotal", note: "Berechnetes Feld ohne direkte Front-Eingabe." },
  { section: "pricing", label: "Rabattbetrag", businessCategory: "Preislogik", frontId: null, adminFormKey: "discount", apiPayloadKey: "discount", dbPath: "pricing.discount", targetPath: "pricing.discount", dbWriteKey: "pricing.discount", note: "Berechnetes Feld ohne direkte Front-Eingabe." },
  { section: "pricing", label: "MwSt", businessCategory: "Preislogik", frontId: null, adminFormKey: "vat", apiPayloadKey: "vat", dbPath: "pricing.vat", targetPath: "pricing.vat", dbWriteKey: "pricing.vat", note: "Berechnetes Feld ohne direkte Front-Eingabe." },
  { section: "pricing", label: "Total", businessCategory: "Preislogik", frontId: null, adminFormKey: "total", apiPayloadKey: "total", dbPath: "pricing.total", targetPath: "pricing.total", dbWriteKey: "pricing.total", note: "Berechnetes Feld ohne direkte Front-Eingabe." },
];

export function normalizeMappingKey(value: string | null | undefined): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getOrderFieldStatus(entry: OrderFieldEntry): OrderFieldStatus {
  if (!entry.apiPayloadKey || !entry.dbPath || !entry.dbWriteKey || !entry.targetPath) {
    return "red";
  }
  if (!entry.frontId || !entry.adminFormKey) {
    return "yellow";
  }
  return normalizeMappingKey(entry.apiPayloadKey) === normalizeMappingKey(entry.dbWriteKey) ? "green" : "yellow";
}

export function groupOrderFieldMap(entries: OrderFieldEntry[]) {
  const grouped = new Map<OrderFieldSection, OrderFieldEntry[]>();
  for (const entry of entries) {
    const bucket = grouped.get(entry.section) || [];
    bucket.push(entry);
    grouped.set(entry.section, bucket);
  }
  return grouped;
}
