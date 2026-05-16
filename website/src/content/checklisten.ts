/**
 * Vorbereitungs-Checklisten für Kunden vor dem Shooting.
 * HTML-Version wird auf /checklisten/<slug>/ gerendert, PDF zum Download
 * unter `pdfHref`. PDFs werden separat in `public/downloads/checklisten/` abgelegt.
 */

export type ChecklistGroup = {
	heading: string;
	items: string[];
};

export type Checklist = {
	slug: string;
	title: string;
	subtitle: string;
	intro: string;
	pdfHref: string;
	seoTitle: string;
	seoDescription: string;
	groups: ChecklistGroup[];
};

export const checklisten: Checklist[] = [
	{
		slug: 'innenraeume',
		title: 'Innenräume vorbereiten',
		subtitle: 'Für ruhige, klare Aufnahmen im Innenbereich.',
		intro:
			'Ein aufgeräumter Raum mit gleichmäßigem Licht und reduzierter Dekoration macht den größten Unterschied. Mit dieser Liste sind Sie in 30–45 Minuten pro Raum bereit.',
		pdfHref: '/downloads/checklisten/innenraeume.pdf',
		seoTitle: 'Checkliste Innenräume – Vorbereitung Foto-Shooting | Propus',
		seoDescription:
			'Schritt-für-Schritt-Checkliste zur Vorbereitung Ihrer Innenräume für das Immobilien-Foto-Shooting. Kostenloser PDF-Download.',
		groups: [
			{
				heading: 'Aufräumen & Reduzieren',
				items: [
					'Persönliche Gegenstände entfernen (Fotos, Post, Schlüssel, Ladekabel)',
					'Sichtbare Kabel bündeln oder verdecken',
					'Mülleimer leeren und außer Sicht stellen',
					'Wäschekörbe, Kinderspielzeug, Tierausstattung verstauen',
					'Arbeitsflächen in Küche und Bad freiräumen',
					'Magneten, Notizen und Kalender von Kühlschrank/Pinnwand entfernen',
				],
			},
			{
				heading: 'Licht & Fenster',
				items: [
					'Alle Lampen funktionsfähig (defekte Leuchtmittel ersetzen)',
					'Vorhänge und Jalousien gleichmäßig öffnen',
					'Fensterscheiben innen und außen reinigen',
					'Insektengitter wenn möglich entfernen',
					'Auf konsistente Lichtfarbe achten (warmweiß durchgängig)',
				],
			},
			{
				heading: 'Möbel & Dekoration',
				items: [
					'Sofakissen aufschütteln, Decken faltbar drapieren',
					'Stühle gerade zum Tisch ausrichten',
					'Teppiche glatt ziehen',
					'Frische Blumen oder eine Obstschale als ruhige Akzente',
					'Persönliche Dekoration auf 1–2 Stücke pro Raum reduzieren',
				],
			},
			{
				heading: 'Bad & Küche',
				items: [
					'Frische Handtücher gleichmäßig gefaltet auflegen',
					'Spiegel, Armaturen und Glasflächen polieren',
					'Spülbecken leer und trocken',
					'Toilettendeckel geschlossen',
					'Shampoo-Flaschen, Zahnputzbecher etc. verstauen',
					'Geschirrtücher, Schwämme, Spülmittel außer Sicht',
				],
			},
			{
				heading: 'Letzte Kontrolle',
				items: [
					'Bodenbelag staubsaugen oder wischen',
					'Türen in Position bringen (offen oder geschlossen – konsistent)',
					'Heizkörper-Thermostate auf normales Niveau',
					'Haustiere für die Shooting-Zeit unterbringen',
					'Schlüsselübergabe oder Anwesenheit geklärt',
				],
			},
		],
	},
	{
		slug: 'aussenbereich',
		title: 'Außenbereich vorbereiten',
		subtitle: 'Fassade, Garten und Umgebung in Form bringen.',
		intro:
			'Der erste Eindruck entsteht draußen. Eine saubere Einfahrt, gepflegte Vegetation und ein paar verschobene Fahrzeuge bringen die Architektur klar zur Geltung.',
		pdfHref: '/downloads/checklisten/aussenbereich.pdf',
		seoTitle: 'Checkliste Außenbereich – Vorbereitung Foto-Shooting | Propus',
		seoDescription:
			'Checkliste für die Vorbereitung des Außenbereichs vor dem Immobilien-Shooting: Fassade, Garten, Einfahrt, Saisonales. Inkl. PDF-Download.',
		groups: [
			{
				heading: 'Fassade & Eingang',
				items: [
					'Fenster und Türen außen reinigen',
					'Haustür-Beschläge polieren',
					'Briefkasten leeren und gerade ausrichten',
					'Hausnummer und Klingelschild sauber',
					'Spinnweben unter Vordächern entfernen',
				],
			},
			{
				heading: 'Einfahrt & Wege',
				items: [
					'Fahrzeuge aus der Einfahrt und vor dem Haus entfernen',
					'Mülltonnen außer Sicht (Garage, Carport, Rückseite)',
					'Wege und Treppen kehren',
					'Blätter, Schnee oder Laub beseitigen',
					'Fußmatten gerade ausrichten',
				],
			},
			{
				heading: 'Garten & Vegetation',
				items: [
					'Rasen mähen (1–2 Tage vor dem Termin)',
					'Hecken und Sträucher schneiden, wo nötig',
					'Welke Pflanzen, Unkraut, Laub entfernen',
					'Gartenwerkzeug, Schläuche und Sprenger verstauen',
					'Kinderspielzeug aus dem Garten räumen',
				],
			},
			{
				heading: 'Terrasse, Balkon & Pool',
				items: [
					'Gartenmöbel gerade ausrichten, Kissen aufschütteln',
					'Grill abdecken oder einlagern',
					'Pool/Whirlpool sauber und Wasser klar',
					'Pflanzkübel und Deko reduziert und symmetrisch',
					'Sonnenschirme einklappen oder gleichmäßig öffnen',
				],
			},
			{
				heading: 'Saisonale Punkte',
				items: [
					'Sommer: Bewässerung am Morgen, keine Pfützen',
					'Herbst: Laub frisch entfernen',
					'Winter: Schnee von Wegen, Eis von Stufen',
					'Frühling: Frische Blüten als Akzent möglich',
				],
			},
		],
	},
	{
		slug: 'drohne',
		title: 'Drohnen-Shooting vorbereiten',
		subtitle: 'Voraussetzungen für regelkonforme Luftaufnahmen.',
		intro:
			'Drohnenaufnahmen sind in der Schweiz reguliert. Mit dieser Liste klären wir vorab alle Punkte, damit das Shooting reibungslos und legal verläuft.',
		pdfHref: '/downloads/checklisten/drohne.pdf',
		seoTitle: 'Checkliste Drohnen-Shooting – Vorbereitung | Propus',
		seoDescription:
			'Vorbereitungs-Checkliste für Drohnenaufnahmen: Bewilligungen, Zugang, Wetter, Sicherheit. Kostenloser PDF-Download.',
		groups: [
			{
				heading: 'Standort & Bewilligungen',
				items: [
					'Lage prüfen: Flugbeschränkungszonen (BAZL-Karte)',
					'Mindestabstand zu Flughäfen, Heliports, Spitälern',
					'Sondergenehmigung in Schutzgebieten oder Stadtzentren rechtzeitig einholen',
					'Nachbarn vorab informieren, wenn nahe Grundstücke überflogen werden',
					'Bei Mietobjekten: Schriftliche Zustimmung des Eigentümers',
				],
			},
			{
				heading: 'Wetter & Zeitfenster',
				items: [
					'Windprognose < 10 m/s an der Flughöhe',
					'Kein Regen, kein Schneefall, klare Sicht',
					'Sonnenstand: morgens oder spätnachmittags für weiches Licht',
					'Reservetermin innerhalb 5–7 Tagen geplant',
				],
			},
			{
				heading: 'Vor Ort',
				items: [
					'Start- und Landeplatz freigeräumt (5×5 m, fester Untergrund)',
					'Keine Hindernisse im Aufstiegskorridor',
					'Personen außerhalb des Sicherheitsradius',
					'Haustiere innen oder angeleint',
					'Fahrzeuge und Gartenmöbel positioniert wie für Außen-Shoot',
				],
			},
			{
				heading: 'Objekt-Vorbereitung',
				items: [
					'Dachflächen, Solaranlage, Kamin sauber und intakt',
					'Pool/Teich entlaubt, Wasserspiegel ruhig',
					'Garten und Wege wie für Außen-Checkliste vorbereitet',
					'Auffällige Baustellen oder Container temporär entfernen',
				],
			},
		],
	},
	{
		slug: '360-tour',
		title: '360°-Rundgang vorbereiten',
		subtitle: 'Räume bereitstellen für die virtuelle Tour.',
		intro:
			'Eine 360°-Tour zeigt jeden Winkel – Vorbereitung ist daher kritischer als bei klassischer Fotografie. Wo die Kamera steht, ist auch der Boden sichtbar.',
		pdfHref: '/downloads/checklisten/360-tour.pdf',
		seoTitle: 'Checkliste 360°-Rundgang – Vorbereitung | Propus',
		seoDescription:
			'Vorbereitungs-Checkliste für virtuelle 360°-Rundgänge: alle Sichtachsen, gleichmäßiges Licht, freie Wege. Inkl. PDF-Download.',
		groups: [
			{
				heading: 'Vollständige Innen-Checkliste anwenden',
				items: [
					'Alle Punkte der Innenräume-Checkliste durchgehen',
					'Bei 360° gibt es keinen "toten Winkel": Auch Türseite, Decke und Boden sind sichtbar',
					'Spiegelnde Flächen prüfen – Kamera darf sich nicht prominent reflektieren',
				],
			},
			{
				heading: 'Sichtachsen & Wege',
				items: [
					'Türen offen lassen für nahtlosen Übergang zwischen Räumen',
					'Wege durch alle Räume freihalten (mindestens 80 cm Durchgang)',
					'Stative, Putzmaterial, Werkzeug komplett aus dem Objekt',
					'Garderobe leer oder neutral bestückt',
				],
			},
			{
				heading: 'Licht für 360°',
				items: [
					'Alle Lampen einschalten (auch in selten genutzten Räumen)',
					'Vorhänge und Jalousien gleichmäßig öffnen',
					'Auf identische Lichtfarbe in allen Räumen achten',
					'Direkt einfallende Sonne reduzieren (Halbschatten ist ideal)',
				],
			},
			{
				heading: 'Anwesenheit & Zeit',
				items: [
					'Pro Raum ca. 5–10 Minuten Aufnahmezeit einplanen',
					'Bewohner und Haustiere für die gesamte Tour-Aufnahme außer Haus',
					'Ablenkungen wie Fernseher, Musik, Radios aus',
					'Geräte mit blinkenden LEDs abdecken oder ausschalten',
				],
			},
		],
	},
];
