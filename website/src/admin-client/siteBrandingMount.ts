import { fetchCms, patchJson } from './api';
import { pfDropHtml, wireAdminDropzones } from './dropzone';

const BR_ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml,image/gif,image/x-icon,.ico';

type CmsMedia = { id: string; src: string };
type Cms = {
	media: CmsMedia[];
	headerLogoUrl?: string;
	headerLogoMediaId?: string;
	headerLogoDarkUrl?: string;
	headerLogoDarkMediaId?: string;
	faviconUrl?: string;
	faviconMediaId?: string;
};

function escapeHtml(s: string): string {
	const d = document.createElement('div');
	d.textContent = s;
	return d.innerHTML;
}

async function uploadImageFile(file: File): Promise<{ id: string } | null> {
	const fd = new FormData();
	fd.append('file', file);
	const r = await fetch('/api/admin/media', { method: 'POST', body: fd, credentials: 'same-origin' });
	if (!r.ok) return null;
	const j = (await r.json()) as { media?: { id: string } };
	return j.media || null;
}

function headerPreviewSrc(cms: Cms, map: Record<string, string>): string {
	const u = (cms.headerLogoUrl || '').trim();
	if (u) return u;
	const mid = (cms.headerLogoMediaId || '').trim();
	return mid ? map[mid] || '' : '';
}

function headerDarkPreviewSrc(cms: Cms, map: Record<string, string>): string {
	const u = (cms.headerLogoDarkUrl || '').trim();
	if (u) return u;
	const mid = (cms.headerLogoDarkMediaId || '').trim();
	return mid ? map[mid] || '' : '';
}

function faviconPreviewSrc(cms: Cms, map: Record<string, string>): string {
	const u = (cms.faviconUrl || '').trim();
	if (u) return u;
	const mid = (cms.faviconMediaId || '').trim();
	return mid ? map[mid] || '' : '';
}

export function mountSiteBrandingAdmin(root: HTMLElement): void {
	let cms: Cms = { media: [] };

	function renderMsg(text: string, ok: boolean) {
		const el = document.getElementById('admin-branding-msg');
		if (!el) return;
		el.className = `admin-msg ${ok ? 'admin-msg--ok' : 'admin-msg--err'}`;
		el.textContent = text;
		el.hidden = false;
		setTimeout(() => {
			el.hidden = true;
		}, 5000);
	}

	async function reload() {
		const data = (await fetchCms()) as Partial<Cms>;
		cms = {
			media: Array.isArray(data.media) ? data.media : [],
			headerLogoUrl: typeof data.headerLogoUrl === 'string' ? data.headerLogoUrl : undefined,
			headerLogoMediaId: typeof data.headerLogoMediaId === 'string' ? data.headerLogoMediaId : undefined,
			headerLogoDarkUrl: typeof data.headerLogoDarkUrl === 'string' ? data.headerLogoDarkUrl : undefined,
			headerLogoDarkMediaId:
				typeof data.headerLogoDarkMediaId === 'string' ? data.headerLogoDarkMediaId : undefined,
			faviconUrl: typeof data.faviconUrl === 'string' ? data.faviconUrl : undefined,
			faviconMediaId: typeof data.faviconMediaId === 'string' ? data.faviconMediaId : undefined,
		};
		render();
	}

	function render() {
		const map = Object.fromEntries(cms.media.map((m) => [m.id, m.src]));
		const hSrc = headerPreviewSrc(cms, map);
		const hdSrc = headerDarkPreviewSrc(cms, map);
		const fSrc = faviconPreviewSrc(cms, map);

		const headerPreview =
			hSrc ?
				`<img class="admin-branding-preview__img admin-branding-preview__img--header" src="${escapeHtml(hSrc)}" alt="" />`
			:	`<span class="admin-branding-preview__placeholder">Vorschau: Standard aus dem Projekt (<code>site.ts</code>)</span>`;

		const headerDarkPreview =
			hdSrc ?
				`<img class="admin-branding-preview__img admin-branding-preview__img--header" src="${escapeHtml(hdSrc)}" alt="" />`
			:	`<span class="admin-branding-preview__placeholder">Kein eigenes Logo – im Dunkelmodus wie Hellmodus</span>`;

		const faviconPreview =
			fSrc ?
				`<img class="admin-branding-preview__img admin-branding-preview__img--favicon" src="${escapeHtml(fSrc)}" alt="" />`
			:	`<span class="admin-branding-preview__placeholder admin-branding-preview__placeholder--sm">/favicon.svg</span>`;

		root.innerHTML = `
			<p id="admin-branding-msg" class="admin-msg" hidden></p>
			<div class="admin-branding">
				<section class="admin-branding-panel" aria-labelledby="admin-branding-logo-title">
					<p class="admin-branding-panel__eyebrow">Kopfzeile</p>
					<h2 id="admin-branding-logo-title" class="admin-branding-panel__title">Logo (Hellmodus)</h2>
					<p class="admin-branding-panel__hint">Für helle Kopfzeile. Ohne Eintrag: Logo aus dem Code (<code>site.ts</code>). URL oder Upload.</p>
					<div class="admin-branding-preview admin-branding-preview--header">
						${headerPreview}
					</div>
					<form id="admin-branding-header-form" class="admin-branding-form">
						<div class="admin-field">
							<label for="admin-branding-header-url">Bild-URL</label>
							<input id="admin-branding-header-url" type="text" name="url" value="${escapeHtml(hSrc && !cms.headerLogoMediaId ? hSrc : (cms.headerLogoUrl || ''))}" placeholder="https://…" autocomplete="off" />
						</div>
						<div class="admin-branding-form__upload">
							<p class="admin-pf-upload__label">Datei</p>
							${pfDropHtml({
								name: 'photo',
								accept: BR_ACCEPT,
								title: 'Logo wählen',
								meta: 'PNG, SVG, WebP · auf hellem Header-Hintergrund prüfen',
								compact: true,
							})}
						</div>
						<div class="admin-branding-form__actions">
							<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Speichern</button>
							<button type="button" class="admin-btn admin-btn--sm" id="admin-branding-header-reset">Zurücksetzen</button>
						</div>
					</form>
				</section>
				<section class="admin-branding-panel" aria-labelledby="admin-branding-logo-dark-title">
					<p class="admin-branding-panel__eyebrow">Kopfzeile</p>
					<h2 id="admin-branding-logo-dark-title" class="admin-branding-panel__title">Logo (Dunkelmodus)</h2>
					<p class="admin-branding-panel__hint">Optional – helle oder invertierte Variante für die dunkle Kopfzeile. Leer lassen, dann gilt überall das Hellmodus-Logo.</p>
					<div class="admin-branding-preview admin-branding-preview--header admin-branding-preview--header-dark">
						${headerDarkPreview}
					</div>
					<form id="admin-branding-header-dark-form" class="admin-branding-form">
						<div class="admin-field">
							<label for="admin-branding-header-dark-url">Bild-URL</label>
							<input id="admin-branding-header-dark-url" type="text" name="url" value="${escapeHtml(hdSrc && !cms.headerLogoDarkMediaId ? hdSrc : (cms.headerLogoDarkUrl || ''))}" placeholder="https://…" autocomplete="off" />
						</div>
						<div class="admin-branding-form__upload">
							<p class="admin-pf-upload__label">Datei</p>
							${pfDropHtml({
								name: 'photo',
								accept: BR_ACCEPT,
								title: 'Dunkelmodus-Logo wählen',
								meta: 'PNG, SVG, WebP · auf dunklem Hintergrund prüfen',
								compact: true,
							})}
						</div>
						<div class="admin-branding-form__actions">
							<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Speichern</button>
							<button type="button" class="admin-btn admin-btn--sm" id="admin-branding-header-dark-reset">Zurücksetzen</button>
						</div>
					</form>
				</section>
				<section class="admin-branding-panel" aria-labelledby="admin-branding-favicon-title">
					<p class="admin-branding-panel__eyebrow">Browser-Tab</p>
					<h2 id="admin-branding-favicon-title" class="admin-branding-panel__title">Favicon</h2>
					<p class="admin-branding-panel__hint">Ohne Eintrag: <code>/favicon.svg</code> aus dem Projekt. Quadratisch, mind. 32×32 px; SVG, PNG oder ICO.</p>
					<div class="admin-branding-preview admin-branding-preview--favicon">
						${faviconPreview}
					</div>
					<form id="admin-branding-favicon-form" class="admin-branding-form">
						<div class="admin-field">
							<label for="admin-branding-favicon-url">Bild-URL</label>
							<input id="admin-branding-favicon-url" type="text" name="url" value="${escapeHtml(fSrc && !cms.faviconMediaId ? fSrc : (cms.faviconUrl || ''))}" placeholder="https://… oder /pfad/zum-icon.png" autocomplete="off" />
						</div>
						<div class="admin-branding-form__upload">
							<p class="admin-pf-upload__label">Datei</p>
							${pfDropHtml({
								name: 'photo',
								accept: BR_ACCEPT,
								title: 'Favicon wählen',
								meta: 'PNG, SVG, ICO · klein & klar',
								compact: true,
							})}
						</div>
						<div class="admin-branding-form__actions">
							<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Speichern</button>
							<button type="button" class="admin-btn admin-btn--sm" id="admin-branding-favicon-reset">Zurücksetzen</button>
						</div>
					</form>
				</section>
			</div>
		`;

		wireAdminDropzones(root);

		root.querySelector('#admin-branding-header-form')?.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const form = ev.target as HTMLFormElement;
			const fd = new FormData(form);
			const photo = fd.get('photo');
			let payload: { header: { url?: string | null; mediaId?: string | null } };
			if (photo instanceof File && photo.size > 0) {
				const up = await uploadImageFile(photo);
				if (!up) {
					renderMsg('Upload fehlgeschlagen.', false);
					return;
				}
				payload = { header: { mediaId: up.id, url: null } };
			} else {
				const url = String(fd.get('url') || '').trim();
				payload = { header: url ? { url, mediaId: null } : { url: null, mediaId: null } };
			}
			const r = await patchJson('/api/admin/site-branding', payload);
			const j = await r.json().catch(() => ({}));
			if (!r.ok) {
				renderMsg((j as { error?: string }).error || 'Speichern fehlgeschlagen.', false);
				return;
			}
			renderMsg('Header-Logo gespeichert.', true);
			form.reset();
			await reload();
		});

		root.querySelector('#admin-branding-header-reset')?.addEventListener('click', async () => {
			const r = await patchJson('/api/admin/site-branding', { header: { url: null, mediaId: null } });
			if (!r.ok) {
				renderMsg('Zurücksetzen fehlgeschlagen.', false);
				return;
			}
			renderMsg('Header-Logo: wieder Standard.', true);
			await reload();
		});

		root.querySelector('#admin-branding-header-dark-form')?.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const form = ev.target as HTMLFormElement;
			const fd = new FormData(form);
			const photo = fd.get('photo');
			let payload: { headerDark: { url?: string | null; mediaId?: string | null } };
			if (photo instanceof File && photo.size > 0) {
				const up = await uploadImageFile(photo);
				if (!up) {
					renderMsg('Upload fehlgeschlagen.', false);
					return;
				}
				payload = { headerDark: { mediaId: up.id, url: null } };
			} else {
				const url = String(fd.get('url') || '').trim();
				payload = { headerDark: url ? { url, mediaId: null } : { url: null, mediaId: null } };
			}
			const r = await patchJson('/api/admin/site-branding', payload);
			const j = await r.json().catch(() => ({}));
			if (!r.ok) {
				renderMsg((j as { error?: string }).error || 'Speichern fehlgeschlagen.', false);
				return;
			}
			renderMsg('Dunkelmodus-Logo gespeichert.', true);
			form.reset();
			await reload();
		});

		root.querySelector('#admin-branding-header-dark-reset')?.addEventListener('click', async () => {
			const r = await patchJson('/api/admin/site-branding', {
				headerDark: { url: null, mediaId: null },
			});
			if (!r.ok) {
				renderMsg('Zurücksetzen fehlgeschlagen.', false);
				return;
			}
			renderMsg('Dunkelmodus-Logo entfernt – wieder ein Logo für beide Modi.', true);
			await reload();
		});

		root.querySelector('#admin-branding-favicon-form')?.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const form = ev.target as HTMLFormElement;
			const fd = new FormData(form);
			const photo = fd.get('photo');
			let payload: { favicon: { url?: string | null; mediaId?: string | null } };
			if (photo instanceof File && photo.size > 0) {
				const up = await uploadImageFile(photo);
				if (!up) {
					renderMsg('Upload fehlgeschlagen.', false);
					return;
				}
				payload = { favicon: { mediaId: up.id, url: null } };
			} else {
				const url = String(fd.get('url') || '').trim();
				payload = { favicon: url ? { url, mediaId: null } : { url: null, mediaId: null } };
			}
			const r = await patchJson('/api/admin/site-branding', payload);
			const j = await r.json().catch(() => ({}));
			if (!r.ok) {
				renderMsg((j as { error?: string }).error || 'Speichern fehlgeschlagen.', false);
				return;
			}
			renderMsg('Favicon gespeichert.', true);
			form.reset();
			await reload();
		});

		root.querySelector('#admin-branding-favicon-reset')?.addEventListener('click', async () => {
			const r = await patchJson('/api/admin/site-branding', { favicon: { url: null, mediaId: null } });
			if (!r.ok) {
				renderMsg('Zurücksetzen fehlgeschlagen.', false);
				return;
			}
			renderMsg('Favicon: wieder Standard.', true);
			await reload();
		});
	}

	void reload();
}
