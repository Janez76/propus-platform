export async function fetchCms(): Promise<unknown> {
	const r = await fetch('/api/admin/cms', { credentials: 'same-origin' });
	if (!r.ok) throw new Error('Daten konnten nicht geladen werden.');
	return r.json();
}

export type PortfolioDataResponse = {
	category: string;
	entries: unknown[];
	media: Array<{ id: string; src: string }>;
	featuredPortfolioIds: string[];
	maxHomeTiles: number;
};

/** Eine Kategorie + nur benötigte Medien – aus DB/CMS. */
export async function fetchPortfolioCategory(category: string): Promise<PortfolioDataResponse> {
	const r = await fetch(`/api/admin/portfolio-data?category=${encodeURIComponent(category)}`, {
		credentials: 'same-origin',
	});
	if (!r.ok) throw new Error('Portfolio konnte nicht geladen werden.');
	return r.json() as Promise<PortfolioDataResponse>;
}

export async function postJson(url: string, body: unknown): Promise<Response> {
	return fetch(url, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

export async function patchJson(url: string, body: unknown): Promise<Response> {
	return fetch(url, {
		method: 'PATCH',
		credentials: 'same-origin',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

export async function deleteReq(url: string): Promise<Response> {
	return fetch(url, { method: 'DELETE', credentials: 'same-origin' });
}
