import { fetchCms, patchJson } from './api';
import {
	SEO_ADMIN_GROUP_LABELS,
	SEO_ADMIN_GROUP_ORDER,
	SEO_PAGE_DEFINITIONS,
	type SeoAdminGroup,
	type SeoPageKey,
} from '../lib/seo-config';

function isSeoPageKey(s: string): s is SeoPageKey {
	return SEO_PAGE_DEFINITIONS.some((d) => d.key === s);
}

function scrollToSeoFocusFromQuery(): void {
	const raw = new URLSearchParams(window.location.search).get('focus')?.trim();
	if (!raw || !isSeoPageKey(raw)) return;
	const el = document.getElementById(`seo-page-${raw}`);
	if (!(el instanceof HTMLDetailsElement)) return;
	el.open = true;
	requestAnimationFrame(() => {
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		const u = new URL(window.location.href);
		u.searchParams.delete('focus');
		history.replaceState({}, '', `${u.pathname}${u.search}${u.hash}`);
	});
}

type CmsSeoPage = {
	key: SeoPageKey;
	metaTitle?: string;
	metaDescription?: string;
	keywords?: string;
	ogTitle?: string;
	ogDescription?: string;
	ogImageUrl?: string;
	index?: boolean;
	slug?: string;
};

type CmsSeoSettings = {
	defaultOgImageUrl?: string;
	sitemapEnabled?: boolean;
	allowIndexing?: boolean;
	robotsDisallow?: string[];
	robotsCustom?: string;
	autoImageOptimization?: boolean;
};

type CmsState = {
	seoPages?: CmsSeoPage[];
	seoSettings?: CmsSeoSettings;
};

function escapeHtml(s: string): string {
	const d = document.createElement('div');
	d.textContent = s;
	return d.innerHTML;
}

function escapeAttr(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/\r?\n/g, ' ');
}

function resolvedPage(cms: CmsState, key: SeoPageKey) {
	const def = SEO_PAGE_DEFINITIONS.find((entry) => entry.key === key);
	if (!def) throw new Error(`SEO-Seite nicht gefunden: ${key}`);
	const raw = (cms.seoPages || []).find((entry) => entry.key === key);
	return {
		...def,
		metaTitle: raw?.metaTitle || def.defaultTitle,
		metaDescription: raw?.metaDescription || def.defaultDescription,
		keywords: raw?.keywords || def.defaultKeywords || '',
		ogTitle: raw?.ogTitle || raw?.metaTitle || def.defaultTitle,
		ogDescription: raw?.ogDescription || raw?.metaDescription || def.defaultDescription,
		ogImageUrl: raw?.ogImageUrl || cms.seoSettings?.defaultOgImageUrl || '',
		index: raw?.index !== false && def.defaultIndex !== false,
		slug: raw?.slug || def.defaultPath,
	};
}

function siteUrl(path: string): string {
	try {
		return new URL(path, window.location.origin).href;
	} catch {
		return path;
	}
}

function previewHost(): string {
	try {
		return window.location.hostname || window.location.host;
	} catch {
		return '';
	}
}

const SOFT_TITLE = 60;
const SOFT_DESC = 155;

function pageCardHtml(cms: CmsState, key: SeoPageKey): string {
	const page = resolvedPage(cms, key);
	const globalOg = (cms.seoSettings?.defaultOgImageUrl || '').trim();
	const defOnly = SEO_PAGE_DEFINITIONS.find((e) => e.key === key)!;
	const defaultPathResolved = defOnly.defaultPath;

	const slugInfo = page.slugEditable
		? `
			<div class="admin-field">
				<label>URL / Slug</label>
				<input type="text" name="slug" value="${escapeHtml(page.slug)}" placeholder="${escapeHtml(page.defaultPath)}" autocomplete="off" />
				<p class="admin-p-hint admin-p-hint--tight">Öffentlicher Pfad; muss eindeutig sein.</p>
			</div>`
		: `
			<div class="admin-field">
				<label>URL</label>
				<input type="text" value="${escapeHtml(page.defaultPath)}" disabled />
				<p class="admin-p-hint admin-p-hint--tight">Fester Pfad für diese Seite.</p>
			</div>`;

	const ogPreviewSrc = page.ogImageUrl ? escapeHtml(page.ogImageUrl) : '';
	const indexLabel = page.index ? 'Index' : 'noindex';

	return `
		<details class="admin-seo-acc" id="seo-page-${page.key}">
			<summary class="admin-seo-acc__summary">
				<span class="admin-seo-acc__summary-main">
					<span class="admin-seo-acc__name">${escapeHtml(page.label)}</span>
					<span class="admin-seo-acc__path">${escapeHtml(page.slug)}</span>
				</span>
				<span class="admin-seo-acc__summary-aside">
					<span class="admin-seo-acc__pill admin-seo-acc__pill--${page.index ? 'on' : 'off'}">${indexLabel}</span>
					<span class="admin-seo-acc__chev" aria-hidden="true"></span>
				</span>
			</summary>
			<div class="admin-seo-acc__panel">
				<div class="admin-seo-acc__gold" aria-hidden="true"><span></span></div>
				<div class="admin-seo-acc__layout">
					<form
						class="admin-seo-acc__form admin-seo-form"
						data-page-key="${page.key}"
						data-default-path="${escapeAttr(defaultPathResolved)}"
						data-default-meta-title="${escapeAttr(defOnly.defaultTitle)}"
						data-default-meta-description="${escapeAttr(defOnly.defaultDescription)}"
						data-default-keywords="${escapeAttr(defOnly.defaultKeywords || '')}"
						data-global-default-og="${escapeAttr(globalOg)}"
					>
						<div class="admin-field">
							<label for="seo-mt-${page.key}">Meta-Titel</label>
							<input id="seo-mt-${page.key}" type="text" name="metaTitle" value="${escapeHtml(page.metaTitle)}" maxlength="70" autocomplete="off" />
							<div class="admin-seo-form__row">
								<button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" data-seo-restore="metaTitle">Standard</button>
								<span class="admin-seo-len" data-seo-len="metaTitle" aria-live="polite"></span>
							</div>
						</div>
						<div class="admin-field">
							<label for="seo-md-${page.key}">Meta-Beschreibung</label>
							<textarea id="seo-md-${page.key}" name="metaDescription" rows="4" maxlength="180" autocomplete="off">${escapeHtml(page.metaDescription)}</textarea>
							<div class="admin-seo-form__row">
								<button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" data-seo-restore="metaDescription">Standard</button>
								<span class="admin-seo-len" data-seo-len="metaDescription" aria-live="polite"></span>
							</div>
							<p class="admin-p-hint admin-p-hint--tight">Erscheint in Google und in Link-Vorschauen (z.&nbsp;B. Social).</p>
						</div>
						${slugInfo}
						<div class="admin-field">
							<label for="seo-ogimg-${page.key}">Open-Graph-Bild (URL)</label>
							<input id="seo-ogimg-${page.key}" type="url" name="ogImageUrl" value="${escapeHtml(page.ogImageUrl)}" placeholder="https://…" autocomplete="off" />
							<p class="admin-p-hint admin-p-hint--tight">Empfohlen ca. 1200×630&nbsp;px. Leer = globales Standardbild (Technik-Bereich).</p>
						</div>
						<details class="admin-seo-acc__nested">
							<summary>Keywords &amp; Feinjustierung</summary>
							<div class="admin-seo-acc__nested-body">
								<div class="admin-field">
									<label for="seo-kw-${page.key}">Keywords (optional)</label>
									<input id="seo-kw-${page.key}" type="text" name="keywords" value="${escapeHtml(page.keywords)}" placeholder="Begriff, Begriff …" autocomplete="off" />
								</div>
							</div>
						</details>
						<label class="admin-toggle">
							<input type="checkbox" name="index" ${page.index ? 'checked' : ''} />
							<span class="admin-toggle__track" aria-hidden="true"><span class="admin-toggle__thumb"></span></span>
							<span>In Suchmaschinen indexieren</span>
						</label>
						<div class="admin-seo-acc__actions">
							<button type="submit" class="admin-btn admin-btn--primary">Speichern</button>
						</div>
					</form>
					<aside class="admin-seo-acc__preview" data-preview-for="${page.key}">
						<p class="admin-seo-acc__preview-label">Vorschau</p>
						<div class="admin-seo-card admin-seo-card--google">
							<p class="admin-seo-card__kicker">Google</p>
							<p class="admin-seo-card__url" data-preview-url>${escapeHtml(siteUrl(page.slug))}</p>
							<p class="admin-seo-card__title" data-preview-title>${escapeHtml(page.metaTitle)}</p>
							<p class="admin-seo-card__desc" data-preview-desc>${escapeHtml(page.metaDescription)}</p>
						</div>
						<div class="admin-seo-card admin-seo-card--social">
							<p class="admin-seo-card__kicker">Social / Messenger</p>
							<div class="admin-seo-og">
								<div class="admin-seo-og__image" data-og-image-slot>
									${ogPreviewSrc ? `<img src="${ogPreviewSrc}" alt="" loading="lazy" decoding="async" />` : '<span class="admin-seo-og__placeholder">Kein Bild</span>'}
								</div>
								<div class="admin-seo-og__body">
									<p class="admin-seo-og__host" data-preview-host>${escapeHtml(previewHost())}</p>
									<p class="admin-seo-og__title" data-preview-og-title>${escapeHtml(page.metaTitle)}</p>
									<p class="admin-seo-og__desc" data-preview-og-desc>${escapeHtml(page.metaDescription)}</p>
								</div>
							</div>
						</div>
					</aside>
				</div>
			</div>
		</details>
	`;
}

function globalSeoHtml(cms: CmsState): string {
	const settings = cms.seoSettings || {};
	return `
		<details class="admin-seo-acc admin-seo-acc--tech">
			<summary class="admin-seo-acc__summary">
				<span class="admin-seo-acc__summary-main">
					<span class="admin-seo-acc__name">Technik · Sitemap · robots.txt</span>
					<span class="admin-seo-acc__path">Global</span>
				</span>
				<span class="admin-seo-acc__summary-aside">
					<span class="admin-seo-acc__chev" aria-hidden="true"></span>
				</span>
			</summary>
			<div class="admin-seo-acc__panel">
				<div class="admin-seo-acc__gold" aria-hidden="true"><span></span></div>
				<form id="admin-seo-settings-form" class="admin-seo-tech-form">
					<p class="admin-p-hint admin-p-hint--tight" style="margin:0 0 1rem;max-width:40rem;">
						Standardbild für alle Seiten ohne eigenes OG-Bild. Sitemap und Indexierung nur ändern, wenn du die Auswirkungen kennst.
					</p>
					<div class="admin-grid admin-grid--two">
						<div class="admin-field">
							<label>Standard-OG-Bild (URL)</label>
							<input type="url" name="defaultOgImageUrl" value="${escapeHtml(settings.defaultOgImageUrl || '')}" placeholder="https://…" />
						</div>
						<div class="admin-field">
							<label>robots.txt – zusätzliche Disallow-Pfade (eine Zeile pro Pfad)</label>
							<textarea name="robotsDisallowText" rows="4" placeholder="/intern/">${escapeHtml(
								Array.isArray(settings.robotsDisallow) ? settings.robotsDisallow.join('\n') : '',
							)}</textarea>
						</div>
					</div>
					<div class="admin-field">
						<label>Eigener Zusatz in robots.txt (optional)</label>
						<textarea name="robotsCustom" rows="3" placeholder="Nur bei Bedarf">${escapeHtml(settings.robotsCustom || '')}</textarea>
					</div>
					<div class="admin-seo-tech-form__toggles">
						<label class="admin-toggle">
							<input type="checkbox" name="allowIndexing" ${settings.allowIndexing !== false ? 'checked' : ''} />
							<span class="admin-toggle__track" aria-hidden="true"><span class="admin-toggle__thumb"></span></span>
							<span>Website indexierbar</span>
						</label>
						<label class="admin-toggle">
							<input type="checkbox" name="sitemapEnabled" ${settings.sitemapEnabled !== false ? 'checked' : ''} />
							<span class="admin-toggle__track" aria-hidden="true"><span class="admin-toggle__thumb"></span></span>
							<span>Sitemap ausgeben</span>
						</label>
						<label class="admin-toggle">
							<input type="checkbox" name="autoImageOptimization" ${settings.autoImageOptimization !== false ? 'checked' : ''} />
							<span class="admin-toggle__track" aria-hidden="true"><span class="admin-toggle__thumb"></span></span>
							<span>Bildoptimierung (CDN)</span>
						</label>
					</div>
					<div class="admin-seo-acc__actions">
						<button type="submit" class="admin-btn admin-btn--primary">Technik speichern</button>
						<a class="admin-link" href="/robots.txt" target="_blank" rel="noreferrer">robots.txt</a>
						<a class="admin-link" href="/sitemap.xml" target="_blank" rel="noreferrer">Sitemap</a>
					</div>
				</form>
			</div>
		</details>
	`;
}

function bindPreview(root: HTMLElement, key: SeoPageKey) {
	const form = root.querySelector<HTMLFormElement>(`.admin-seo-form[data-page-key="${key}"]`);
	const preview = root.querySelector<HTMLElement>(`[data-preview-for="${key}"]`);
	if (!form || !preview) return;

	const refresh = () => {
		const fd = new FormData(form);
		const title = String(fd.get('metaTitle') || '').trim();
		const desc = String(fd.get('metaDescription') || '').trim();
		let ogImage = String(fd.get('ogImageUrl') || '').trim();
		if (!ogImage) ogImage = String(form.dataset.globalDefaultOg || '').trim();
		const slug = String(fd.get('slug') || '').trim() || String(form.dataset.defaultPath || '');

		const urlEl = preview.querySelector<HTMLElement>('[data-preview-url]');
		const titleEl = preview.querySelector<HTMLElement>('[data-preview-title]');
		const descEl = preview.querySelector<HTMLElement>('[data-preview-desc]');
		const ogTitleEl = preview.querySelector<HTMLElement>('[data-preview-og-title]');
		const ogDescEl = preview.querySelector<HTMLElement>('[data-preview-og-desc]');
		const hostEl = preview.querySelector<HTMLElement>('[data-preview-host]');
		const imageSlot = preview.querySelector<HTMLElement>('[data-og-image-slot]');

		if (urlEl) urlEl.textContent = siteUrl(slug || '/');
		if (titleEl) titleEl.textContent = title;
		if (descEl) descEl.textContent = desc;
		if (ogTitleEl) ogTitleEl.textContent = title;
		if (ogDescEl) ogDescEl.textContent = desc;
		if (hostEl) hostEl.textContent = previewHost();
		if (imageSlot) {
			imageSlot.innerHTML = ogImage
				? `<img src="${escapeHtml(ogImage)}" alt="" loading="lazy" decoding="async" />`
				: '<span class="admin-seo-og__placeholder">Kein Bild</span>';
		}
	};

	form.addEventListener('input', refresh);
	refresh();
}

function bindCharMeters(form: HTMLFormElement) {
	const titleEl = form.querySelector<HTMLInputElement>('[name="metaTitle"]');
	const descEl = form.querySelector<HTMLTextAreaElement>('[name="metaDescription"]');
	const titleCount = form.querySelector('[data-seo-len="metaTitle"]');
	const descCount = form.querySelector('[data-seo-len="metaDescription"]');

	const sync = () => {
		if (titleEl && titleCount) {
			const n = titleEl.value.length;
			titleCount.textContent = `${n} / ${SOFT_TITLE} (Ziel)`;
			titleCount.classList.toggle('admin-seo-len--warn', n > SOFT_TITLE);
		}
		if (descEl && descCount) {
			const n = descEl.value.length;
			descCount.textContent = `${n} / ${SOFT_DESC} (Ziel)`;
			descCount.classList.toggle('admin-seo-len--warn', n > SOFT_DESC);
		}
	};
	form.addEventListener('input', sync);
	sync();
}

function bindRestoreDefaults(root: HTMLElement) {
	root.querySelectorAll<HTMLButtonElement>('[data-seo-restore]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const field = btn.getAttribute('data-seo-restore');
			const form = btn.closest('form');
			if (!form || !field) return;
			if (field === 'metaTitle') {
				const el = form.elements.namedItem('metaTitle');
				if (el instanceof HTMLInputElement) el.value = form.dataset.defaultMetaTitle || '';
			}
			if (field === 'metaDescription') {
				const el = form.elements.namedItem('metaDescription');
				if (el instanceof HTMLTextAreaElement) el.value = form.dataset.defaultMetaDescription || '';
			}
			form.dispatchEvent(new Event('input', { bubbles: true }));
		});
	});
}

function renderGroupSection(cms: CmsState, group: SeoAdminGroup, keys: SeoPageKey[]): string {
	if (keys.length === 0) return '';
	const meta = SEO_ADMIN_GROUP_LABELS[group];
	const cards = keys.map((k) => pageCardHtml(cms, k)).join('');
	return `
		<section class="admin-seo-group" aria-labelledby="admin-seo-group-${group}">
			<h2 id="admin-seo-group-${group}" class="admin-seo-group__title">${escapeHtml(meta.title)}</h2>
			<p class="admin-seo-group__hint">${escapeHtml(meta.hint)}</p>
			<div class="admin-seo-group__list">${cards}</div>
		</section>
	`;
}

export function mountSeoSettingsAdmin(
	root: HTMLElement,
	options: { focus?: SeoPageKey } = {},
): void {
	function msg(text: string, ok: boolean) {
		const el = document.getElementById('admin-seo-msg');
		if (!el) return;
		el.className = `admin-msg ${ok ? 'admin-msg--ok' : 'admin-msg--err'}`;
		el.textContent = text;
		el.hidden = false;
		setTimeout(() => {
			el.hidden = true;
		}, 5000);
	}

	async function reload() {
		try {
			const cms = (await fetchCms()) as CmsState;
			render(cms);
		} catch {
			msg('Daten konnten nicht geladen werden. Bitte Seite neu laden.', false);
		}
	}

	function render(cms: CmsState) {
		const filtered = options.focus
			? SEO_PAGE_DEFINITIONS.filter((entry) => entry.key === options.focus)
			: [...SEO_PAGE_DEFINITIONS];

		let bodyHtml: string;
		if (options.focus && filtered.length === 1) {
			const g = filtered[0].adminGroup;
			const meta = SEO_ADMIN_GROUP_LABELS[g];
			bodyHtml = `
				<section class="admin-seo-group" aria-labelledby="admin-seo-focus-title">
					<h2 id="admin-seo-focus-title" class="admin-seo-group__title">${escapeHtml(meta.title)}</h2>
					<p class="admin-seo-group__hint">${escapeHtml(meta.hint)}</p>
					<div class="admin-seo-group__list">${pageCardHtml(cms, filtered[0].key)}</div>
				</section>`;
		} else if (options.focus && filtered.length === 0) {
			bodyHtml = `<p class="admin-p-hint">Diese SEO-Seite ist nicht bekannt. <a class="admin-link" href="/admin/seo">Zur Übersicht</a></p>`;
		} else {
			bodyHtml = SEO_ADMIN_GROUP_ORDER.map((group) => {
				const keys = filtered
					.filter((d) => d.adminGroup === group)
					.sort((a, b) => a.sort - b.sort)
					.map((d) => d.key);
				return renderGroupSection(cms, group, keys);
			}).join('');
		}

		root.innerHTML = `
			<p id="admin-seo-msg" class="admin-msg" hidden></p>
			<div class="admin-seo-shell">
				<p class="admin-seo-shell__lead">
					Pro Seite Titel, Beschreibung und Vorschaubild pflegen. Kategorien aufklappen – Live-Vorschau rechts (bzw. unten auf schmalen Screens).
				</p>
				${!options.focus ? globalSeoHtml(cms) : ''}
				${bodyHtml}
			</div>
		`;

		root.querySelector('#admin-seo-settings-form')?.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const fd = new FormData(ev.target as HTMLFormElement);
			const r = await patchJson('/api/admin/seo', {
				settings: {
					defaultOgImageUrl: String(fd.get('defaultOgImageUrl') || '').trim() || null,
					robotsDisallowText: String(fd.get('robotsDisallowText') || ''),
					robotsCustom: String(fd.get('robotsCustom') || '').trim() || null,
					allowIndexing: Boolean(fd.get('allowIndexing')),
					sitemapEnabled: Boolean(fd.get('sitemapEnabled')),
					autoImageOptimization: Boolean(fd.get('autoImageOptimization')),
				},
			});
			const j = await r.json().catch(() => ({}));
			if (!r.ok) {
				msg((j as { error?: string }).error || 'Speichern fehlgeschlagen.', false);
				return;
			}
			msg('Gespeichert.', true);
			await reload();
		});

		root.querySelectorAll<HTMLFormElement>('.admin-seo-form[data-page-key]').forEach((form) => {
			const key = form.dataset.pageKey as SeoPageKey;
			bindPreview(root, key);
			bindCharMeters(form);
			form.addEventListener('submit', async (ev) => {
				ev.preventDefault();
				const fd = new FormData(form);
				const metaTitle = String(fd.get('metaTitle') || '').trim();
				const metaDescription = String(fd.get('metaDescription') || '').trim();
				const r = await patchJson('/api/admin/seo', {
					pageKey: key,
					page: {
						metaTitle: metaTitle || null,
						metaDescription: metaDescription || null,
						keywords: String(fd.get('keywords') || '').trim() || null,
						ogTitle: metaTitle || null,
						ogDescription: metaDescription || null,
						ogImageUrl: String(fd.get('ogImageUrl') || '').trim() || null,
						index: Boolean(fd.get('index')),
						slug: String(fd.get('slug') || '').trim() || null,
					},
				});
				const j = await r.json().catch(() => ({}));
				if (!r.ok) {
					msg((j as { error?: string }).error || 'Seite konnte nicht gespeichert werden.', false);
					return;
				}
				msg('Gespeichert.', true);
				await reload();
			});
		});

		bindRestoreDefaults(root);
		scrollToSeoFocusFromQuery();
	}

	void reload();
}
