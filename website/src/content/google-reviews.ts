/**
 * Google-Bewertungen – **Quelle ist die Places API (New)** (`GOOGLE_PLACES_API_KEY` in `.env`).
 *
 * `googleReviews` ist nur **Notfall-Fallback** ohne API (z. B. lokaler Build). Einträge nur aus dem
 * echten Google-Unternehmensprofil übernehmen, keine erfundenen Texte.
 */
export type GoogleReviewEntry = {
	readonly authorName: string;
	readonly rating: 1 | 2 | 3 | 4 | 5;
	/** Kurzer Auszug; bei Bedarf mit … enden */
	readonly text: string;
	/** Relativ zu „jetzt“, z. B. „vor 2 Monaten“ (Google). */
	readonly relativeTime?: string;
	/**
	 * ISO-8601 / RFC 3339 von der Places API – für Sortierung „neueste zuerst“.
	 * Fallback-Einträge ohne API: weglassen (rutschen ans Ende der Liste).
	 */
	readonly publishTime?: string;
	/**
	 * Places API: eindeutiger Ressourcenname des Reviews (Deduplizierung, wenn der Autor-Name fehlt).
	 */
	readonly sourceReviewResource?: string;
};

const DAY_MS = 86400000;

/**
 * Grobe Datumsschätzung aus Googles relativer Zeit (de/en), wenn kein `publishTime` da ist.
 * Rückgabe: ungefähre Publish-Zeit in ms (jünger = größerer Wert).
 */
function approxMsFromRelativeTime(rel?: string): number {
	if (!rel?.trim()) return 0;
	const s = rel.trim().toLowerCase();
	const now = Date.now();

	const tryMatch = (re: RegExp, msPerUnit: number): number | null => {
		const m = s.match(re);
		if (!m) return null;
		let n: number;
		if (m[1] === 'einem' || m[1] === 'einer' || m[1] === 'a' || m[1] === 'an') n = 1;
		else n = parseInt(m[1], 10);
		if (Number.isNaN(n) || n < 0) return null;
		return now - n * msPerUnit;
	};

	return (
		tryMatch(/vor\s+(\d+)\s+stunden?/, 3600000) ??
		tryMatch(/vor\s+(\d+)\s+tagen?/, DAY_MS) ??
		tryMatch(/vor\s+(einem|1)\s+tag/, DAY_MS) ??
		tryMatch(/vor\s+(\d+)\s+wochen?/, 7 * DAY_MS) ??
		tryMatch(/vor\s+(einer|einem|1)\s+woche/, 7 * DAY_MS) ??
		tryMatch(/vor\s+(\d+)\s+monaten?/, 30 * DAY_MS) ??
		tryMatch(/vor\s+(einem|1)\s+monat/, 30 * DAY_MS) ??
		tryMatch(/vor\s+(\d+)\s+jahren?/, 365.25 * DAY_MS) ??
		tryMatch(/vor\s+(einem|1)\s+jahr/, 365.25 * DAY_MS) ??
		tryMatch(/(\d+)\s+hours?\s+ago/, 3600000) ??
		tryMatch(/(\d+)\s+days?\s+ago/, DAY_MS) ??
		tryMatch(/(\d+)\s+weeks?\s+ago/, 7 * DAY_MS) ??
		tryMatch(/(\d+)\s+months?\s+ago/, 30 * DAY_MS) ??
		tryMatch(/(\d+)\s+years?\s+ago/, 365.25 * DAY_MS) ??
		(() => {
			const mDay = s.match(/a\s+(day|week|month|year)\s+ago/);
			if (!mDay) return null;
			const u = mDay[1];
			const mult =
				u === 'day' ? DAY_MS : u === 'week' ? 7 * DAY_MS : u === 'month' ? 30 * DAY_MS : 365.25 * DAY_MS;
			return now - mult;
		})() ??
		0
	);
}

/** Für Sortierung „neueste zuerst“: ISO-Zeit, sonst relative Zeit, sonst 0. */
function reviewPublishMs(r: GoogleReviewEntry): number {
	const raw = r.publishTime?.trim();
	if (raw) {
		const n = Date.parse(raw);
		if (!Number.isNaN(n)) return n;
	}
	const approx = approxMsFromRelativeTime(r.relativeTime);
	return approx > 0 ? approx : 0;
}

function reviewTextLen(r: GoogleReviewEntry): number {
	return r.text.trim().length;
}

/** Normalisierter Autor:innen-Schlüssel (Deduplizierung, case-insensitive). */
export function normalizeReviewAuthorKey(authorName: string): string {
	return authorName.trim().toLowerCase().replace(/\s+/g, ' ');
}

const GENERIC_AUTHOR_KEYS = new Set([
	'',
	'google nutzer',
	'google user',
	'anonymous',
]);

function isGenericReviewAuthorName(authorName: string): boolean {
	return GENERIC_AUTHOR_KEYS.has(normalizeReviewAuthorKey(authorName));
}

/**
 * Ein Schlüssel pro „logischer“ Bewertung: echte Namen nach Person;
 * generische Platzhalter (z. B. mehrere „Google-Nutzer“ von der API) nach Zeit/Text unterscheiden.
 */
export function reviewDedupeKey(r: GoogleReviewEntry): string {
	if (!isGenericReviewAuthorName(r.authorName)) {
		return normalizeReviewAuthorKey(r.authorName);
	}
	const res = (r.sourceReviewResource ?? '').trim();
	if (res) return `__res__:${res}`;
	const pt = (r.publishTime ?? '').trim();
	if (pt) return `__generic__:${pt}`;
	const rel = (r.relativeTime ?? '').trim();
	if (rel) return `__generic__:${rel}`;
	const snippet = r.text.trim().slice(0, 96);
	return `__generic__:${snippet.length}:${snippet}`;
}

/**
 * Erste Bewertung pro Dedupe-Key behalten – **Reihenfolge bleibt** (z. B. Relevanz-Reihenfolge der Places API).
 */
export function dedupeGoogleReviewsKeepFirst(list: readonly GoogleReviewEntry[]): GoogleReviewEntry[] {
	const out: GoogleReviewEntry[] = [];
	const seen = new Set<string>();
	for (const r of list) {
		if (r.rating !== 5) continue;
		const k = reviewDedupeKey(r);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(r);
	}
	return out;
}

/**
 * Pro Person nur eine Bewertung: bei mehreren Einträgen bleibt der **längere** Text;
 * bei gleicher Länge das **neuere** (nach `publishTime` / relativer Zeit).
 */
export function dedupeGoogleReviewsByAuthorPreferLonger(list: readonly GoogleReviewEntry[]): GoogleReviewEntry[] {
	const byAuthor = new Map<string, GoogleReviewEntry>();
	for (const r of list) {
		const k = reviewDedupeKey(r);
		const prev = byAuthor.get(k);
		if (!prev) {
			byAuthor.set(k, r);
			continue;
		}
		const lenDiff = reviewTextLen(r) - reviewTextLen(prev);
		if (lenDiff > 0) byAuthor.set(k, r);
		else if (lenDiff === 0 && reviewPublishMs(r) > reviewPublishMs(prev)) byAuthor.set(k, r);
	}
	return Array.from(byAuthor.values());
}

/**
 * „Beste“ für die Startseite: längere Texte zuerst (aussagekräftiger), bei Gleichstand neuer.
 */
export function sortGoogleReviewsBestForHome(list: readonly GoogleReviewEntry[]): GoogleReviewEntry[] {
	return [...list].sort((a, b) => {
		const lenDiff = reviewTextLen(b) - reviewTextLen(a);
		if (lenDiff !== 0) return lenDiff;
		return reviewPublishMs(b) - reviewPublishMs(a);
	});
}

export const googleReviewsSectionCopy = {
	eyebrow: 'Rezensionen',
	title: 'Stimmen von Kunden.',
	intro: 'Echte Rückmeldungen von Kundinnen und Kunden.',
	/** Link unter dem Grid (Ziel: Google-Maps-Profil). */
	linkLabel: 'Alle Bewertungen ansehen',
} as const;

/** Direkter Link zum Google-Maps-Eintrag (Bewertungen dort einsehbar). */
export const googleReviewsListingUrl =
	'https://www.google.com/maps/place/Propus+GmbH/@47.1566619,8.5120229,17z/data=!3m1!4b1!4m6!3m5!1s0x2b8a42f6d37b7209:0xa6eb24a675463924!8m2!3d47.1566619!4d8.5120229!16s%2Fg%2F11kt4v94qb' as const;

/**
 * Optional: nur wenn **kein** `GOOGLE_PLACES_API_KEY` gesetzt ist (z. B. lokaler Build).
 * Live-Betrieb: leer lassen – Bewertungen kommen ausschließlich von Google.
 */
export const googleReviews: readonly GoogleReviewEntry[] = [];
