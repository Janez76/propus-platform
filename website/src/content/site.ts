/** Zentrale Site-Konfiguration und Kurztexte (deutsch). */

const logoFromEnv =
	typeof import.meta.env.PUBLIC_SITE_LOGO_URL === 'string'
		? import.meta.env.PUBLIC_SITE_LOGO_URL.trim()
		: '';

export const site = {
	/** Kurzname / Markenzeile */
	name: 'Propus',
	/** Rechtlicher Name (Footer, Impressum) */
	legalName: 'Propus GmbH',
	/** Kurze Zeile unter dem Logo im Header */
	headerLine: 'Immobilienfotografie',
	/**
	 * Logo (links im Header). Ohne lokale Datei: `PUBLIC_SITE_LOGO_URL` (z. B. Supabase public URL) setzen;
	 * sonst Fallback unter `/images/` falls im Projekt vorhanden.
	 */
	logoSrc: logoFromEnv || '/images/propus-logo.png',
	tagline: 'Gold Standard für Immobilienpräsentation',
	description:
		'Propus GmbH – Immobilienfotografie, Drohnenaufnahmen, 360°-Rundgänge, Grundrisse und Visualisierungen in Zug und der ganzen Schweiz. Professionell, schnell, online buchbar.',
	url: 'https://www.propus.ch',
	email: 'office@propus.ch',
	phone: '+41445896363',
	phoneDisplay: '+41 44 589 63 63',
	addressLines: ['Untere Roostmatt 8', '6300 Zug, Schweiz'] as const,
	/** Footer: Wochentage (kurz) */
	officeHoursDays: 'Mo–Sa',
	/** Footer: Zeitspanne, typografisch getrennt von den Tagen */
	officeHoursTime: '08.00 – 17.00 Uhr',
	locale: 'de_CH',
} as const;

/**
 * Impressum (CH) – Zahlen und Formulierungen bitte juristisch prüfen.
 * Adresse Zeile 1 kommt aus `site.addressLines[0]`.
 */
export const impressum = {
	addressLine2: 'CH – 6300 Zug',
	uid: 'CHE-424.310.597',
	chId: 'CH-170-4022021-5',
	management: 'Gemäss Handelsregister',
	registerIntro: 'Eingetragen im Handelsregister des Kantons Zug',
	registerNumber: 'CHE – in Gründung',
	vatNumber: 'CHE- in Gründung',
} as const;

/** Footer-Zeile (Credit). */
export const footerCredit = 'Propus GmbH | Designed by Propus Codestudio' as const;

/** Online-Buchung – alle „Jetzt buchen“-CTAs verweisen hierhin. */
export const bookingAppHref = 'https://booking.propus.ch/' as const;

/** Primärer Call-to-Action (Header, Startseite, Schlussbereiche). */
export const ctaBookHref = bookingAppHref;
export const ctaBookLabel = 'Jetzt buchen' as const;

/** Link zur Portfolio-Übersicht (Startseite). */
export const ctaPortfolioHref = '/portfolio/' as const;
export const ctaPortfolioLabel = 'Vollständiges Portfolio ansehen' as const;

/** Footer: Rechtstexte (Platzhalter-Seiten – Inhalt rechtlich prüfen). */
export const footerLegalLinks = [
	{ href: '/impressum/', label: 'Impressum' },
	{ href: '/datenschutz/', label: 'Datenschutz' },
	{ href: '/agb/', label: 'AGB' },
] as const;

/** Footer: Social – optional `href` setzen; ohne `href` nur Icon (ohne Link). */
export type FooterSocialNetwork = 'instagram' | 'linkedin';

export type FooterSocialLink = {
	readonly label: string;
	readonly network: FooterSocialNetwork;
	readonly href?: string;
};

export const footerSocialLinks: readonly FooterSocialLink[] = [
	{ label: 'Instagram', network: 'instagram', href: 'https://www.instagram.com/propus.ch/' },
	{ label: 'LinkedIn', network: 'linkedin', href: 'https://ch.linkedin.com/company/propusgmbh' },
];

export const nav = [
	{ href: '/', label: 'Startseite' },
	{ href: '/portfolio/', label: 'Portfolio' },
	{ href: '/dienstleistungen/', label: 'Dienstleistungen' },
	{ href: '/preise/', label: 'Preise' },
	{ href: '/ueber-uns/', label: 'Über uns' },
	{ href: '/kontakt/', label: 'Kontakt' },
] as const;

export const seo = {
	defaultTitle: `${site.name} – ${site.tagline}`,
	defaultDescription: site.description,
	/** Absoluter Bild-URL für Open Graph (Platzhalter). */
	defaultOgImage:
		'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&h=630&fit=crop&q=85',
} as const;
