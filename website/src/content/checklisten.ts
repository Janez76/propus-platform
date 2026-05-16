/**
 * Vorbereitungs-Checklisten für Kund:innen vor dem Shooting.
 *
 * Genutzt von `pages/checklisten/index.astro` (Übersicht) und
 * `pages/checklisten/[slug].astro` (Detailseite). Die PDFs liegen
 * unter `public/downloads/checklisten/`.
 *
 * Inhalte basieren auf den offiziellen Propus-Anleitungen (Edition 2026).
 */

export type ChecklistGroup = {
	heading: string;
	items: string[];
};

export type ChecklistStep = {
	step: string;
	body: string;
};

export type ChecklistKeyPoint = {
	title: string;
	body: string;
};

export type ChecklistItem = {
	slug: string;
	/** Sortierreihenfolge in der Übersicht */
	order: number;
	/** Card-Titel + Detailseite-H1 */
	title: string;
	/** Eyebrow-Zeile (DE/EN gemischt wie auf PDF-Cover) */
	eyebrow: string;
	/** Kurzbeschreibung für Card + Hero */
	subtitle: string;
	/** Längere Einführung auf der Detailseite */
	intro: string;
	/** Optionaler Versprechen-/Beruhigungs-Block (PDF-Cover) */
	promise?: string;
	/** PDF-Download-Pfad (in public/) */
	pdfHref: string;
	/** Pages (PDF) — wird neben dem Download-Button gezeigt */
	pdfPages: number;
	/** „Die wichtigsten Punkte" — Top-Highlights */
	keyPoints: ChecklistKeyPoint[];
	/** Hauptcheckliste, gruppiert */
	groups: ChecklistGroup[];
	/** Optionaler „So läuft es ab"-Ablauf */
	timeline?: ChecklistStep[];
	/** Schluss-Hinweis (z. B. Faustregel, Wetter-Hinweis) */
	closing?: string;
	/** SEO */
	metaDescription: string;
};

export const CHECKLISTEN: ChecklistItem[] = [
	{
		slug: 'foto-shooting',
		order: 1,
		title: 'Bereit fürs Foto-Shooting',
		eyebrow: 'Checkliste · Innen & Aussen',
		subtitle:
			'Die kompakte Vorbereitungs-Anleitung für Ihr Immobilien-Shooting — fünf Punkte reichen für 90 % der Bildwirkung.',
		intro:
			'Diese Anleitung wirkt umfangreich, ist aber als Überblick gedacht — nicht als Pflichtenheft. Konzentrieren Sie sich auf die wichtigsten Punkte. Den Rest bringen wir gemeinsam beim Kurzrundgang in Ordnung.',
		promise:
			'Wir sind Fotograf:innen mit Auge — keine Inspektoren. Beim Termin gehen wir gemeinsam durch die Räume und machen letzte Anpassungen. Kleine Unordnung verzeihen wir; Authentizität verkauft besser als Perfektion.',
		pdfHref: '/downloads/checklisten/Propus_Anleitung_Foto-Shooting.pdf',
		pdfPages: 8,
		keyPoints: [
			{
				title: 'Gründlich aufgeräumt',
				body: 'Persönliche Gegenstände, Kabel, Wäsche, Post — alles in Schränke oder ausser Sicht. Macht 70 % des Effekts aus.',
			},
			{
				title: 'Sauber & staubfrei',
				body: 'Böden gesaugt, Oberflächen gewischt, Fenster und Spiegel streifenfrei. Hochauflösende Kameras zeigen jeden Krümel.',
			},
			{
				title: 'Alle Lichter an, Vorhänge auf',
				body: 'Auch tagsüber jede Lampe einschalten und Rollläden hochziehen — Räume wirken so doppelt so gross.',
			},
			{
				title: 'Küche & Bad geleert',
				body: 'Arbeitsflächen frei (kein Toaster, Wasserkocher), Hygieneartikel verstaut, WC-Deckel zu, Spüle leer.',
			},
			{
				title: 'Haustiere & Familie ausser Haus',
				body: 'Ruhe während des Shootings — keine Haare, keine Spielsachen, keine Kinder in den Bildern.',
			},
		],
		groups: [
			{
				heading: 'Wohnzimmer',
				items: [
					'Möbel symmetrisch arrangieren',
					'Teppich gerade ausrichten',
					'Kissen aufschütteln, Decken falten',
					'Frische Blumen als Akzent',
					'Fernbedienungen wegräumen',
					'Sichtbare Kabel verstecken',
					'TV ausschalten (schwarzer Bildschirm)',
					'Magazine, Spielkonsolen weg',
				],
			},
			{
				heading: 'Küche',
				items: [
					'Toaster, Wasserkocher, Kaffeemaschine weg',
					'Müll- und Recyclingbehälter ausser Sicht',
					'Spüle leer, sauber, trocken',
					'Obstschale oder Brett als Akzent',
					'Kühlschrank-Aussen frei (keine Magnete)',
					'Spülmittel, Schwämme verstauen',
					'Geschirrtücher entfernen',
					'Arbeitsflächen freiräumen',
				],
			},
			{
				heading: 'Bad',
				items: [
					'Hygieneartikel verstauen',
					'Spiegel und Armaturen poliert',
					'WC-Deckel geschlossen',
					'Duschvorhang gerade · Duschtür streifenfrei',
					'Frische, abgestimmte Handtücher',
					'Waage, Wäschekorb weg',
					'Badvorleger entfernen',
					'Mülleimer ausser Sicht',
				],
			},
			{
				heading: 'Schlafzimmer',
				items: [
					'Bett frisch und ordentlich',
					'Schmuck, Medikamente sicher',
					'Kissen aufschütteln',
					'Schränke geschlossen',
					'Nachttisch fast leer',
					'Ladegeräte verstecken',
					'Kleidung im Schrank',
					'Persönliche Fotos weg',
				],
			},
			{
				heading: 'Büro & Kinderzimmer',
				items: [
					'Schreibtisch leer (keine Papierstapel)',
					'Spielzeug und Kleidung verstaut',
					'Bücher und Ordner geordnet',
					'Schlichte Bettwäsche im Kinderzimmer',
					'Monitor aus, Kabel bündeln',
					'Persönliche Poster und Fotos entfernen',
					'Visitenkarten, sensible Daten weg',
					'Bunte Deko reduziert',
				],
			},
			{
				heading: 'Garten & Terrasse',
				items: [
					'Rasen gemäht, Kanten getrimmt',
					'Trampolin, Planschbecken weg',
					'Laub und Gartenabfälle entfernt',
					'Grill gereinigt oder abgedeckt',
					'Gartenmöbel sauber, ordentlich',
					'Wäscheständer, Aschenbecher entfernen',
					'Gartenwerkzeuge, Schläuche weg',
					'Sitzgelegenheiten einladend gestaltet',
				],
			},
			{
				heading: 'Fassade, Einfahrt & Eingang',
				items: [
					'Alle Fahrzeuge weg (Strasse + Einfahrt)',
					'Fassade von Spinnweben befreit',
					'Mülltonnen ausser Sicht',
					'Haustür sauber, Griff funktioniert',
					'Gehwege gekehrt',
					'Hausnummer und Briefkasten gepflegt',
					'Aussenfenster geputzt',
					'Eingangsleuchten an',
				],
			},
			{
				heading: 'Gerüche, Technik & Sicherheit',
				items: [
					'Räume 15 Min. vor Termin lüften',
					'Wertgegenstände sicher verstauen',
					'Auf intensive Düfte verzichten',
					'Persönliche Dokumente weg',
					'TV, Monitore, Tablets aus (schwarz)',
					'Familienfotos entfernen',
					'Smart-Home-Anzeigen verdecken',
					'Fenster und Türen geschlossen halten',
				],
			},
		],
		timeline: [
			{ step: 'Terminbestätigung', body: 'Idealerweise tagsüber bei Sonnenschein.' },
			{ step: 'Ihre Vorbereitung am Vortag', body: 'Die fünf Top-Punkte reichen meist.' },
			{ step: 'Kurzrundgang mit uns', body: 'Max. 10 Min. — wir helfen bei den letzten Details.' },
			{ step: 'Shooting', body: 'Sie können entspannt bleiben oder das Haus verlassen.' },
			{ step: 'Lieferung der Bilder', body: 'Innerhalb von 24–48 Stunden, fertig bearbeitet.' },
		],
		closing:
			'Stellen Sie sich vor, Sie zeigen die Wohnung Verwandten, die noch nie da waren. So vorbereitet ist sie auch für die Fotos bereit.',
		metaDescription:
			'Vorbereitungs-Checkliste für Ihr Immobilien-Foto-Shooting mit Propus: die fünf wichtigsten Punkte plus Detail-Listen für jeden Raum. Inkl. PDF-Download.',
	},
	{
		slug: 'daemmerung',
		order: 2,
		title: 'Dämmerungs-Shooting · Blaue Stunde',
		eyebrow: 'Checkliste · Twilight',
		subtitle:
			'Aufnahmen zur „blauen Stunde" — kurz, kostbar, spektakulär. Vorbereitung lohnt sich doppelt.',
		intro:
			'Wenn der Himmel tiefblau und die Fenster warm leuchten, verkauft sich Ihre Immobilie wie von selbst. Das Zeitfenster ist 20–30 Minuten lang — Vorbereitung lohnt sich doppelt.',
		promise:
			'Sie schalten einfach ALLE Lichter ein — innen und aussen — und wir kümmern uns um den Rest. Wir kommen rechtzeitig vor Sonnenuntergang, gehen mit Ihnen durchs Haus und stellen sicher, dass jedes Fenster leuchtet.',
		pdfHref: '/downloads/checklisten/Propus_Anleitung_Daemmerung.pdf',
		pdfPages: 4,
		keyPoints: [
			{
				title: 'Alle Lichter EIN',
				body: 'Innen UND aussen, 30 Min. vor Sonnenuntergang. Auch Lampen, die Sie sonst nie nutzen — Akzentlicht, Lichterketten, Gartenstrahler. Glühbirnen brauchen Zeit für volle Helligkeit.',
			},
			{
				title: 'Vorhänge auf, Rollläden hoch',
				body: 'Das warme Licht muss von aussen sichtbar sein. Geschlossene Vorhänge wirken kalt und leer.',
			},
			{
				title: 'Atmosphäre dazu',
				body: 'Kamin anzünden, Kerzen entzünden, evtl. Tisch dezent eindecken. Diese Details machen den Unterschied zwischen „schön" und „verkaufsstark".',
			},
		],
		groups: [
			{
				heading: 'Innen — jede Lampe ein',
				items: [
					'Decken-, Steh-, Wandleuchten',
					'Lampen mit warmweissem Licht (2700–3000 K)',
					'Tisch- und Nachttischlampen',
					'Dimmer auf 70–80 % stellen',
					'Schreibtisch- und Akzentlicht',
					'Defekte Glühbirnen vorab ersetzen',
					'Lichter über Spiegel und Bildern',
					'Auch selten benutzte Lampen einschalten',
				],
			},
			{
				heading: 'Aussen — die ganze Fassade',
				items: [
					'Fassadenstrahler und Wandleuchten',
					'Poolbeleuchtung (türkis-magisch!)',
					'Eingangsbeleuchtung, Vordach',
					'Terrassenlampen, Lichterketten',
					'Wegleuchten, Bodenstrahler',
					'Bewegungsmelder auf Dauerlicht',
					'Garten- und Baumbeleuchtung',
					'Hausnummer beleuchtet',
				],
			},
			{
				heading: 'Schnell-Check 30 Minuten vor dem Shooting',
				items: [
					'Alle Innenlampen EIN (Decken-, Steh-, Tisch-)',
					'Vorhänge auf, Rollläden hoch',
					'Alle Aussenlampen EIN (Eingang, Garten, Wege)',
					'TV, PC, Monitore AUS (schwarzer Bildschirm)',
					'Pool-, Akzent- und Wegbeleuchtung EIN',
					'Kamin / Cheminée an, Kerzen entzündet',
					'Bewegungsmelder auf Dauerlicht umgestellt',
					'Fahrzeuge weg, Mülltonnen weg, Velos weg',
					'Garten aufgeräumt (Schläuche, Werkzeug)',
					'Wetter geprüft — bei Regen: Termin verschieben',
				],
			},
		],
		timeline: [
			{
				step: '−60 Min',
				body: 'Vorbereitung abschliessen. Räume aufgeräumt, Vorhänge auf, Fenster aussen geputzt.',
			},
			{
				step: '−30 Min',
				body: 'Alle Lichter EIN. Innen, aussen, Garten, Akzente. Glühbirnen brauchen Zeit für volle Helligkeit.',
			},
			{
				step: '−15 Min',
				body: 'Atmosphäre. Kamin entzünden, Kerzen anzünden, Tisch optional dezent eindecken.',
			},
			{
				step: 'Sonnenuntergang',
				body: 'Shooting beginnt. Wir arbeiten zügig und konzentriert.',
			},
			{
				step: '+30 Min',
				body: 'Ende der „blauen Stunde". Danach wird der Himmel schwarz und der Effekt geht verloren.',
			},
		],
		closing:
			'Wenn ein Nachbar Sie fragt, ob Sie Geburtstag feiern — dann sind die Lichter richtig gesetzt.',
		metaDescription:
			'Vorbereitung für Dämmerungs- und Twilight-Aufnahmen: Lichtsetzung, Ablauf und Schnell-Check für die blaue Stunde. Inkl. PDF-Download von Propus.',
	},
	{
		slug: 'saisonal',
		order: 3,
		title: 'Saisonale Vorbereitung',
		eyebrow: 'Checkliste · Frühling–Winter',
		subtitle:
			'Jede Jahreszeit hat ihr eigenes Spielfeld. Saisonale Tipps für stärkere Bilder — keine Pflichtaufgaben.',
		intro:
			'Diese Anleitung zeigt, was wann wirklich zählt. Authentisch zur aktuellen Saison ist immer richtig. Sommerbilder im Winter wirken unseriös — Käufer merken das.',
		promise:
			'Bei kurzfristigem Verkauf: fotografieren Sie jetzt. Bei längerer Planung: warten Sie auf die fotogenste Saison. Verkauft sich Ihre Immobilie nicht innerhalb von 2–3 Monaten, lohnt sich ein zweites Shooting in der neuen Saison.',
		pdfHref: '/downloads/checklisten/Propus_Anleitung_Saisonal.pdf',
		pdfPages: 5,
		keyPoints: [
			{
				title: 'Frühling — die fotogenste Saison',
				body: 'April–Mai. Gärten, blühende Bäume, helle Räume. Rasen frisch mähen, Wintergeräte weg.',
			},
			{
				title: 'Sommer — Pool & Aussenleben',
				body: 'Juni–August. Pools, Terrassen, Aussenleben. Pool kristallklar, Sonnenschirme aufgespannt.',
			},
			{
				title: 'Herbst — goldene Gemütlichkeit',
				body: 'September–Oktober. Goldenes Licht, Kamin, Gemütlichkeit. Laub rechen, Kerzen entzünden.',
			},
			{
				title: 'Winter — hell und warm',
				body: 'Dezember–Februar. Helle Innenräume, Schnee, Dämmerung. Schnee räumen, alle Lampen an.',
			},
		],
		groups: [
			{
				heading: 'Frühling',
				items: [
					'Rasen frisch mähen, Kanten abstechen',
					'Wintergeräte, Schutzhauben, Streusalz weg',
					'Hecken und Sträucher in Form schneiden',
					'Terrasse und Gartenmöbel reinigen',
					'Blühende Topfpflanzen am Eingang',
					'Schwere Winterdecken durch leichte ersetzen',
					'Fenster gegen Pollen putzen',
					'Frische Schnittblumen als Akzent',
				],
			},
			{
				heading: 'Sommer',
				items: [
					'Pool kristallklar (Vortag absaugen, chloren)',
					'Rasen tiefgrün — bei Trockenheit wässern',
					'Poolspielzeug, Reinigungsroboter weg',
					'Klimaanlage rechtzeitig einschalten',
					'Sonnenschirme aufgespannt, gleichgerichtet',
					'Grill geputzt und am Platz',
					'Outdoor-Kissen frisch / nicht verblichen',
					'Frisches Obst als Stilleben',
				],
			},
			{
				heading: 'Herbst',
				items: [
					'Laub regelmässig rechen (auch am Shooting-Tag)',
					'Kerzen entzünden (Sicherheit beachten)',
					'Dachrinnen von Blättern befreien',
					'Verwelkte Sommerblumen ersetzen',
					'Kamin oder Cheminée anzünden',
					'Kürbisse maximal dezent — KEIN Halloween-Dekor',
					'Warme Decken und Kissen in Erdtönen',
					'Beleuchtung etwas früher einschalten',
				],
			},
			{
				heading: 'Winter',
				items: [
					'Schnee von Eingang, Wegen und Einfahrt räumen',
					'Weihnachtsdeko entfernen (datiert die Bilder!)',
					'Streusalz und Splitt wegkehren',
					'Kamin oder Cheminée mit echtem Feuer',
					'Heizung auf angenehme Temperatur',
					'Eiszapfen an Dachrinnen prüfen',
					'Alle Lampen einschalten (Tageslicht knapp)',
					'Warme Texturen: Strick, Fell, Wolle',
				],
			},
		],
		closing:
			'Twilight im Winter ist besonders eindrücklich: kurze Tage = weniger Wartezeit auf die blaue Stunde. Siehe separate Anleitung „Dämmerungs-Shooting".',
		metaDescription:
			'Saisonale Vorbereitung für Immobilienfotos: was im Frühling, Sommer, Herbst und Winter zählt — mit Schnell-Check pro Saison. Propus-PDF zum Download.',
	},
	{
		slug: 'matterport-360',
		order: 4,
		title: 'Virtueller Rundgang · Matterport 360',
		eyebrow: 'Checkliste · 360°-Scan',
		subtitle:
			'Anders als bei Fotos sieht die Kamera ALLES — 360° in jedem Raum. Was vorbereitet ist, muss am Termin nicht mehr gemacht werden.',
		intro:
			'Ein 360-Scan dauert je nach Raumgrösse 1–3 Stunden. Sie können (und sollten) während des Scans nicht im Bild sein — die Kamera sieht in alle Richtungen. Planen Sie auswärts zu sein oder in einem fertigen Raum.',
		promise:
			'Wer einmal vorbereitet ist, hat es einfacher als beim Fotoshooting — es gibt kein „nochmal umstellen für den nächsten Winkel". Versprochen.',
		pdfHref: '/downloads/checklisten/Propus_Anleitung_Matterport-360.pdf',
		pdfPages: 4,
		keyPoints: [
			{
				title: 'Wirklich überall aufräumen',
				body: 'Bei Fotos kann man Dinge „aus dem Bild" schieben. Beim 360-Scan nicht — alle Seiten zählen.',
			},
			{
				title: 'Türen offen lassen',
				body: 'Damit der Rundgang fliessend wirkt, müssen alle Türen offen sein. Auch Schränke (Garderobe, Vorratskammer), falls Sie diese im Tour zeigen wollen.',
			},
			{
				title: 'Konstante Beleuchtung',
				body: 'Während des gesamten Scans dürfen Lichter NICHT verändert werden. Vor dem Start: alles einschalten und Hände weg.',
			},
			{
				title: 'Sie selbst nicht im Bild',
				body: 'Während die Kamera scannt, müssen Sie ausser Sicht sein — am besten in einem bereits gescannten Raum oder ganz draussen.',
			},
		],
		groups: [
			{
				heading: 'Alle Räume',
				items: [
					'Alle Türen weit offen — innen und zu Räumen',
					'Alle Lichter konstant EIN während des Scans',
					'Schiebetüren, Falttüren ganz öffnen',
					'Mobiltelefone, Tablets stummschalten',
					'Sichthindernisse (Vorhänge, Rollläden) auf',
					'Haustiere ausser Haus',
					'Persönliches strikt ausser Sicht',
					'Kabel und Ladegeräte weg (auch unter dem Sofa)',
				],
			},
			{
				heading: 'Empfindliche Bereiche · Rundumsicht',
				items: [
					'Spiegel werden mit-gescannt — saubere Spiegel kritisch',
					'Zimmerpflanzen mittig — nicht direkt vor Kamera',
					'Glastüren — Fingerabdrücke putzen',
					'Kein Konfetti, Glitzer oder Reflektoren am Boden',
					'Reflektierende Oberflächen (Marmor, Glas) wischen',
					'Schmuckstücke, Bargeld, Pässe sicher weggeschlossen',
					'Türgriffe und Schalter ohne Staub',
					'Familienfotos abnehmen oder umdrehen',
				],
			},
			{
				heading: 'Aussen (falls Aussen-Scans gewünscht)',
				items: [
					'Fahrzeuge weg, Einfahrt frei',
					'Trampolin, Spielzeug weg',
					'Garten aufgeräumt — Werkzeug, Schläuche weg',
					'Pool reinigen, Möbel ausgerichtet',
					'Mülltonnen ausser Sicht',
					'Briefkasten leer, Hausnummer sichtbar',
				],
			},
			{
				heading: 'Schnell-Check vor dem Scan',
				items: [
					'Alle Räume aufgeräumt (rundherum, nicht nur Front)',
					'Persönliches verstaut (Schmuck, Dokumente, Fotos)',
					'Türen weit offen',
					'Schränke geschlossen (sofern nicht im Tour gewünscht)',
					'Alle Lichter EIN',
					'Konstantes Licht (während Scan keine Änderung!)',
					'Spiegel, Glas, Türgriffe geputzt',
					'Haustiere und Familie ausser Haus',
					'Mobiltelefone stumm',
					'Während Scan: ausser Sicht oder fertiger Raum',
				],
			},
		],
		closing:
			'Innerhalb von 24–48 Stunden erhalten Sie den fertigen Rundgang als Link, eingebettete iframe für Ihre Website und ein Dollhouse-View fürs Inserat.',
		metaDescription:
			'Vorbereitung für Matterport- und 360°-Scans: was anders ist als beim Foto, was eingeschaltet bleiben muss und der Schnell-Check vor dem Termin. Propus-PDF.',
	},
	{
		slug: 'video',
		order: 5,
		title: 'Immobilien-Video & Cinematic-Tour',
		eyebrow: 'Checkliste · Bewegtbild',
		subtitle:
			'Video zeigt Bewegung, Atmosphäre und Lebensgefühl — und gerade deshalb fallen Details umso mehr auf.',
		intro:
			'Video ist nicht „Fotos in Bewegung" — es ist Storytelling. Sie liefern den Raum, wir liefern die Bewegung. Die Vorbereitung ist fast identisch zu Fotos, mit ein paar Zusatzpunkten die Bewegung berücksichtigen.',
		promise:
			'Inserate mit Video erzielen 403 % mehr Anfragen als reine Foto-Inserate (NAR-Studie). Video wird auf Social Media bevorzugt — und Käufer ab 35 Jahren erwarten es bereits.',
		pdfHref: '/downloads/checklisten/Propus_Anleitung_Video.pdf',
		pdfPages: 4,
		keyPoints: [
			{
				title: 'Mehr Zeit einplanen',
				body: 'Ein Video-Dreh dauert 3–5 Stunden — länger als Foto. Planen Sie Stille im Haus und keine Termine während dieser Zeit ein.',
			},
			{
				title: 'Geräusche zählen',
				body: 'Im Video hört man alles — Heizung, Kühlschrank, Strassenlärm, Geschirrspüler. Lassen Sie laute Geräte aus.',
			},
			{
				title: 'Bewegung im Raum verboten',
				body: 'Während wir filmen, dürfen Sie und Familie nicht im Bild erscheinen — auch nicht im Hintergrund eines Fensters.',
			},
			{
				title: 'Lifestyle-Details lohnen sich',
				body: 'Eine dampfende Kaffeetasse, eine brennende Kerze, ein leicht wehender Vorhang — Video lebt von solchen kleinen Bewegungen.',
			},
		],
		groups: [
			{
				heading: 'Alle Räume (Basis wie Foto-Shoot, plus …)',
				items: [
					'Wege durch die Wohnung freiräumen (für Kamerafahrten)',
					'Spiegel UND Glasflächen extra streifenfrei',
					'Türen weit offen, einheitlich nach gleicher Seite',
					'Keine WLAN-Boxen, Router, Modems sichtbar',
					'Vorhänge ordentlich gerafft — nicht zerwurschtelt',
					'Sichtbare Kabel besonders sorgfältig verstecken',
					'Bewegliche Kleinteile fixieren (Magazine, Decken)',
					'Pflanzen so platzieren, dass sie nicht ins Bild flattern',
				],
			},
			{
				heading: 'Geräusche · die Tonspur zählt',
				items: [
					'Heizung, Klimaanlage, Lüftung nicht hochdrehen',
					'Tropfende Wasserhähne reparieren',
					'Geschirrspüler, Waschmaschine, Trockner AUS',
					'Standventilator, Luftbefeuchter AUS',
					'Kühlschrank-Pieper, Wecker, Mikrowelle deaktivieren',
					'Hund / Vogel ausser Hörweite',
					'Telefone stumm — alle',
					'Bauarbeiten in Nachbarschaft: Termin verschieben',
				],
			},
			{
				heading: 'Lifestyle-Akzente · das gewisse Etwas',
				items: [
					'Frisch aufgebrühter Kaffee in einer Tasse',
					'Kamin / Cheminée an (Vorlauf einplanen)',
					'Brennende Kerze auf dem Esstisch',
					'Buch leicht aufgeschlagen auf Sofa',
					'Dezent gedeckter Tisch (2 Gedecke)',
					'Decke locker drapiert (nicht gefaltet)',
					'Schnittblumen oder frisches Obst',
					'Sanft wehende Vorhänge (Fenster leicht öffnen)',
				],
			},
			{
				heading: 'Schnell-Check vor dem Dreh',
				items: [
					'Foto-Checkliste komplett erledigt',
					'Wege freigeräumt für Kamerafahrten',
					'Alle Geräte mit Pieptönen aus',
					'Heizung/AC auf konstante Temperatur',
					'Geschirrspüler, Waschmaschine AUS',
					'Tropfende Hähne abgedichtet',
					'Vorhänge ordentlich gerafft',
					'Spiegel und Glas streifenfrei',
					'Lifestyle-Akzente platziert (Kaffee, Kerze, Blumen)',
					'Familie & Tiere ausser Haus',
					'Telefone stumm',
					'Termine während Dreh: keine',
				],
			},
		],
		timeline: [
			{ step: 'Vortag', body: 'Sie bereiten vor (Checkliste). Wir prüfen Wetter und Drohne-Wetterprognose.' },
			{ step: 'Morgens', body: 'Wir kommen 1 h vor Drehbeginn an für Lichtcheck und Kamera-Setup.' },
			{ step: 'Dreh', body: '3–5 Stunden, je nach Objekt. Sie bleiben in einem nicht-gefilmten Raum oder verlassen das Haus.' },
			{ step: 'Schnitt', body: 'Wir schneiden 3–5 Tage. Sie erhalten 1–2 Vorschauversionen.' },
			{ step: 'Lieferung', body: 'Finalvideo in 4K, plus gekürzte Versionen für Social Media (16:9, 9:16, 1:1).' },
		],
		closing:
			'Ein gut vorbereitetes Video verkauft eine Geschichte — und Geschichten verkaufen Immobilien schneller als Fakten.',
		metaDescription:
			'Vorbereitung für Immobilien-Video und Cinematic-Touren: Bewegung, Ton, Lifestyle-Akzente und Ablauf. Inkl. PDF-Download der Propus-Anleitung.',
	},
];

const bySlug = new Map(CHECKLISTEN.map((c) => [c.slug, c]));

export function getChecklistBySlug(slug: string | undefined): ChecklistItem | undefined {
	if (!slug) return undefined;
	return bySlug.get(slug);
}

export const CHECKLISTEN_SORTED = [...CHECKLISTEN].sort((a, b) => a.order - b.order);
