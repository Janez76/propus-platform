import { deleteReq, fetchCms, patchJson, postJson } from './api';
import { pfDropHtml, wireAdminDropzones } from './dropzone';

const CL_ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml,image/gif';

type CmsClientLogo = {
	id: string;
	sort: number;
	name: string;
	imageUrl?: string;
	mediaId?: string;
	enabled?: boolean;
};

type CmsMedia = { id: string; src: string };
type Cms = { clientLogos: CmsClientLogo[]; media: CmsMedia[] };

function escapeHtml(s: string): string {
	const d = document.createElement('div');
	d.textContent = s;
	return d.innerHTML;
}

function isEnabled(c: CmsClientLogo): boolean {
	return c.enabled !== false;
}

function previewSrc(c: CmsClientLogo, mediaMap: Record<string, string>): string {
	const u = (c.imageUrl || '').trim();
	if (u) return u;
	const mid = (c.mediaId || '').trim();
	return mid ? mediaMap[mid] || '' : '';
}

function dndHandleHtml(): string {
	return `<button type="button" class="admin-dnd-handle" draggable="true" aria-label="Zum Sortieren ziehen" data-clientlogo-drag-handle>
		<span class="admin-dnd-handle__grip" aria-hidden="true">
			<span></span><span></span><span></span><span></span><span></span><span></span>
		</span>
	</button>`;
}

function parseUrlLines(raw: string): string[] {
	return raw
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
}

async function uploadImageFile(file: File): Promise<{ src: string } | null> {
	const fd = new FormData();
	fd.append('file', file);
	const r = await fetch('/api/admin/media', { method: 'POST', body: fd, credentials: 'same-origin' });
	if (!r.ok) return null;
	const j = (await r.json()) as { media?: { src: string } };
	return j.media?.src ? { src: j.media.src } : null;
}

export function mountClientLogosAdmin(root: HTMLElement): void {
	let cms: Cms = { clientLogos: [], media: [] };

	function renderMsg(text: string, ok: boolean) {
		const el = document.getElementById('admin-clientlogos-msg');
		if (!el) return;
		el.className = `admin-msg ${ok ? 'admin-msg--ok' : 'admin-msg--err'}`;
		el.textContent = text;
		el.hidden = false;
		setTimeout(() => {
			el.hidden = true;
		}, 4000);
	}

	async function reload() {
		const data = (await fetchCms()) as Partial<Cms>;
		cms = {
			clientLogos: Array.isArray(data.clientLogos) ? data.clientLogos : [],
			media: Array.isArray(data.media) ? data.media : [],
		};
		render();
	}

	async function persistOrder(): Promise<boolean> {
		const ul = root.querySelector('#admin-clientlogos-order');
		if (!ul) return false;
		const ids = [...ul.querySelectorAll<HTMLLIElement>('[data-logo-id]')].map((li) => li.dataset.logoId!);
		const r = await postJson('/api/admin/client-logos/reorder', { ids });
		if (!r.ok) {
			renderMsg('Reihenfolge speichern fehlgeschlagen.', false);
			return false;
		}
		return true;
	}

	function render() {
		const sorted = [...cms.clientLogos].sort((a, b) => a.sort - b.sort);
		const map = Object.fromEntries(cms.media.map((m) => [m.id, m.src]));

		const lis = sorted
			.map((c) => {
				const src = previewSrc(c, map);
				const on = isEnabled(c);
				const itemClass = on ? 'admin-cl-item' : 'admin-cl-item admin-cl-item--inactive';
				const label = (c.name || '').trim() || 'Logo';
				const thumb =
					src ?
						`<div class="admin-cl-thumb"><img src="${escapeHtml(src)}" alt="" /></div>`
					:	`<div class="admin-cl-thumb admin-cl-thumb--placeholder" aria-hidden="true">—</div>`;
				return `
				<li class="${itemClass}" data-logo-id="${c.id}" id="admin-clientlogo-${c.id}">
					<div class="admin-cl-item__overview">
						<div class="admin-cl-item__row">
							${dndHandleHtml()}
							${thumb}
							<div class="admin-p-meta">
								<span class="admin-p-badge">Kundenlogo</span>
								<p class="admin-cl-item__title">${escapeHtml(label)}</p>
								<p class="admin-cl-item__sub">Startseite · Leiste (Graustufen)</p>
							</div>
							<div class="admin-p-actions">
								<label class="admin-toggle">
									<input type="checkbox" data-toggle-clientlogo="${c.id}" ${on ? 'checked' : ''} />
									<span class="admin-toggle__track" aria-hidden="true"><span class="admin-toggle__thumb"></span></span>
									<span>Öffentlich</span>
								</label>
								<button type="button" class="admin-btn admin-btn--danger admin-btn--sm" data-del-logo="${c.id}">Löschen</button>
							</div>
						</div>
					</div>
					<form class="admin-cl-form" data-logo="${c.id}">
						<div class="admin-cl-segment">
							<h3 class="admin-cl-segment__title">Bildquelle</h3>
							<p class="admin-cl-segment__hint">Direktlink (https oder Pfad ab /). Upload setzt die öffentliche Medien-URL.</p>
							<div class="admin-cl-segment__grid">
								<div class="admin-field">
									<label>Bild-URL</label>
									<input type="text" name="imageUrl" value="${escapeHtml(src)}" placeholder="https://…" autocomplete="off" />
								</div>
								<div>
									<p class="admin-pf-upload__label">Datei (optional)</p>
									${pfDropHtml({
										name: 'photo',
										accept: CL_ACCEPT,
										title: 'Logo wählen',
										meta: 'PNG, SVG, WebP · ersetzt die URL',
										compact: true,
									})}
								</div>
							</div>
						</div>
						<div class="admin-cl-segment admin-cl-segment--foot">
							<div class="admin-cl-form-actions">
								<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Speichern</button>
							</div>
						</div>
					</form>
				</li>`;
			})
			.join('');

		const listBlock =
			sorted.length === 0 ?
				`<p class="admin-pf-list-empty">Noch keine Logos – unten URLs eintragen oder Platzhalter aus dem Code greifen.</p>`
			:	`<ul id="admin-clientlogos-order" class="admin-pf-list">${lis}</ul>
				<p class="admin-pf-list-hint admin-cl-list-hint">Reihenfolge: Eintrag am Griff verschieben; wird beim Ablegen gespeichert.</p>`;

		root.innerHTML = `
			<div class="admin-pf admin-cl-page">
				<p id="admin-clientlogos-msg" class="admin-msg" hidden></p>
				<p class="admin-pf-lead">
					Logos für die Kundenleiste auf der Startseite. Kurzinfo oben, Bildadresse unten. Reihenfolge per Griff, Sichtbarkeit per Schalter.
				</p>
				<section class="admin-pf-block" aria-labelledby="admin-cl-list-title">
					<h2 id="admin-cl-list-title" class="admin-pf-block__title">Einträge</h2>
					${listBlock}
				</section>
				<section class="admin-pf-block admin-pf-block--upload" aria-labelledby="admin-cl-new-title">
					<h2 id="admin-cl-new-title" class="admin-pf-block__title">Logos hinzufügen</h2>
					<div class="admin-cl-new-sheet">
						<form id="admin-clientlogos-new" class="admin-cl-new-form">
							<div class="admin-cl-segment">
								<h3 class="admin-cl-segment__title">Bild-URLs</h3>
								<p class="admin-cl-segment__hint">Eine URL pro Zeile. Anzeigename wird aus dem Dateinamen abgeleitet.</p>
								<div class="admin-field">
									<label for="admin-cl-bulk-urls">URLs</label>
									<textarea id="admin-cl-bulk-urls" name="urls" rows="5" required placeholder="https://…"></textarea>
								</div>
							</div>
							<div class="admin-cl-segment admin-cl-segment--foot">
								<div class="admin-cl-form-actions">
									<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Hinzufügen</button>
								</div>
							</div>
						</form>
					</div>
				</section>
			</div>
		`;

		wireAdminDropzones(root);

		root.querySelectorAll('[data-toggle-clientlogo]').forEach((inp) => {
			inp.addEventListener('change', async () => {
				const id = (inp as HTMLInputElement).dataset.toggleClientlogo;
				if (!id) return;
				const enabled = (inp as HTMLInputElement).checked;
				const r = await patchJson(`/api/admin/client-logos/${id}`, { enabled });
				if (!r.ok) {
					renderMsg('Status konnte nicht geändert werden.', false);
					await reload();
					return;
				}
				await reload();
			});
		});

		root.querySelectorAll('.admin-cl-form[data-logo]').forEach((form) => {
			form.addEventListener('submit', async (ev) => {
				ev.preventDefault();
				const id = (form as HTMLFormElement).dataset.logo;
				if (!id) return;
				const fd = new FormData(form as HTMLFormElement);
				const photo = fd.get('photo');
				let imageUrl = String(fd.get('imageUrl') || '').trim();
				if (photo instanceof File && photo.size > 0) {
					const up = await uploadImageFile(photo);
					if (!up) {
						renderMsg('Upload fehlgeschlagen.', false);
						return;
					}
					imageUrl = up.src;
				}
				if (!imageUrl) {
					renderMsg('Bitte Bild-URL angeben oder Datei wählen.', false);
					return;
				}
				const r = await patchJson(`/api/admin/client-logos/${id}`, { imageUrl });
				if (!r.ok) {
					const j = await r.json().catch(() => ({}));
					renderMsg((j as { error?: string }).error || 'Speichern fehlgeschlagen.', false);
					return;
				}
				renderMsg('Gespeichert.', true);
				await reload();
			});
		});

		root.querySelectorAll('[data-del-logo]').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const id = (btn as HTMLButtonElement).dataset.delLogo;
				if (!id || !confirm('Dieses Logo dauerhaft löschen?')) return;
				const r = await deleteReq(`/api/admin/client-logos/${id}`);
				if (!r.ok) {
					renderMsg('Löschen fehlgeschlagen.', false);
					return;
				}
				renderMsg('Gelöscht.', true);
				await reload();
			});
		});

		root.querySelector('#admin-clientlogos-new')?.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const form = ev.target as HTMLFormElement;
			const fd = new FormData(form);
			const urls = parseUrlLines(String(fd.get('urls') || ''));
			if (urls.length === 0) {
				renderMsg('Bitte mindestens eine Bild-URL eintragen.', false);
				return;
			}
			let okCount = 0;
			let lastErr = '';
			for (const imageUrl of urls) {
				const r = await postJson('/api/admin/client-logos', { imageUrl });
				const body = await r.json().catch(() => ({}));
				if (!r.ok) {
					lastErr = (body as { error?: string }).error || 'Anlegen fehlgeschlagen.';
					continue;
				}
				okCount += 1;
			}
			if (okCount === 0) {
				renderMsg(lastErr || 'Kein Logo konnte angelegt werden.', false);
				return;
			}
			const allOk = okCount === urls.length;
			const msg = allOk
				? okCount === 1
					? 'Logo hinzugefügt.'
					: `${okCount} Logos hinzugefügt.`
				: `${okCount} von ${urls.length} Logos hinzugefügt.${lastErr ? ` ${lastErr}` : ''}`;
			renderMsg(msg, allOk);
			form.reset();
			await reload();
		});

		let dragId: string | null = null;
		const orderUl = root.querySelector('#admin-clientlogos-order');
		orderUl?.addEventListener('dragstart', (e) => {
			if (!(e.target as HTMLElement).closest('[data-clientlogo-drag-handle]')) {
				e.preventDefault();
				return;
			}
			const li = (e.target as HTMLElement).closest('[data-logo-id]') as HTMLLIElement | null;
			dragId = li?.dataset.logoId || null;
			if (dragId) e.dataTransfer?.setData('text/plain', dragId);
		});
		orderUl?.addEventListener('dragover', (e) => e.preventDefault());
		orderUl?.addEventListener('drop', async (e) => {
			e.preventDefault();
			const ulEl = orderUl as HTMLUListElement;
			const id = e.dataTransfer?.getData('text/plain') || dragId;
			if (!id) return;
			const dragging = ulEl.querySelector(`[data-logo-id="${id}"]`) as HTMLLIElement | null;
			const target = (e.target as HTMLElement).closest('[data-logo-id]') as HTMLLIElement | null;
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
	}

	void reload();
}
