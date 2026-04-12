import type { APIRoute } from 'astro';
import { normalizeClientLogoImageUrl } from '../../../lib/cms/clientLogoUrl';
import { readCms, writeCms } from '../../../lib/cms/store';
import type { CmsState } from '../../../lib/cms/types';

export const prerender = false;

type BrandingPart = { url?: string | null; mediaId?: string | null };

type BrandingSlot = 'header' | 'headerDark' | 'favicon';

function clearBrandingSlot(cms: CmsState, slot: BrandingSlot): void {
	if (slot === 'header') {
		delete cms.headerLogoUrl;
		delete cms.headerLogoMediaId;
	} else if (slot === 'headerDark') {
		delete cms.headerLogoDarkUrl;
		delete cms.headerLogoDarkMediaId;
	} else {
		delete cms.faviconUrl;
		delete cms.faviconMediaId;
	}
}

function setBrandingFromMedia(cms: CmsState, slot: BrandingSlot, mediaId: string): void {
	if (slot === 'header') {
		cms.headerLogoMediaId = mediaId;
		delete cms.headerLogoUrl;
	} else if (slot === 'headerDark') {
		cms.headerLogoDarkMediaId = mediaId;
		delete cms.headerLogoDarkUrl;
	} else {
		cms.faviconMediaId = mediaId;
		delete cms.faviconUrl;
	}
}

function setBrandingFromUrl(cms: CmsState, slot: BrandingSlot, url: string): void {
	if (slot === 'header') {
		cms.headerLogoUrl = url;
		delete cms.headerLogoMediaId;
	} else if (slot === 'headerDark') {
		cms.headerLogoDarkUrl = url;
		delete cms.headerLogoDarkMediaId;
	} else {
		cms.faviconUrl = url;
		delete cms.faviconMediaId;
	}
}

function applyPart(cms: CmsState, part: BrandingPart | undefined, slot: BrandingSlot): void {
	if (part === undefined) return;
	const mediaIds = new Set(cms.media.map((m) => m.id));
	const midRaw = part.mediaId != null ? String(part.mediaId).trim() : '';
	const urlRaw = part.url != null ? String(part.url).trim() : '';
	if (midRaw) {
		if (!mediaIds.has(midRaw)) {
			throw new Error('BAD_MEDIA');
		}
		setBrandingFromMedia(cms, slot, midRaw);
		return;
	}
	if (urlRaw) {
		const u = normalizeClientLogoImageUrl(urlRaw);
		if (!u) {
			throw new Error('BAD_URL');
		}
		setBrandingFromUrl(cms, slot, u);
		return;
	}
	clearBrandingSlot(cms, slot);
}

export const PATCH: APIRoute = async ({ request }) => {
	let body: { header?: BrandingPart; headerDark?: BrandingPart; favicon?: BrandingPart } = {};
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültige Daten.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();

	try {
		applyPart(cms, body.header, 'header');
		applyPart(cms, body.headerDark, 'headerDark');
		applyPart(cms, body.favicon, 'favicon');
	} catch (e) {
		const code = e instanceof Error ? e.message : '';
		if (code === 'BAD_MEDIA') {
			return new Response(JSON.stringify({ error: 'Ungültige Bild-Referenz (Medienbibliothek).' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		if (code === 'BAD_URL') {
			return new Response(JSON.stringify({ error: 'Ungültige Bild-URL (https:// oder Pfad ab /).' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		console.error('[site-branding] Unerwarteter Fehler:', e);
		return new Response(JSON.stringify({ error: 'Interner Fehler beim Speichern des Brandings.' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	await writeCms(cms);
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
