/**
 * Volltext-Anleitungen für den Guideline-Bereich (Build-Zeit).
 * Downloads verweisen auf IDs in `guideline-static.ts` (GUIDELINE_DOWNLOADS).
 */

export type ManualSection = {
	id: string;
	title: string;
	intro?: string;
	bullets?: string[];
	numbered?: string[];
	note?: string;
};

export type GuidelineManual = {
	slug: string;
	/** Kurztitel in Listen / Cards */
	listTitle: string;
	/** voller Seitentitel (H1) */
	title: string;
	/** Navigation (schmal) */
	navLabel: string;
	category: string;
	lang: 'de' | 'en';
	pdfDownloadId: string;
	docxDownloadId: string;
	teaser: string;
	sections: ManualSection[];
};

export const GUIDELINE_MANUALS: GuidelineManual[] = [
	{
		slug: 'bildoptimierung-web',
		listTitle: 'Bildoptimierung für Web & Portale',
		title: 'Bildoptimierung für Web & Propus-Portale',
		navLabel: 'Bildoptimierung',
		category: 'Web & Medien',
		lang: 'de',
		pdfDownloadId: 'anleitung-bildoptimierung-web-pdf',
		docxDownloadId: 'anleitung-bildoptimierung-web-docx',
		teaser:
			'Einheitliche Qualität, schnelle Ladezeiten und scharfe Darstellung auf Retina-Displays — ohne Überraschungen beim Upload.',
		sections: [
			{
				id: 'ziel',
				title: 'Ziel & Qualitätsanspruch',
				intro:
					'Immobilienbilder sollen auf Propus-Websites und Galerien professionell wirken und gleichzeitig möglichst wenig Bandbreite verbrauchen.',
				bullets: [
					'Farbraum: immer sRGB ausliefern; CMYK oder AdobeRGB vor Export ins Web umrechnen.',
					'Schärfe: leichte Klarheit nach Skalierung ist ok; keine aggressiven USM-Halos an Fensterrahmen oder Kanten.',
					'Horizont: gerade Linie; vertikale Fassaden nicht nach innen kippen (max. leichte Korrektur).',
					'Ausschnitt: störende Details, Personen, Kennzeichen und Unrat zuverlässig ausblenden oder anderen Blick wählen.',
				],
			},
			{
				id: 'formate',
				title: 'Formate & Auflösung',
				bullets: [
					'JPEG: Qualität typisch 78–86 (Lightroom/Photoshop — je nach Motiv); Himmel ohne unschönes Banding.',
					'WebP: wo gefordert, Qualität 80–90; als Alternative zu JPEG für Thumbnails prüfen.',
					'Lange Kanten: für Hero/Detail mind. 2400 px; für Galerie-Grid oft 1600–2000 px ausreichend — pro Objekt einheitlich halten.',
					'Seitenverhältnis: Querformat Standard; Hochformat nur wenn nötig.',
					'Dateigrösse: grob unter ~350–600 KB pro Standardfoto (Hero darf etwas höher, aber sinnvoll komprimieren).',
				],
				note: 'Exakte CMS-Limits im jeweiligen Listing-Editor prüfen; bei Überschreitung können Uploads scheitern oder automatisch neu komprimiert werden.',
			},
			{
				id: 'workflow',
				title: 'Bearbeitungs-Workflow',
				numbered: [
					'Rohdaten sortieren, Duplikate und Ausreisser entfernen (Serien mit identischem Motiv reduzieren).',
					'Grundkorrektur: Belichtung, Kontrast, wb; lokale Helligkeit an Fenstern nur so weit, dass Innen noch lesbar bleibt.',
					'Geradeziehen, Zuschneiden auf Ziel-Seitenverhältnis, Perspektive nur dezent korrigieren.',
					'Export-Preset „Propus Web sRGB“ anlegen (einheitliche Kantenlängen, moderates Schärfen; Metadaten: Copyright behalten, GPS ggf. entfernen).',
					'Stichproben im Browser (100% Zoom) auf Notebook und Handy prüfen — besonders Rauschen in Schatten.',
				],
			},
			{
				id: 'lieferung',
				title: 'Benennung & Ablage',
				bullets: [
					'Dateiname: z. B. objekt_kurz_raum_idx.jpg ohne Sonderzeichen und Umlaute (ae, oe, …).',
					'Reihenfolge: Nummerierung durchgängig; keine Lücken in der Galerie-Reihenfolge.',
					'RAW nur intern archivieren; ins Portal nur finales JPEG/WebP.',
				],
			},
			{
				id: 'check',
				title: 'Checkliste vor Upload',
				bullets: [
					'sRGB, ausreichende Kantenlänge, unter Ziel-Dateigrösse.',
					'Keine übermässige HDR-„Puppe“, Farben naturgetreu (Holzböden nicht orange, Wände nicht gelb).',
					'Spiegelungen/Fenster: keine Crew im Bild; Reflexionen akzeptabel, aber keine ablenkenden Hotspots.',
					'Wasserzeichen nur falls Propus/Partner das explizit vorschreibt — sonst weglassen.',
				],
			},
		],
	},
	{
		slug: 'drohnenaufnahmen',
		listTitle: 'Drohnenaufnahmen & Luftbild',
		title: 'Drohnenaufnahmen für Immobilien & Matterport-Kontext',
		navLabel: 'Drohne',
		category: 'Aufnahme',
		lang: 'de',
		pdfDownloadId: 'anleitung-drohnenaufnahmen-pdf',
		docxDownloadId: 'anleitung-drohnenaufnahmen-docx',
		teaser:
			'Sichere, regelkonforme und verkaufsstarke Luftaufnahmen — von Planung bis Auslieferung.',
		sections: [
			{
				id: 'recht',
				title: 'Vorbereitung & Regeln (CH)',
				intro:
					'Vor jedem Einsatz Einsatzgebiet, Flughöhe, Landesrechte und Sonderzonen prüfen; die offiziellen Karten nutzen und — falls nötig — Auflagen dokumentieren.',
				bullets: [
					'Insurance und Drohnen-Registrierung: Betrieb nur mit gültigen Unterlagen und aktueller Schulungsnachweis-Logik gemäß Betrieb.',
					'DSG und Privatsphäre: Nachbargärten, Personen und Kennzeichen vermeiden oder anonymisieren; bei Bedarf Einwilligungen einholen.',
					'Wetter: Windböen, Niesel (Sensor-Flecken) und tiefe Temperaturen meiden; Propeller-Vibrationen ruinieren Schärfe.',
				],
			},
			{
				id: 'flug',
				title: 'Flug-Setup',
				numbered: [
					'Startfläche frei räumen; Return-to-Home Höhe höher setzen als höchstes Hindernis in der Umgebung.',
					'Belichtung manuell oder mit festem Ausgleich; keine vollautomatischen Sprünge zwischen hell/dunkel.',
					'Serie mit Bildüberlappung planen, falls später Stitches nötig sind (selten für Einzelhero — aber für grosse Grundstücke).',
					'Erste und letzte Aufnahme: Orientierungsshots für den Bearbeiter (Hausname, Richtung Sonne).',
				],
			},
			{
				id: 'bildsprache',
				title: 'Bildsprache & Höhe',
				bullets: [
					'Klassische Schrägaufnahme mit sichtbarem Vordergrund (Rasen/Weg) wirkt einladender als senkrechter „Kartenzoom“.',
					'Flughöhe so wählen, dass das Gebäude proportional bleibt — extreme Weitwinkel-Verzerrung in der Nachbearbeitung korrigieren.',
					'Zeitfenster: leicht seitliche Sonne statt hartes Mittagslicht; Wolken als Diffusor nutzen.',
					'HDR oder Bracketing nur wenn Sensor es sauber merged; Ghosting an Bäumen vermeiden.',
				],
			},
			{
				id: 'post',
				title: 'Nachbearbeitung',
				bullets: [
					'Horizont und vertikale Linien; leichte Farbkorrektur; Himmel nicht „künstlich elektrisch“ einfärben.',
					'Rauschen in Homogenbereichen (Himmel) reduzieren; Schärfe modulationsarm halten.',
					'Zuschnitt auf Propus-Ziel-Format; Daten wie in der Bildoptimierungs-Anleitung exportieren.',
				],
			},
		],
	},
	{
		slug: 'floor-plan-standard',
		listTitle: 'Floor Plan Standard (DE)',
		title: 'Floor Plan Standard — Deutsch',
		navLabel: 'Floor Plan DE',
		category: 'Grundriss',
		lang: 'de',
		pdfDownloadId: 'anleitung-floor-plan-standard-pdf',
		docxDownloadId: 'anleitung-floor-plan-standard-docx',
		teaser:
			'Lesbare, einheitliche Grundrisse aus Matterport & CAD — bereit für Web, Druck und Vermittlung.',
		sections: [
			{
				id: 'basis',
				title: 'Grundlagen & Lesbarkeit',
				bullets: [
					'Linienführung: Wände durchgängig schwarz/dunkelgrau; keine gebrochenen Linien an Ecken.',
					'Türen und Schwingkreise: Öffnungsrichtung klar; Schiebetüren als gestrichelte Spur markieren.',
					'Fenster: parallele Doppelstriche; Festverglasung von öffenbaren Flügeln unterscheiden.',
					'Massstab: wenn angegeben, mit Referenzlineal im Export gegenprüfen.',
				],
			},
			{
				id: 'rume',
				title: 'Räume & Benennung',
				numbered: [
					'Zimmerbezeichnungen einheitlich (z. B. „Schlafzimmer“, „Eltern-Ankleide“, „Reduit“) — keine wilden Mischungen aus Dialekt und Marketing-Sprech.',
					'Flächen nur anzeigen, wenn Datenquelle verlässlich; sonst „ca.“ oder Weglassen.',
					'Nischen < 1 m² als Teil des Hauptbands auffassen, nicht als Mini-Zimmer labeln.',
					'Treppen mit Laufrichtung und ggf. Podest markieren.',
				],
			},
			{
				id: 'matterport',
				title: 'Aus Matterport ableiten',
				bullets: [
					'Scan-Qualität prüfen (Lücken, Höhenprung), bevor aus dem Dollhouse exportiert wird.',
					'Wände nachziehen, wo der Algorithmus verschmälert/verschiebt — besonders um Bad/WC.',
					'Möbel standardmässig ausgeblendet oder nur leichte Kontur — klare Architektur hat Priorität.',
				],
			},
			{
				id: 'export',
				title: 'Export & Lieferformate',
				bullets: [
					'PDF vektorisch wenn möglich; falls Raster, mind. 300 dpi für A4-Druck.',
					'PNG/Web: einheitliche Kantenlänge gemäss Portal-Vorgabe; Hintergrund weiss.',
					'Legende: Nordpfeil, Massstab, Logo nur wenn CI das erfordert.',
				],
			},
		],
	},
	{
		slug: 'floor-plan-standard-en',
		listTitle: 'Floor Plan Standard (EN)',
		title: 'Floor Plan Standard — English',
		navLabel: 'Floor Plan EN',
		category: 'Floor plan',
		lang: 'en',
		pdfDownloadId: 'anleitung-floor-plan-standard-en-pdf',
		docxDownloadId: 'anleitung-floor-plan-standard-en-docx',
		teaser:
			'Clear, consistent floor plans for international listings and English-first portals.',
		sections: [
			{
				id: 'basics',
				title: 'Readability basics',
				bullets: [
					'Walls: single consistent stroke weight; corners must meet cleanly without gaps.',
					'Doors: show swing direction; pocket/sliding doors clearly differentiated.',
					'Windows: parallel ticks; distinguish fixed vs operable where relevant.',
					'Scale bar: if a scale is claimed, verify it against a known reference length in the asset.',
				],
			},
			{
				id: 'labels',
				title: 'Room naming',
				numbered: [
					'Use neutral international English (e.g. “Bedroom”, “En-suite bathroom”, “Utility”, “Storage”).',
					'Don’t invent room names for marketing fluff — stick to verifiable use.',
					'State areas only when reliable; otherwise omit or mark as approximate.',
					'Stairs: show run direction and landings where layout is non-trivial.',
				],
			},
			{
				id: 'matterport',
				title: 'Deriving from Matterport',
				bullets: [
					'Fix scan gaps before tracing; bathrooms and tight corridors often need manual wall edits.',
					'Keep furniture minimal or muted so structure reads on small screens.',
				],
			},
			{
				id: 'export',
				title: 'Export targets',
				bullets: [
					'Prefer vector PDF for print; if raster, target 300 dpi at A4.',
					'For web/portal: consistent long edge, white background, compressed but legible walls.',
				],
			},
		],
	},
	{
		slug: 'immobilienfotografie',
		listTitle: 'Immobilien-Innenaufnahmen',
		title: 'Immobilienfotografie — Innen & Staging-Light',
		navLabel: 'Fotografie',
		category: 'Aufnahme',
		lang: 'de',
		pdfDownloadId: 'anleitung-immobilienfotografie-pdf',
		docxDownloadId: 'anleitung-immobilienfotografie-docx',
		teaser:
			'Ruhige, helle und verkaufsfähige Innenräume — ohne übertriebene HDR-Ästhetik.',
		sections: [
			{
				id: 'vorbereitung',
				title: 'Vor Ort: Basis',
				numbered: [
					'Grundreinigung & Dekoration: Oberflächen frei, Kabel bündeln, Klappen zu, WC-Deckel zu.',
					'Blenden teilweise für diffuses Licht; direkte Sonne mit grossen Fensterflächen kontrollieren (Zeit/Vorhang).',
					'Stativ nutzen; ISO so niedrig wie möglich; Spiegel ohne Fotograf im Bild.',
				],
			},
			{
				id: 'technik',
				title: 'Technik & Belichtung',
				bullets: [
					'Blenden meist f/8–f/11 am Fullframe-Äquivalent für Schärfezone; Notfall kleiner — nie komplett offen für Serienräume.',
					'Blendenreihen nur wenn notwendig; natürliche HDR-Mischung bevorzugen.',
					'Weissabgleich fix pro Raum; keine automatischen Sprünge zwischen Shots.',
					'Verzerrung: leichte Weitwinkel ok; kritische Architektur mit längerer Brennweite ergänzen.',
				],
			},
			{
				id: 'raumfolge',
				title: 'Raumfolge & Story',
				bullets: [
					'Einstiegshalle → Wohnkern → Essen → Küche → Nasszellen → Schlafen → Aussenbereiche.',
					'Pro Raum mindestens eine Etablierungsaufnahme und eine Detailaufnahme (Material, Aussicht).',
					'Doppelte Winkel vermeiden; lieber mehr Vielfalt als 20 ähnliche Shots.',
				],
			},
			{
				id: 'recht',
				title: 'Sensibles & Rechte',
				bullets: [
					'Kunst, Family Photos, Markenposter: wenn unklaar, unkenntlich machen oder wegschneiden.',
					'Smart-Displays, TVs mit erkennbaren Streams oder News: Bildschirm neutralisieren.',
				],
			},
		],
	},
	{
		slug: 'kundenanlage-matterport',
		listTitle: 'Kundenanlage Matterport',
		title: 'Kundenanlage & Organisation in Matterport',
		navLabel: 'Matterport',
		category: 'Platform',
		lang: 'de',
		pdfDownloadId: 'anleitung-kundenanlage-matterport-pdf',
		docxDownloadId: 'anleitung-kundenanlage-matterport-docx',
		teaser:
			'Von Workspace bis Übergabe — einheitliche Namen, klare Zugänge und saubere Modellpflege.',
		sections: [
			{
				id: 'struktur',
				title: 'Struktur & Namensgebung',
				bullets: [
					'Kunde und Objekt klar trennen; keine generischen „Test“- oder Datums-Chaos-Modelle in Produktion.',
					'Modellname: Kunde_Kurz_Objektadresse_JJJJ-MM — Sonderzeichen vermeiden.',
					'Tags/Labels für interne Suche setzen (AV, Region, Paket).',
				],
			},
			{
				id: 'rechte',
				title: 'Freigaben & Sichtbarkeit',
				numbered: [
					'Standard: nicht öffentlich, bis Freigabe durch Propus oder Kunde dokumentiert ist.',
					'Share-Links mit Ablaufdatum nur für temporäre Reviews; nach Abschluss deaktivieren.',
					'Matterport-Teams: Rollen minimal vergeben (Admin vs Editor vs Viewer).',
				],
			},
			{
				id: 'workflow',
				title: 'Übergabe an Propus',
				bullets: [
					'Merge/Split nur nach Absprache — UUID/Referenzen im Tour-Manager können sonst brechen.',
					'Nach Upload: Prüfen auf fehlende Ebenen, Lochfüllungen, Spiegel-Ghosts.',
					'Links zu Space-ID, Passwort-Policies und Zuständigkeiten im Ticket/CRM vermerken.',
				],
			},
			{
				id: 'support',
				title: 'Support & Eskalation',
				bullets: [
					'Billing/Quota-Themen früh bei Propus Backend melden — nicht im Kunden-Thread lösen.',
					'Hardware-Probleme (Kalibrierung) an definierte Ansprechperson eskalieren.',
				],
			},
		],
	},
];

const bySlug = new Map(GUIDELINE_MANUALS.map((m) => [m.slug, m]));

export function getManualBySlug(slug: string | undefined): GuidelineManual | undefined {
	if (!slug) return undefined;
	return bySlug.get(slug);
}
