/**
 * Referenz-Logos für die Startseite (Platzhalter).
 * Ersetze `wordmark` durch eigene SVGs oder Bilder unter /public/clients/.
 */
export interface ClientLogo {
	id: string;
	name: string;
	/** Kurzes Label im Logo-Raster, wenn kein Bild (`imageSrc`) gesetzt ist. */
	wordmark: string;
	/** Logo-URL aus dem CMS oder statisch (Startseite: Schwarz-Weiß per CSS). */
	imageSrc?: string;
}

export const clientLogos: ClientLogo[] = [
	{ id: '1', name: 'Platzhalter Partner A', wordmark: 'Nordstadt' },
	{ id: '2', name: 'Platzhalter Partner B', wordmark: 'Atrium' },
	{ id: '3', name: 'Platzhalter Partner C', wordmark: 'Quartier' },
	{ id: '4', name: 'Platzhalter Partner D', wordmark: 'LIGNUM' },
	{ id: '5', name: 'Platzhalter Partner E', wordmark: 'STUDIO 47' },
	{ id: '6', name: 'Platzhalter Partner F', wordmark: 'URBAN' },
	{ id: '7', name: 'Platzhalter Partner G', wordmark: 'HAVEN' },
	{ id: '8', name: 'Platzhalter Partner H', wordmark: 'ELEVATE' },
];
