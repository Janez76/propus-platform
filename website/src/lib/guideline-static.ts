/**
 * Fest eingebundene Guideline-Daten (Build-Zeit).
 * Neue Seiten: Eintrag hier + neue `.astro` unter `pages/guideline/`.
 * Neue Downloads: Eintrag hier + Datei unter `private-guideline-assets/files/`.
 */

export type GuidelinePageLink = {
	href: string;
	title: string;
	category?: string;
};

export type GuidelineDownloadEntry = {
	id: string;
	/** relativ zu private-guideline-assets */
	path: string;
	title: string;
};

export const GUIDELINE_PAGES: GuidelinePageLink[] = [
	{ href: '/guideline/willkommen/', title: 'Willkommen', category: 'Start' },
];

export const GUIDELINE_DOWNLOADS: GuidelineDownloadEntry[] = [
	{
		id: 'beispiel',
		path: 'files/beispiel.txt',
		title: 'Beispieldownload (Platzhalter)',
	},
];
