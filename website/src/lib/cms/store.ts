import { getSupabaseAdmin } from '../supabase/admin';
import { SEO_PAGE_DEFINITIONS, isReservedSeoPath, normalizeSeoPath } from '../seo-config';
import type { CmsSeoPage, CmsSeoSettings, CmsState } from './types';

const EMPTY: CmsState = {
	version: 1,
	media: [],
	portfolio: [],
	featuredPortfolioIds: [],
	team: [],
	clientLogos: [],
	services: [],
	seoPages: [],
	seoSettings: {},
};

function trimOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeSeoPages(data: Partial<CmsState>): CmsSeoPage[] {
	const list = Array.isArray(data.seoPages) ? data.seoPages : [];
	return list
		.filter((entry): entry is CmsSeoPage => Boolean(entry && typeof entry === 'object' && entry.key))
		.map((entry) => {
			const def = SEO_PAGE_DEFINITIONS.find((item) => item.key === entry.key);
			if (!def) return null;
			const slug = trimOptionalString(entry.slug);
			const normalizedSlug =
				def.slugEditable && slug && !isReservedSeoPath(slug) ? normalizeSeoPath(slug) : undefined;
			return {
				key: entry.key,
				...(trimOptionalString(entry.metaTitle) ? { metaTitle: trimOptionalString(entry.metaTitle) } : {}),
				...(trimOptionalString(entry.metaDescription)
					? { metaDescription: trimOptionalString(entry.metaDescription) }
					: {}),
				...(trimOptionalString(entry.keywords) ? { keywords: trimOptionalString(entry.keywords) } : {}),
				...(trimOptionalString(entry.ogTitle) ? { ogTitle: trimOptionalString(entry.ogTitle) } : {}),
				...(trimOptionalString(entry.ogDescription)
					? { ogDescription: trimOptionalString(entry.ogDescription) }
					: {}),
				...(trimOptionalString(entry.ogImageUrl)
					? { ogImageUrl: trimOptionalString(entry.ogImageUrl) }
					: {}),
				...(typeof entry.index === 'boolean' ? { index: entry.index } : {}),
				...(normalizedSlug ? { slug: normalizedSlug } : {}),
			} satisfies CmsSeoPage;
		})
		.filter(Boolean) as CmsSeoPage[];
}

function normalizeSeoSettings(data: Partial<CmsState>): CmsSeoSettings {
	const raw = data.seoSettings;
	if (!raw || typeof raw !== 'object') return {};
	const settings = raw as CmsSeoSettings;
	return {
		...(trimOptionalString(settings.defaultOgImageUrl)
			? { defaultOgImageUrl: trimOptionalString(settings.defaultOgImageUrl) }
			: {}),
		...(typeof settings.sitemapEnabled === 'boolean'
			? { sitemapEnabled: settings.sitemapEnabled }
			: {}),
		...(typeof settings.allowIndexing === 'boolean'
			? { allowIndexing: settings.allowIndexing }
			: {}),
		...(typeof settings.autoImageOptimization === 'boolean'
			? { autoImageOptimization: settings.autoImageOptimization }
			: {}),
		...(Array.isArray(settings.robotsDisallow)
			? {
					robotsDisallow: settings.robotsDisallow
						.map((entry) => normalizeSeoPath(String(entry || '')))
						.filter((entry) => entry && !isReservedSeoPath(entry)),
			  }
			: {}),
		...(trimOptionalString(settings.robotsCustom)
			? { robotsCustom: trimOptionalString(settings.robotsCustom) }
			: {}),
	};
}

function normalizeCmsPayload(data: unknown): CmsState {
	if (!data || typeof data !== 'object') return { ...EMPTY };
	const d = data as Partial<CmsState>;
	if (d.version !== 1 || !Array.isArray(d.media)) return { ...EMPTY };
	const headerLogoUrl = typeof d.headerLogoUrl === 'string' ? d.headerLogoUrl : undefined;
	const headerLogoMediaId =
		typeof d.headerLogoMediaId === 'string' ? d.headerLogoMediaId : undefined;
	const headerLogoDarkUrl = typeof d.headerLogoDarkUrl === 'string' ? d.headerLogoDarkUrl : undefined;
	const headerLogoDarkMediaId =
		typeof d.headerLogoDarkMediaId === 'string' ? d.headerLogoDarkMediaId : undefined;
	const faviconUrl = typeof d.faviconUrl === 'string' ? d.faviconUrl : undefined;
	const faviconMediaId = typeof d.faviconMediaId === 'string' ? d.faviconMediaId : undefined;
	return {
		version: 1,
		media: d.media.map((entry) => ({
			...entry,
			...(trimOptionalString(entry?.alt) ? { alt: trimOptionalString(entry.alt) } : {}),
		})),
		portfolio: Array.isArray(d.portfolio) ? d.portfolio : [],
		featuredPortfolioIds: Array.isArray(d.featuredPortfolioIds) ? d.featuredPortfolioIds : [],
		team: Array.isArray(d.team) ? d.team : [],
		clientLogos: Array.isArray(d.clientLogos) ? d.clientLogos : [],
		services: Array.isArray(d.services) ? d.services : [],
		seoPages: normalizeSeoPages(d),
		seoSettings: normalizeSeoSettings(d),
		...(headerLogoUrl ? { headerLogoUrl } : {}),
		...(headerLogoMediaId ? { headerLogoMediaId } : {}),
		...(headerLogoDarkUrl ? { headerLogoDarkUrl } : {}),
		...(headerLogoDarkMediaId ? { headerLogoDarkMediaId } : {}),
		...(faviconUrl ? { faviconUrl } : {}),
		...(faviconMediaId ? { faviconMediaId } : {}),
	};
}

function buildPersistedState(state: CmsState): CmsState {
	const hu = (state.headerLogoUrl || '').trim();
	const hm = (state.headerLogoMediaId || '').trim();
	const hdu = (state.headerLogoDarkUrl || '').trim();
	const hdm = (state.headerLogoDarkMediaId || '').trim();
	const fu = (state.faviconUrl || '').trim();
	const fm = (state.faviconMediaId || '').trim();
	const seoPages = normalizeSeoPages(state);
	const seoSettings = normalizeSeoSettings(state);
	return {
		version: 1,
		media: state.media.map((entry) => ({
			id: entry.id,
			src: entry.src,
			createdAt: entry.createdAt,
			...(trimOptionalString(entry.alt) ? { alt: trimOptionalString(entry.alt) } : {}),
		})),
		portfolio: state.portfolio,
		featuredPortfolioIds: state.featuredPortfolioIds,
		team: state.team,
		clientLogos: Array.isArray(state.clientLogos) ? state.clientLogos : [],
		services: Array.isArray(state.services) ? state.services : [],
		...(seoPages.length ? { seoPages } : {}),
		...(Object.keys(seoSettings).length ? { seoSettings } : {}),
		...(hu ? { headerLogoUrl: hu } : {}),
		...(hm ? { headerLogoMediaId: hm } : {}),
		...(hdu ? { headerLogoDarkUrl: hdu } : {}),
		...(hdm ? { headerLogoDarkMediaId: hdm } : {}),
		...(fu ? { faviconUrl: fu } : {}),
		...(fm ? { faviconMediaId: fm } : {}),
	};
}

export async function readCms(): Promise<CmsState> {
	try {
		const supabase = getSupabaseAdmin();
		if (!supabase) {
			return { ...EMPTY };
		}
		const { data, error } = await supabase.from('cms_state').select('payload').eq('id', 1).maybeSingle();
		if (error) {
			console.error(`[cms] Supabase read: ${error.message}`);
			return { ...EMPTY };
		}
		return normalizeCmsPayload(data?.payload);
	} catch (e) {
		console.error('[cms] readCms:', e);
		return { ...EMPTY };
	}
}

export async function writeCms(state: CmsState): Promise<void> {
	const supabase = getSupabaseAdmin();
	if (!supabase) {
		throw new Error(
			'CMS: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen. Speichern ist ohne Supabase nicht möglich.',
		);
	}
	const next = buildPersistedState(state);
	const { error } = await supabase.from('cms_state').upsert(
		{
			id: 1,
			payload: next as Record<string, unknown>,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: 'id' },
	);
	if (error) throw new Error(`CMS Supabase write: ${error.message}`);
}
