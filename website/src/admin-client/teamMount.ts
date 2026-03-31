import { deleteReq, fetchCms, patchJson, postJson } from './api';
import { PF_IMG_ACCEPT, pfDropHtml, wireAdminDropzones } from './dropzone';

type CmsTeam = {
	id: string;
	sort: number;
	name: string;
	role: string;
	email: string;
	bio: string;
	mediaId: string;
	enabled?: boolean;
};

type CmsMedia = { id: string; src: string };
type Cms = { team: CmsTeam[]; media: CmsMedia[] };

function escapeHtml(s: string): string {
	const d = document.createElement('div');
	d.textContent = s;
	return d.innerHTML;
}

function isEnabled(m: CmsTeam): boolean {
	return m.enabled !== false;
}

function dndHandleHtml(): string {
	return `<button type="button" class="admin-dnd-handle" draggable="true" aria-label="Zum Sortieren ziehen" data-team-drag-handle>
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

export function mountTeamAdmin(root: HTMLElement): void {
	let cms: Cms = { team: [], media: [] };

	function renderMsg(text: string, ok: boolean) {
		const el = document.getElementById('admin-team-msg');
		if (!el) return;
		el.className = `admin-msg ${ok ? 'admin-msg--ok' : 'admin-msg--err'}`;
		el.textContent = text;
		el.hidden = false;
		setTimeout(() => {
			el.hidden = true;
		}, 4000);
	}

	async function reload() {
		const data = (await fetchCms()) as Cms;
		cms = data;
		render();
	}

	async function persistTeamOrder(): Promise<boolean> {
		const ul = root.querySelector('#admin-team-order');
		if (!ul) return false;
		const ids = [...ul.querySelectorAll<HTMLLIElement>('[data-member-id]')].map((li) => li.dataset.memberId!);
		const r = await postJson('/api/admin/team/reorder', { ids });
		if (!r.ok) {
			renderMsg('Reihenfolge speichern fehlgeschlagen.', false);
			return false;
		}
		return true;
	}

	function render() {
		const sorted = [...cms.team].sort((a, b) => a.sort - b.sort);
		const map = Object.fromEntries(cms.media.map((m) => [m.id, m.src]));

		const lis = sorted
			.map((m) => {
				const src = m.mediaId ? map[m.mediaId] : '';
				const on = isEnabled(m);
				const itemClass = on ? 'admin-tm-item' : 'admin-tm-item admin-tm-item--inactive';
				const thumb =
					src ?
						`<div class="admin-p-thumb"><img src="${escapeHtml(src)}" alt="" width="72" height="72" /></div>`
					:	`<div class="admin-p-thumb admin-p-thumb--placeholder" aria-hidden="true">Foto</div>`;
				return `
				<li class="${itemClass}" data-member-id="${m.id}" id="admin-team-${m.id}">
					<div class="admin-tm-item__overview">
						<div class="admin-tm-item__row">
							${dndHandleHtml()}
							${thumb}
							<div class="admin-p-meta">
								<span class="admin-p-badge">Person</span>
								<p class="admin-tm-item__title">${escapeHtml(m.name)}</p>
								<p class="admin-tm-item__role">${escapeHtml(m.role)}</p>
							</div>
							<div class="admin-p-actions">
								<label class="admin-toggle">
									<input type="checkbox" data-toggle-team="${m.id}" ${on ? 'checked' : ''} />
									<span class="admin-toggle__track" aria-hidden="true"><span class="admin-toggle__thumb"></span></span>
									<span>Öffentlich</span>
								</label>
								<button type="button" class="admin-btn admin-btn--danger admin-btn--sm" data-del-member="${m.id}">Löschen</button>
							</div>
						</div>
					</div>
					<form class="admin-tm-form" data-member="${m.id}">
						<input type="hidden" name="mediaId" value="${escapeHtml(m.mediaId)}" />
						<div class="admin-tm-segment">
							<h3 class="admin-tm-segment__title">Profil</h3>
							<div class="admin-tm-segment__grid">
								<div class="admin-field"><label>Name</label><input type="text" name="name" value="${escapeHtml(m.name)}" required /></div>
								<div class="admin-field"><label>Rolle</label><input type="text" name="role" value="${escapeHtml(m.role)}" required /></div>
								<div class="admin-field"><label>E-Mail (optional)</label><input type="email" name="email" value="${escapeHtml(m.email)}" /></div>
								<div class="admin-field"><label>Über mich</label><textarea name="bio" rows="4">${escapeHtml(m.bio)}</textarea></div>
							</div>
						</div>
						<div class="admin-tm-segment">
							<h3 class="admin-tm-segment__title">Porträt</h3>
							<p class="admin-tm-segment__hint">Neues Bild ersetzt das aktuelle. Leer lassen, um das bestehende Foto zu behalten.</p>
							<div class="admin-tm-segment__grid">
								<div>
									<p class="admin-pf-upload__label">Datei (optional)</p>
									${pfDropHtml({
										name: 'photo',
										accept: PF_IMG_ACCEPT,
										title: 'Porträt wählen',
										meta: 'JPEG, PNG, WebP, GIF',
										compact: true,
									})}
								</div>
								<div class="admin-tm-form__clear">
									<button type="button" class="admin-btn admin-btn--sm" data-clear-photo="${m.id}">Porträt entfernen</button>
								</div>
							</div>
						</div>
						<div class="admin-tm-segment admin-tm-segment--foot">
							<div class="admin-tm-form-actions">
								<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Speichern</button>
							</div>
						</div>
					</form>
				</li>`;
			})
			.join('');

		const listBlock =
			sorted.length === 0 ?
				`<p class="admin-pf-list-empty">Noch keine Personen.</p>`
			:	`<ul id="admin-team-order" class="admin-pf-list">${lis}</ul>
				<p class="admin-pf-list-hint admin-tm-list-hint">Reihenfolge: Eintrag am Griff verschieben; wird beim Ablegen gespeichert.</p>`;

		root.innerHTML = `
			<div class="admin-pf admin-tm-page">
				<p id="admin-team-msg" class="admin-msg" hidden></p>
				<p class="admin-pf-lead">
					Einträge für die öffentliche Team-Seite. Oben Kurzinfo, darunter Profil und Porträt. Schalter „Öffentlich“ steuert die Anzeige.
				</p>
				<section class="admin-pf-block" aria-labelledby="admin-tm-list-title">
					<h2 id="admin-tm-list-title" class="admin-pf-block__title">Einträge</h2>
					${listBlock}
				</section>
				<section class="admin-pf-block admin-pf-block--upload" aria-labelledby="admin-tm-new-title">
					<h2 id="admin-tm-new-title" class="admin-pf-block__title">Neue Person</h2>
					<div class="admin-tm-new-sheet">
						<form id="admin-team-new" class="admin-tm-new-form">
							<div class="admin-tm-segment">
								<h3 class="admin-tm-segment__title">Profil</h3>
								<div class="admin-tm-segment__grid">
									<div class="admin-field"><label>Name</label><input type="text" name="name" required /></div>
									<div class="admin-field"><label>Rolle</label><input type="text" name="role" required /></div>
									<div class="admin-field"><label>E-Mail (optional)</label><input type="email" name="email" /></div>
									<div class="admin-field"><label>Über mich</label><textarea name="bio" rows="4"></textarea></div>
								</div>
							</div>
							<div class="admin-tm-segment">
								<h3 class="admin-tm-segment__title">Porträt</h3>
								<p class="admin-tm-segment__hint">Optional – kann nach dem Anlegen nachgereicht werden.</p>
								<div class="admin-tm-segment__grid">
									<div>
										<p class="admin-pf-upload__label">Datei (optional)</p>
										${pfDropHtml({
											name: 'photo',
											accept: PF_IMG_ACCEPT,
											title: 'Porträt wählen',
											meta: 'JPEG, PNG, WebP, GIF',
											compact: true,
										})}
									</div>
								</div>
							</div>
							<div class="admin-tm-segment admin-tm-segment--foot">
								<div class="admin-tm-form-actions">
									<button type="submit" class="admin-btn admin-btn--sm admin-pf-upload__submit">Hinzufügen</button>
								</div>
							</div>
						</form>
					</div>
				</section>
			</div>
		`;

		wireAdminDropzones(root);

		root.querySelectorAll('[data-toggle-team]').forEach((inp) => {
			inp.addEventListener('change', async () => {
				const id = (inp as HTMLInputElement).dataset.toggleTeam;
				if (!id) return;
				const enabled = (inp as HTMLInputElement).checked;
				const r = await patchJson(`/api/admin/team/${id}`, { enabled });
				if (!r.ok) {
					renderMsg('Status konnte nicht geändert werden.', false);
					await reload();
					return;
				}
				await reload();
			});
		});

		root.querySelectorAll('[data-clear-photo]').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const id = (btn as HTMLButtonElement).dataset.clearPhoto;
				if (!id) return;
				const r = await patchJson(`/api/admin/team/${id}`, { mediaId: '' });
				if (!r.ok) {
					renderMsg('Konnte Porträt nicht entfernen.', false);
					return;
				}
				renderMsg('Porträt entfernt.', true);
				await reload();
			});
		});

		root.querySelectorAll('.admin-tm-form[data-member]').forEach((form) => {
			form.addEventListener('submit', async (ev) => {
				ev.preventDefault();
				const id = (form as HTMLFormElement).dataset.member;
				if (!id) return;
				const fd = new FormData(form as HTMLFormElement);
				let mediaId = (fd.get('mediaId') as string) || '';
				const photo = fd.get('photo');
				if (photo instanceof File && photo.size > 0) {
					const up = await uploadImageFile(photo);
					if (!up) {
						renderMsg('Bild-Upload fehlgeschlagen.', false);
						return;
					}
					mediaId = up.id;
				}
				const r = await patchJson(`/api/admin/team/${id}`, {
					name: fd.get('name'),
					role: fd.get('role'),
					email: fd.get('email'),
					bio: fd.get('bio'),
					mediaId: mediaId || '',
				});
				if (!r.ok) {
					const j = await r.json().catch(() => ({}));
					renderMsg((j as { error?: string }).error || 'Speichern fehlgeschlagen.', false);
					return;
				}
				renderMsg('Gespeichert.', true);
				await reload();
			});
		});

		root.querySelectorAll('[data-del-member]').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const id = (btn as HTMLButtonElement).dataset.delMember;
				if (!id || !confirm('Diese Person dauerhaft löschen?')) return;
				const r = await deleteReq(`/api/admin/team/${id}`);
				if (!r.ok) {
					renderMsg('Löschen fehlgeschlagen.', false);
					return;
				}
				renderMsg('Gelöscht.', true);
				await reload();
			});
		});

		root.querySelector('#admin-team-new')?.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const form = ev.target as HTMLFormElement;
			const fd = new FormData(form);
			const r = await postJson('/api/admin/team', {
				name: fd.get('name'),
				role: fd.get('role'),
				email: fd.get('email'),
				bio: fd.get('bio'),
				mediaId: '',
			});
			const body = await r.json().catch(() => ({}));
			if (!r.ok) {
				renderMsg((body as { error?: string }).error || 'Anlegen fehlgeschlagen.', false);
				return;
			}
			const newId = (body as { entry?: { id: string } }).entry?.id;
			const photo = fd.get('photo');
			if (newId && photo instanceof File && photo.size > 0) {
				const up = await uploadImageFile(photo);
				if (up) {
					await patchJson(`/api/admin/team/${newId}`, { mediaId: up.id });
				}
			}
			renderMsg('Person hinzugefügt.', true);
			form.reset();
			await reload();
		});

		let dragMemberId: string | null = null;
		const orderUl = root.querySelector('#admin-team-order');
		orderUl?.addEventListener('dragstart', (e) => {
			if (!(e.target as HTMLElement).closest('[data-team-drag-handle]')) {
				e.preventDefault();
				return;
			}
			const li = (e.target as HTMLElement).closest('[data-member-id]') as HTMLLIElement | null;
			dragMemberId = li?.dataset.memberId || null;
			if (dragMemberId) e.dataTransfer?.setData('text/plain', dragMemberId);
		});
		orderUl?.addEventListener('dragover', (e) => e.preventDefault());
		orderUl?.addEventListener('drop', async (e) => {
			e.preventDefault();
			const ulEl = orderUl as HTMLUListElement;
			const id = e.dataTransfer?.getData('text/plain') || dragMemberId;
			if (!id) return;
			const dragging = ulEl.querySelector(`[data-member-id="${id}"]`) as HTMLLIElement | null;
			const target = (e.target as HTMLElement).closest('[data-member-id]') as HTMLLIElement | null;
			if (!dragging || !target || dragging === target) return;
			const rect = target.getBoundingClientRect();
			const before = e.clientY < rect.top + rect.height / 2;
			if (before) ulEl.insertBefore(dragging, target);
			else ulEl.insertBefore(dragging, target.nextSibling);
			const ok = await persistTeamOrder();
			if (ok) {
				await reload();
				renderMsg('Reihenfolge gespeichert.', true);
			}
		});
	}

	void reload();
}
