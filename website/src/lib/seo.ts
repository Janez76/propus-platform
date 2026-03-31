import { footerLegalLinks as staticFooterLegalLinks, nav as staticNav, seo as seoDefaults } from '../content/site';
import { cmsImageUrlForDisplay } from './cmsDisplayImage';
import { readCms } from './cms/store';
import type { CmsSeoPage, CmsSeoSettings, CmsState } from './cms/types';
import {
	SEO_PAGE_DEFINITIONS,
	getSeoPageDefinition,
	normalizeSeoPath,
	type SeoPageKey,
} from './seo-config';

export type ResolvedSeoSettings = {
	defaultOgImageUrl: string;
	sitemapEnabled: boolean;
	allowIndexing: boolean;
	robotsDisallow: string[];
	robotsCustom?: string;
	autoImageOptimization: boolean;
};

export type ResolvedSeoPage = {
	key: SeoPageKey;
	label: string;
	path: string;
	defaultPath: string;
	title: string;
	description: string;
	keywords: string;
	ogTitle: string;
	ogDescription: string;
	ogImage: string;
	index: boolean;
	slugEditable: boolean;
	adminHref: string;
};

export type SeoRouteEntry = {
	key: SeoPageKey;
	defaultPath: string;
	path: string;
	slugEditable: boolean;
};

export type SeoNavLink = { href: string; label: string };

const DEFAULT_SETTINGS: ResolvedSeoSettings = {
	defaultOgImageUrl: seoDefaults.defaultOgImage,
	sitemapEnabled: true,
	allowIndexing: true,
	robotsDisallow: [],
	autoImageOptimization: true,
};

export function resolveSeoSettings(state: CmsState): ResolvedSeoSettings {
	const settings = (state.seoSettings || {}) as CmsSeoSettings;
	const autoImageOptimization = settings.autoImageOptimization !== false;
	return {
		defaultOgImageUrl: settings.defaultOgImageUrl || DEFAULT_SETTINGS.defaultOgImageUrl,
		sitemapEnabled: settings.sitemapEnabled !== false,
		allowIndexing: settings.allowIndexing !== false,
		robotsDisallow: Array.isArray(settings.robotsDisallow)
			? settings.robotsDisallow.map((entry) => normalizeSeoPath(entry)).filter(Boolean)
			: [],
		autoImageOptimization,
		...(settings.robotsCustom ? { robotsCustom: settings.robotsCustom } : {}),
	};
}

function getSeoEntry(state: CmsState, key: SeoPageKey): CmsSeoPage | undefined {
	return Array.isArray(state.seoPages) ? state.seoPages.find((entry) => entry.key === key) : undefined;
}

export function resolveSeoPage(state: CmsState, key: SeoPageKey): ResolvedSeoPage {
	const def = getSeoPageDefinition(key);
	const entry = getSeoEntry(state, key);
	const settings = resolveSeoSettings(state);
	const path =
		def.slugEditable && entry?.slug ? normalizeSeoPath(entry.slug) || def.defaultPath : def.defaultPath;
	const title = entry?.metaTitle?.trim() || def.defaultTitle;
	const description = entry?.metaDescription?.trim() || def.defaultDescription;
	const keywords = entry?.keywords?.trim() || def.defaultKeywords || '';
	const ogTitle = entry?.ogTitle?.trim() || title;
	const ogDescription = entry?.ogDescription?.trim() || description;
	const ogImageBase = entry?.ogImageUrl?.trim() || settings.defaultOgImageUrl;
	const pageIndex = typeof entry?.index === 'boolean' ? entry.index : def.defaultIndex;
	const ogImage = cmsImageUrlForDisplay(
		ogImageBase,
		'service',
		settings.autoImageOptimization,
	);
	return {
		key,
		label: def.label,
		path,
		defaultPath: def.defaultPath,
		title,
		description,
		keywords,
		ogTitle,
		ogDescription,
		ogImage,
		index: settings.allowIndexing && pageIndex,
		slugEditable: def.slugEditable,
		adminHref: def.adminHref,
	};
}

export function resolveSeoRouteMap(state: CmsState): SeoRouteEntry[] {
	return SEO_PAGE_DEFINITIONS.filter((def) => def.slugEditable).map((def) => ({
		key: def.key,
		defaultPath: def.defaultPath,
		path: resolveSeoPage(state, def.key).path,
		slugEditable: def.slugEditable,
	}));
}

export async function loadSeoPage(key: SeoPageKey): Promise<ResolvedSeoPage> {
	const state = await readCms();
	return resolveSeoPage(state, key);
}

export async function loadSeoSettings(): Promise<ResolvedSeoSettings> {
	const state = await readCms();
	return resolveSeoSettings(state);
}

export async function loadAllSeoPages(): Promise<ResolvedSeoPage[]> {
	const state = await readCms();
	return SEO_PAGE_DEFINITIONS.map((def) => resolveSeoPage(state, def.key));
}

export function resolveSiteSeoLinks(state: CmsState): {
	navItems: SeoNavLink[];
	footerLegalItems: SeoNavLink[];
} {
	const pick = (key: SeoPageKey) => resolveSeoPage(state, key);
	return {
		navItems: [
			pick('startseite'),
			pick('portfolio'),
			pick('dienstleistungen'),
			pick('preise'),
			pick('ueber-uns'),
			pick('kontakt'),
		].map((page) => ({ href: page.path, label: page.label })),
		footerLegalItems: [pick('impressum'), pick('datenschutz'), pick('agb')].map((page) => ({
			href: page.path,
			label: page.label,
		})),
	};
}

export async function loadSiteSeoLinks(): Promise<{
	navItems: SeoNavLink[];
	footerLegalItems: SeoNavLink[];
}> {
	try {
		const state = await readCms();
		return resolveSiteSeoLinks(state);
	} catch {
		return {
			navItems: [...staticNav],
			footerLegalItems: [...staticFooterLegalLinks],
		};
	}
}

let cachedRouteMap: SeoRouteEntry[] | null = null;
let cachedRouteMapAt = 0;

export async function loadSeoRouteMapCached(ttlMs = 15000): Promise<SeoRouteEntry[]> {
	const now = Date.now();
	if (cachedRouteMap && now - cachedRouteMapAt < ttlMs) return cachedRouteMap;
	try {
		const state = await readCms();
		cachedRouteMap = resolveSeoRouteMap(state);
		cachedRouteMapAt = now;
		return cachedRouteMap;
	} catch {
		return SEO_PAGE_DEFINITIONS.filter((def) => def.slugEditable).map((def) => ({
			key: def.key,
			defaultPath: def.defaultPath,
			path: def.defaultPath,
			slugEditable: def.slugEditable,
		}));
	}
}
