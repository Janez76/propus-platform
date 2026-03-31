/**
 * Normalisierung des Propus-Booking-Katalogs (api-booking.propus.ch).
 * Parität zur Buchungsoberfläche booking.propus.ch.
 */

export const BOOKING_CATALOG_URL = 'https://api-booking.propus.ch/api/catalog/products';

export type BookingCategory = {
	key: string;
	name: string;
	description?: string;
	kind_scope?: string;
	sort_order?: number;
	active?: boolean;
	show_in_frontpanel?: boolean;
};

export type BookingPackage = {
	key: string;
	categoryKey?: string;
	sortOrder?: number;
	label: string;
	description?: string;
	price?: number;
	pricingType?: string;
};

export type BookingAddon = {
	id: string;
	group?: string;
	categoryKey?: string;
	sortOrder?: number;
	label: string;
	pricingType?: string;
	price?: number;
	unitPrice?: number;
	pricingNote?: string;
};

export type BookingProductRule = {
	active?: boolean;
	rule_type?: string;
	config_json?: { price?: number; unitPrice?: number };
};

export type BookingProduct = {
	code?: string;
	name?: string;
	kind?: string;
	description?: string;
	category_key?: string;
	sort_order?: number;
	active?: boolean;
	show_on_website?: boolean;
	rules?: BookingProductRule[];
};

export type BookingCatalogResponse = {
	ok?: boolean;
	categories?: BookingCategory[];
	packages?: BookingPackage[];
	addons?: BookingAddon[];
	products?: BookingProduct[];
};

export type NormalizedPackage = {
	key: string;
	label: string;
	description: string;
	priceDisplay: string;
	featured: boolean;
};

export type NormalizedAddonLine = {
	title: string;
	description: string;
	priceDisplay: string;
	sortOrder: number;
};

export type NormalizedAddonCategory = {
	key: string;
	name: string;
	items: NormalizedAddonLine[];
};

/** Kurztexte / „Beliebt“ wenn die API keine Beschreibung liefert. */
export const PACKAGE_FALLBACK_COPY: Record<string, { description: string; featured?: boolean }> = {
	bestseller: {
		description: 'Solide Grundausstattung für kompakte Objekte und schnelle Listings.',
	},
	cinematic: {
		description: 'Mehr Aufnahmen und Stimmung – häufiges Setup für repräsentative Liegenschaften.',
		featured: true,
	},
	fullview: {
		description: 'Maximaler Umfang für herausragende Objekte und markante Auftritte.',
	},
};

const chf = new Intl.NumberFormat('de-CH', {
	style: 'currency',
	currency: 'CHF',
	maximumFractionDigits: 0,
});

function firstRulePrice(rules: BookingProductRule[] | undefined): { price?: number; unitPrice?: number; ruleType?: string } {
	if (!Array.isArray(rules)) return {};
	for (const r of rules) {
		if (r && r.active === false) continue;
		const cfg = r?.config_json;
		return {
			price: typeof cfg?.price === 'number' ? cfg.price : undefined,
			unitPrice: typeof cfg?.unitPrice === 'number' ? cfg.unitPrice : undefined,
			ruleType: r?.rule_type,
		};
	}
	return {};
}

export function formatPackagePrice(price: number | undefined, pricingType: string | undefined): string {
	const pt = pricingType || 'fixed';
	if (price === undefined || price === null || price <= 0) return 'auf Anfrage';
	if (pt === 'fixed') return chf.format(price);
	return `ab ${chf.format(price)}`;
}

export function formatAddonPriceLine(a: {
	price?: number;
	unitPrice?: number;
	pricingType?: string;
	pricingNote?: string;
}): string {
	if (a.pricingNote && String(a.pricingNote).trim()) return String(a.pricingNote).trim();
	const pt = a.pricingType || 'fixed';
	if (pt === 'perFloor' && typeof a.unitPrice === 'number') {
		return `${chf.format(a.unitPrice)} pro Geschoss`;
	}
	if (pt === 'perRoom' && typeof a.unitPrice === 'number') {
		return `${chf.format(a.unitPrice)} pro Raum`;
	}
	if (pt === 'byArea') {
		if (a.price && a.price > 0) return `ab ${chf.format(a.price)}`;
		return 'nach Fläche';
	}
	return formatPackagePrice(a.price, pt);
}

function productByCode(products: BookingProduct[] | undefined, code: string): BookingProduct | undefined {
	if (!products) return undefined;
	return products.find((p) => p && p.code === code);
}

type LineBuilder = {
	code: string;
	categoryKey: string;
	sortOrder: number;
	title: string;
	description: string;
	priceDisplay: string;
};

/**
 * Eine Zeile pro Produktcode; Preis aus rules falls addons[] unvollständig.
 */
function buildAddonLines(data: BookingCatalogResponse): LineBuilder[] {
	const addonIds = new Set((data.addons || []).map((a) => a.id).filter(Boolean));
	const byCode = new Map<string, LineBuilder>();

	function setLine(b: LineBuilder) {
		byCode.set(b.code, b);
	}

	if (Array.isArray(data.addons)) {
		for (const a of data.addons) {
			if (!a?.id) continue;
			const prod = productByCode(data.products, a.id);
			if (prod?.show_on_website === false) continue;
			const desc = (prod?.description || '').trim();
			setLine({
				code: a.id,
				categoryKey: a.categoryKey || 'uncategorized',
				sortOrder: a.sortOrder ?? prod?.sort_order ?? 0,
				title: (a.label || prod?.name || a.id).trim(),
				description: desc,
				priceDisplay: formatAddonPriceLine({
					price: a.price,
					unitPrice: a.unitPrice,
					pricingType: a.pricingType,
					pricingNote: a.pricingNote,
				}),
			});
		}
	}

	if (Array.isArray(data.products)) {
		for (const p of data.products) {
			if (!p || p.kind !== 'addon' || p.active === false || p.show_on_website === false) continue;
			const code = p.code || '';
			if (!code) continue;
			const { price, unitPrice, ruleType } = firstRulePrice(p.rules);
			let pricingType = 'fixed';
			if (ruleType === 'per_room') pricingType = 'perRoom';
			else if (ruleType === 'per_floor') pricingType = 'perFloor';
			else if (ruleType === 'area_tier') pricingType = 'byArea';

			const fromRules = formatAddonPriceLine({
				price,
				unitPrice,
				pricingType,
				pricingNote: undefined,
			});

			const existing = byCode.get(code);
			if (existing) {
				setLine({
					...existing,
					title: existing.title || (p.name || code).trim(),
					description: existing.description || (p.description || '').trim(),
					priceDisplay: existing.priceDisplay || fromRules,
					sortOrder: existing.sortOrder || p.sort_order || 0,
					categoryKey: existing.categoryKey || p.category_key || 'uncategorized',
				});
			} else if (!addonIds.has(code)) {
				setLine({
					code,
					categoryKey: p.category_key || 'uncategorized',
					sortOrder: p.sort_order ?? 0,
					title: (p.name || code).trim(),
					description: (p.description || '').trim(),
					priceDisplay: fromRules,
				});
			}
		}
	}

	return [...byCode.values()];
}

export function normalizePackagesFromCatalog(data: BookingCatalogResponse): NormalizedPackage[] {
	const list: NormalizedPackage[] = [];

	if (Array.isArray(data.packages)) {
		for (const p of data.packages) {
			if (!p?.key || !p.label) continue;
			const fb = PACKAGE_FALLBACK_COPY[p.key] || { description: '', featured: false };
			const apiDesc = (p.description || '').trim();
			list.push({
				key: p.key,
				label: humanizePackageLabel(p.label),
				description: apiDesc || fb.description,
				priceDisplay: formatPackagePrice(p.price, p.pricingType),
				featured: Boolean(fb.featured),
			});
		}
		list.sort((a, b) => {
			const sa = data.packages!.find((x) => x.key === a.key)?.sortOrder ?? 0;
			const sb = data.packages!.find((x) => x.key === b.key)?.sortOrder ?? 0;
			return sa - sb;
		});
		return list;
	}

	/* Fallback: Pakete nur in products */
	if (Array.isArray(data.products)) {
		const pkgs = data.products.filter((p) => p && p.kind === 'package' && p.active !== false);
		for (const p of pkgs) {
			const key = p.code || '';
			if (!key) continue;
			const { price } = firstRulePrice(p.rules);
			const fb = PACKAGE_FALLBACK_COPY[key] || { description: '', featured: false };
			const apiDesc = (p.description || '').trim();
			list.push({
				key,
				label: humanizePackageLabel(p.name || key),
				description: apiDesc || fb.description,
				priceDisplay: formatPackagePrice(price, price && price > 0 ? 'fixed' : 'other'),
				featured: Boolean(fb.featured),
			});
		}
		list.sort((a, b) => {
			const sa = data.products!.find((x) => x.code === a.key)?.sort_order ?? 0;
			const sb = data.products!.find((x) => x.code === b.key)?.sort_order ?? 0;
			return sa - sb;
		});
	}

	return list;
}

function humanizePackageLabel(label: string): string {
	const t = label.trim();
	if (!t) return t;
	return t
		.split(/\s+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(' ');
}

/**
 * Kategorien wie in der Buchung: nur aktive Add-on-Kategorien mit Frontpanel,
 * sortiert wie sort_order. Leere Kategorien entfallen.
 */
export function groupAddonCategories(data: BookingCatalogResponse): NormalizedAddonCategory[] {
	const lines = buildAddonLines(data);
	const categories = (data.categories || [])
		.filter(
			(c) =>
				c &&
				c.active !== false &&
				c.kind_scope === 'addon' &&
				c.show_in_frontpanel !== false &&
				c.key &&
				c.key !== 'package',
		)
		.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

	const catKeys = new Set(categories.map((c) => c.key));
	const itemsByCat = new Map<string, NormalizedAddonLine[]>();

	for (const row of lines) {
		if (!catKeys.has(row.categoryKey)) continue;
		const item: NormalizedAddonLine = {
			title: row.title,
			description: row.description,
			priceDisplay: row.priceDisplay,
			sortOrder: row.sortOrder,
		};
		if (!itemsByCat.has(row.categoryKey)) itemsByCat.set(row.categoryKey, []);
		itemsByCat.get(row.categoryKey)!.push(item);
	}

	const out: NormalizedAddonCategory[] = [];
	for (const c of categories) {
		const raw = (itemsByCat.get(c.key) || []).sort((a, b) => a.sortOrder - b.sortOrder);
		const seen = new Set<string>();
		const items = raw.filter((it) => {
			const k = `${it.title}|${it.priceDisplay}`;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		});
		if (!items.length) continue;
		const name = (c.name || c.key).trim();
		if (c.key === 'test' || /^tes1?$/i.test(name)) continue;
		out.push({ key: c.key, name, items });
	}

	return out;
}
