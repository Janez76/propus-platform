import { deleteReq, fetchCms, patchJson, postJson } from './api';
import { pfDropHtml, wireAdminDropzones } from './dropzone';

const SV_IMG_ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml,image/gif';

type CmsService = {
	id: string;
	sort: number;
	title: string;
	slogan: string;
	body: string;
	imageUrl?: string;
	mediaId?: string;
	enabled?: boolean;
};

type CmsMedia = { id: string; src: string };
type Cms = { services: CmsService[]; media: CmsMedia[] };

function escapeHtml(s: string): string {
	const d = document.createElement('div');
	d.textContent = s;
	return d.innerHTML;
}

function isEnabled(s: CmsService): boolean {
	return s.enabled !== false;
}

function previewSrc(s: CmsService, mediaMap: Record<string, string>): string {
	const u = (s.imageUrl || '').trim();
	if (u) return u;
	const mid = (s.mediaId || '').trim();
	return mid ? mediaMap[mid] || '' : '';
}

function dndHandleHtml(): string {
	return `<button type="button" class="admin-dnd-handle" draggable="true" aria-label="Zum Sortieren ziehen" data-service-drag-handle>
		<span class="admin-dnd-handle__grip" aria-hidden="true">
			<span></span><span></span><span></span><span></span><span></span><span></span>
		</span>
	</button>`;
}

async function uploadImageFile(file: File): Promise<{ id: string } | null> {
	const fd = new FormData();
	fd.append('file', file);
	const r = await fetch('/api/admin/media', { method: 'POST', body: fd, credentials: 'same-origin' });
	if (!r.ok) return null;
	const j = (await r.json()) as { media?: { id: string } };
	return j.media || null;
}

export function mountServicesAdmin(root: HTMLElement): void {
	let cms: Cms = { services: [], media: [] };

	function renderMsg(text: string, ok: boolean) {
		const el = document.getElementById('admin-services-msg');
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
			const data = (await fetchCms()) as Partial<Cms>;
			cms = {
				services: Array.isArray(data.services) ? data.services : [],
				media: Array.isArray(data.media) ? data.media : [],
			};
			render();
		} catch {
			const el = document.getElementById('admin-services-msg');
			if (el) {
				el.className = 'admin-msg admin-msg--err';
				el.textContent = 'Daten konnten nicht geladen werden. Bitte Seite neu laden.';
				el.hidden = false;
			}
		}
	}

	async function persistOrder(): Promise<boolean> {
		const ul = root.querySelector('#admin-services-order');
		if (!ul) return false;
		const ids = [...ul.querySelectorAll<HTMLLIElement>('[data-service-id]')].map((li) => li.dataset.serviceId!);
		const r = await postJson('/api/admin/services/reorder', { ids });
		if (!r.ok) {
			renderMsg('Reihenfolge speichern fehlgeschlagen.', false);
			return false;
		}
		return true;
	}

	async function importDefault() {
		const hadItems = cms.services.length > 0;
		if (
			hadItems &&
			!confirm(
				'Bestehende Einträge werden gelöscht und durch die Vorlage ersetzt. Fortfahren?',
			)
		) {
			return;
		}
		const r = await postJson('/api/admin/services', {
			importDefault: true,
			...(hadItems ? { replaceExisting: true } : {}),
		});
		const j = await r.json().catch(() => ({}));
		if (!r.ok) {
			renderMsg((j as { error?: string }).error || 'Import fehlgeschlagen.', false);
			return;
		}
		renderMsg('Vorlage eingefügt.', true);
		await reload();
	}

	function render() {
		const sorted = [...cms.services].sort((a, b) => a.sort - b.sort);
		const map = Object.fromEntries(cms.media.map((m) => [m.id, m.src]));

		const lis = sorted
			.map((s) => {
				const src = previewSrc(s, map);
				const on = isEnabled(s);
				const itemClass = on ? 'admin-sv-item' : 'admin-sv-item admin-sv-item--inactive';
				const thumb =
					src ?
						`<div class="admin-p-thumb"><img src="${escapeHtml(src)}" alt="" width="84" height="54" /></div>`
					:	`<div class="admin-p-thumb admin-p-thumb--placeholder" aria-hidden="true">Bild</div>`;
				return `
				<li class="${itemClass}" data-service-id="${s.id}" id="admin-service-${s.id}">
					<div class="admin-sv-item__overview">
						<div class="admin-sv-item__row">
							${dndHandleHtml()}
							${thumb}
							<div class="admin-p-meta">
								<span class="admin-p-badge">Kurzinfo</span>
								<p class="admin-sv-item__title">${escapeHtml(s.title)}</p>
								<p class="admin-sv-item__slogan">${escapeHtml(s.slogan)}</p>
							</div>
							<div class="admin-p-actions">
								<label class="admin-toggle">
									<input type="checkbox" data-toggle-service="${s.id}" ${on ? 'checked' : ''} />
									<span class="admin-toggle__track" aria-hidden="true"><span class="admin-toggle__thumb"></span></span>
									<span>Öffentlich</span>
								</label>
								<button type="button" class="admin-btn admin-btn--danger admin-btn--sm" data-del-service="${s.id}">Löschen</button>
							</div>
						</div>
					</div>
					<form class="admin-sv-form" data-service="${s.id}">
						<input type="hidden" name="mediaId" value="${escapeHtml((s.mediaId || '').trim())}" />
						<div class="admin-sv-segment">
							<h3 class="admin-sv-segment__title">Text</h3>
							<div class="admin-sv-segment__grid">
								<div class="admin-field"><label>Titel</label><input type="text" name="title" value="${escapeHtml(s.title)}" required /></div>
								<div class="admin-field"><label>Slogan</label><input type="text" name="slogan" value="${escapeHtml(s.slogan)}" required /></div>
								<div class="admin-field"><label>Fließtext</label><textarea name="body" rows="4" required>${escapeHtml(s.body)}</textarea></div>
							</div>
						</div>
						<div class="admin-sv-segment">
							<h3 class="admin-sv-segment__title">Bild</h3>
							<p class="admin-sv-segment__hint">URL eintragen oder Datei wählen. Upload ersetzt die URL.</p>
							<div class="admin-sv-segment__grid">
								<div class="admin-field">
									<label>Bild-URL</label>
									<input type="text" name="imageUrl" value="${escapeHtml(src)}" placeholder="https://…" autocomplete="off" />
								</div>
								<div>
									<p class="admin-pf-upload__label">Datei (optional)</p>
									${pfDropHtml({
										name: 'photo',
										accept: SV_IMG_ACCEPT,
										title: 'Bild wählen',
										meta: 'JPEG, PNG, WebP, SVG, GIF',
										compact: true,
									})}
								</div>
							</div>
						</div>
						<div class="admin-sv-segment admin-sv-segment--foot">
							<div class="admin-sv-form-actions">
								<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Speichern</button>
							</div>
						</div>
					</form>
				</li>`;
			})
			.join('');

		const emptyHint =
			sorted.length === 0 ?
				`<div class="admin-sv-empty">
					<p class="admin-pf-list-empty">Noch keine Einträge. Unten anlegen oder vordefinierten Inhalt einfügen.</p>
					<button type="button" class="admin-btn admin-btn--primary" id="admin-services-import-default">Vorlage einfügen</button>
				</div>`
			:	'';

		const listBlock =
			sorted.length === 0 ?
				emptyHint
			:	`<ul id="admin-services-order" class="admin-pf-list">${lis}</ul>
				<p class="admin-pf-list-hint admin-sv-list-hint">Reihenfolge: Eintrag am Griff verschieben; wird beim Ablegen gespeichert.</p>`;

		root.innerHTML = `
			<div class="admin-pf admin-sv-page">
				<p id="admin-services-msg" class="admin-msg" hidden></p>
				<p class="admin-pf-lead">
					Einträge für die öffentliche Leistungsseite. Pro Zeile: Kurzinfo, dann Text und Bild. Schalter „Öffentlich“ steuert die Anzeige.
				</p>
				<section class="admin-pf-block" aria-labelledby="admin-sv-list-title">
					<h2 id="admin-sv-list-title" class="admin-pf-block__title">Einträge</h2>
					${listBlock}
				</section>
				<section class="admin-pf-block admin-pf-block--upload" aria-labelledby="admin-sv-new-title">
					<h2 id="admin-sv-new-title" class="admin-pf-block__title">Neuer Eintrag</h2>
					<div class="admin-sv-new-sheet">
						<form id="admin-services-new" class="admin-sv-new-form">
							<div class="admin-sv-segment">
								<h3 class="admin-sv-segment__title">Text</h3>
								<div class="admin-sv-segment__grid">
									<div class="admin-field"><label>Titel</label><input type="text" name="title" required /></div>
									<div class="admin-field"><label>Slogan</label><input type="text" name="slogan" required /></div>
									<div class="admin-field"><label>Fließtext</label><textarea name="body" rows="4" required></textarea></div>
								</div>
							</div>
							<div class="admin-sv-segment">
								<h3 class="admin-sv-segment__title">Bild</h3>
								<p class="admin-sv-segment__hint">URL oder Datei angeben.</p>
								<div class="admin-sv-segment__grid">
									<div class="admin-field">
										<label>Bild-URL</label>
										<input type="text" name="imageUrl" placeholder="https://…" autocomplete="off" />
									</div>
									<div>
										<p class="admin-pf-upload__label">Datei</p>
										${pfDropHtml({
											name: 'photo',
											accept: SV_IMG_ACCEPT,
											title: 'Bild wählen',
											meta: 'JPEG, PNG, WebP, SVG, GIF',
										})}
									</div>
								</div>
							</div>
							<div class="admin-sv-segment admin-sv-segment--foot">
								<div class="admin-sv-form-actions">
									<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Hinzufügen</button>
								</div>
							</div>
						</form>
					</div>
				</section>
			</div>
		`;

		const bindImport = (sel: string) => {
			root.querySelector(sel)?.addEventListener('click', () => {
				void importDefault();
			});
		};
		bindImport('#admin-services-import-default');

		root.querySelectorAll('[data-toggle-service]').forEach((inp) => {
			inp.addEventListener('change', async () => {
				const id = (inp as HTMLInputElement).dataset.toggleService;
				if (!id) return;
				const enabled = (inp as HTMLInputElement).checked;
				const r = await patchJson(`/api/admin/services/${id}`, { enabled });
				if (!r.ok) {
					renderMsg('Status konnte nicht geändert werden.', false);
					await reload();
					return;
				}
				await reload();
			});
		});

		root.querySelectorAll('.admin-sv-form[data-service]').forEach((form) => {
			form.addEventListener('submit', async (ev) => {
				ev.preventDefault();
				const id = (form as HTMLFormElement).dataset.service;
				if (!id) return;
				const fd = new FormData(form as HTMLFormElement);
				const photo = fd.get('photo');

				let payload: Record<string, unknown> = {
					title: fd.get('title'),
					slogan: fd.get('slogan'),
					body: fd.get('body'),
				};

				if (photo instanceof File && photo.size > 0) {
					const up = await uploadImageFile(photo);
					if (!up) {
						renderMsg('Bild-Upload fehlgeschlagen.', false);
						return;
					}
					payload = { ...payload, mediaId: up.id };
				} else {
					const url = String(fd.get('imageUrl') || '').trim();
					const hiddenMid = String(fd.get('mediaId') || '').trim();
					if (url) {
						payload = { ...payload, imageUrl: url };
					} else if (hiddenMid) {
						payload = { ...payload, mediaId: hiddenMid };
					} else {
						renderMsg('Bitte Bild-URL setzen oder Datei hochladen.', false);
						return;
					}
				}

				const r = await patchJson(`/api/admin/services/${id}`, payload);
				if (!r.ok) {
					const j = await r.json().catch(() => ({}));
					renderMsg((j as { error?: string }).error || 'Speichern fehlgeschlagen.', false);
					return;
				}
				renderMsg('Gespeichert.', true);
				await reload();
			});
		});

		root.querySelectorAll('[data-del-service]').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const id = (btn as HTMLButtonElement).dataset.delService;
				if (!id || !confirm('Diese Leistung dauerhaft löschen?')) return;
				const r = await deleteReq(`/api/admin/services/${id}`);
				if (!r.ok) {
					renderMsg('Löschen fehlgeschlagen.', false);
					return;
				}
				renderMsg('Gelöscht.', true);
				await reload();
			});
		});

		root.querySelector('#admin-services-new')?.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const form = ev.target as HTMLFormElement;
			const fd = new FormData(form);
			const photo = fd.get('photo');

			let body: Record<string, unknown> = {
				title: fd.get('title'),
				slogan: fd.get('slogan'),
				body: fd.get('body'),
			};

			if (photo instanceof File && photo.size > 0) {
				const up = await uploadImageFile(photo);
				if (!up) {
					renderMsg('Bild-Upload fehlgeschlagen.', false);
					return;
				}
				body = { ...body, mediaId: up.id };
			} else {
				const url = String(fd.get('imageUrl') || '').trim();
				if (!url) {
					renderMsg('Bitte Bild-URL oder Datei angeben.', false);
					return;
				}
				body = { ...body, imageUrl: url };
			}

			const r = await postJson('/api/admin/services', body);
			const j = await r.json().catch(() => ({}));
			if (!r.ok) {
				renderMsg((j as { error?: string }).error || 'Anlegen fehlgeschlagen.', false);
				return;
			}
			renderMsg('Leistung hinzugefügt.', true);
			form.reset();
			await reload();
		});

		let dragId: string | null = null;
		const orderUl = root.querySelector('#admin-services-order');
		orderUl?.addEventListener('dragstart', (e) => {
			if (!(e.target as HTMLElement).closest('[data-service-drag-handle]')) {
				e.preventDefault();
				return;
			}
			const li = (e.target as HTMLElement).closest('[data-service-id]') as HTMLLIElement | null;
			dragId = li?.dataset.serviceId || null;
			if (dragId) e.dataTransfer?.setData('text/plain', dragId);
		});
		orderUl?.addEventListener('dragover', (e) => e.preventDefault());
		orderUl?.addEventListener('drop', async (e) => {
			e.preventDefault();
			const ulEl = orderUl as HTMLUListElement;
			const sid = e.dataTransfer?.getData('text/plain') || dragId;
			if (!sid) return;
			const dragging = ulEl.querySelector(`[data-service-id="${sid}"]`) as HTMLLIElement | null;
			const target = (e.target as HTMLElement).closest('[data-service-id]') as HTMLLIElement | null;
			if (!dragging || !target || dragging === target) return;
			const rect = target.getBoundingClientRect();
			const before = e.clientY < rect.top + rect.height / 2;
			if (before) ulEl.insertBefore(dragging, target);
			else ulEl.insertBefore(dragging, target.nextSibling);
			const ok = await persistOrder();
			if (ok) {
				await reload();
				renderMsg('Reihenfolge gespeichert.', true);
			}
		});

		wireAdminDropzones(root);
	}

	void reload();
}
