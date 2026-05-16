/**
 * Häufige Fragen — Q&A für die /faq/-Seite (Schema.org-FAQPage).
 *
 * Inhalte sind AGB-konsistent (Stand 25.05.2025). Antworten verweisen
 * auf Sektions-Anker in /agb/ — die Anker werden in PRO-55 angelegt.
 *
 * Schema-Konvention: `answer` ist plain text (geht ins JSON-LD wie von
 * Google für FAQPage empfohlen). `answerHtml` ist optional und enthält
 * Inline-Links — wird im Browser bevorzugt gerendert.
 */

export type FaqItem = {
	id: string;
	category:
		| 'ablauf'
		| 'leistungen'
		| 'lieferung'
		| 'hosting'
		| 'buchung'
		| 'zahlung'
		| 'recht';
	question: string;
	/** Plain text — wird für Schema.org JSON-LD genutzt. */
	answer: string;
	/** Optionales HTML — wird im Browser gerendert wenn vorhanden. */
	answerHtml?: string;
};

export const FAQS: FaqItem[] = [
	// ─── Ablauf vor Ort ───────────────────────────────────────────────
	{
		id: 'ablauf-vorbereitung',
		category: 'ablauf',
		question: 'Wie bereite ich meine Immobilie auf das Shooting vor?',
		answer:
			'Die fünf wichtigsten Punkte: gründlich aufgeräumt, sauber, alle Lichter an, Küche und Bad geleert, Haustiere und Familie ausser Haus. Für jede Aufnahme-Art gibt es eine eigene Checkliste mit PDF-Download unter propus.ch/checklisten. Erfahrungsgemäss reichen diese fünf Punkte für 90 % der Bildwirkung — den Rest machen wir gemeinsam beim Kurzrundgang.',
		answerHtml:
			'Die fünf wichtigsten Punkte: gründlich aufgeräumt, sauber, alle Lichter an, Küche und Bad geleert, Haustiere und Familie ausser Haus. Für jede Aufnahme-Art gibt es eine eigene Checkliste mit PDF-Download unter <a href="/checklisten/">propus.ch/checklisten</a>. Erfahrungsgemäss reichen diese fünf Punkte für 90 % der Bildwirkung — den Rest machen wir gemeinsam beim Kurzrundgang.',
	},
	{
		id: 'ablauf-dauer',
		category: 'ablauf',
		question: 'Wie lange dauert ein Termin vor Ort?',
		answer:
			'Foto-Shooting: typisch 1–2 Stunden je nach Objektgrösse. Dämmerungs-Aufnahmen: zusätzlich 60 Minuten vor und 30 Minuten ab Sonnenuntergang. Matterport-Scan (360°-Rundgang): 1–3 Stunden, abhängig von der Raumzahl. Video-Dreh: 3–5 Stunden inkl. Setup. Wir starten meist mit einem 10-minütigen Kurzrundgang.',
	},
	{
		id: 'ablauf-wetter',
		category: 'ablauf',
		question: 'Was passiert bei schlechtem Wetter?',
		answer:
			'Für Innenaufnahmen ist Wetter zweitrangig — wir arbeiten dann mit konstantem Tageslicht und ergänzendem Kunstlicht. Bei extremen Wetterbedingungen (starker Regen, Sturm, schlechte Sicht) verschieben wir Aussen-, Drohnen- und Dämmerungs-Shoots auf einen Ersatztermin. Wir prüfen die Prognose am Vortag und melden uns proaktiv. Details zur Storno-Regelung bei wetterbedingter Absage durch uns finden Sie in unseren AGB, Abschnitt 5.2.',
		answerHtml:
			'Für Innenaufnahmen ist Wetter zweitrangig — wir arbeiten dann mit konstantem Tageslicht und ergänzendem Kunstlicht. Bei extremen Wetterbedingungen (starker Regen, Sturm, schlechte Sicht) verschieben wir Aussen-, Drohnen- und Dämmerungs-Shoots auf einen Ersatztermin. Wir prüfen die Prognose am Vortag und melden uns proaktiv. Details zur Storno-Regelung bei wetterbedingter Absage durch uns finden Sie in unseren <a href="/agb/#stornierung-propus">AGB, Abschnitt 5.2</a>.',
	},

	// ─── Leistungen & Pakete ──────────────────────────────────────────
	{
		id: 'leistungen-uebersicht',
		category: 'leistungen',
		question: 'Welche Leistungen bietet Propus an?',
		answer:
			'Wir decken die Visual-Content-Kette für Immobilien komplett ab: Fotografie (innen und aussen), Drohnenaufnahmen, 360°-Rundgänge (Matterport), Grundrisse (2D, optional aus der Tour generiert), Video (Reels und längere Clips), Home Staging und 3D-Visualisierung sowie Retusche. Eine vollständige Übersicht inklusive Pakete und Einzelpreise finden Sie unter propus.ch/preise und propus.ch/dienstleistungen.',
		answerHtml:
			'Wir decken die Visual-Content-Kette für Immobilien komplett ab: Fotografie (innen und aussen), Drohnenaufnahmen, 360°-Rundgänge (Matterport), Grundrisse (2D, optional aus der Tour generiert), Video (Reels und längere Clips), Home Staging und 3D-Visualisierung sowie Retusche. Eine vollständige Übersicht inklusive Pakete und Einzelpreise finden Sie unter <a href="/preise/">propus.ch/preise</a> und <a href="/dienstleistungen/">propus.ch/dienstleistungen</a>.',
	},
	{
		id: 'leistungen-drohne',
		category: 'leistungen',
		question: 'Wann sind Drohnenaufnahmen sinnvoll — und wann nicht?',
		answer:
			'Sinnvoll bei freistehenden Objekten, grossen Grundstücken, besonderer Lage oder zur Einordnung der Umgebung. Weniger sinnvoll bei städtischen Lagen mit Sichtbeschränkungen oder reinen Innen-Vermarktungen. Wir fliegen unter BAZL-Aufsicht (Kategorie A1/A3), inklusive Haftpflichtversicherung. Flugzonen, Bewilligungen und Wetterprognose prüfen wir vor jedem Einsatz. Wichtig: Sind auf den Aufnahmen Personen oder Nachbargrundstücke erkennbar, liegt das Einholen der Einwilligungen gemäss AGB 6.3 beim Auftraggeber — wir beraten Sie gerne im Vorfeld dazu.',
		answerHtml:
			'Sinnvoll bei freistehenden Objekten, grossen Grundstücken, besonderer Lage oder zur Einordnung der Umgebung. Weniger sinnvoll bei städtischen Lagen mit Sichtbeschränkungen oder reinen Innen-Vermarktungen. Wir fliegen unter BAZL-Aufsicht (Kategorie A1/A3), inklusive Haftpflichtversicherung. Flugzonen, Bewilligungen und Wetterprognose prüfen wir vor jedem Einsatz. Wichtig: Sind auf den Aufnahmen Personen oder Nachbargrundstücke erkennbar, liegt das Einholen der Einwilligungen gemäss <a href="/agb/#datenschutz">AGB 6.3</a> beim Auftraggeber — wir beraten Sie gerne im Vorfeld dazu.',
	},
	{
		id: 'leistungen-matterport',
		category: 'leistungen',
		question: 'Was bringt ein 360°-Rundgang konkret?',
		answer:
			'Inserate mit virtuellem Rundgang erzeugen erfahrungsgemäss deutlich höhere Verweildauer und reduzieren unqualifizierte Besichtigungen, weil Interessenten besser vorbereitet kommen. Sie erhalten einen Link, eine einbettbare iframe für Ihre Website und eine Dollhouse-Übersicht fürs Inserat. Hosting-Hinweis: Virtuelle Rundgänge sind standardmässig 6 Monate gehostet, danach erfolgt eine automatische Archivierung. Verlängerung ist jederzeit möglich.',
	},
	{
		id: 'leistungen-grundriss',
		category: 'leistungen',
		question: 'Was ist ein Grundriss „von Tour" — und was sind die Unterschiede?',
		answer:
			'Wir bieten drei Varianten: 2D-Grundriss aus der Tour (ab CHF 49 pro Stockwerk) wird aus dem Matterport-Scan generiert, schnell und kostengünstig — Voraussetzung ist eine 360°-Tour des Objekts. 2D-Grundriss ohne Tour (ab CHF 79 pro Stockwerk): wir vermessen vor Ort separat. 2D-Grundriss nach Skizze (ab CHF 149 pro Stockwerk): wir setzen Ihren Plan oder Ihre Handzeichnung in einen professionellen Grundriss um. Wichtig zur Flächenangabe: Quadratmeter, Masse und Flächenangaben basieren auf Drittanbieter-Software (Matterport, CubiCasa). Für die Richtigkeit und Genauigkeit übernehmen wir gemäss AGB 8 keine Gewähr — für rechtsverbindliche Flächen empfehlen wir eine vermessungstechnische Aufnahme.',
		answerHtml:
			'Wir bieten drei Varianten: 2D-Grundriss aus der Tour (ab CHF 49 pro Stockwerk) wird aus dem Matterport-Scan generiert, schnell und kostengünstig — Voraussetzung ist eine 360°-Tour des Objekts. 2D-Grundriss ohne Tour (ab CHF 79 pro Stockwerk): wir vermessen vor Ort separat. 2D-Grundriss nach Skizze (ab CHF 149 pro Stockwerk): wir setzen Ihren Plan oder Ihre Handzeichnung in einen professionellen Grundriss um. Wichtig zur Flächenangabe: Quadratmeter, Masse und Flächenangaben basieren auf Drittanbieter-Software (Matterport, CubiCasa). Für die Richtigkeit und Genauigkeit übernehmen wir gemäss <a href="/agb/#haftung">AGB 8</a> keine Gewähr — für rechtsverbindliche Flächen empfehlen wir eine vermessungstechnische Aufnahme.',
	},
	{
		id: 'leistungen-staging',
		category: 'leistungen',
		question: 'Wann lohnt sich Home Staging oder eine 3D-Visualisierung?',
		answer:
			'Staging ab CHF 99 pro Raum lohnt sich bei leerstehenden, leeren oder unvorteilhaft möblierten Objekten — empirisch verkürzt es die Vermarktungsdauer spürbar. 3D-Visualisierung ist sinnvoll für Neubau, Umbau und Vorvermarktung, wenn Sie noch keine fertigen Räume haben. Wir beraten gerne, was bei Ihrem Objekt mehr bringt.',
	},
	{
		id: 'leistungen-saison',
		category: 'leistungen',
		question: 'Soll ich auf eine bestimmte Jahreszeit warten?',
		answer:
			'Authentisch zur aktuellen Saison ist immer richtig — Sommerbilder im Winter wirken unseriös. Bei kurzfristigem Verkauf fotografieren Sie jetzt. Bei längerer Planung lohnt sich die fotogenste Saison (Frühling für Gärten, Sommer für Pools, Herbst für Stimmung, Winter für helle Innenräume und Dämmerung).',
	},

	// ─── Lieferung & Formate ──────────────────────────────────────────
	{
		id: 'lieferung-zeit',
		category: 'lieferung',
		question: 'Wann erhalte ich die fertigen Bilder?',
		answer:
			'Fotos liefern wir in der Regel innerhalb von 24–48 Stunden nach dem Shooting — fertig bearbeitet, im Web- und Druckformat. Garantierte Lieferung innerhalb von 24 Stunden ist als Express-Option (CHF 99) buchbar. 360°-Rundgänge sind nach 24–48 Stunden online. Videos brauchen 3–5 Tage Schnitt, dann erhalten Sie 1–2 Vorschauversionen vor der finalen Lieferung. Die genannten Zeiten sind Erfahrungswerte, keine zugesicherten Liefertermine.',
	},
	{
		id: 'lieferung-formate',
		category: 'lieferung',
		question: 'In welchen Formaten und Auflösungen bekomme ich die Bilder?',
		answer:
			'Standard ist JPEG in zwei Varianten: hochauflösend für Druck und Exposé sowie web-optimiert (sRGB, lange Kante typisch 2400 px) für Portale und Galerien. Für Video gibt es 4K plus zugeschnittene Versionen für Social Media (16:9, 9:16, 1:1). Auf Wunsch liefern wir auch WebP oder RAW.',
	},
	{
		id: 'lieferung-selekto',
		category: 'lieferung',
		question: 'Wie bekomme ich die Bilder ausgeliefert?',
		answer:
			'Über unsere Auslieferungsplattform Selekto: nach Fertigstellung erhalten Sie einen Link zur passwortgeschützten Galerie. Dort können Sie Bilder einzeln oder gesammelt herunterladen, an Kollegen weiterleiten und auswählen, welche Bilder ins Exposé sollen. Die Archivierung der Bilder liegt nach Auslieferung gemäss AGB 6.2 bei Ihnen — wir empfehlen, die Galerie zeitnah herunterzuladen.',
		answerHtml:
			'Über unsere Auslieferungsplattform Selekto: nach Fertigstellung erhalten Sie einen Link zur passwortgeschützten Galerie. Dort können Sie Bilder einzeln oder gesammelt herunterladen, an Kollegen weiterleiten und auswählen, welche Bilder ins Exposé sollen. Die Archivierung der Bilder liegt nach Auslieferung gemäss <a href="/agb/#archivierung">AGB 6.2</a> bei Ihnen — wir empfehlen, die Galerie zeitnah herunterzuladen.',
	},

	// ─── Hosting & Verlängerung ───────────────────────────────────────
	{
		id: 'hosting-dauer',
		category: 'hosting',
		question: 'Wie lange ist mein 360°-Rundgang online?',
		answer:
			'Standardmässig hosten wir virtuelle Rundgänge für 6 Monate ab Bereitstellung. Danach wird der Rundgang automatisch archiviert und ist nicht mehr öffentlich abrufbar. Vor Ablauf melden wir uns mit einer Verlängerungsoption.',
	},
	{
		id: 'hosting-verlaengerung',
		category: 'hosting',
		question: 'Was kostet eine Verlängerung — und was, wenn ich zu spät bin?',
		answer:
			'Verlängerung um weitere 6 Monate: CHF 59. Reaktivierung eines bereits archivierten Rundgangs: CHF 74. Eine Übertragung auf einen anderen Server oder Kundenaccount ist ebenfalls gegen Gebühr möglich — sprechen Sie uns dazu direkt an. Nach 12 Monaten im Archiv kann der Rundgang gemäss AGB 7 endgültig gelöscht werden.',
		answerHtml:
			'Verlängerung um weitere 6 Monate: CHF 59. Reaktivierung eines bereits archivierten Rundgangs: CHF 74. Eine Übertragung auf einen anderen Server oder Kundenaccount ist ebenfalls gegen Gebühr möglich — sprechen Sie uns dazu direkt an. Nach 12 Monaten im Archiv kann der Rundgang gemäss <a href="/agb/#hosting">AGB 7</a> endgültig gelöscht werden.',
	},

	// ─── Buchung & Preise ─────────────────────────────────────────────
	{
		id: 'buchung-preise',
		category: 'buchung',
		question: 'Was kostet ein Shooting?',
		answer:
			'Unser Einstiegspaket „Bestseller" (10 Bodenfotos plus 4 Luftaufnahmen) liegt bei CHF 399. „The Full View" (10 Fotos plus 4 Luftaufnahmen plus 360°-Tour bis 199 m²) bei CHF 649. Das Video-Paket „Cinematic Duo" bei CHF 549. Einzelleistungen ab CHF 229 (10 Bodenfotos). Vollständige Preisliste und Buchung unter propus.ch/preise — alle Preise verstehen sich gemäss AGB 4.2 in CHF, exklusive MwSt.',
		answerHtml:
			'Unser Einstiegspaket „Bestseller" (10 Bodenfotos plus 4 Luftaufnahmen) liegt bei CHF 399. „The Full View" (10 Fotos plus 4 Luftaufnahmen plus 360°-Tour bis 199 m²) bei CHF 649. Das Video-Paket „Cinematic Duo" bei CHF 549. Einzelleistungen ab CHF 229 (10 Bodenfotos). Vollständige Preisliste und Buchung unter <a href="/preise/">propus.ch/preise</a> — alle Preise verstehen sich gemäss <a href="/agb/#zahlung">AGB 4.2</a> in CHF, exklusive MwSt.',
	},
	{
		id: 'buchung-mindestbestellung',
		category: 'buchung',
		question: 'Was passiert, wenn ich nur einen Teil der gebuchten Leistungen brauche?',
		answer:
			'Der gebuchte Umfang (zum Beispiel 10 Fotos) gilt als Mindestbestellung. Wenn Sie davon nachträglich nur einen Teil nutzen (zum Beispiel 5 von 10 Fotos), entsteht kein Anspruch auf Preisreduktion oder Erstattung — das ist in AGB 3 geregelt. Wir empfehlen daher, im Buchungsdialog ehrlich abzuschätzen, was Sie wirklich brauchen. Bei Unsicherheit beraten wir Sie kurz vor der Buchung.',
		answerHtml:
			'Der gebuchte Umfang (zum Beispiel 10 Fotos) gilt als Mindestbestellung. Wenn Sie davon nachträglich nur einen Teil nutzen (zum Beispiel 5 von 10 Fotos), entsteht kein Anspruch auf Preisreduktion oder Erstattung — das ist in <a href="/agb/#mindestbestellung">AGB 3</a> geregelt. Wir empfehlen daher, im Buchungsdialog ehrlich abzuschätzen, was Sie wirklich brauchen. Bei Unsicherheit beraten wir Sie kurz vor der Buchung.',
	},
	{
		id: 'buchung-anfahrt',
		category: 'buchung',
		question: 'Kommt ihr in die ganze Schweiz?',
		answer:
			'Unser Schwerpunkt liegt in Zug und der Zentralschweiz, wir fahren aber regelmässig in alle Kantone. Anfahrt innerhalb des Grossraums Zug/Zürich ist in den Paketen enthalten. Für Termine in weiter entfernten Kantonen berechnen wir Anfahrt nach Aufwand — die genauen Konditionen sehen Sie transparent im Buchungsdialog vor der Bestätigung.',
	},

	// ─── Zahlung & Stornierung ────────────────────────────────────────
	{
		id: 'zahlung-methoden',
		category: 'zahlung',
		question: 'Wie kann ich bezahlen?',
		answer:
			'Sie können per Banküberweisung (Kontodaten auf der Rechnung) oder über Payrexx mit Kreditkarte, TWINT, PostFinance, Apple Pay oder Google Pay bezahlen. Die Zahlungsfrist beträgt gemäss AGB 4.2 14 Tage ab Rechnungseingang.',
		answerHtml:
			'Sie können per Banküberweisung (Kontodaten auf der Rechnung) oder über Payrexx mit Kreditkarte, TWINT, PostFinance, Apple Pay oder Google Pay bezahlen. Die Zahlungsfrist beträgt gemäss <a href="/agb/#zahlung">AGB 4.2</a> 14 Tage ab Rechnungseingang.',
	},
	{
		id: 'zahlung-stornierung',
		category: 'zahlung',
		question: 'Was passiert, wenn ich den Termin absagen muss?',
		answer:
			'Stornierungen müssen schriftlich (per E-Mail) erfolgen. Es gilt die Staffel aus AGB 5.1: Bis 7 Tage vor Termin kostenfrei. 6 bis 3 Tage vor Termin: 30 % des Honorars. Weniger als 48 Stunden vor Termin: 50 %. Am Tag des Termins oder bei Nichterscheinen: 100 %. Bei Verschiebung aus zwingenden Gründen (Krankheit, Notfall) finden wir gemeinsam eine Lösung — sprechen Sie uns frühzeitig an.',
		answerHtml:
			'Stornierungen müssen schriftlich (per E-Mail) erfolgen. Es gilt die Staffel aus <a href="/agb/#stornierung">AGB 5.1</a>: Bis 7 Tage vor Termin kostenfrei. 6 bis 3 Tage vor Termin: 30 % des Honorars. Weniger als 48 Stunden vor Termin: 50 %. Am Tag des Termins oder bei Nichterscheinen: 100 %. Bei Verschiebung aus zwingenden Gründen (Krankheit, Notfall) finden wir gemeinsam eine Lösung — sprechen Sie uns frühzeitig an.',
	},
	{
		id: 'zahlung-verzug',
		category: 'zahlung',
		question: 'Was, wenn die Rechnung mal liegen bleibt?',
		answer:
			'Bei Überschreitung der 14-Tage-Frist erhalten Sie zunächst eine kostenfreie Zahlungserinnerung, ab der zweiten Mahnung CHF 20, ab der dritten CHF 50 Mahngebühr. Danach behalten wir uns Inkassoverfahren und Verzugszinsen (5 % pro Jahr) vor — Details in AGB 4.4.',
		answerHtml:
			'Bei Überschreitung der 14-Tage-Frist erhalten Sie zunächst eine kostenfreie Zahlungserinnerung, ab der zweiten Mahnung CHF 20, ab der dritten CHF 50 Mahngebühr. Danach behalten wir uns Inkassoverfahren und Verzugszinsen (5 % pro Jahr) vor — Details in <a href="/agb/#verzug">AGB 4.4</a>.',
	},

	// ─── Recht & Privatsphäre ─────────────────────────────────────────
	{
		id: 'recht-personen',
		category: 'recht',
		question: 'Wie geht ihr mit Personen, Kennzeichen und Familienfotos um?',
		answer:
			'Wir vermeiden Personen, Kfz-Kennzeichen und persönliche Gegenstände aktiv im Bild und weisen beim Kurzrundgang auf zu entfernende Objekte hin. Wichtig: Gemäss AGB 6.3 liegt die Verantwortung für das Entfernen persönlicher Gegenstände sowie das Einholen von Einwilligungen erkennbarer Personen vor Veröffentlichung beim Auftraggeber. Wir unterstützen mit Retusche-Leistungen (ab CHF 25), übernehmen aber keine Haftung für Datenschutzverstösse durch übersehene Inhalte.',
		answerHtml:
			'Wir vermeiden Personen, Kfz-Kennzeichen und persönliche Gegenstände aktiv im Bild und weisen beim Kurzrundgang auf zu entfernende Objekte hin. Wichtig: Gemäss <a href="/agb/#datenschutz">AGB 6.3</a> liegt die Verantwortung für das Entfernen persönlicher Gegenstände sowie das Einholen von Einwilligungen erkennbarer Personen vor Veröffentlichung beim Auftraggeber. Wir unterstützen mit Retusche-Leistungen (ab CHF 25), übernehmen aber keine Haftung für Datenschutzverstösse durch übersehene Inhalte.',
	},
	{
		id: 'recht-nutzungsrechte',
		category: 'recht',
		question: 'Welche Nutzungsrechte habe ich an den Bildern?',
		answer:
			'Nach vollständiger Bezahlung erhalten Sie gemäss AGB 6.1 ein nicht-exklusives, zeitlich und örtlich unbegrenztes Nutzungsrecht an den erstellten Werken — für Portale, Exposé, Website, Social Media und alle weiteren Vermarktungskanäle. Bis zur vollständigen Bezahlung bleibt das Eigentum an den Werken bei Propus (Eigentumsvorbehalt). Propus behält sich vor, die Werke für eigene Werbezwecke (Portfolio, Social Media, Website) zu nutzen — wünschen Sie das nicht, treffen wir eine schriftliche Sondervereinbarung.',
		answerHtml:
			'Nach vollständiger Bezahlung erhalten Sie gemäss <a href="/agb/#nutzungsrechte">AGB 6.1</a> ein nicht-exklusives, zeitlich und örtlich unbegrenztes Nutzungsrecht an den erstellten Werken — für Portale, Exposé, Website, Social Media und alle weiteren Vermarktungskanäle. Bis zur vollständigen Bezahlung bleibt das Eigentum an den Werken bei Propus (Eigentumsvorbehalt). Propus behält sich vor, die Werke für eigene Werbezwecke (Portfolio, Social Media, Website) zu nutzen — wünschen Sie das nicht, treffen wir eine schriftliche Sondervereinbarung.',
	},
	{
		id: 'recht-flaechen',
		category: 'recht',
		question: 'Wer haftet für Flächenangaben in Grundrissen?',
		answer:
			'Quadratmeter und Masse in unseren Grundrissen basieren auf Software-Drittanbietern (Matterport, CubiCasa). Für die Richtigkeit übernehmen wir gemäss AGB 8 keine Gewähr. Für rechtsverbindliche Flächenangaben (zum Beispiel im Kaufvertrag) empfehlen wir eine vermessungstechnische Aufnahme durch einen Geometer.',
		answerHtml:
			'Quadratmeter und Masse in unseren Grundrissen basieren auf Software-Drittanbietern (Matterport, CubiCasa). Für die Richtigkeit übernehmen wir gemäss <a href="/agb/#haftung">AGB 8</a> keine Gewähr. Für rechtsverbindliche Flächenangaben (zum Beispiel im Kaufvertrag) empfehlen wir eine vermessungstechnische Aufnahme durch einen Geometer.',
	},
];

export const FAQS_BY_CATEGORY: ReadonlyArray<{
	key: FaqItem['category'];
	label: string;
	items: FaqItem[];
}> = (() => {
	const labelByKey: Record<FaqItem['category'], string> = {
		ablauf: 'Ablauf vor Ort',
		leistungen: 'Leistungen & Pakete',
		lieferung: 'Lieferung & Formate',
		hosting: 'Hosting & Verlängerung',
		buchung: 'Buchung & Preise',
		zahlung: 'Zahlung & Stornierung',
		recht: 'Recht & Privatsphäre',
	};
	const order: FaqItem['category'][] = [
		'ablauf',
		'leistungen',
		'lieferung',
		'hosting',
		'buchung',
		'zahlung',
		'recht',
	];
	return order.map((key) => ({
		key,
		label: labelByKey[key],
		items: FAQS.filter((f) => f.category === key),
	}));
})();
