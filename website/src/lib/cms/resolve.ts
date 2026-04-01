import type { ClientLogo } from '../../content/clients';
import type { PortfolioItem } from '../../content/portfolio';
import { cmsImageUrlForDisplay } from '../cmsDisplayImage';
import type { ServiceDetailSection } from '../../content/services-detail';
import type { TeamMember } from '../../content/team';
import { clientLogos as staticClientLogos } from '../../content/clients';
import { portfolioItems } from '../../content/portfolio';
import { servicesDetailSections } from '../../content/services-detail';
import { teamMembers } from '../../content/team';
import { site } from '../../content/site';
import { matterportEmbedUrl, youtubeEmbedUrl } from '../embeds';
import { normalizeClientLogoImageUrl } from './clientLogoUrl';
import {
	PORTFOLIO_CATEGORIES,
	clientLogoEnabled,
	portfolioEntryEnabled,
	serviceSectionEnabled,
	teamMemberEnabled,
} from './types';
import type { CmsState } from './types';
import { getSupabaseAdmin } from '../supabase/admin';
import { resolveSeoPage, resolveSiteSeoLinks, type ResolvedSeoPage } from '../seo';
import { readCms } from './store';
import { buildDefaultCmsServices, ensureDefaultServicesInCms, ensureSeededCms } from './seed';

const DEFAULT_W = 1600;
const DEFAULT_H = 1067;
/** 16:9 für Matterport- und YouTube-iframes (Layout / aspect-ratio auf der Seite). */
const EMBED_W = 1920;
const EMBED_H = 1080;
const TEAM_W = 800;
const TEAM_H = 1000;

const catOrder = PORTFOLIO_CATEGORIES.map((c) => c.id);

function imageOptimizationEnabled(state: CmsState | null | undefined): boolean {
	return state?.seoSettings?.autoImageOptimization !== false;
}

function optimizePortfolioItem(item: PortfolioItem, enabled = true): PortfolioItem {
	if (item.kind === 'image') {
		return {
			...item,
			src: cmsImageUrlForDisplay(item.src, 'portfolio', enabled),
			width: DEFAULT_W,
			height: DEFAULT_H,
		};
	}
	if (item.kind === 'compare') {
		return {
			...item,
			width: DEFAULT_W,
			height: DEFAULT_H,
			compare: {
				...item.compare,
				beforeSrc: cmsImageUrlForDisplay(item.compare.beforeSrc, 'portfolio', enabled),
				afterSrc: cmsImageUrlForDisplay(item.compare.afterSrc, 'portfolio', enabled),
			},
		};
	}
	return item;
}

export function cmsStateToPortfolioItems(state: CmsState): PortfolioItem[] {
	const optimize = imageOptimizationEnabled(state);
	const mediaMap = Object.fromEntries(state.media.map((m) => [m.id, m]));

	const sorted = [...state.portfolio].sort((a, b) => {
		const ia = catOrder.indexOf(a.category);
		const ib = catOrder.indexOf(b.category);
		if (ia !== ib) return ia - ib;
		return a.sort - b.sort;
	});

	const out: PortfolioItem[] = [];

	for (const entry of sorted) {
		if (!portfolioEntryEnabled(entry)) continue;
		if (entry.kind === 'image') {
			const m = mediaMap[entry.mediaId];
			if (!m) continue;
			out.push({
				id: entry.id,
				kind: 'image',
				src: cmsImageUrlForDisplay(m.src, 'portfolio', optimize),
				alt: m.alt || '',
				width: DEFAULT_W,
				height: DEFAULT_H,
				categories: [entry.category],
			});
		} else if (entry.kind === 'compare') {
			const before = mediaMap[entry.beforeMediaId];
			const after = mediaMap[entry.afterMediaId];
			if (!before || !after) continue;
			out.push({
				id: entry.id,
				kind: 'compare',
				width: DEFAULT_W,
				height: DEFAULT_H,
				categories: [entry.category],
				compare: {
					beforeSrc: cmsImageUrlForDisplay(before.src, 'portfolio', optimize),
					afterSrc: cmsImageUrlForDisplay(after.src, 'portfolio', optimize),
					beforeAlt: before.alt || 'Vorher',
					afterAlt: after.alt || 'Nachher',
				},
			});
		} else if (entry.kind === 'matterport') {
			const embed = matterportEmbedUrl(entry.sourceUrl);
			if (!embed) continue;
			out.push({
				id: entry.id,
				kind: 'matterport',
				embedUrl: embed,
				width: EMBED_W,
				height: EMBED_H,
				categories: [entry.category],
			});
		} else if (entry.kind === 'youtube') {
			const embed = youtubeEmbedUrl(entry.sourceUrl);
			if (!embed) continue;
			out.push({
				id: entry.id,
				kind: 'youtube',
				embedUrl: embed,
				width: EMBED_W,
				height: EMBED_H,
				categories: [entry.category],
			});
		}
	}

	return out;
}

/** Startseiten-Vorschau: nur statische Kacheln (Bild / Vorher-Nachher), max. 6, CMS-Reihenfolge. */
export function resolveFeaturedPortfolio(
	state: CmsState,
	items: PortfolioItem[],
): PortfolioItem[] {
	const byId = Object.fromEntries(items.map((i) => [i.id, i]));
	const out: PortfolioItem[] = [];
	for (const id of state.featuredPortfolioIds) {
		const i = byId[id];
		if (!i || (i.kind !== 'image' && i.kind !== 'compare')) continue;
		out.push(i);
		if (out.length >= 6) break;
	}
	if (out.length > 0) return out;
	return items.filter((it) => it.kind === 'image').slice(0, 6);
}

export function cmsStateToTeamMembers(state: CmsState): TeamMember[] {
	const optimize = imageOptimizationEnabled(state);
	const mediaMap = Object.fromEntries(state.media.map((m) => [m.id, m]));
	return [...state.team]
		.filter((m) => teamMemberEnabled(m))
		.sort((a, b) => a.sort - b.sort)
		.map((m) => {
			const img = m.mediaId ? mediaMap[m.mediaId] : undefined;
			const paras = m.bio
				.split(/\n\n+/)
				.map((s) => s.trim())
				.filter(Boolean);
			return {
				id: m.id,
				name: m.name,
				role: m.role,
				email: m.email || '',
				bio: paras.length ? paras : [''],
				imageSrc: img?.src ? cmsImageUrlForDisplay(img.src, 'team', optimize) : undefined,
				imageAlt: m.name,
				width: TEAM_W,
				height: TEAM_H,
			};
		});
}

export function cmsStateToClientLogos(state: CmsState): ClientLogo[] {
	const optimize = imageOptimizationEnabled(state);
	const logos = Array.isArray(state.clientLogos) ? state.clientLogos : [];
	const media = Array.isArray(state.media) ? state.media : [];
	const mediaMap = Object.fromEntries(media.map((m) => [m.id, m]));
	const out: ClientLogo[] = [];
	for (const c of [...logos].sort((a, b) => a.sort - b.sort)) {
		if (!clientLogoEnabled(c)) continue;
		const url = (c.imageUrl || '').trim();
		const fromMedia = c.mediaId ? mediaMap[c.mediaId] : undefined;
		const imageSrc = url || fromMedia?.src;
		if (!imageSrc) continue;
		out.push({
			id: c.id,
			name: c.name,
			imageSrc: cmsImageUrlForDisplay(imageSrc, 'logo', optimize),
			wordmark: c.name,
		});
	}
	return out;
}

/** Portfolio für die Website (CMS mit einmaligem Seed bei leerer Datei, sonst Fallback TS). */
export async function loadSitePortfolio(): Promise<PortfolioItem[]> {
	const raw = await readCms();
	if (raw.portfolio.length === 0) {
		if (raw.team.length === 0 && raw.media.length === 0) {
			const seeded = await ensureSeededCms();
			return cmsStateToPortfolioItems(seeded);
		}
		return portfolioItems.map((item) => optimizePortfolioItem(item, imageOptimizationEnabled(raw)));
	}
	const items = cmsStateToPortfolioItems(raw);
	return items.length > 0
		? items
		: portfolioItems.map((item) => optimizePortfolioItem(item, imageOptimizationEnabled(raw)));
}

export async function loadSiteCmsState(): Promise<CmsState> {
	const raw = await readCms();
	if (raw.portfolio.length === 0 && raw.team.length === 0 && raw.media.length === 0) {
		return ensureSeededCms();
	}
	return raw;
}

export async function loadSiteTeam(): Promise<TeamMember[]> {
	const raw = await readCms();
	if (raw.team.length === 0) {
		if (raw.portfolio.length === 0 && raw.media.length === 0) {
			const seeded = await ensureSeededCms();
			return cmsStateToTeamMembers(seeded);
		}
		return teamMembers.map((m) => ({
			...m,
			imageSrc: m.imageSrc
				? cmsImageUrlForDisplay(m.imageSrc, 'team', imageOptimizationEnabled(raw))
				: m.imageSrc,
		}));
	}
	const t = cmsStateToTeamMembers(raw);
	return t.length > 0
		? t
		: teamMembers.map((m) => ({
				...m,
				imageSrc: m.imageSrc
					? cmsImageUrlForDisplay(m.imageSrc, 'team', imageOptimizationEnabled(raw))
					: m.imageSrc,
			}));
}

/** „Ausgewählte Arbeiten“ auf der Startseite (CMS-Reihenfolge, Fallback erste Einzelbilder). */
export async function loadHomePortfolioPreview(): Promise<PortfolioItem[]> {
	const cms = await loadSiteCmsState();
	let items = cmsStateToPortfolioItems(cms);
	if (items.length === 0)
		items = portfolioItems.map((item) => optimizePortfolioItem(item, imageOptimizationEnabled(cms)));
	return resolveFeaturedPortfolio(cms, items);
}

/** Kundenlogos für die Startseite (CMS); sonst statische Platzhalter aus `content/clients.ts`). */
export async function loadSiteClientLogos(): Promise<ClientLogo[]> {
	const raw = await readCms();
	const fromCms = cmsStateToClientLogos(raw);
	if (fromCms.length > 0) return fromCms;
	return staticClientLogos.map((c) =>
		c.imageSrc
			? { ...c, imageSrc: cmsImageUrlForDisplay(c.imageSrc, 'logo', imageOptimizationEnabled(raw)) }
			: c,
	);
}

export type SiteBranding = {
	logoSrc: string;
	/** Gesetzt, wenn im CMS ein eigenes Header-Logo für den Dunkelmodus hinterlegt ist. */
	logoSrcDark?: string;
	faviconHref: string;
	faviconType: string;
};

export type HomePageData = {
	seoStart: ResolvedSeoPage;
	seoPortfolio: ResolvedSeoPage;
	featuredPortfolio: PortfolioItem[];
	clientLogos: ClientLogo[];
	branding: SiteBranding;
	siteLinks: ReturnType<typeof resolveSiteSeoLinks>;
};

const HOME_PAGE_CACHE_MS = 60 * 1000;
let cachedHomePageData:
	| {
			expiresAt: number;
			value: HomePageData;
	  }
	| null = null;
let homePageDataInFlight: Promise<HomePageData> | null = null;

/**
 * Einmal CMS lesen für die Startseite (SEO, Header/Footer, Featured, Logos) – vermeidet mehrere Supabase-Roundtrips.
 */
export async function loadHomePageData(): Promise<HomePageData> {
	const now = Date.now();
	if (cachedHomePageData && cachedHomePageData.expiresAt > now) {
		return cachedHomePageData.value;
	}
	if (!homePageDataInFlight) {
		homePageDataInFlight = (async () => {
			const state = await loadSiteCmsState();
			const seoStart = resolveSeoPage(state, 'startseite');
			const seoPortfolio = resolveSeoPage(state, 'portfolio');
			let items = cmsStateToPortfolioItems(state);
			if (items.length === 0) {
				items = portfolioItems.map((item) =>
					optimizePortfolioItem(item, imageOptimizationEnabled(state)),
				);
			}
			const featuredPortfolio = resolveFeaturedPortfolio(state, items);
			const fromCms = cmsStateToClientLogos(state);
			const clientLogos =
				fromCms.length > 0
					? fromCms
					: staticClientLogos.map((c) =>
							c.imageSrc
								? {
										...c,
										imageSrc: cmsImageUrlForDisplay(c.imageSrc, 'logo', imageOptimizationEnabled(state)),
									}
								: c,
						);
			const branding = siteBrandingFromState(state);
			const siteLinks = resolveSiteSeoLinks(state);
			const value = {
				seoStart,
				seoPortfolio,
				featuredPortfolio,
				clientLogos,
				branding,
				siteLinks,
			};
			cachedHomePageData = {
				expiresAt: Date.now() + HOME_PAGE_CACHE_MS,
				value,
			};
			return value;
		})().finally(() => {
			homePageDataInFlight = null;
		});
	}
	return homePageDataInFlight;
}

export function cmsStateToServiceSections(state: CmsState): ServiceDetailSection[] {
	const optimize = imageOptimizationEnabled(state);
	const list = Array.isArray(state.services) ? state.services : [];
	const mediaMap = Object.fromEntries(state.media.map((m) => [m.id, m]));
	const out: ServiceDetailSection[] = [];
	for (const s of [...list].sort((a, b) => a.sort - b.sort)) {
		if (!serviceSectionEnabled(s)) continue;
		const url = (s.imageUrl || '').trim();
		const fromM = s.mediaId ? mediaMap[s.mediaId] : undefined;
		const imageSrc = url || fromM?.src;
		if (!imageSrc) continue;
		const w = s.width && s.width > 0 ? s.width : DEFAULT_W;
		const h = s.height && s.height > 0 ? s.height : DEFAULT_H;
		out.push({
			id: s.id,
			title: s.title.trim(),
			slogan: s.slogan.trim(),
			body: s.body.trim(),
			imageSrc: cmsImageUrlForDisplay(imageSrc, 'service', optimize),
			imageAlt: (s.imageAlt || s.title).trim(),
			width: w,
			height: h,
		});
	}
	return out;
}

/** Dienstleistungs-Karten; leeres CMS wird einmalig aus `content/services-detail.ts` befüllt. */
export async function loadSiteServiceSections(): Promise<ServiceDetailSection[]> {
	await ensureDefaultServicesInCms();
	const raw = await readCms();
	const sections = cmsStateToServiceSections(raw);
	if (sections.length > 0) return sections;
	return cmsStateToServiceSections({ ...raw, services: buildDefaultCmsServices() });
}

function faviconMimeForSrc(src: string): string {
	const pathOnly = src.split('?')[0].split('#')[0].toLowerCase();
	if (pathOnly.endsWith('.png')) return 'image/png';
	if (pathOnly.endsWith('.ico')) return 'image/x-icon';
	if (pathOnly.endsWith('.webp')) return 'image/webp';
	if (pathOnly.endsWith('.gif')) return 'image/gif';
	if (pathOnly.endsWith('.jpg') || pathOnly.endsWith('.jpeg')) return 'image/jpeg';
	if (pathOnly.endsWith('.avif')) return 'image/avif';
	return 'image/svg+xml';
}

const faviconFromEnv =
	typeof import.meta.env.PUBLIC_SITE_FAVICON_URL === 'string'
		? import.meta.env.PUBLIC_SITE_FAVICON_URL.trim()
		: '';

/** Header-Logo und Favicon aus bereits geladenem CMS-State (kein zweites `readCms`). */
export function siteBrandingFromState(state: CmsState): SiteBranding {
	const mediaMap = Object.fromEntries(state.media.map((m) => [m.id, m.src]));

	const optimize = imageOptimizationEnabled(state);

	let logoSrc = site.logoSrc;
	const hMid = (state.headerLogoMediaId || '').trim();
	if (hMid && mediaMap[hMid]) {
		logoSrc = mediaMap[hMid];
	} else {
		const u = normalizeClientLogoImageUrl(state.headerLogoUrl || '');
		if (u) logoSrc = u;
	}

	let logoSrcDark: string | undefined;
	const hdMid = (state.headerLogoDarkMediaId || '').trim();
	if (hdMid && mediaMap[hdMid]) {
		logoSrcDark = cmsImageUrlForDisplay(mediaMap[hdMid], 'branding', optimize);
	} else {
		const du = normalizeClientLogoImageUrl(state.headerLogoDarkUrl || '');
		if (du) logoSrcDark = cmsImageUrlForDisplay(du, 'branding', optimize);
	}

	let faviconHref = faviconFromEnv || '/favicon.svg';
	let faviconType = 'image/svg+xml';
	const fMid = (state.faviconMediaId || '').trim();
	if (fMid && mediaMap[fMid]) {
		faviconHref = mediaMap[fMid];
		faviconType = faviconMimeForSrc(faviconHref);
	} else {
		const fu = normalizeClientLogoImageUrl(state.faviconUrl || '');
		if (fu) {
			faviconHref = fu;
			faviconType = faviconMimeForSrc(fu);
		}
	}

	return {
		logoSrc: cmsImageUrlForDisplay(logoSrc, 'branding', optimize),
		...(logoSrcDark ? { logoSrcDark } : {}),
		faviconHref: cmsImageUrlForDisplay(faviconHref, 'branding', false),
		faviconType,
	};
}

function siteBrandingWithoutCms(): SiteBranding {
	const faviconHref = faviconFromEnv || '/favicon.svg';
	return {
		logoSrc: cmsImageUrlForDisplay(site.logoSrc, 'branding'),
		faviconHref: cmsImageUrlForDisplay(faviconHref, 'branding', false),
		faviconType: faviconMimeForSrc(faviconHref),
	};
}

/** Header-Logo und Favicon: CMS überschreibt sonst Env / `content/site.ts` / `/favicon.svg`. */
export async function loadSiteBranding(): Promise<SiteBranding> {
	if (!getSupabaseAdmin()) {
		return siteBrandingWithoutCms();
	}
	const state = await readCms();
	return siteBrandingFromState(state);
}
