/**
 * Team und Texte für die Über-uns-Seite (Modals).
 * Bilder: Platzhalter Unsplash – durch echte Porträts ersetzen.
 */
export type TeamMember = {
	id: string;
	name: string;
	role: string;
	email: string;
	/** Absätze für „Über mich“ im Modal */
	bio: readonly string[];
	imageSrc?: string;
	imageAlt?: string;
	width?: number;
	height?: number;
};

export const teamMembers: readonly TeamMember[] = [
	{
		id: 'janez-smirmaul',
		name: 'Janez Smirmaul',
		role: 'Founder / Photographer',
		email: 'janez.smirmaul@propus.ch',
		bio: [
			'Ich habe Propus aus der Überzeugung gegründet, dass visuelle Vermarktung ruhig, präzise und ehrlich sein kann – ohne laute Effekte.',
			'Als Fotograf liegt mein Schwerpunkt auf Architektur und Lichtführung; ich begleite Projekte von der ersten Besichtigung bis zur Auslieferung.',
			'Am meisten schätze ich das direkte Gespräch mit Kundinnen und Kunden – wenn am Ende klar ist, was die Immobilie ausmacht, sind die Bilder fast schon da.',
		],
		imageSrc: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=800&q=85',
		imageAlt: 'Janez Smirmaul',
		width: 800,
		height: 1000,
	},
	{
		id: 'ivan-mijajlovic',
		name: 'Ivan Mijajlovic',
		role: 'Photographer | Developer',
		email: 'ivan.mijajlovic@propus.ch',
		bio: [
			'Als Mitgründer verbinde ich Aufnahme, Bildsprache und Gestaltung – damit Exposés, Web und Print wie aus einem Guss wirken.',
			'Neben der Kamera kümmere ich mich um visuelle Konzepte und die feine Abstimmung zwischen Stills und Bewegtbild.',
			'Mir ist wichtig, dass sich Interessentinnen und Interessenten im Bild zurechtfinden – ohne Ablenkung von der Architektur.',
		],
		imageSrc: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&q=85',
		imageAlt: 'Ivan Mijajlovic',
		width: 800,
		height: 1000,
	},
	{
		id: 'marijana-mijajlovic',
		name: 'Marijana Mijajlovic',
		role: 'Virtual Specialist',
		email: 'marijana.mijajlovic@propus.ch',
		bio: [
			'Ich kümmere mich um 360°-Rundgänge und virtuelle Formate – strukturiert, verständlich und technisch sauber umgesetzt.',
			'Mein Hintergrund ist die Schnittstelle zwischen Darstellung und Nutzerführung: Orientierung soll leichtfallen, nicht überfordern.',
			'Ich mag die Arbeit, weil ein gut gebauter Rundgang vor Ort viel von dem ersetzt, was sonst erst beim Besichtigungstermin klar wird.',
		],
		imageSrc: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=85',
		imageAlt: 'Marijana Mijajlovic',
		width: 800,
		height: 1000,
	},
	{
		id: 'aleksandar-kuresevic',
		name: 'Aleksandar Kurešević',
		role: 'Architect & Designer',
		email: 'aleksandar.kuresevic@propus.ch',
		bio: [
			'Als Architekt und Designer übersetze ich Pläne und Ideen in klare Visualisierungen – für Neubau, Umbau und Vorvermarktung.',
			'Ich achte auf Proportionen, Materialität und Licht, damit Renderings nah an der späteren Realität bleiben.',
			'Die Zusammenarbeit mit dem Fototeam hilft mir, Stil und Farbwelt über alle Medien hinweg stimmig zu halten.',
		],
		imageSrc: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=85',
		imageAlt: 'Aleksandar Kurešević',
		width: 800,
		height: 800,
	},
	{
		id: 'maher-azizi',
		name: 'Maher Azizi',
		role: 'Photographer | Videographer',
		email: 'maher.azizi@propus.ch',
		bio: [
			'Ich arbeite an der Schnittstelle von Stills und Bewegtbild – damit Ihre Immobilie sowohl in Bildern als auch in kurzen Filmen stimmig wirkt.',
			'Ob statische Raumaufnahmen oder ruhige Kamerafahrten: ich achte auf Licht, Tempo und einen klaren roten Faden.',
			'Mir liegt daran, dass Video und Fotografie zusammenpassen – gleiche Atmosphäre, gleiche Qualität, bereit für Web und Social Media.',
		],
		imageSrc: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=85',
		imageAlt: 'Maher Azizi',
		width: 800,
		height: 1000,
	},
	{
		id: 'danijel-randjelovic',
		name: 'Danijel Randjelovic',
		role: 'Backoffice | Marketing',
		email: 'danijel.randjelovic@propus.ch',
		bio: [
			'Ich bin die Schnittstelle zwischen Anfrage und Team – ob erste Orientierung, Terminabstimmung oder Nachfassen: ich sorge dafür, dass Sie schnell eine klare Antwort erhalten.',
			'Im Marketing halte ich unsere Auftritte und Botschaften konsistent – von Social Media bis zu kleinen Kampagnen, immer im ruhigen Propus-Ton.',
			'Mir liegt daran, dass sich Kundinnen und Kunden gut aufgehoben fühlen – im Backoffice heisst das für mich zuhören, strukturieren und die richtigen Ansprechpartner verbinden.',
		],
		imageSrc: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=800&q=85',
		imageAlt: 'Danijel Randjelovic',
		width: 800,
		height: 800,
	},
] as const;

export type CompanyStory = {
	title: string;
	eyebrow: string;
	paragraphs: readonly string[];
};

export const companyStory: CompanyStory = {
	eyebrow: 'Propus',
	title: 'Unsere Geschichte',
	paragraphs: [
		'Die Propus GmbH ist ein familiengeführtes Unternehmen mit Fokus auf hochwertige visuelle Immobilienvermarktung. Mit Sitz in Zug und weiteren Standorten sind wir schweizweit im Einsatz.',
		'Wir verbinden bewährte Handwerkstechnik mit modernen Werkzeugen – von Fotografie und Drohnenaufnahmen über 360°-Touren bis zu fotorealistischen Visualisierungen.',
		'Zuverlässigkeit, Qualität und persönliche Betreuung sind für uns keine Schlagworte, sondern der Massstab im Alltag. Mit Propus soll jede Immobilie klar und überzeugend erlebbar werden.',
	],
};

/** Hinter-den-Kulissen-Bild (anklickbar → Firmengeschichte). */
export const behindTheScenesImage = {
	src: 'https://images.unsplash.com/photo-1600585154084-4e5fe7c39198?w=1920&q=88',
	alt: 'Architektonisch anspruchsvoller Wohnraum in warmem Licht',
	width: 1920,
	height: 1280,
} as const;
