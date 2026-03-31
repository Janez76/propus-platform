function escapeHtml(s: string): string {
	const d = document.createElement('div');
	d.textContent = s;
	return d.innerHTML;
}

export const PF_IMG_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export const PF_SVG_UPLOAD =
	'<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';

export type PfDropOpts = {
	name: string;
	accept: string;
	multiple?: boolean;
	required?: boolean;
	title: string;
	meta: string;
	compact?: boolean;
};

export function pfDropHtml(o: PfDropOpts): string {
	const mult = o.multiple ? ' multiple' : '';
	const req = o.required ? ' required' : '';
	const mod = o.compact ? ' admin-pf-drop--compact' : '';
	return `<div class="admin-pf-drop${mod}" data-admin-pf-drop>
		<label class="admin-pf-drop__label">
			<input type="file" class="admin-pf-drop__input" name="${o.name}" accept="${o.accept}"${mult}${req} />
			<span class="admin-pf-drop__face">
				<span class="admin-pf-drop__icon">${PF_SVG_UPLOAD}</span>
				<span class="admin-pf-drop__title">${escapeHtml(o.title)}</span>
				<span class="admin-pf-drop__meta">${escapeHtml(o.meta)}</span>
				<span class="admin-pf-drop__cta">Auswählen oder hierher ziehen</span>
			</span>
		</label>
		<p class="admin-pf-drop__picked" data-pf-file-label hidden></p>
	</div>`;
}

/** Drag & Drop + Dateiname für alle `[data-admin-pf-drop]` unter `root`. */
export function wireAdminDropzones(root: ParentNode): void {
	root.querySelectorAll('[data-admin-pf-drop]').forEach((dropEl) => {
		const drop = dropEl as HTMLElement;
		const inp = drop.querySelector<HTMLInputElement>('.admin-pf-drop__input');
		const picked = drop.querySelector<HTMLElement>('[data-pf-file-label]');
		if (!inp || !picked) return;

		const sync = () => {
			const f = inp.files;
			if (!f?.length) {
				picked.textContent = '';
				picked.hidden = true;
				drop.classList.remove('admin-pf-drop--has', 'is-dragover');
				return;
			}
			drop.classList.add('admin-pf-drop--has');
			const names = [...f].map((x) => x.name);
			const max = 4;
			const head = names.slice(0, max).join(' · ');
			picked.textContent =
				names.length <= max ? head : `${head} (+${names.length - max} weitere)`;
			picked.hidden = false;
		};

		inp.addEventListener('change', sync);

		drop.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.stopPropagation();
			drop.classList.add('is-dragover');
		});
		drop.addEventListener('dragleave', (e) => {
			const rel = e.relatedTarget as Node | null;
			if (!rel || !drop.contains(rel)) drop.classList.remove('is-dragover');
		});
		drop.addEventListener('drop', (e) => {
			e.preventDefault();
			e.stopPropagation();
			drop.classList.remove('is-dragover');
			const files = e.dataTransfer?.files;
			if (!files?.length) return;
			const dt = new DataTransfer();
			if (inp.multiple) {
				for (let i = 0; i < files.length; i++) dt.items.add(files[i]);
			} else {
				dt.items.add(files[0]);
			}
			inp.files = dt.files;
			sync();
		});
	});
}
