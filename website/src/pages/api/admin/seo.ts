import type { APIRoute } from 'astro';
import {
	SEO_PAGE_DEFINITIONS,
	getSeoPageDefinition,
	isReservedSeoPath,
	normalizeSeoPath,
	type SeoPageKey,
} from '../../../lib/seo-config';
import { readCms, writeCms } from '../../../lib/cms/store';
import type { CmsSeoPage, CmsSeoSettings } from '../../../lib/cms/types';

export const prerender = false;

function trimOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseRobotsDisallow(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((entry) => normalizeSeoPath(String(entry || ''))).filter(Boolean);
	}
	if (typeof value === 'string') {
		return value
			.split(/\r?\n+/)
			.map((entry) => normalizeSeoPath(entry))
			.filter(Boolean);
	}
	return [];
}

function ensureUniqueSlug(
	pageKey: SeoPageKey,
	nextPath: string,
	pages: CmsSeoPage[],
): string | null {
	if (!nextPath) return null;
	for (const def of SEO_PAGE_DEFINITIONS) {
		if (def.key === pageKey) continue;
		const other = pages.find((entry) => entry.key === def.key);
		const candidate =
			def.slugEditable && other?.slug ? normalizeSeoPath(other.slug) : normalizeSeoPath(def.defaultPath);
		if (candidate === nextPath) {
			return `Der Pfad ${nextPath} wird bereits von „${def.label}“ verwendet.`;
		}
	}
	return null;
}

export const GET: APIRoute = async () => {
	const cms = await readCms();
	return new Response(
		JSON.stringify({
			seoPages: Array.isArray(cms.seoPages) ? cms.seoPages : [],
			seoSettings: cms.seoSettings || {},
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
	);
};

export const PATCH: APIRoute = async ({ request }) => {
	let body:
		| {
				pageKey?: SeoPageKey;
				page?: Partial<CmsSeoPage>;
				settings?: Partial<CmsSeoSettings> & { robotsDisallowText?: string };
		  }
		| undefined;
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültiges JSON.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	cms.seoPages = Array.isArray(cms.seoPages) ? cms.seoPages : [];
	cms.seoSettings = cms.seoSettings || {};

	if (body?.settings && typeof body.settings === 'object') {
		const settings = body.settings;
		const next = { ...cms.seoSettings };
		if (trimOptionalString(settings.defaultOgImageUrl)) {
			next.defaultOgImageUrl = trimOptionalString(settings.defaultOgImageUrl);
		} else if (settings.defaultOgImageUrl === '' || settings.defaultOgImageUrl === null) {
			delete next.defaultOgImageUrl;
		}
		if (typeof settings.sitemapEnabled === 'boolean') next.sitemapEnabled = settings.sitemapEnabled;
		if (typeof settings.allowIndexing === 'boolean') next.allowIndexing = settings.allowIndexing;
		if (typeof settings.autoImageOptimization === 'boolean')
			next.autoImageOptimization = settings.autoImageOptimization;
		if (trimOptionalString(settings.robotsCustom)) {
			next.robotsCustom = trimOptionalString(settings.robotsCustom);
		} else if (settings.robotsCustom === '' || settings.robotsCustom === null) {
			delete next.robotsCustom;
		}
		if (settings.robotsDisallow || settings.robotsDisallowText !== undefined) {
			next.robotsDisallow = parseRobotsDisallow(
				settings.robotsDisallowText ?? settings.robotsDisallow,
			);
		}
		cms.seoSettings = next;
	}

	if (body?.pageKey) {
		const def = getSeoPageDefinition(body.pageKey);
		const pagePatch = body.page || {};
		const index = cms.seoPages.findIndex((entry) => entry.key === body?.pageKey);
		const current = index >= 0 ? cms.seoPages[index] : ({ key: body.pageKey } as CmsSeoPage);
		const slug = trimOptionalString(pagePatch.slug);
		let normalizedSlug: string | undefined;
		if (def.slugEditable && slug) {
			normalizedSlug = normalizeSeoPath(slug);
			if (!normalizedSlug || isReservedSeoPath(normalizedSlug)) {
				return new Response(JSON.stringify({ error: 'Dieser Pfad ist reserviert oder ungültig.' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				});
			}
			const duplicate = ensureUniqueSlug(body.pageKey, normalizedSlug, cms.seoPages);
			if (duplicate) {
				return new Response(JSON.stringify({ error: duplicate }), {
					status: 409,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				});
			}
		}

		const merged: CmsSeoPage = { ...current, key: body.pageKey };
		const setOrDelete = <K extends keyof CmsSeoPage>(key: K, value: CmsSeoPage[K] | undefined) => {
			if (value === undefined || value === '') delete merged[key];
			else merged[key] = value;
		};

		if ('metaTitle' in pagePatch) setOrDelete('metaTitle', trimOptionalString(pagePatch.metaTitle));
		if ('metaDescription' in pagePatch)
			setOrDelete('metaDescription', trimOptionalString(pagePatch.metaDescription));
		if ('keywords' in pagePatch) setOrDelete('keywords', trimOptionalString(pagePatch.keywords));
		if ('ogTitle' in pagePatch) setOrDelete('ogTitle', trimOptionalString(pagePatch.ogTitle));
		if ('ogDescription' in pagePatch)
			setOrDelete('ogDescription', trimOptionalString(pagePatch.ogDescription));
		if ('ogImageUrl' in pagePatch) setOrDelete('ogImageUrl', trimOptionalString(pagePatch.ogImageUrl));
		if ('index' in pagePatch && typeof pagePatch.index === 'boolean') merged.index = pagePatch.index;
		if ('slug' in pagePatch) {
			if (!def.slugEditable) delete merged.slug;
			else setOrDelete('slug', normalizedSlug);
		}

		if (index >= 0) cms.seoPages[index] = merged;
		else cms.seoPages.push(merged);
	}

	await writeCms(cms);
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
