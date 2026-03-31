/**
 * Booking-Katalog: https://api-booking.propus.ch/api/catalog/products
 * URL überschreibbar mit PUBLIC_BOOKING_CATALOG_URL
 */

export const DEFAULT_BOOKING_CATALOG_URL =
	'https://api-booking.propus.ch/api/catalog/products';

const FETCH_TIMEOUT_MS = 12_000;

/** API-Antwort (relevante Felder; weitere werden ignoriert). */
type ApiRule = {
	rule_type: string;
	priority?: number;
	active?: boolean;
	config_json?: Record<string, unknown>;
};

type ApiProduct = {
	id?: string;
	code: string;
	name: string;
	kind: string;
	category_key: string;
	description?: string | null;
	active?: boolean;
	show_on_website?: boolean;
	sort_order?: number;
	rules?: ApiRule[];
};

type ApiCategory = {
	key: string;
	name: string;
	description?: string | null;
	kind_scope?: string;
	sort_order?: number;
	active?: boolean;
};

type ApiPackage = {
	key: string;
	categoryKey: string;
	sortOrder?: number;
	label: string;
	description?: string | null;
	price: number;
	pricingType?: string;
};

type ApiAddon = {
	id: string;
	pricingNote?: string | null;
};

type ApiPayload = {
	ok?: boolean;
	categories?: ApiCategory[];
	packages?: ApiPackage[];
	addons?: ApiAddon[];
	products?: ApiProduct[];
};

export type CatalogPackageCard = {
	key: string;
	label: string;
	subtitle: string;
	priceDisplay: string;
	featured: boolean;
	badge?: string;
};

export type CatalogProductRow = {
	code: string;
	name: string;
	priceDisplay: string;
};

export type CatalogAccordionSection = {
	key: string;
	name: string;
	description: string;
	sortOrder: number;
	products: CatalogProductRow[];
};

export type NormalizedCatalog = {
	packages: CatalogPackageCard[];
	sections: CatalogAccordionSection[];
};

export type CatalogLoadResult =
	| { ok: true; data: NormalizedCatalog }
	| { ok: false; error: string };

function catalogUrl(): string {
	const u =
		typeof import.meta.env.PUBLIC_BOOKING_CATALOG_URL === 'string'
			? import.meta.env.PUBLIC_BOOKING_CATALOG_URL.trim()
			: '';
	return u || DEFAULT_BOOKING_CATALOG_URL;
}

function pickRule(p: ApiProduct): ApiRule | undefined {
	const rules = (p.rules || []).filter((r) => r.active !== false);
	rules.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
	return rules[0];
}

function addonNoteForCode(code: string, addons: ApiAddon[]): string {
	const a = addons.find((x) => x.id === code);
	const n = a?.pricingNote;
	return typeof n === 'string' && n.trim() ? n.trim() : '';
}

/**
 * Wie „Camera Shooting“: eine Zeile pro Staffel (links Fläche, rechts Preis),
 * darunter eine Zeile wie Camera Shooting: links „+100 m²“, rechts Preis in Gold.
 */
function expandAreaTierToRows(productCode: string, cj: Record<string, unknown>): CatalogProductRow[] {
	const tiers = cj.tiers as { price?: number; maxArea?: number }[] | undefined;
	if (!Array.isArray(tiers) || tiers.length === 0) return [];

	const rows: CatalogProductRow[] = [];
	let rowIndex = 0;
	for (const tier of tiers.slice(0, 3)) {
		if (typeof tier.price !== 'number') continue;
		const label =
			typeof tier.maxArea === 'number'
				? `bis ${tier.maxArea} m²`
				: `Staffel ${rowIndex + 1}`;
		rows.push({
			code: `${productCode}__tier${rowIndex}`,
			name: label,
			priceDisplay: `${tier.price} CHF`,
		});
		rowIndex++;
	}

	const incArea = cj.incrementArea;
	const incPrice = cj.incrementPrice;
	if (typeof incArea === 'number' && typeof incPrice === 'number') {
		rows.push({
			code: `${productCode}__increment`,
			name: `+${incArea} m²`,
			priceDisplay: `${incPrice} CHF`,
		});
	}

	return rows;
}

function rowsForProduct(p: ApiProduct, addons: ApiAddon[]): CatalogProductRow[] {
	const rule = pickRule(p);
	const cfg = rule?.config_json;
	if (rule?.rule_type === 'area_tier' && cfg) {
		const expanded = expandAreaTierToRows(p.code, cfg);
		if (expanded.length > 0) return expanded;
	}

	return [
		{
			code: p.code,
			name: p.name || p.code,
			priceDisplay: formatProductPrice(p, addons),
		},
	];
}

function formatProductPrice(p: ApiProduct, addons: ApiAddon[]): string {
	const rule = pickRule(p);
	const cj = rule?.config_json;

	if (rule && cj && rule.rule_type === 'area_tier') {
		return 'Staffelpreis';
	}

	const note = addonNoteForCode(p.code, addons);
	if (note) return note;

	if (!rule?.config_json) return '—';

	const t = rule.rule_type;
	const cfg = rule.config_json;

	if (t === 'fixed' && typeof cfg.price === 'number') {
		return `${cfg.price} CHF`;
	}
	if (t === 'per_floor' && typeof cfg.unitPrice === 'number') {
		return `ab ${cfg.unitPrice} CHF / Stockwerk`;
	}
	if (t === 'per_room' && typeof cfg.unitPrice === 'number') {
		return `ab ${cfg.unitPrice} CHF / Raum`;
	}

	return 'auf Anfrage';
}

const FEATURED_PACKAGE_KEY = 'bestseller';
const FEATURED_BADGE = 'Am beliebtesten';

/** Highlight-Paket visuell in die Mitte der Reihe legen (z. B. drei Karten). */
function reorderFeaturedToCenter(packages: CatalogPackageCard[]): CatalogPackageCard[] {
	const n = packages.length;
	if (n < 2) return packages;
	const fi = packages.findIndex((c) => c.featured);
	if (fi < 0) return packages;
	const target = Math.floor(n / 2);
	if (fi === target) return packages;
	const next = [...packages];
	const [card] = next.splice(fi, 1);
	next.splice(target, 0, card);
	return next;
}

/** Deutsche Anzeigenamen nach API-`category.key`; Keys und Buchungslogik bleiben unverändert. */
const CATEGORY_TITLE_DE: Record<string, string> = {
	camera: 'Bodenfotos',
	dronePhoto: 'Luftaufnahmen',
	tour: 'Virtual 360°-Tour',
	keypickup: 'Schlüsselabholung',
	floorplans: 'Grundrisse',
	groundVideo: 'Bodenvideo',
	droneVideo: 'Drohnenvideo',
	staging: 'Staging',
	express: 'Express',
	package: 'Pakete',
};

function categoryDisplayTitleDe(key: string, apiFallback: string): string {
	return CATEGORY_TITLE_DE[key] ?? apiFallback;
}

/** Zusatzprodukt je Einheit (Website-Preisliste; Buchung nutzt weiter API-Produkte). */
const EXTRA_PHOTO_UNIT_PRICE_CHF = 9;

function extraUnitRowForCategory(catKey: string): CatalogProductRow | null {
	if (catKey === 'camera') {
		return {
			code: '__website_extra_bodenfoto',
			name: '+1 Bodenfoto',
			priceDisplay: `${EXTRA_PHOTO_UNIT_PRICE_CHF} CHF`,
		};
	}
	if (catKey === 'dronePhoto') {
		return {
			code: '__website_extra_luftaufnahme',
			name: '+1 Luftaufnahme',
			priceDisplay: `${EXTRA_PHOTO_UNIT_PRICE_CHF} CHF`,
		};
	}
	return null;
}

function isRecord(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null;
}

function parsePayload(raw: unknown): ApiPayload | null {
	if (!isRecord(raw)) return null;
	return raw as ApiPayload;
}

/**
 * Paket-Beschreibungen aus der API können HTML enthalten (`<p>`, `<br>`).
 * Für die Website: reiner Text mit Zeilenumbrüchen je Zeile/Listeneintrag.
 */
function packageDescriptionToPlainLines(raw: string): string {
	const s = raw.trim();
	if (!s) return '';
	let t = s
		.replace(/<\s*br\s*\/?>/gi, '\n')
		.replace(/<\s*\/\s*p\s*>/gi, '\n')
		.replace(/<\s*p\b[^>]*>/gi, '\n');
	t = t.replace(/<[^>]+>/g, '');
	t = t
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
	return t
		.split(/\n+/)
		.map((line) => line.trim())
		.filter(Boolean)
		.join('\n');
}

export function normalizeCatalogPayload(raw: unknown): NormalizedCatalog | null {
	const data = parsePayload(raw);
	if (!data?.categories || !Array.isArray(data.packages) || !Array.isArray(data.products)) {
		return null;
	}

	const addons = Array.isArray(data.addons) ? data.addons : [];

	const categories = data.categories
		.filter((c) => c && c.active !== false)
		.slice()
		.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

	const packagesSorted = data.packages
		.filter((p) => p && p.key && p.label)
		.slice()
		.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

	const productsByCode = new Map<string, ApiProduct>();
	for (const p of data.products) {
		if (p?.code) productsByCode.set(p.code, p);
	}

	const packageCards: CatalogPackageCard[] = packagesSorted.map((pkg) => {
		const prod = productsByCode.get(pkg.key);
		const desc =
			(typeof pkg.description === 'string' && pkg.description.trim()) ||
			(typeof prod?.description === 'string' && prod.description.trim()) ||
			'';
		const subtitle = packageDescriptionToPlainLines(desc);
		const featured = pkg.key === FEATURED_PACKAGE_KEY;
		return {
			key: pkg.key,
			label: pkg.label,
			subtitle,
			priceDisplay: `${pkg.price} CHF`,
			featured,
			badge: featured ? FEATURED_BADGE : undefined,
		};
	});

	const listProducts = data.products.filter(
		(p) =>
			p &&
			p.kind !== 'package' &&
			p.active !== false &&
			p.show_on_website !== false &&
			p.category_key &&
			p.category_key !== 'package',
	);

	const byCategory = new Map<string, ApiProduct[]>();
	for (const p of listProducts) {
		const k = p.category_key;
		if (!byCategory.has(k)) byCategory.set(k, []);
		byCategory.get(k)!.push(p);
	}

	const sections: CatalogAccordionSection[] = [];

	for (const cat of categories) {
		if (cat.key === 'package') continue;
		const prods = byCategory.get(cat.key);
		if (!prods?.length) continue;

		prods.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

		const rows: CatalogProductRow[] = prods.flatMap((p) => rowsForProduct(p, addons));
		const extra = extraUnitRowForCategory(cat.key);
		if (extra) rows.push(extra);

		sections.push({
			key: cat.key,
			name: categoryDisplayTitleDe(cat.key, cat.name || cat.key),
			description: typeof cat.description === 'string' ? cat.description.trim() : '',
			sortOrder: cat.sort_order ?? 0,
			products: rows,
		});
	}

	sections.sort((a, b) => a.sortOrder - b.sortOrder);

	return { packages: reorderFeaturedToCenter(packageCards), sections };
}

export async function loadBookingCatalog(): Promise<CatalogLoadResult> {
	const url = catalogUrl();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: 'application/json' },
		});
		clearTimeout(timer);

		if (!res.ok) {
			return { ok: false, error: `Der Katalog konnte nicht geladen werden (HTTP ${res.status}).` };
		}

		let json: unknown;
		try {
			json = await res.json();
		} catch {
			return { ok: false, error: 'Die API-Antwort war kein gültiges JSON.' };
		}

		const parsed = parsePayload(json);
		if (!parsed?.ok) {
			return { ok: false, error: 'Die API meldet einen Fehler oder liefert keine Daten.' };
		}

		const data = normalizeCatalogPayload(json);
		if (!data) {
			return { ok: false, error: 'Die Katalog-Struktur ist unvollständig oder hat sich geändert.' };
		}

		return { ok: true, data };
	} catch (e) {
		clearTimeout(timer);
		if (e instanceof Error && e.name === 'AbortError') {
			return { ok: false, error: 'Zeitüberschreitung beim Laden des Katalogs.' };
		}
		return {
			ok: false,
			error: e instanceof Error ? e.message : 'Unbekannter Fehler beim Laden des Katalogs.',
		};
	}
}
