/**
 * Zentrale SEO- und Organisations-Defaults.
 *
 * Single source of truth fuer strukturierte Daten (JSON-LD), Canonical-Basis und
 * Open-Graph-Defaults. Textuelle Site-Metadaten (Name, Adresslines, Telefon, Email)
 * bleiben in `content/site.ts`, um bestehende Importe nicht zu brechen; dieses Modul
 * ergaenzt und re-exportiert sie in strukturierter Form.
 */

import { site, impressum, seo } from '../content/site';

/** Basis-URL fuer Canonicals, OG-URLs und JSON-LD @id. */
export const canonicalBase = 'https://www.propus.ch' as const;

/** BCP-47 Locale fuer <html lang> / og:locale / inLanguage. */
export const contentLocale = 'de-CH' as const;

/** Fuer og:locale (Underscore-Variante). */
export const ogLocale = 'de_CH' as const;

/** Default-Open-Graph-Bild, wenn keine Seite ein eigenes setzt. */
export const defaultOgImage = seo.defaultOgImage;

/**
 * Strukturierte Organisationsdaten fuer JSON-LD.
 * Verifizierte Werte; `geo` wurde bewusst weggelassen, weil die Koordinaten fuer
 * Untere Roostmatt 8 nicht zuverlaessig per Nominatim / search.ch abgefragt werden
 * konnten. Lieber weglassen als raten.
 */
export const organization = {
	legalName: site.legalName,
	alternateName: site.name,
	url: canonicalBase,
	telephone: site.phone,
	email: site.email,
	address: {
		streetAddress: 'Untere Roostmatt 8',
		postalCode: '6300',
		addressLocality: 'Zug',
		addressRegion: 'ZG',
		addressCountry: 'CH',
	},
	/**
	 * SHAB-Eintragungsdatum laut Moneyhouse (primaere Quelle fuer `foundingDate`).
	 * Statutendatum waere 2024-05-23 (ebenfalls Moneyhouse); Schema.org verwendet
	 * konventionell das Eintragungsdatum. Bei Zweifeln zefix.ch als Primaerquelle.
	 */
	foundingDate: '2024-06-07',
	/** CHE-UID aus Impressum (site.ts → impressum.uid). */
	uid: impressum.uid,
	priceRange: 'CHF 229–649',
	openingHours: [
		{
			dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
			opens: '08:00',
			closes: '17:00',
		},
	],
	/** Primaer bediente Regionen. */
	areaServed: [
		{ name: 'Kanton Zürich', code: 'CH-ZH' },
		{ name: 'Kanton Zug', code: 'CH-ZG' },
		{ name: 'Kanton Schwyz', code: 'CH-SZ' },
		{ name: 'Kanton Aargau', code: 'CH-AG' },
	],
	/**
	 * Verifizierte Social- und Profil-URLs.
	 * Facebook: Seite `propusimm0` noch aktiv unter altem Brand «Propus Immo».
	 * Threads: `@propus.ch` aktiv.
	 * CubiCasa: Fotografen-Profil aktiv.
	 * Google Maps Link aus bestehendem Code uebernommen.
	 */
	sameAs: [
		'https://www.instagram.com/propus.ch/',
		'https://ch.linkedin.com/company/propusgmbh',
		'https://www.facebook.com/propusimm0/',
		'https://www.threads.com/@propus.ch',
		'https://www.cubi.casa/photographer/propus-gmbh/',
		'https://www.google.com/maps/place/Propus+GmbH/@47.1566619,8.5120229,17z',
	],
	/**
	 * Leistungskatalog fuer `hasOfferCatalog`. Preise werden separat via
	 * Booking-API geladen; hier nur Name und Kurzbeschreibung.
	 */
	services: [
		{ name: 'Immobilienfotografie', description: 'Innen- und Aussenaufnahmen für Portale, Exposés und Druck.' },
		{ name: 'Drohnenaufnahmen', description: 'Luftaufnahmen für Lage und Gebäude, regelkonform geplant.' },
		{ name: '360°-Rundgang', description: 'Virtuelle Rundgänge für Orientierung vor der Besichtigung.' },
		{ name: 'Grundrisse', description: 'Grundrisse für Portale, PDF und Druck.' },
		{ name: 'Immobilienvideo', description: 'Kurze Formate mit ruhigem Schnitt für Website und Social Media.' },
		{ name: 'Home Staging', description: 'Inszenierung leerer oder bewohnter Räume.' },
		{ name: 'Visualisierung', description: 'Renderings für Neubau, Umbau und Vorvermarktung.' },
		{ name: 'Retusche', description: 'Entfernen störender Objekte und Bildaufbereitung.' },
	],
} as const;

/** Gibt einen vollstaendigen Seitentitel im Schema "{title} | Propus" zurueck. */
export function buildTitle(pageTitle: string): string {
	return `${pageTitle} | ${organization.alternateName}`;
}
