/** Portfolio-Kategorien (Tabs auf der Portfolio-Seite). */
export type PortfolioCategory =
	| 'bodenfotos'
	| 'luftaufnahmen'
	| 'tour360'
	| 'grundrisse'
	| 'video'
	| 'staging'
	| 'visualisierung'
	| 'retusche';

/** Standard-Tab beim ersten Besuch der Portfolio-Seite. */
export const portfolioDefaultCategory: PortfolioCategory = 'bodenfotos';

/** Tabs inkl. Kurzbeschreibung für die Portfolio-Seite. */
export const portfolioCategoryTabs: {
	id: PortfolioCategory;
	label: string;
	description: string;
}[] = [
	{
		id: 'bodenfotos',
		label: 'Bodenfotos',
		description:
			'Innen- und Außenaufnahmen auf Augenhöhe – ruhige Perspektiven, kontrolliertes Licht und klare Linien. Ideal für Portale, Exposés und den ersten Eindruck beim Interessenten.',
	},
	{
		id: 'luftaufnahmen',
		label: 'Luftaufnahmen',
		description:
			'Perspektiven aus der Luft: Lage, Grundstück und Architektur im Zusammenhang. Wirkungsvoll für Vermarktung und Nachbarschaftskontext – regelkonform und sicher umgesetzt.',
	},
	{
		id: 'tour360',
		label: '360° Rundgang',
		description:
			'Virtuelle Rundgänge, die Räume erfahrbar machen. Interessenten können sich orientieren, verweilen und Ihr Objekt stärker in Erinnerung behalten.',
	},
	{
		id: 'grundrisse',
		label: 'Grundrisse',
		description:
			'Lesbare, aufgeräumte Grundrisse – maßstäblich und visuell aufbereitet für Maklerportale, PDF-Exposés und Druckunterlagen.',
	},
	{
		id: 'video',
		label: 'Video',
		description:
			'Bewegtbild mit ruhigem Rhythmus und professioneller Bildsprache – für Websites, Social Media und als Ergänzung zu Stills und Touren.',
	},
	{
		id: 'staging',
		label: 'Staging',
		description:
			'Inszenierung von Räumen: Möblierung, Akzente und Atmosphäre, damit Käufer Nutzung und Potenzial leichter erfassen – ohne von der Architektur abzulenken.',
	},
	{
		id: 'visualisierung',
		label: 'Visualisierung',
		description:
			'Renderings und Visualisierungen für Neubauprojekte und Konzepte – überzeugend, bevor der erste Stein gelegt ist, und konsistent mit Ihrer Markenästhetik.',
	},
	{
		id: 'retusche',
		label: 'Retusche',
		description:
			'Entfernen von störenden Objekten im Bild – behutsam retuschiert, damit der Blick auf Architektur, Raum und Atmosphäre frei bleibt und das Exposé ruhig wirkt.',
	},
];

export interface PortfolioComparePair {
	beforeSrc: string;
	afterSrc: string;
	beforeAlt: string;
	afterAlt: string;
}

interface PortfolioItemBase {
	id: string;
	categories: PortfolioCategory[];
	width: number;
	height: number;
}

export type PortfolioItem =
	| (PortfolioItemBase & {
			kind: 'image';
			src: string;
			alt: string;
	  })
	| (PortfolioItemBase & {
			kind: 'compare';
			compare: PortfolioComparePair;
	  })
	| (PortfolioItemBase & {
			kind: 'matterport';
			/** iframe src */
			embedUrl: string;
	  })
	| (PortfolioItemBase & {
			kind: 'youtube';
			embedUrl: string;
	  });

/** Platzhalter via Unsplash – durch eigene Aufnahmen ersetzen. */
export const portfolioItems: PortfolioItem[] = [
	{
		id: '1',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=85',
		alt: 'Lichtdurchflutetes Wohnzimmer mit hohen Decken',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos'],
	},
	{
		id: '2',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=85',
		alt: 'Moderne Villa mit Garten und blauem Himmel',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos'],
	},
	{
		id: '3',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=85',
		alt: 'Offene Küche mit Insel und warmem Licht',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos', 'retusche'],
	},
	{
		id: '4',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1600&q=85',
		alt: 'Poolterrasse mit Panoramablick',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos'],
	},
	{
		id: '5',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=85',
		alt: 'Repräsentativer Büro- und Empfangsbereich',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos'],
	},
	{
		id: '6',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=85',
		alt: 'Schlafzimmer mit großformatigem Fenster',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos', 'staging'],
	},
	{
		id: '7',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=85',
		alt: 'Architektonische Außenansicht mit Holzelementen',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos'],
	},
	{
		id: '8',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1600&q=85',
		alt: 'Minimalistisches Bad mit Stein und Glas',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos'],
	},
	{
		id: '9',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&q=85',
		alt: 'Glasfassade eines Bürohochhauses',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos'],
	},
	{
		id: '10',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=1600&q=85',
		alt: 'Essbereich mit Designerleuchten',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos'],
	},
	{
		id: '11',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1600585154084-4e5fe7c39198?w=1600&q=85',
		alt: 'Eingangsbereich und gepflegte Einfahrt',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos'],
	},
	{
		id: '12',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1600&q=85',
		alt: 'Coworking-Fläche mit industriellem Charme',
		width: 1600,
		height: 1067,
		categories: ['bodenfotos'],
	},
	{
		id: '13',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=85',
		alt: 'Luftaufnahme über Landschaft und Architektur',
		width: 1600,
		height: 1067,
		categories: ['luftaufnahmen'],
	},
	{
		id: '14',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1600&q=85',
		alt: 'Architektonischer Grundriss und Planunterlagen',
		width: 1600,
		height: 1067,
		categories: ['grundrisse'],
	},
	{
		id: '15',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1600&q=85',
		alt: 'Weitwinkelansicht eines Wohnraums für virtuelle Rundgänge',
		width: 1600,
		height: 1067,
		categories: ['tour360'],
	},
	{
		id: '16',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=1600&q=85',
		alt: 'Kamera und Equipment für Immobilienvideo',
		width: 1600,
		height: 1067,
		categories: ['video'],
	},
	{
		id: '17',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=1600&q=85',
		alt: 'Stilvoll möbliertes Wohnzimmer nach Homestaging',
		width: 1600,
		height: 1067,
		categories: ['staging'],
	},
	{
		id: '18',
		kind: 'image',
		src: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1600&q=85',
		alt: 'Architekturvisualisierung und Außenansicht',
		width: 1600,
		height: 1067,
		categories: ['visualisierung'],
	},
	{
		id: 'ba-staging-1',
		kind: 'compare',
		width: 1600,
		height: 1067,
		categories: ['staging'],
		compare: {
			beforeSrc: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&q=85',
			afterSrc: 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=1600&q=85',
			beforeAlt: 'Leerer Wohnraum vor dem Staging',
			afterAlt: 'Derselbe Raum nach professionellem Staging',
		},
	},
	{
		id: 'ba-staging-2',
		kind: 'compare',
		width: 1600,
		height: 1067,
		categories: ['staging'],
		compare: {
			beforeSrc: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1600&q=85',
			afterSrc: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1600&q=85',
			beforeAlt: 'Unmöblierter Bereich vor der Inszenierung',
			afterAlt: 'Ruhig inszenierter Wohnbereich nach dem Staging',
		},
	},
	{
		id: 'ba-retusche-1',
		kind: 'compare',
		width: 1600,
		height: 1067,
		categories: ['retusche'],
		compare: {
			beforeSrc: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1600&q=85',
			afterSrc: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=85',
			beforeAlt: 'Aufnahme mit störenden Bildelementen',
			afterAlt: 'Aufgeräumtes Bild nach Entfernen der Ablenkungen',
		},
	},
	{
		id: 'ba-retusche-2',
		kind: 'compare',
		width: 1600,
		height: 1067,
		categories: ['retusche'],
		compare: {
			beforeSrc: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600&q=85',
			afterSrc: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=85',
			beforeAlt: 'Raum mit ablenkenden Details im Bild',
			afterAlt: 'Fokus auf Architektur nach Retusche',
		},
	},
];
