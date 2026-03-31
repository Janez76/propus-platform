import type { PortfolioCategory } from '../../content/portfolio';
import type { SeoPageKey } from '../seo-config';

export type { PortfolioCategory };

export const PORTFOLIO_CATEGORIES: { id: PortfolioCategory; label: string }[] = [
	{ id: 'bodenfotos', label: 'Bodenfotos' },
	{ id: 'luftaufnahmen', label: 'Luftaufnahmen' },
	{ id: 'tour360', label: '360° Rundgang' },
	{ id: 'grundrisse', label: 'Grundrisse' },
	{ id: 'video', label: 'Video' },
	{ id: 'staging', label: 'Staging' },
	{ id: 'visualisierung', label: 'Visualisierung' },
	{ id: 'retusche', label: 'Retusche' },
];

export const COMPARE_CATEGORIES = ['staging', 'retusche'] as const;
export type CompareCategory = (typeof COMPARE_CATEGORIES)[number];

export function isCompareCategory(cat: PortfolioCategory): cat is CompareCategory {
	return (COMPARE_CATEGORIES as readonly string[]).includes(cat);
}

/** CMS: `enabled === false` → unsichtbar auf der Website, bleibt im Backpanel. */
export function portfolioEntryEnabled(entry: { enabled?: boolean }): boolean {
	return entry.enabled !== false;
}

export function teamMemberEnabled(m: { enabled?: boolean }): boolean {
	return m.enabled !== false;
}

export function clientLogoEnabled(e: { enabled?: boolean }): boolean {
	return e.enabled !== false;
}

export function serviceSectionEnabled(e: { enabled?: boolean }): boolean {
	return e.enabled !== false;
}

export interface CmsMedia {
	id: string;
	src: string;
	createdAt: string;
	alt?: string;
}

export interface CmsPortfolioImage {
	id: string;
	kind: 'image';
	category: PortfolioCategory;
	sort: number;
	mediaId: string;
	enabled?: boolean;
}

export interface CmsPortfolioCompare {
	id: string;
	kind: 'compare';
	category: CompareCategory;
	sort: number;
	beforeMediaId: string;
	afterMediaId: string;
	enabled?: boolean;
}

export interface CmsPortfolioMatterport {
	id: string;
	kind: 'matterport';
	category: 'tour360';
	sort: number;
	/** Original-Link (Bearbeitung im Admin) */
	sourceUrl: string;
	enabled?: boolean;
}

export interface CmsPortfolioYoutube {
	id: string;
	kind: 'youtube';
	category: 'video';
	sort: number;
	sourceUrl: string;
	enabled?: boolean;
}

export type CmsPortfolioEntry =
	| CmsPortfolioImage
	| CmsPortfolioCompare
	| CmsPortfolioMatterport
	| CmsPortfolioYoutube;

export interface CmsTeamMember {
	id: string;
	sort: number;
	name: string;
	role: string;
	/** optional, für Kontakt im Modal */
	email: string;
	bio: string;
	mediaId: string;
	enabled?: boolean;
}

/** Referenzlogo (Startseite Marquee), Bild per URL (https oder Pfad ab `/`). */
export interface CmsClientLogo {
	id: string;
	sort: number;
	/** Anzeigename / Tooltip (z. B. Firmenname). */
	name: string;
	/** Bild-URL (extern oder z. B. Supabase Storage). */
	imageUrl?: string;
	/** @deprecated Alte Einträge nur über Medienbibliothek; beim Speichern durch imageUrl ersetzt. */
	mediaId?: string;
	enabled?: boolean;
}

/** Dienstleistungs-Karte (Seite /dienstleistungen/). */
export interface CmsServiceSection {
	id: string;
	sort: number;
	title: string;
	slogan: string;
	body: string;
	imageAlt: string;
	/** Optional; Fallback 1600×1067 für Layout. */
	width?: number;
	height?: number;
	/** Bild-URL (https, // oder /). */
	imageUrl?: string;
	mediaId?: string;
	enabled?: boolean;
}

export interface CmsSeoPage {
	key: SeoPageKey;
	metaTitle?: string;
	metaDescription?: string;
	keywords?: string;
	ogTitle?: string;
	ogDescription?: string;
	ogImageUrl?: string;
	index?: boolean;
	/**
	 * Editierbarer Pfad für SSR-Seiten mit Middleware-Rewrite.
	 * Wird nur dort aktiv genutzt, wo `slugEditable` in `seo-config.ts` gesetzt ist.
	 */
	slug?: string;
}

export interface CmsSeoSettings {
	defaultOgImageUrl?: string;
	sitemapEnabled?: boolean;
	allowIndexing?: boolean;
	robotsDisallow?: string[];
	robotsCustom?: string;
	autoImageOptimization?: boolean;
}

export interface CmsState {
	version: 1;
	media: CmsMedia[];
	portfolio: CmsPortfolioEntry[];
	featuredPortfolioIds: string[];
	team: CmsTeamMember[];
	clientLogos: CmsClientLogo[];
	services: CmsServiceSection[];
	seoPages?: CmsSeoPage[];
	seoSettings?: CmsSeoSettings;
	/** Optional: Header-Logo (URL); sonst `site.logoSrc`. */
	headerLogoUrl?: string;
	headerLogoMediaId?: string;
	/** Optional: separates Header-Logo für Dunkelmodus; sonst dasselbe wie Hellmodus. */
	headerLogoDarkUrl?: string;
	headerLogoDarkMediaId?: string;
	/** Optional: Favicon (URL); sonst `/favicon.svg`. */
	faviconUrl?: string;
	faviconMediaId?: string;
}
