import { matterportEmbedUrl, youtubeEmbedUrl } from '../lib/embeds';
import { ADMIN_CATEGORIES, isStagingOrRetusche, type AdminCategoryId } from './categories';
import { deleteReq, fetchPortfolioCategory, patchJson, postJson } from './api';
import { PF_IMG_ACCEPT, pfDropHtml, wireAdminDropzones } from './dropzone';

type CmsMedia = { id: string; src: string };
type CmsEntry =
	| { id: string; kind: 'image'; category: string; sort: number; mediaId: string; enabled?: boolean }
	| {
			id: string;
			kind: 'compare';
			category: string;
			sort: number;
			beforeMediaId: string;
			afterMediaId: string;
			enabled?: boolean;
	  }
	| { id: string; kind: 'matterport'; category: string; sort: number; sourceUrl: string; enabled?: boolean }
	| { id: string; kind: 'youtube'; category: string; sort: number; sourceUrl: string; enabled?: boolean };

type Cms = { media: CmsMedia[]; portfolio: CmsEntry[] };

function escapeHtml(s: string): string {
	const d = document.createElement('div');
	d.textContent = s;
	return d.innerHTML;
}

function isEnabled(e: CmsEntry): boolean {
	return e.enabled !== false;
}

function thumbSrc(e: CmsEntry, map: Record<string, string>): string {
	if (e.kind === 'image') return map[e.mediaId] || '';
	if (e.kind === 'compare') return map[e.beforeMediaId] || '';
	return '';
}

function dndHandleHtml(): string {
	return `<button type="button" class="admin-dnd-handle" draggable="true" aria-label="Zum Sortieren ziehen" data-drag-handle>
		<span class="admin-dnd-handle__grip" aria-hidden="true">
			<span></span><span></span><span></span><span></span><span></span><span></span>
		</span>
	</button>`;
}

export function mountPortfolioAdmin(root: HTMLElement): void {
	let cms: Cms = { media: [], portfolio: [] };
	let activeCat: AdminCategoryId = 'bodenfotos';
	let featuredOrder: string[] = [];
	let maxHomeTiles = 6;

	function msg(text: string, ok: boolean) {
		const el = document.getElementById('admin-portfolio-msg');
		if (!el) return;
		el.className = `admin-msg ${ok ? 'admin-msg--ok' : 'admin-msg--err'}`;
		el.textContent = text;
		el.hidden = false;
		setTimeout(() => {
			el.hidden = true;
		}, 4000);
	}

	async function reload() {
		const data = await fetchPortfolioCategory(activeCat);
		cms = {
			media: data.media as CmsMedia[],
			portfolio: data.entries as CmsEntry[],
		};
		featuredOrder = [...(data.featuredPortfolioIds || [])];
		maxHomeTiles = typeof data.maxHomeTiles === 'number' ? data.maxHomeTiles : 6;
		render();
	}

	async function persistFeatured(): Promise<boolean> {
		const r = await postJson('/api/admin/featured', { ids: featuredOrder });
		if (!r.ok) {
			const j = await r.json().catch(() => ({}));
			msg((j as { error?: string }).error || 'Auswahl konnte nicht gespeichert werden.', false);
			await reload();
			return false;
		}
		return true;
	}

	function entriesForCat(cat: AdminCategoryId): CmsEntry[] {
		return cms.portfolio
			.filter((p) => p.category === cat)
			.sort((a, b) => a.sort - b.sort);
	}

	async function saveOrder(cat: AdminCategoryId, quiet?: boolean) {
		const ul = root.querySelector<HTMLUListElement>(`[data-cat-list="${cat}"]`);
		if (!ul) return;
		const ids = [...ul.querySelectorAll<HTMLLIElement>('[data-entry-id]')].map((li) => li.dataset.entryId!);
		const r = await postJson('/api/admin/portfolio/reorder', { category: cat, ids });
		if (!r.ok) {
			const j = await r.json().catch(() => ({}));
			msg((j as { error?: string }).error || 'Reihenfolge konnte nicht gespeichert werden.', false);
			await reload();
			return;
		}
		ids.forEach((id, index) => {
			const e = cms.portfolio.find((p) => p.id === id && p.category === cat);
			if (e && 'sort' in e) (e as { sort: number }).sort = index;
		});
		if (!quiet) msg('Reihenfolge gespeichert.', true);
	}

	function rowHtml(e: CmsEntry, mediaMap: Record<string, string>): string {
		const legacyKind = (e as { kind: string }).kind;
		const src = thumbSrc(e, mediaMap);
		const thumb =
			src ?
				`<img class="admin-p-thumb" src="${escapeHtml(src)}" alt="" width="76" height="50" />`
			:	`<div class="admin-p-thumb admin-p-thumb--placeholder">${e.kind === 'matterport' ? '360°' : e.kind === 'youtube' ? 'Video' : legacyKind === 'videoFile' ? '!' : '—'}</div>`;

		let badge = 'Bild';
		if (legacyKind === 'videoFile') badge = 'MP4 (alt)';
		else if (e.kind === 'compare') badge = 'Vorher / Nachher';
		else if (e.kind === 'matterport') badge = 'Matterport';
		else if (e.kind === 'youtube') badge = 'YouTube';

		const on = isEnabled(e);
		const rowClass = on ? 'admin-p-row' : 'admin-p-row admin-p-row--inactive';

		let middle = '';
		if (legacyKind === 'videoFile') {
			middle = `<p class="admin-p-hint" style="margin:0;">MP4-Uploads wurden entfernt. Diesen Eintrag bitte löschen oder durch ein YouTube-Video ersetzen.</p>`;
		} else if (e.kind === 'matterport') {
			const embed = matterportEmbedUrl(e.sourceUrl);
			const preview =
				embed ?
					`<div class="admin-p-embed-preview" aria-label="Vorschau Matterport">
						<iframe src="${escapeHtml(embed)}" title="Matterport Vorschau" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen allow="fullscreen; xr-spatial-tracking"></iframe>
					</div>`
				:	'';
			middle = `<div class="admin-field" style="margin:0;">
				<span class="admin-p-badge">Matterport-Link</span>
				<p class="admin-p-hint">Link einfügen · Darstellung 16:9</p>
				<div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
					<input type="url" data-url-field data-id="${e.id}" value="${escapeHtml(e.sourceUrl)}" placeholder="https://my.matterport.com/show/?m=…" style="flex:1;min-width:12rem;" />
					<button type="button" class="admin-btn admin-btn--sm" data-save-url="${e.id}">Link speichern</button>
				</div>
				${preview}
			</div>`;
		} else if (e.kind === 'youtube') {
			const embed = youtubeEmbedUrl(e.sourceUrl);
			const preview =
				embed ?
					`<div class="admin-p-embed-preview" aria-label="Vorschau YouTube">
						<iframe src="${escapeHtml(embed)}" title="YouTube Vorschau" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"></iframe>
					</div>`
				:	'';
			middle = `<div class="admin-field" style="margin:0;">
				<span class="admin-p-badge">YouTube-Link</span>
				<div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
					<input type="url" data-url-field data-id="${e.id}" value="${escapeHtml(e.sourceUrl)}" placeholder="https://www.youtube.com/watch?v=…" style="flex:1;min-width:12rem;" />
					<button type="button" class="admin-btn admin-btn--sm" data-save-url="${e.id}">Link speichern</button>
				</div>
				${preview}
			</div>`;
		}

		const toggle = `<label class="admin-toggle">
			<input type="checkbox" data-toggle-enabled="${e.id}" ${on ? 'checked' : ''} />
			<span class="admin-toggle__track" aria-hidden="true"><span class="admin-toggle__thumb"></span></span>
			<span>Öffentlich</span>
		</label>`;

		const onHome = featuredOrder.includes(e.id);
		const showStartToggle = e.kind === 'image' || e.kind === 'compare';
		const toggleHome =
			showStartToggle ?
				`<label class="admin-toggle" title="Hervorhebung auf der Einstiegsseite, maximal ${maxHomeTiles} Einträge">
			<input type="checkbox" data-toggle-home="${e.id}" ${onHome ? 'checked' : ''} />
			<span class="admin-toggle__track" aria-hidden="true"><span class="admin-toggle__thumb"></span></span>
			<span>Start</span>
		</label>`
			:	'';

		return `<li class="${rowClass}" data-entry-id="${e.id}" data-category="${activeCat}">
			${dndHandleHtml()}
			${thumb}
			<div class="admin-p-meta">
				<div class="admin-p-badge">${badge}</div>
				${middle}
			</div>
			<div class="admin-p-actions">
				${toggle}
				${toggleHome}
				<button type="button" class="admin-btn admin-btn--danger admin-btn--sm" data-del="${e.id}">Löschen</button>
			</div>
		</li>`;
	}

	function addSectionHtml(cat: AdminCategoryId): string {
		const label = ADMIN_CATEGORIES.find((c) => c.id === cat)?.label || cat;

		if (cat === 'tour360') {
			return `
			<div class="admin-pf-upload-stack">
				<p class="admin-pf-upload__context">Kategorie: ${escapeHtml(label)}</p>
				<div class="admin-pf-urlbox">
					<p class="admin-pf-urlbox__title">Matterport-Link</p>
					<form class="admin-pf-urlbox__form" data-add-matterport>
						<input type="url" name="sourceUrl" required placeholder="https://my.matterport.com/show/?m=…" class="admin-pf-urlbox__input" />
						<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Speichern</button>
					</form>
				</div>
			</div>`;
		}

		if (cat === 'video') {
			return `
			<div class="admin-pf-upload-stack">
				<p class="admin-pf-upload__context">Kategorie: ${escapeHtml(label)}</p>
				<div class="admin-video-two-col admin-pf-upload__two">
					<div class="admin-pf-upload__cell">
						<div class="admin-pf-urlbox admin-pf-urlbox--tight">
							<p class="admin-pf-urlbox__title">YouTube</p>
							<form class="admin-pf-urlbox__form admin-pf-urlbox__form--stack" data-add-youtube>
								<input type="url" name="sourceUrl" required placeholder="https://…" class="admin-pf-urlbox__input" />
								<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Speichern</button>
							</form>
						</div>
					</div>
					<div class="admin-pf-upload__cell">
						<p class="admin-pf-upload__label">Bilder (optional)</p>
						<form class="admin-pf-upload__form admin-pf-upload__form--stacked" data-upload-image>
							${pfDropHtml({
								name: 'file',
								accept: PF_IMG_ACCEPT,
								multiple: true,
								title: 'Bilder hinzufügen',
								meta: 'JPEG, PNG, WebP',
								compact: true,
							})}
							<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Hochladen</button>
						</form>
					</div>
				</div>
			</div>`;
		}

		if (isStagingOrRetusche(cat)) {
			return `
			<div class="admin-pf-upload-stack">
				<p class="admin-pf-upload__context">Kategorie: ${escapeHtml(label)}</p>
				<div class="admin-pf-upload__radios" role="group" aria-label="Upload-Typ">
					<label class="admin-pf-upload__radio"><input type="radio" name="pfMode" value="single" checked /> Einzelbild</label>
					<label class="admin-pf-upload__radio"><input type="radio" name="pfMode" value="compare" /> Vergleich</label>
				</div>
				<div data-pf-single>
					<form class="admin-pf-upload__form admin-pf-upload__form--stacked" data-upload-image>
						${pfDropHtml({
							name: 'file',
							accept: PF_IMG_ACCEPT,
							multiple: true,
							required: true,
							title: 'Bilder hochladen',
							meta: 'JPEG, PNG, WebP · mehrere Dateien',
						})}
						<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Hochladen</button>
					</form>
				</div>
				<div data-pf-compare style="display:none;">
					<form class="admin-pf-upload__form admin-pf-upload__form--stacked" data-upload-compare>
						<div class="admin-pf-compare-drops">
							<div class="admin-pf-compare-drops__item">
								<p class="admin-pf-upload__label">Vorher</p>
								${pfDropHtml({
									name: 'fileBefore',
									accept: PF_IMG_ACCEPT,
									required: true,
									title: 'Datei wählen',
									meta: 'Erste Aufnahme',
									compact: true,
								})}
							</div>
							<div class="admin-pf-compare-drops__item">
								<p class="admin-pf-upload__label">Nachher</p>
								${pfDropHtml({
									name: 'fileAfter',
									accept: PF_IMG_ACCEPT,
									required: true,
									title: 'Datei wählen',
									meta: 'Zweite Aufnahme',
									compact: true,
								})}
							</div>
						</div>
						<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Speichern</button>
					</form>
				</div>
			</div>`;
		}

		return `
		<div class="admin-pf-upload-stack">
			<p class="admin-pf-upload__context">Kategorie: ${escapeHtml(label)}</p>
			<form class="admin-pf-upload__form admin-pf-upload__form--stacked" data-upload-image>
				${pfDropHtml({
					name: 'file',
					accept: PF_IMG_ACCEPT,
					multiple: true,
					required: true,
					title: 'Bilder hochladen',
					meta: 'JPEG, PNG, WebP · mehrere Dateien',
				})}
				<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Hochladen</button>
			</form>
		</div>`;
	}

	function render() {
		const mediaMap = Object.fromEntries(cms.media.map((m) => [m.id, m.src]));
		const items = entriesForCat(activeCat);
		const catLabel = ADMIN_CATEGORIES.find((c) => c.id === activeCat)?.label || '';

		const tabs = ADMIN_CATEGORIES.map((c) => {
			const active = c.id === activeCat;
			return `<button type="button" role="tab" aria-selected="${active ? 'true' : 'false'}" class="admin-pf-nav__btn${active ? ' is-active' : ''}" data-tab="${c.id}"><span class="admin-pf-nav__label">${escapeHtml(c.label)}</span></button>`;
		}).join('');

		const list =
			items.length === 0 ?
				`<p class="admin-pf-list-empty">Keine Einträge in dieser Kategorie.</p>`
			:	`<ul class="admin-pf-list" data-cat-list="${activeCat}">${items.map((e) => rowHtml(e, mediaMap)).join('')}</ul>
				<p class="admin-pf-list-hint">Sortierung per Griff · Änderungen werden gespeichert.</p>`;

		root.innerHTML = `
			<div class="admin-pf">
				<p id="admin-portfolio-msg" class="admin-msg" hidden></p>
				<p class="admin-pf-lead">
					Schalter „Start“: bis zu ${maxHomeTiles} Einträge für die Einstiegs-Ansicht. Reihenfolge entspricht der Reihenfolge beim Aktivieren.
				</p>
				<nav class="admin-pf-nav" aria-label="Portfolio-Kategorien">
					<div class="admin-pf-nav__scroll" role="tablist">${tabs}</div>
				</nav>
				<section class="admin-pf-block" aria-labelledby="admin-pf-list-title">
					<h2 id="admin-pf-list-title" class="admin-pf-block__title">${escapeHtml(catLabel)}</h2>
					${list}
				</section>
				<section class="admin-pf-block admin-pf-block--upload" aria-labelledby="admin-pf-upload-title">
					<h2 id="admin-pf-upload-title" class="admin-pf-block__title">Upload</h2>
					${addSectionHtml(activeCat)}
				</section>
			</div>
		`;

		root.querySelectorAll('[data-tab]').forEach((btn) => {
			btn.addEventListener('click', () => {
				void (async () => {
					activeCat = (btn as HTMLButtonElement).dataset.tab as AdminCategoryId;
					await reload();
				})();
			});
		});

		root.querySelectorAll('[data-del]').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const id = (btn as HTMLButtonElement).dataset.del;
				if (!id || !confirm('Dauerhaft löschen?')) return;
				const r = await deleteReq(`/api/admin/portfolio/${id}`);
				if (!r.ok) {
					msg('Konnte nicht entfernen.', false);
					return;
				}
				msg('Gelöscht.', true);
				await reload();
			});
		});

		root.querySelectorAll('[data-toggle-enabled]').forEach((inp) => {
			inp.addEventListener('change', async () => {
				const id = (inp as HTMLInputElement).dataset.toggleEnabled;
				if (!id) return;
				const enabled = (inp as HTMLInputElement).checked;
				const r = await patchJson(`/api/admin/portfolio/${id}`, { enabled });
				if (!r.ok) {
					msg('Einstellung konnte nicht geändert werden.', false);
					(inp as HTMLInputElement).checked = !enabled;
					await reload();
					return;
				}
				const e = cms.portfolio.find((p) => p.id === id);
				if (e) (e as { enabled?: boolean }).enabled = enabled;
				const li = root.querySelector(`[data-entry-id="${id}"]`);
				li?.classList.toggle('admin-p-row--inactive', !enabled);
			});
		});

		root.querySelectorAll('[data-toggle-home]').forEach((inp) => {
			inp.addEventListener('change', async () => {
				const id = (inp as HTMLInputElement).dataset.toggleHome;
				if (!id) return;
				const want = (inp as HTMLInputElement).checked;
				if (want) {
					if (featuredOrder.length >= maxHomeTiles && !featuredOrder.includes(id)) {
						(inp as HTMLInputElement).checked = false;
						msg(`Maximal ${maxHomeTiles} Einträge für „Start“.`, false);
						return;
					}
					if (!featuredOrder.includes(id)) featuredOrder.push(id);
				} else {
					featuredOrder = featuredOrder.filter((x) => x !== id);
				}
				const ok = await persistFeatured();
				if (!ok) {
					(inp as HTMLInputElement).checked = !want;
					return;
				}
				msg(want ? '„Start“ aktiviert.' : '„Start“ entfernt.', true);
			});
		});

		root.querySelectorAll('[data-save-url]').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const id = (btn as HTMLButtonElement).dataset.saveUrl;
				if (!id) return;
				const inp = root.querySelector<HTMLInputElement>(`input[data-url-field][data-id="${id}"]`);
				if (!inp) return;
				const r = await patchJson(`/api/admin/portfolio/${id}`, { sourceUrl: inp.value.trim() });
				if (!r.ok) {
					const j = await r.json().catch(() => ({}));
					msg((j as { error?: string }).error || 'Link ungültig.', false);
					return;
				}
				const entry = cms.portfolio.find((p) => p.id === id);
				if (entry && (entry.kind === 'matterport' || entry.kind === 'youtube')) {
					(entry as { sourceUrl: string }).sourceUrl = inp.value.trim();
				}
				msg('Link gespeichert.', true);
				render();
			});
		});

		root.querySelectorAll('form[data-upload-image]').forEach((form) => {
			form.addEventListener('submit', async (ev) => {
				ev.preventDefault();
				const fd = new FormData(form as HTMLFormElement);
				const raw = fd.getAll('file');
				const files = raw.filter((f): f is File => f instanceof File && f.size > 0);
				if (files.length === 0) {
					msg('Bitte mindestens eine Bilddatei wählen.', false);
					return;
				}
				let ok = 0;
				let lastErr = '';
				for (const file of files) {
					const up = new FormData();
					up.append('kind', 'image');
					up.append('category', activeCat);
					up.append('file', file);
					const r = await fetch('/api/admin/portfolio', {
						method: 'POST',
						body: up,
						credentials: 'same-origin',
					});
					if (r.ok) ok += 1;
					else {
						const j = await r.json().catch(() => ({}));
						lastErr = (j as { error?: string }).error || 'Upload fehlgeschlagen.';
					}
				}
				if (ok === files.length) {
					msg(ok === 1 ? 'Hinzugefügt.' : `${ok} Bilder hinzugefügt.`, true);
				} else if (ok > 0) {
					msg(`${ok} von ${files.length} OK. ${lastErr}`, false);
				} else {
					msg(lastErr || 'Upload fehlgeschlagen.', false);
				}
				(form as HTMLFormElement).reset();
				await reload();
			});
		});

		root.querySelectorAll('form[data-upload-compare]').forEach((form) => {
			form.addEventListener('submit', async (ev) => {
				ev.preventDefault();
				const fd = new FormData(form as HTMLFormElement);
				const bf = fd.get('fileBefore');
				const af = fd.get('fileAfter');
				if (!(bf instanceof File) || !(af instanceof File)) return;
				const up = new FormData();
				up.append('kind', 'compare');
				up.append('category', activeCat);
				up.append('fileBefore', bf);
				up.append('fileAfter', af);
				const r = await fetch('/api/admin/portfolio', {
					method: 'POST',
					body: up,
					credentials: 'same-origin',
				});
				if (!r.ok) {
					const j = await r.json().catch(() => ({}));
					msg((j as { error?: string }).error || 'Upload fehlgeschlagen.', false);
					return;
				}
				msg('Vorher/Nachher gespeichert.', true);
				(form as HTMLFormElement).reset();
				await reload();
			});
		});

		root.querySelector('form[data-add-matterport]')?.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const form = ev.target as HTMLFormElement;
			const sourceUrl = (new FormData(form).get('sourceUrl') as string)?.trim();
			if (!sourceUrl) return;
			const r = await postJson('/api/admin/portfolio', {
				kind: 'matterport',
				category: 'tour360',
				sourceUrl,
			});
			if (!r.ok) {
				const j = await r.json().catch(() => ({}));
				msg((j as { error?: string }).error || 'Matterport-Link ungültig.', false);
				return;
			}
			msg('Hinzugefügt.', true);
			form.reset();
			await reload();
		});

		root.querySelector('form[data-add-youtube]')?.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const form = ev.target as HTMLFormElement;
			const sourceUrl = (new FormData(form).get('sourceUrl') as string)?.trim();
			if (!sourceUrl) return;
			const r = await postJson('/api/admin/portfolio', {
				kind: 'youtube',
				category: 'video',
				sourceUrl,
			});
			if (!r.ok) {
				const j = await r.json().catch(() => ({}));
				msg((j as { error?: string }).error || 'YouTube-Link ungültig.', false);
				return;
			}
			msg('Hinzugefügt.', true);
			form.reset();
			await reload();
		});

		if (isStagingOrRetusche(activeCat)) {
			const single = root.querySelector('[data-pf-single]');
			const comp = root.querySelector('[data-pf-compare]');
			root.querySelectorAll('input[name="pfMode"]').forEach((r) => {
				r.addEventListener('change', () => {
					const v = (root.querySelector('input[name="pfMode"]:checked') as HTMLInputElement)?.value;
					if (single && comp) {
						single.style.display = v === 'single' ? '' : 'none';
						comp.style.display = v === 'compare' ? '' : 'none';
					}
				});
			});
		}

		let dragId: string | null = null;
		root.querySelectorAll('[data-cat-list]').forEach((ul) => {
			ul.addEventListener('dragstart', (e) => {
				if (!(e.target as HTMLElement).closest('[data-drag-handle]')) {
					e.preventDefault();
					return;
				}
				const li = (e.target as HTMLElement).closest('[data-entry-id]') as HTMLLIElement | null;
				dragId = li?.dataset.entryId || null;
				if (dragId) e.dataTransfer?.setData('text/plain', dragId);
			});
			ul.addEventListener('dragover', (e) => e.preventDefault());
			ul.addEventListener('drop', (e) => {
				e.preventDefault();
				const ulEl = ul as HTMLUListElement;
				const cat = ulEl.dataset.catList as AdminCategoryId;
				const id = e.dataTransfer?.getData('text/plain') || dragId;
				if (!id || !cat) return;
				const dragging = ulEl.querySelector(`[data-entry-id="${id}"]`) as HTMLLIElement | null;
				const target = (e.target as HTMLElement).closest('[data-entry-id]') as HTMLLIElement | null;
				if (!dragging || !target || dragging === target) return;
				const rect = target.getBoundingClientRect();
				const before = e.clientY < rect.top + rect.height / 2;
				if (before) ulEl.insertBefore(dragging, target);
				else ulEl.insertBefore(dragging, target.nextSibling);
				void saveOrder(cat, true);
			});
		});

		wireAdminDropzones(root);
	}

	void reload();
}
