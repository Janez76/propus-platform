import { portfolioItems } from '../../content/portfolio';
import { servicesDetailSections } from '../../content/services-detail';
import { teamMembers } from '../../content/team';
import type {
	CmsMedia,
	CmsPortfolioEntry,
	CmsServiceSection,
	CmsState,
	CmsTeamMember,
} from './types';
import { getSupabaseAdmin } from '../supabase/admin';
import { readCms, writeCms } from './store';

function mediaIdForUrl(map: Map<string, string>, url: string, media: CmsMedia[]): string {
	const existing = map.get(url);
	if (existing) return existing;
	const id = crypto.randomUUID();
	map.set(url, id);
	media.push({
		id,
		src: url,
		createdAt: new Date().toISOString(),
	});
	return id;
}

/** Einmalige Initialbefüllung aus den bisherigen TS-Inhalten. */
export function buildSeedCms(): CmsState {
	const media: CmsMedia[] = [];
	const urlToMediaId = new Map<string, string>();
	const portfolio: CmsPortfolioEntry[] = [];
	let sortCounter = 0;

	for (const item of portfolioItems) {
		if (item.kind === 'image') {
			const mid = mediaIdForUrl(urlToMediaId, item.src, media);
			for (const cat of item.categories) {
				portfolio.push({
					id: crypto.randomUUID(),
					kind: 'image',
					category: cat,
					sort: sortCounter++,
					mediaId: mid,
					enabled: true,
				});
			}
		} else if (item.kind === 'compare') {
			const beforeId = mediaIdForUrl(urlToMediaId, item.compare.beforeSrc, media);
			const afterId = mediaIdForUrl(urlToMediaId, item.compare.afterSrc, media);
			for (const cat of item.categories) {
				if (cat !== 'staging' && cat !== 'retusche') continue;
				portfolio.push({
					id: crypto.randomUUID(),
					kind: 'compare',
					category: cat,
					sort: sortCounter++,
					beforeMediaId: beforeId,
					afterMediaId: afterId,
					enabled: true,
				});
			}
		}
	}

	const imagePortfolioIds = portfolio.filter((p) => p.kind === 'image').map((p) => p.id);
	const featuredPortfolioIds = imagePortfolioIds.slice(0, 6);

	const team: CmsTeamMember[] = [];
	let teamSort = 0;
	for (const m of teamMembers) {
		const src = m.imageSrc;
		const mediaId = src ? mediaIdForUrl(urlToMediaId, src, media) : '';
		team.push({
			id: m.id,
			sort: teamSort++,
			name: m.name,
			role: m.role,
			email: m.email,
			bio: [...m.bio].join('\n\n'),
			mediaId,
			enabled: true,
		});
	}

	return {
		version: 1,
		media,
		portfolio,
		featuredPortfolioIds,
		team,
		clientLogos: [],
		services: [],
	};
}

export async function ensureSeededCms(): Promise<CmsState> {
	const current = await readCms();
	if (current.portfolio.length > 0 || current.team.length > 0 || current.media.length > 0) {
		return current;
	}
	const seeded = buildSeedCms();
	if (getSupabaseAdmin()) {
		try {
			await writeCms(seeded);
		} catch (e) {
			console.error('[cms] Initialer Portfolio-Seed konnte nicht gespeichert werden:', e);
		}
	}
	return seeded;
}

/** Vorlagen-Leistungskarten (ohne Supabase-Persistenz nutzbar). */
export function buildDefaultCmsServices(): CmsServiceSection[] {
	return servicesDetailSections.map(
		(s, i): CmsServiceSection => ({
			id: s.id,
			sort: i * 10,
			title: s.title,
			slogan: s.slogan,
			body: s.body,
			imageAlt: s.imageAlt,
			imageUrl: s.imageSrc,
			width: s.width,
			height: s.height,
			enabled: true,
		}),
	);
}

/**
 * Wenn noch keine Leistungs-Karten im CMS: alle Einträge aus `content/services-detail.ts` übernehmen
 * (gleicher Inhalt wie auf /dienstleistungen/, von der Startseite verlinkt). Einmalig beim ersten Zugriff.
 */
export async function ensureDefaultServicesInCms(): Promise<void> {
	const cms = await readCms();
	if (!Array.isArray(cms.services)) cms.services = [];
	if (cms.services.length > 0) return;

	cms.services = buildDefaultCmsServices();
	if (!getSupabaseAdmin()) return;
	await writeCms(cms);
}
