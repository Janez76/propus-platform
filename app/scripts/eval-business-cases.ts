/**
 * Zusätzliche Eval-Fälle aus typischen Propus-Business-Fragen.
 * Werden standardmässig in `eval-assistant.ts` mit `BASE_TEST_CASES` zu `TEST_CASES` zusammengeführt.
 * Schneller ohne diese Fälle: `npm run eval:assistant -- --no-business`
 *
 * Erwartung: mindestens eines der genannten Tools wird aufgerufen (heuristisch).
 */

export type BusinessEvalRow = {
  id: string;
  userMessage: string;
  /** Mindestens ein Tool aus dieser Liste soll vorkommen. */
  expectToolAnyOf: string[];
};

const ROWS: Array<[string, string, string[]]> = [
  ["biz-01", "Welche Aufträge sind diese Woche geplant?", ["propus_report", "get_open_orders"]],
  ["biz-02", "Zeig mir alle offenen Aufträge für Kanton Zürich.", ["propus_report", "search_orders"]],
  ["biz-03", "Welche Aufträge haben noch keinen Liefertermin?", ["propus_report", "get_open_orders"]],
  ["biz-04", "Wer hat zuletzt einen Drohnenauftrag gebucht?", ["propus_report", "search_orders"]],
  ["biz-05", "Wie viele Aufträge haben wir diesen Monat abgeschlossen?", ["propus_report", "get_open_orders"]],
  ["biz-06", 'Zeig mir alle Aufträge mit Status „In Bearbeitung".', ["propus_report", "search_orders"]],
  ["biz-07", "Welche Aufträge warten auf Post-Production?", ["propus_report", "search_orders", "get_open_orders"]],
  ["biz-08", "Gibt es Aufträge ohne verknüpfte Tour?", ["propus_report", "search_orders", "get_order_detail"]],

  ["biz-09", "Welche Touren laufen in den nächsten 30 Tagen ab?", ["propus_report", "get_tours_expiring_soon"]],
  ["biz-10", "Wie viele aktive Matterport-Touren haben wir aktuell?", ["propus_report", "count_active_tours"]],
  ["biz-11", "Welche Touren wurden archiviert?", ["propus_report", "matterport_list_spaces"]],
  ["biz-12", "Zeig mir alle Touren, die noch keine Verlängerung haben.", ["propus_report", "get_tours_expiring_soon"]],
  ["biz-13", "Welcher Kunde hat die meisten aktiven Touren?", ["propus_report", "search_customers"]],
  ["biz-14", "Wann wurde die Tour für Objekt XY zuletzt verlängert?", ["get_tour_detail", "get_tour_status", "search_orders"]],
  ["biz-15", "Wie hoch sind die monatlichen Matterport-Kosten aktuell?", ["propus_report", "matterport_list_spaces"]],

  ["biz-16", "Wer sind unsere Top-10-Kunden nach Auftragsvolumen?", ["propus_report", "search_customers"]],
  ["biz-17", "Welche Kunden haben seit über 3 Monaten keinen Auftrag erteilt?", ["propus_report", "search_customers"]],
  ["biz-18", "Zeig mir alle Kunden aus dem Kanton Zug.", ["propus_report", "search_customers"]],
  ["biz-19", "Gibt es Kunden ohne hinterlegte E-Mail-Adresse?", ["propus_report", "search_customers"]],
  ["biz-20", "Welche Kunden haben eine offene Rechnung?", ["propus_report", "search_invoices"]],
  ["biz-21", "Wer ist der Hauptkontakt bei Firma XY?", ["search_customers", "get_customer_contacts", "search_contacts"]],
  ["biz-22", "Zeig mir die Auftragshistorie von Kunde XY.", ["search_customers", "get_customer_detail"]],

  ["biz-23", "Welche Rechnungen sind überfällig?", ["propus_report", "get_overdue_invoices", "search_invoices"]],
  ["biz-24", "Wie hoch ist der offene Umsatz diesen Monat?", ["propus_report", "get_invoice_stats", "search_invoices"]],
  ["biz-25", "Zeig mir alle Rechnungen, die noch nicht bezahlt wurden.", ["propus_report", "search_invoices"]],
  ["biz-26", "Wie viel Umsatz haben wir im letzten Quartal gemacht?", ["propus_report", "get_invoice_stats"]],
  ["biz-27", "Welche Rechnungen wurden in den letzten 7 Tagen erstellt?", ["propus_report", "search_invoices"]],
  ["biz-28", "Gibt es Rechnungen mit Korrekturbedarf?", ["propus_report", "search_invoices"]],

  ["biz-29", "Wie viele Foto-Aufträge hat Ivan diese Woche?", ["propus_report", "get_open_orders", "search_orders"]],
  ["biz-30", "Welche Objekte wurden noch nicht retouchiert?", ["propus_report", "search_orders"]],
  ["biz-31", "Zeig mir alle Aufträge, bei denen Drohnenfotos bestellt wurden.", ["propus_report", "search_orders"]],
  ["biz-32", "Wie lange ist die durchschnittliche Bearbeitungszeit in Post-Production?", ["propus_report"]],
  ["biz-33", "Welche Aufträge sind für Marijana in der Warteschlange?", ["propus_report", "search_orders", "get_open_orders"]],
  ["biz-34", "Wie viele Reels wurden diesen Monat produziert?", ["propus_report", "search_orders"]],

  ["biz-35", "Wann ist der nächste freie Shooting-Termin?", ["propus_report", "get_open_orders", "list_photographers"]],
  ["biz-36", "Welche Termine kollidieren diese Woche?", ["propus_report", "get_open_orders"]],
  ["biz-37", "Wie ausgelastet ist das Team nächste Woche?", ["propus_report", "get_open_orders"]],
  ["biz-38", "Gibt es Aufträge ohne zugewiesenen Fotografen?", ["propus_report", "get_open_orders"]],
  ["biz-39", "Welche Objekte liegen ausserhalb der normalen Reisezone?", ["propus_report", "get_route"]],

  ["biz-40", "Wie hat sich das Auftragsvolumen im Jahresvergleich entwickelt?", ["propus_report", "search_orders"]],
  ["biz-41", "Welche Dienstleistung wird am häufigsten gebucht?", ["propus_report", "list_available_services"]],
  ["biz-42", "In welchem Kanton haben wir die meisten Kunden?", ["propus_report", "search_customers"]],
  ["biz-43", "Wie hoch ist die Stornoquote in den letzten 6 Monaten?", ["propus_report", "search_orders"]],
  ["biz-44", "Welche Monate sind erfahrungsgemäss am stärksten ausgelastet?", ["propus_report", "search_orders"]],

  ["biz-45", "Welche Benutzer haben Admin-Rechte?", ["propus_report", "query_database"]],
  ["biz-46", "Gibt es Datensätze mit fehlender Adresse?", ["propus_report", "search_customers"]],
  ["biz-47", "Welche Aufträge haben kein verknüpftes Objekt?", ["propus_report", "search_orders"]],
  ["biz-48", "Zeig mir alle offenen Kanban-Karten.", ["propus_report", "get_open_orders"]],
  ["biz-49", "Gibt es doppelte Kundendatensätze?", ["propus_report", "search_customers"]],
  ["biz-50", "Was hat sich auf der Plattform in den letzten 24 Stunden geändert?", ["propus_report", "get_recent_posteingang_messages"]],
];

export const BUSINESS_COVERAGE_CASES: BusinessEvalRow[] = ROWS.map(([id, userMessage, expectToolAnyOf]) => ({
  id,
  userMessage,
  expectToolAnyOf,
}));
