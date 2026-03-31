import {
	dedupeGoogleReviewsKeepFirst,
	reviewDedupeKey,
	type GoogleReviewEntry,
} from '../content/google-reviews';

/** Standort laut Google Maps (Propus GmbH, Zug) – für präzise Textsuche */
const MAP_CENTER = { latitude: 47.1566619, longitude: 8.5120229 } as const;
const RADIUS_M = 400;

const PLACES_V1 = 'https://places.googleapis.com/v1';

/** BCP-47: deutsche Oberfläche für Ortsnamen, Review-Zeilen („vor 3 Monaten“) und ggf. lokalisierte Texte */
const PLACES_LANGUAGE = 'de-CH';

type SearchTextResponse = {
	/** Ressourcenname, z. B. `places/ChIJ…` (für GET Place Details) */
	places?: Array<{ name?: string; id?: string; displayName?: { text: string } }>;
};

type PlaceDetailsResponse = {
	reviews?: Array<{
		/** Eindeutig pro Review, z. B. `places/…/reviews/…` */
		name?: string;
		rating?: number;
		/** Lokalisiert (z. B. de-CH) */
		text?: { text?: string } | string;
		/** Originalsprache – oft befüllt, wenn `text` leer ist */
		originalText?: { text?: string } | string;
		publishTime?: string | { seconds?: string | number; nanos?: number };
		relativePublishTimeDescription?: string;
		authorAttribution?: { displayName?: string };
	}>;
};

/** Wenn Google keinen öffentlichen Text liefert, trotzdem Karte anzeigen (5★). */
const REVIEW_TEXT_FALLBACK = 'Auszeichnung mit 5 Sternen auf Google Maps.';

function extractReviewText(t: unknown): string {
	if (typeof t === 'string') return t.trim();
	if (t && typeof t === 'object' && 'text' in t) {
		const txt = (t as { text?: string }).text;
		return (txt ?? '').trim();
	}
	return '';
}

/** RFC-3339-String oder protobuf-Timestamp-Objekt aus der API. */
function normalizePublishTime(v: unknown): string | undefined {
	if (v == null) return undefined;
	if (typeof v === 'string') {
		const x = v.trim();
		return x || undefined;
	}
	if (typeof v === 'object' && v !== null && 'seconds' in v) {
		const o = v as { seconds?: string | number; nanos?: number };
		const sec = typeof o.seconds === 'string' ? Number(o.seconds) : o.seconds;
		if (typeof sec === 'number' && !Number.isNaN(sec)) {
			const ms = sec * 1000 + Math.floor((o.nanos ?? 0) / 1e6);
			return new Date(ms).toISOString();
		}
	}
	return undefined;
}

function clampRating(n: number): GoogleReviewEntry['rating'] {
	const r = Math.round(Number(n));
	if (r < 1) return 1;
	if (r > 5) return 5;
	return r as GoogleReviewEntry['rating'];
}

/** Places liefert typischerweise nur wenige Reviews pro Antwort; Ziel ist bis zu 7 × 5 Sterne (mit Fallback kombinierbar). */
const MAX_REVIEWS = 7;

/** Pro Request: zwei sequenzielle Places-Calls ohne die Startseite ewig warten zu lassen. */
const PLACES_FETCH_MS = 2400;

/**
 * Lädt Reviews von Google Places (New), nur **5 Sterne**, bis zu {@link MAX_REVIEWS}.
 * Benötigt `GOOGLE_PLACES_API_KEY` (Cloud Console: „Places API (New)“ aktivieren, Abrechnung).
 */
export async function fetchGoogleReviewsFromPlaces(apiKey: string): Promise<GoogleReviewEntry[]> {
	const key = apiKey.trim();
	if (!key) return [];

	const searchRes = await fetch(`${PLACES_V1}/places:searchText`, {
		method: 'POST',
		signal: AbortSignal.timeout(PLACES_FETCH_MS),
		headers: {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': key,
			'X-Goog-FieldMask': 'places.name,places.displayName',
			'Accept-Language': `${PLACES_LANGUAGE},de;q=0.9`,
		},
		body: JSON.stringify({
			textQuery: 'Propus GmbH Zug Immobilienfotografie',
			languageCode: PLACES_LANGUAGE,
			regionCode: 'CH',
			locationBias: {
				circle: {
					center: MAP_CENTER,
					radius: RADIUS_M,
				},
			},
			maxResultCount: 3,
		}),
	});

	if (!searchRes.ok) {
		console.warn('[googlePlacesReviews] searchText failed:', searchRes.status, await searchRes.text());
		return [];
	}

	const searchJson = (await searchRes.json()) as SearchTextResponse;
	const placeResource = searchJson.places?.[0]?.name ?? searchJson.places?.[0]?.id;
	if (!placeResource) return [];

	const detailPath = encodeURI(placeResource);
	const detailUrl = `${PLACES_V1}/${detailPath}?languageCode=${encodeURIComponent(PLACES_LANGUAGE)}`;
	const detailRes = await fetch(detailUrl, {
		signal: AbortSignal.timeout(PLACES_FETCH_MS),
		headers: {
			'X-Goog-Api-Key': key,
			/** `reviews` liefert alle Review-Unterfelder inkl. `publishTime` (zuverlässiger als Einzelfelder). */
			'X-Goog-FieldMask': 'reviews,rating,userRatingCount,displayName',
			'Accept-Language': `${PLACES_LANGUAGE},de;q=0.9`,
		},
	});

	if (!detailRes.ok) {
		console.warn('[googlePlacesReviews] place details failed:', detailRes.status, await detailRes.text());
		return [];
	}

	const detail = (await detailRes.json()) as PlaceDetailsResponse;
	const raw = detail.reviews ?? [];

	const mapped: GoogleReviewEntry[] = raw
		.map((r) => {
			const rating = clampRating(r.rating ?? 5);
			if (rating !== 5) return null;
			const text =
				extractReviewText(r.text) ||
				extractReviewText(r.originalText) ||
				REVIEW_TEXT_FALLBACK;
			const publishTime = normalizePublishTime(r.publishTime);
			const resName = typeof r.name === 'string' ? r.name.trim() : '';
			return {
				authorName: (r.authorAttribution?.displayName ?? 'Google-Nutzer').trim() || 'Google-Nutzer',
				rating,
				text,
				relativeTime: r.relativePublishTimeDescription,
				...(publishTime ? { publishTime } : {}),
				...(resName ? { sourceReviewResource: resName } : {}),
			} satisfies GoogleReviewEntry;
		})
		.filter((x): x is GoogleReviewEntry => x !== null);

	/** Reihenfolge = Google „relevance“, erste je Autor/in bzw. je Review-Ressource. */
	const unique = dedupeGoogleReviewsKeepFirst(mapped);
	return unique.slice(0, MAX_REVIEWS);
}

function finalizeFallbackOnlyPool(pool: GoogleReviewEntry[]): GoogleReviewEntry[] {
	return dedupeGoogleReviewsKeepFirst(pool.filter((r) => r.rating === 5)).slice(0, MAX_REVIEWS);
}

/**
 * Startseite: **zuerst echte Google-Reviews** (Places API), optional mit Fallback-Einträgen auffüllen
 * (nur Autor:innen, die in der API noch nicht vorkamen). Max. {@link MAX_REVIEWS}.
 */
export async function resolveHomeReviews(
	apiKey: string | undefined,
	fallback: readonly GoogleReviewEntry[],
): Promise<readonly GoogleReviewEntry[]> {
	const manualFive = fallback.filter((r) => r.rating === 5);
	if (!apiKey?.trim()) {
		return finalizeFallbackOnlyPool([...manualFive]);
	}

	try {
		const live = await fetchGoogleReviewsFromPlaces(apiKey);
		const keys = new Set(live.map((r) => reviewDedupeKey(r)));
		const out: GoogleReviewEntry[] = [...live];
		for (const m of manualFive) {
			if (out.length >= MAX_REVIEWS) break;
			const k = reviewDedupeKey(m);
			if (keys.has(k)) continue;
			keys.add(k);
			out.push(m);
		}
		return out.length > 0 ? out : finalizeFallbackOnlyPool([...manualFive]);
	} catch (e) {
		console.warn('[googlePlacesReviews]', e);
		return finalizeFallbackOnlyPool([...manualFive]);
	}
}
