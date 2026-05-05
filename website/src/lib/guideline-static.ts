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
		id: 'anleitung-bildoptimierung-web-pdf',
		path: 'files/Anleitung_Bildoptimierung_Web.pdf',
		title: 'Bildoptimierung Web (PDF)',
	},
	{
		id: 'anleitung-bildoptimierung-web-docx',
		path: 'files/Anleitung_Bildoptimierung_Web.docx',
		title: 'Bildoptimierung Web (Word)',
	},
	{
		id: 'anleitung-drohnenaufnahmen-pdf',
		path: 'files/Anleitung_Drohnenaufnahmen.pdf',
		title: 'Drohnenaufnahmen (PDF)',
	},
	{
		id: 'anleitung-drohnenaufnahmen-docx',
		path: 'files/Anleitung_Drohnenaufnahmen.docx',
		title: 'Drohnenaufnahmen (Word)',
	},
	{
		id: 'anleitung-floor-plan-standard-pdf',
		path: 'files/Anleitung_Floor_Plan_Standard.pdf',
		title: 'Floor Plan Standard (PDF)',
	},
	{
		id: 'anleitung-floor-plan-standard-docx',
		path: 'files/Anleitung_Floor_Plan_Standard.docx',
		title: 'Floor Plan Standard (Word)',
	},
	{
		id: 'anleitung-floor-plan-standard-en-pdf',
		path: 'files/Anleitung_Floor_Plan_Standard_EN.pdf',
		title: 'Floor Plan Standard EN (PDF)',
	},
	{
		id: 'anleitung-floor-plan-standard-en-docx',
		path: 'files/Anleitung_Floor_Plan_Standard_EN.docx',
		title: 'Floor Plan Standard EN (Word)',
	},
	{
		id: 'anleitung-immobilienfotografie-pdf',
		path: 'files/Anleitung_Immobilienfotografie.pdf',
		title: 'Immobilienfotografie (PDF)',
	},
	{
		id: 'anleitung-immobilienfotografie-docx',
		path: 'files/Anleitung_Immobilienfotografie.docx',
		title: 'Immobilienfotografie (Word)',
	},
	{
		id: 'anleitung-kundenanlage-matterport-pdf',
		path: 'files/Anleitung_Kundenanlage_Matterport.pdf',
		title: 'Kundenanlage Matterport (PDF)',
	},
	{
		id: 'anleitung-kundenanlage-matterport-docx',
		path: 'files/Anleitung_Kundenanlage_Matterport.docx',
		title: 'Kundenanlage Matterport (Word)',
	},
];
