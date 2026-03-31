import type { CmsState } from './types';

export function mediaIsReferenced(state: CmsState, mediaId: string): boolean {
	for (const p of state.portfolio) {
		if (p.kind === 'image' && p.mediaId === mediaId) return true;
		if (p.kind === 'compare' && (p.beforeMediaId === mediaId || p.afterMediaId === mediaId)) {
			return true;
		}
	}
	for (const t of state.team) {
		if (t.mediaId === mediaId) return true;
	}
	if (Array.isArray(state.clientLogos)) {
		for (const c of state.clientLogos) {
			if (c.mediaId === mediaId) return true;
		}
	}
	if (Array.isArray(state.services)) {
		for (const s of state.services) {
			if (s.mediaId === mediaId) return true;
		}
	}
	if (
		state.headerLogoMediaId === mediaId ||
		state.headerLogoDarkMediaId === mediaId ||
		state.faviconMediaId === mediaId
	) {
		return true;
	}
	return false;
}
