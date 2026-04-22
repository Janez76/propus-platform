/**
 * Katalog (aligned mit booking/pricing.config.js) für Admin-Bearbeitung.
 */
export const PACKAGE_CATALOG: { key: string; label: string; price: number }[] = [
  { key: "cinematic", label: "Cinematic", price: 549 },
  { key: "bestseller", label: "Bestseller", price: 399 },
  { key: "fullview", label: "Fullview", price: 649 },
];

export type CatalogAddon = {
  id: string;
  label: string;
  price: number;
  group?: string;
  defaultQty?: number;
};

const ADDON_LIST: CatalogAddon[] = [
  { id: "camera_foto10", group: "Zusatz Foto", label: "Bodenfotos 10", price: 229, defaultQty: 1 },
  { id: "camera_foto20", group: "Zusatz Foto", label: "Bodenfotos 20", price: 309, defaultQty: 1 },
  { id: "camera_foto30", group: "Zusatz Foto", label: "Bodenfotos 30", price: 360, defaultQty: 1 },
  { id: "drone_4", group: "Drohne Foto", label: "Drohne 4", price: 249, defaultQty: 1 },
  { id: "express_24h", group: "Express", label: "24h", price: 99, defaultQty: 1 },
  { id: "keypickup", group: "Sonstiges", label: "Schlüsselübergabe", price: 50, defaultQty: 1 },
];

export function getAddonCatalog(): CatalogAddon[] {
  return ADDON_LIST;
}

export function getPackageByKey(key: string | null) {
  if (!key) return null;
  return PACKAGE_CATALOG.find((p) => p.key === key) ?? null;
}
