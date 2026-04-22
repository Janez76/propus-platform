import { site } from '../content/site';

export type SeoPageKey =
	| 'startseite'
	| 'portfolio'
	| 'dienstleistungen'
	| 'preise'
	| 'ueber-uns'
	| 'kontakt'
	| 'impressum'
	| 'datenschutz'
	| 'agb';

/** Gruppierung im SEO-Backpanel (Akkordeons pro Bereich). */
export type SeoAdminGroup = 'einstieg' | 'angebot' | 'recht';

export const SEO_ADMIN_GROUP_ORDER: readonly SeoAdminGroup[] = ['einstieg', 'angebot', 'recht'] as const;

export const SEO_ADMIN_GROUP_LABELS: Record<
	SeoAdminGroup,
	{ title: string; hint: string }
> = {
	einstieg: {
		title: 'Einstieg',
		hint: 'Die Haupt-Landingpage – Titel und Beschreibung wirken in Suche und beim Teilen am stärksten.',
	},
	angebot: {
		title: 'Angebot & Kontakt',
		hint: 'Leistungsseiten und Kontakt – klar formulieren, damit Suchmaschinen und Nutzer sofort den Nutzen erkennen.',
	},
	recht: {
		title: 'Rechtliches',
		hint: 'Pflichtseiten; standardmäßig ohne Indexierung, damit Fokus auf Inhaltsseiten bleibt.',
	},
};

export type SeoPageDefinition = {
	key: SeoPageKey;
	/** Reihenfolge im Backpanel innerhalb der Gruppe (aufsteigend). */
	sort: number;
	adminGroup: SeoAdminGroup;
	label: string;
	defaultPath: string;
	defaultTitle: string;
	defaultDescription: string;
	defaultKeywords?: string;
	defaultIndex: boolean;
	slugEditable: boolean;
	adminHref: string;
};

export const SEO_PAGE_DEFINITIONS: readonly SeoPageDefinition[] = [
	{
		key: 'startseite',
		sort: 0,
		adminGroup: 'einstieg',
		label: 'Startseite',
		defaultPath: '/',
		defaultTitle: `Immobilienfotografie Zürich & Deutschschweiz | ${site.name}`,
		defaultDescription:
			'Professionelle Immobilienfotografie, Drohne & 360°-Touren in Zürich, Zug & Deutschschweiz. Pakete ab 229 CHF. Jetzt online buchen.',
		defaultKeywords:
			'Immobilienfotografie, Drohnenaufnahmen, 360 Rundgang, Grundrisse, Immobilienvideo, Visualisierung, Zug, Schweiz',
		defaultIndex: true,
		slugEditable: false,
		adminHref: '/admin/seo',
	},
	{
		key: 'portfolio',
		sort: 10,
		adminGroup: 'angebot',
		label: 'Portfolio',
		defaultPath: '/portfolio/',
		defaultTitle: `Portfolio Immobilienfotografie Schweiz | ${site.name}`,
		defaultDescription:
			'Ausgewählte Arbeiten: Wohnimmobilien, Gewerbe und Neubau aus Zürich, Zug und der Deutschschweiz. Referenzen von Propus GmbH.',
		defaultKeywords:
			'Portfolio, Referenzen, Immobilienfotografie, Drohnenaufnahmen, 360 Rundgang, Matterport, Home Staging, Schweiz',
		defaultIndex: true,
		slugEditable: true,
		adminHref: '/admin/portfolio',
	},
	{
		key: 'dienstleistungen',
		sort: 20,
		adminGroup: 'angebot',
		label: 'Dienstleistungen',
		defaultPath: '/dienstleistungen/',
		defaultTitle: `Leistungen: Foto, Drohne, 360°-Tour, Video | ${site.name}`,
		defaultDescription:
			'Acht Leistungen für Immobilien: Fotografie, Drohne, 360°-Touren, Grundrisse, Video, Staging, Visualisierung, Retusche. Deutschschweiz.',
		defaultKeywords:
			'Immobilienfotografie, Drohnenaufnahmen, 360 Rundgang, Grundriss, Immobilienvideo, Home Staging, Visualisierung, Retusche, Schweiz, Zug',
		defaultIndex: true,
		slugEditable: true,
		adminHref: '/admin/dienstleistungen',
	},
	{
		key: 'preise',
		sort: 30,
		adminGroup: 'angebot',
		label: 'Preise',
		defaultPath: '/preise/',
		defaultTitle: `Preise Immobilienfotografie ab 229 CHF | ${site.name}`,
		defaultDescription:
			'Transparente Pakete: Bestseller 399 CHF, Full View 649 CHF, Cinematic Duo 549 CHF. Einzelleistungen ab 49 CHF. Jetzt buchen.',
		defaultKeywords:
			'Preise, Pakete, Immobilienfotografie, Drohne, Buchung, Leistungen, Schweiz',
		defaultIndex: true,
		slugEditable: true,
		adminHref: '/admin/seo?focus=preise',
	},
	{
		key: 'ueber-uns',
		sort: 40,
		adminGroup: 'angebot',
		label: 'Über uns',
		defaultPath: '/ueber-uns/',
		defaultTitle: `Über Propus — Immobilienfotografen Zug | ${site.name}`,
		defaultDescription:
			'Propus GmbH aus Zug: Immobilienfotografie, Drohne und virtuelle Touren für Makler, Verwaltungen und Architekten in der Deutschschweiz.',
		defaultKeywords:
			'Über uns, Propus GmbH, Immobilienfotograf Zug, Immobilienvermarktung Schweiz, Team',
		defaultIndex: true,
		slugEditable: true,
		adminHref: '/admin/ueber-uns',
	},
	{
		key: 'kontakt',
		sort: 50,
		adminGroup: 'angebot',
		label: 'Kontakt',
		defaultPath: '/kontakt/',
		defaultTitle: `Kontakt Propus GmbH — Anfrage & Termin | ${site.name}`,
		defaultDescription:
			'Propus GmbH, Untere Roostmatt 8, 6300 Zug. Mo–Sa 08:00–17:00. Telefon +41 44 589 63 63. Termin online buchen.',
		defaultKeywords:
			'Kontakt, Anfrage, Offerte, Immobilienfotografie, Drohne, Propus GmbH, Zug',
		defaultIndex: true,
		slugEditable: true,
		adminHref: '/admin/seo?focus=kontakt',
	},
	{
		key: 'impressum',
		sort: 10,
		adminGroup: 'recht',
		label: 'Impressum',
		defaultPath: '/impressum/',
		defaultTitle: `Impressum | ${site.name}`,
		defaultDescription:
			'Impressum der Propus GmbH: Kontakt, UID, Registerangaben und rechtliche Hinweise gemäss Schweizer Recht.',
		defaultKeywords: 'Impressum, Propus GmbH, Zug',
		defaultIndex: false,
		slugEditable: false,
		adminHref: '/admin/seo',
	},
	{
		key: 'datenschutz',
		sort: 20,
		adminGroup: 'recht',
		label: 'Datenschutz',
		defaultPath: '/datenschutz/',
		defaultTitle: `Datenschutz | ${site.name}`,
		defaultDescription:
			'Datenschutzerklärung der Propus GmbH: Umgang mit personenbezogenen Daten bei Website und Aufträgen.',
		defaultKeywords: 'Datenschutz, Propus GmbH, Privatsphäre',
		defaultIndex: false,
		slugEditable: false,
		adminHref: '/admin/seo',
	},
	{
		key: 'agb',
		sort: 30,
		adminGroup: 'recht',
		label: 'AGB',
		defaultPath: '/agb/',
		defaultTitle: `AGB | ${site.name}`,
		defaultDescription:
			'Allgemeine Geschäftsbedingungen (AGB) der Propus GmbH für Leistungen in der Immobilienvisualisierung.',
		defaultKeywords: 'AGB, Propus GmbH, Vertragsbedingungen',
		defaultIndex: false,
		slugEditable: false,
		adminHref: '/admin/seo',
	},
] as const;

export function getSeoPageDefinition(key: SeoPageKey): SeoPageDefinition {
	const hit = SEO_PAGE_DEFINITIONS.find((entry) => entry.key === key);
	if (!hit) throw new Error(`Unbekannter SEO-Seitenschlüssel: ${key}`);
	return hit;
}

export function normalizeSeoPath(input: string | undefined | null): string {
	const raw = String(input || '').trim();
	if (!raw) return '';
	let path = raw;
	if (/^https?:\/\//i.test(path)) {
		try {
			path = new URL(path).pathname;
		} catch {
			return '';
		}
	}
	if (!path.startsWith('/')) path = `/${path}`;
	path = path.replace(/\/{2,}/g, '/');
	if (path === '/') return '/';
	if (path.endsWith('/')) path = path.slice(0, -1);
	if (/\/[^/]+\.[a-z0-9]+$/i.test(path)) return path;
	return `${path}/`.replace(/\/{2,}/g, '/');
}

export function isReservedSeoPath(pathname: string): boolean {
	const path = normalizeSeoPath(pathname);
	if (!path) return true;
	return (
		path.startsWith('/admin/') ||
		path.startsWith('/api/') ||
		path.startsWith('/_astro/') ||
		path.startsWith('/uploads/') ||
		path === '/favicon.svg/' ||
		path === '/robots.txt/' ||
		path === '/sitemap.xml/'
	);
}
