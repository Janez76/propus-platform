/**
 * Häufige Fragen — Q&A für die /faq/-Seite (Schema.org-FAQPage).
 *
 * Inhalte aus bestehenden Marketing- und Service-Texten zusammengefasst.
 * Antworten sind absichtlich kurz und konkret — keine Marketing-Floskeln.
 */

export type FaqItem = {
	id: string;
	category: 'ablauf' | 'service' | 'recht' | 'preise' | 'lieferung';
	question: string;
	/** Plain text — wird für Schema.org JSON-LD genutzt. */
	answer: string;
	/** Optionales HTML — wird im Browser gerendert wenn vorhanden. */
	answerHtml?: string;
};

export const FAQS: FaqItem[] = [
	{
		id: 'ablauf-vorbereitung',
		category: 'ablauf',
		question: 'Wie bereite ich meine Immobilie auf das Shooting vor?',
		answer:
			'Die fünf wichtigsten Punkte: gründlich aufgeräumt, sauber, alle Lichter an, Küche und Bad geleert, Haustiere und Familie ausser Haus. Für jede Aufnahme-Art gibt es eine eigene Checkliste mit PDF-Download unter /checklisten/. Erfahrungsgemäss reichen diese fünf Punkte für 90 % der Bildwirkung — den Rest machen wir gemeinsam beim Kurzrundgang.',
		answerHtml:
			'Die fünf wichtigsten Punkte: gründlich aufgeräumt, sauber, alle Lichter an, Küche und Bad geleert, Haustiere und Familie ausser Haus. Für jede Aufnahme-Art gibt es eine eigene Checkliste mit PDF-Download unter <a href="/checklisten/">propus.ch/checklisten</a>. Erfahrungsgemäss reichen diese fünf Punkte für 90 % der Bildwirkung — den Rest machen wir gemeinsam beim Kurzrundgang.',
	},
	{
		id: 'ablauf-dauer',
		category: 'ablauf',
		question: 'Wie lange dauert ein Termin vor Ort?',
		answer:
			'Foto-Shooting: typisch 1–2 Stunden je nach Objektgrösse. Dämmerungs-Aufnahmen: zusätzlich 60 Minuten vor und 30 Minuten ab Sonnenuntergang. Matterport-Scan: 1–3 Stunden, abhängig von der Raumzahl. Video-Dreh: 3–5 Stunden inkl. Setup. Wir starten meist mit einem 10-minütigen Kurzrundgang.',
	},
	{
		id: 'lieferung-zeit',
		category: 'lieferung',
		question: 'Wann erhalte ich die fertigen Bilder?',
		answer:
			'Fotos liefern wir in der Regel innerhalb von 24–48 Stunden nach dem Shooting — fertig bearbeitet, im Web- und Druckformat. 360°-Rundgänge sind nach 24–48 Stunden online verfügbar. Videos brauchen 3–5 Tage Schnitt, dann erhalten Sie 1–2 Vorschauversionen vor der finalen Lieferung.',
	},
	{
		id: 'lieferung-formate',
		category: 'lieferung',
		question: 'In welchen Formaten und Auflösungen bekomme ich die Bilder?',
		answer:
			'Standard ist JPEG in zwei Varianten: hochauflösend für Druck und Exposé sowie web-optimiert (sRGB, lange Kante typisch 2400 px) für Portale und Galerien. Für Video gibt es 4K plus zugeschnittene Versionen für Social Media (16:9, 9:16, 1:1). Auf Wunsch liefern wir auch WebP oder RAW.',
	},
	{
		id: 'service-drohne',
		category: 'service',
		question: 'Wann sind Drohnenaufnahmen sinnvoll — und wann nicht?',
		answer:
			'Sinnvoll bei freistehenden Objekten, grossen Grundstücken, besonderer Lage oder zur Einordnung der Umgebung. Weniger sinnvoll bei städtischen Lagen mit Sichtbeschränkungen oder reinen Innen-Vermarktungen. Wir prüfen vor jedem Einsatz Flugzonen, Wetter und nötige Bewilligungen. Bei Mietobjekten holen wir die Einwilligung der Mieter ein.',
	},
	{
		id: 'service-matterport',
		category: 'service',
		question: 'Was bringt ein 360°-Rundgang konkret?',
		answer:
			'Interessenten verbringen 5–10× mehr Zeit mit einem Inserat, das einen virtuellen Rundgang enthält. Sie kommen besser vorbereitet zur Besichtigung — und mit ernster Kaufabsicht. Sie erhalten einen Link, eine einbettbare iframe für Ihre Website und eine Dollhouse-Übersicht fürs Inserat.',
	},
	{
		id: 'service-saison',
		category: 'service',
		question: 'Soll ich auf eine bestimmte Jahreszeit warten?',
		answer:
			'Authentisch zur aktuellen Saison ist immer richtig — Sommerbilder im Winter wirken unseriös. Bei kurzfristigem Verkauf fotografieren Sie jetzt. Bei längerer Planung lohnt sich die fotogenste Saison (Frühling für Gärten, Sommer für Pools, Herbst für Stimmung, Winter für helle Innenräume + Dämmerung). Wenn ein Objekt 2–3 Monate auf dem Markt ist, lohnt ein Neu-Shooting in der neuen Saison.',
	},
	{
		id: 'recht-personen',
		category: 'recht',
		question: 'Wie geht ihr mit Personen, Kennzeichen und Familienfotos um?',
		answer:
			'Wir vermeiden Personen, Kfz-Kennzeichen und persönliche Gegenstände aktiv im Bild. Familienfotos, Kunst mit erkennbaren Marken oder sensible Dokumente entfernen wir am besten vor dem Shooting — was übrig bleibt, retuschieren oder verpixeln wir in der Nachbearbeitung. Für Drohnenaufnahmen holen wir bei Bedarf Einwilligungen von Nachbarn ein.',
	},
	{
		id: 'preise-pakete',
		category: 'preise',
		question: 'Was kostet ein Shooting — gibt es Pakete?',
		answer:
			'Wir arbeiten mit transparenten Paketpreisen je nach Objektgrösse und Leistungsumfang. Eine Übersicht aller Pakete und Einzelleistungen finden Sie unter /preise/. Buchungen laufen direkt online mit fixem Termin. Bei besonderen Umfängen (z. B. Bauträger-Serien, mehrere Objekte) machen wir gerne ein massgeschneidertes Angebot.',
		answerHtml:
			'Wir arbeiten mit transparenten Paketpreisen je nach Objektgrösse und Leistungsumfang. Eine Übersicht aller Pakete und Einzelleistungen finden Sie unter <a href="/preise/">propus.ch/preise</a>. Buchungen laufen direkt online mit fixem Termin. Bei besonderen Umfängen (z. B. Bauträger-Serien, mehrere Objekte) machen wir gerne ein massgeschneidertes Angebot.',
	},
	{
		id: 'preise-anfahrt',
		category: 'preise',
		question: 'Kommt ihr in die ganze Schweiz?',
		answer:
			'Unser Schwerpunkt liegt in Zug und der Zentralschweiz, wir fahren aber regelmässig in alle Kantone. Für Termine ausserhalb der Region berechnen wir Anfahrt nach Aufwand — am einfachsten direkt im Buchungsdialog anfragen, dort sehen Sie alle Konditionen vor der Bestätigung.',
	},
	{
		id: 'ablauf-wetter',
		category: 'ablauf',
		question: 'Was passiert bei schlechtem Wetter?',
		answer:
			'Für Innenaufnahmen ist Wetter zweitrangig — wir arbeiten dann mit konstantem Tageslicht und ergänzendem Kunstlicht. Für Aussenaufnahmen, Drohne oder Dämmerungs-Shoots verschieben wir bei Regen, Sturm oder schlechter Sicht kostenfrei. Wir prüfen die Prognose am Vortag und melden uns proaktiv.',
	},
	{
		id: 'recht-nutzungsrechte',
		category: 'recht',
		question: 'Welche Nutzungsrechte habe ich an den Bildern?',
		answer:
			'Sie erhalten umfassende Nutzungsrechte für die Vermarktung der jeweiligen Immobilie — auf allen Portalen, in Ihrem Exposé, auf Ihrer Website und in Social-Media-Kanälen. Eine Weitergabe an Dritte (z. B. Bauträger an Käufer) klären wir individuell. Details stehen in unseren AGB.',
		answerHtml:
			'Sie erhalten umfassende Nutzungsrechte für die Vermarktung der jeweiligen Immobilie — auf allen Portalen, in Ihrem Exposé, auf Ihrer Website und in Social-Media-Kanälen. Eine Weitergabe an Dritte (z. B. Bauträger an Käufer) klären wir individuell. Details stehen in unseren <a href="/agb/">AGB</a>.',
	},
];

export const FAQS_BY_CATEGORY: ReadonlyArray<{
	key: FaqItem['category'];
	label: string;
	items: FaqItem[];
}> = (() => {
	const labelByKey: Record<FaqItem['category'], string> = {
		ablauf: 'Ablauf vor Ort',
		service: 'Leistungen',
		recht: 'Recht & Privatsphäre',
		preise: 'Preise & Buchung',
		lieferung: 'Lieferung & Formate',
	};
	const order: FaqItem['category'][] = ['ablauf', 'lieferung', 'service', 'preise', 'recht'];
	return order.map((key) => ({
		key,
		label: labelByKey[key],
		items: FAQS.filter((f) => f.category === key),
	}));
})();
