/**
 * Vorlage für die 8 Leistungs-Karten (/dienstleistungen/). Leeres CMS wird automatisch daraus befüllt (`ensureDefaultServicesInCms`); optional im Backpanel „Standard übernehmen“.
 */
export type ServiceDetailSection = {
	id: string;
	title: string;
	slogan: string;
	/** Kurzer Fließtext (ein Absatz) */
	body: string;
	imageSrc: string;
	imageAlt: string;
	width: number;
	height: number;
};

export const servicesDetailSections: ServiceDetailSection[] = [
	{
		id: 'fotografie',
		title: 'Fotografie',
		slogan: 'Ruhiges Licht. Klare Architektur.',
		body: 'Innen- und Außenaufnahmen mit ruhiger Komposition und konsistenten Farben – für Portale, Exposé und Druck.',
		imageSrc: 'https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?w=1600&q=85',
		imageAlt: 'Fotograf mit Kamera bei der Aufnahme',
		width: 1600,
		height: 1067,
	},
	{
		id: 'drohne',
		title: 'Drohnenaufnahmen',
		slogan: 'Perspektive, die alles verbindet.',
		body: 'Lage und Gebäude aus der Luft, regelkonform geplant – für Web, Exposé und Kampagnen.',
		imageSrc: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=1600&q=85',
		imageAlt: 'Drohne in der Luft – Luftaufnahmen für Lage und Architektur',
		width: 1600,
		height: 1067,
	},
	{
		id: 'rundgang',
		title: '360° Rundgang',
		slogan: 'Räume erlebbar machen.',
		body: 'Virtuelle Rundgänge für Orientierung vor dem Besichtigungstermin – ruhig inszeniert, ohne technisches Theater.',
		imageSrc: 'https://images.unsplash.com/photo-1593508512255-86ab42a8e620?w=1600&q=85',
		imageAlt: 'Person mit VR-Brille für einen immersiven 360°-Rundgang',
		width: 1600,
		height: 1067,
	},
	{
		id: 'grundrisse',
		title: 'Grundrisse',
		slogan: 'Struktur, die sofort verständlich ist.',
		body: 'Grundrisse aufbereitet für Portale, PDF und Druck – klar lesbar, ohne visuelles Rauschen.',
		imageSrc: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1600&q=85',
		imageAlt: 'Architekturplan und Grundriss am Zeichentisch',
		width: 1600,
		height: 1067,
	},
	{
		id: 'video',
		title: 'Video',
		slogan: 'Bewegtbild mit Ruhe und Substanz.',
		body: 'Kurze Formate mit ruhigem Schnitt – für Website, Social Media und als Ergänzung zu Stills.',
		imageSrc: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1600&q=85',
		imageAlt: 'Videograf filmt mit professioneller Kamera',
		width: 1600,
		height: 1067,
	},
	{
		id: 'staging',
		title: 'Home Staging',
		slogan: 'Räume, die man sich vorstellen kann.',
		body: 'Inszenierung leerer oder bewohnter Räume – zurückhaltend, damit die Architektur im Mittelpunkt bleibt.',
		imageSrc: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1600&q=85',
		imageAlt: 'Gestylter, heller Wohnraum – Home Staging für die Präsentation',
		width: 1600,
		height: 1067,
	},
	{
		id: 'visualisierung',
		title: 'Visualisierung',
		slogan: 'Ihre Idee, sichtbar und überzeugend.',
		body: 'Renderings für Neubau, Umbau und Vorvermarktung – materialgetreu und an Ihre Markenästhetik angepasst.',
		imageSrc: 'https://images.unsplash.com/photo-1558655146-d09347e92766?w=1600&q=85',
		imageAlt: 'Architektur-Visualisierung und 3D-Modell am Bildschirm',
		width: 1600,
		height: 1067,
	},
	{
		id: 'retusche',
		title: 'Retusche',
		slogan: 'Störendes raus, Raum im Fokus.',
		body: 'Wir entfernen ablenkende Objekte aus Ihren Aufnahmen – dezent und professionell, damit Architektur und Stimmung im Bild zur Geltung kommen.',
		imageSrc: 'https://images.unsplash.com/photo-1522542550221-31fd19575a2d?w=1600&q=85',
		imageAlt: 'Bildbearbeitung und Retusche am Arbeitsplatz mit Bildschirm',
		width: 1600,
		height: 1067,
	},
];
