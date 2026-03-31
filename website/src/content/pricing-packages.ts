/**
 * Statische Preis-Pakete für /preise/ – strukturiert für Akkordeon-Karten.
 */

export type PricingLineItem = {
	readonly title: string;
	readonly description: string;
	/** Anzeige z. B. „inkl.“, „ab 49 CHF“, „+ 120 CHF“ */
	readonly price: string;
};

export type PricingCategory = {
	readonly name: string;
	readonly items: readonly PricingLineItem[];
};

export type PricingPackage = {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly basePrice: string;
	readonly featured?: boolean;
	readonly categories: readonly PricingCategory[];
};

export const pricingPackages: readonly PricingPackage[] = [
	{
		id: 'basic',
		name: 'Basic',
		description:
			'Kompakte Abdeckung für Wohnungen und Standard-Listings – schnell, klar, exportfertig.',
		basePrice: 'ab 349 CHF',
		categories: [
			{
				name: 'Aufnahme & Bilder',
				items: [
					{
						title: 'Finalbilder',
						description: 'Bis zu 12 bearbeitete Aufnahmen, web- und printtauglich.',
						price: 'inkl.',
					},
					{
						title: 'Licht & Perspektive',
						description: 'Grundsetup vor Ort, gerade Linien, natürliche Farben.',
						price: 'inkl.',
					},
					{
						title: 'Zusätzliche Ansicht',
						description: 'Weitere Einzelaufnahme nach Absprache.',
						price: 'ab 49 CHF',
					},
				],
			},
			{
				name: 'Lieferung',
				items: [
					{
						title: 'Download-Paket',
						description: 'Sortierte Dateien, benannt für Ihre Kanäle.',
						price: 'inkl.',
					},
					{
						title: 'Express-Lieferung',
						description: 'Priorisierte Bearbeitung innerhalb 48 h.',
						price: '+ 120 CHF',
					},
				],
			},
			{
				name: 'Erweiterungen',
				items: [
					{
						title: 'Grundriss',
						description: 'Vermasseter Plan aus Bestand oder Scan.',
						price: 'ab 180 CHF',
					},
					{
						title: 'Drohnen-Highlight',
						description: 'Eine Luftperspektive (sofern zulässig).',
						price: 'ab 220 CHF',
					},
				],
			},
		],
	},
	{
		id: 'premium',
		name: 'Premium',
		featured: true,
		description:
			'Mehr Tiefe und Stimmung für repräsentative Objekte – der sweet spot für die meisten Aufträge.',
		basePrice: 'ab 649 CHF',
		categories: [
			{
				name: 'Aufnahme & Bilder',
				items: [
					{
						title: 'Finalbilder',
						description: 'Bis zu 22 Aufnahmen inkl. Detail- und Raumvarianten.',
						price: 'inkl.',
					},
					{
						title: 'Lichtkonzept',
						description: 'Erweitertes Setup, Schattenführung, konsistente Serie.',
						price: 'inkl.',
					},
					{
						title: 'Dämmerungs- oder Mood-Set',
						description: 'Zweite Stimmung am selben Termin.',
						price: 'inkl.',
					},
				],
			},
			{
				name: 'Bearbeitung & Abstimmung',
				items: [
					{
						title: 'Priorisierte Retusche',
						description: 'Kürzere Werkstatt-Pipeline, feste Ansprechperson.',
						price: 'inkl.',
					},
					{
						title: 'Corporate-Farben',
						description: 'Abgleich mit Ihren CI-Vorgaben.',
						price: 'inkl.',
					},
				],
			},
			{
				name: 'Add-ons',
				items: [
					{
						title: '360°-Rundgang',
						description: 'Kurzer, ruhig geführter Tour-Ausschnitt.',
						price: 'ab 290 CHF',
					},
					{
						title: 'Kurzvideo Boden',
						description: '15–30 s Social-Clip aus dem Shooting.',
						price: 'ab 350 CHF',
					},
				],
			},
		],
	},
	{
		id: 'luxury',
		name: 'Luxury',
		description:
			'Massgeschneidert für aussergewöhnliche Liegenschaften, Marken und Kampagnen.',
		basePrice: 'auf Anfrage',
		categories: [
			{
				name: 'Konzept & Direction',
				items: [
					{
						title: 'Storyboard & Shotlist',
						description: 'Vorab-Workshop, klare Bildlogik pro Raum.',
						price: 'nach Aufwand',
					},
					{
						title: 'Art Direction vor Ort',
						description: 'Direkte Inszenierung mit Ihrem Team.',
						price: 'nach Aufwand',
					},
				],
			},
			{
				name: 'Produktion',
				items: [
					{
						title: 'Umfang Stills & Bewegtbild',
						description: 'Cinematics, Drohne, Mehrfach-Besuche nach Bedarf.',
						price: 'Offerte',
					},
					{
						title: 'Mehrere Stimmungswelten',
						description: 'Tag, Abend, saisonale Varianten.',
						price: 'Offerte',
					},
				],
			},
			{
				name: 'Deliverables',
				items: [
					{
						title: 'Social-Snippets & Kampagnenformate',
						description: 'Zuschnitte für Ads, Stories, Print gross.',
						price: 'nach Paket',
					},
					{
						title: 'White-Label & Agenturworkflow',
						description: 'Direkte Übergabe an Ihre Partner.',
						price: 'auf Anfrage',
					},
				],
			},
		],
	},
] as const;
