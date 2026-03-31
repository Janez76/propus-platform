/** Nur für das Verwaltungs-Frontend (ohne Abhängigkeit vom grossen Portfolio-TS). */
export const ADMIN_CATEGORIES = [
	{ id: 'bodenfotos', label: 'Bodenfotos' },
	{ id: 'luftaufnahmen', label: 'Luftaufnahmen' },
	{ id: 'tour360', label: '360° Rundgang' },
	{ id: 'grundrisse', label: 'Grundrisse' },
	{ id: 'video', label: 'Video' },
	{ id: 'staging', label: 'Staging' },
	{ id: 'visualisierung', label: 'Visualisierung' },
	{ id: 'retusche', label: 'Retusche' },
] as const;

export type AdminCategoryId = (typeof ADMIN_CATEGORIES)[number]['id'];

export function isStagingOrRetusche(cat: string): boolean {
	return cat === 'staging' || cat === 'retusche';
}
