import type { GalleryItem } from "../data";

export type FloorPlanItem = { title: string; url: string };

export const DEMO_STORAGE_KEY = "propus-demo-config-v1";

export const DEFAULT_MATTERPORT =
  "https://my.matterport.com/show/?m=sLnkRRfrMfv";

export type DemoPersisted = {
  title: string;
  address: string;
  matterportInput: string;
  /** Basis-URL oder direkte JSON-URL (NAS / Cloud) */
  nasBaseOrManifestUrl: string;
  /** Eine Bild-URL pro Zeile; optional `URL|Beschriftung` */
  imageUrlsText: string;
  /** Optional: eine URL pro Zeile nur für Hero-Slideshow; leer = erste Galerie-Bilder */
  heroUrlsText: string;
  /** Grundrisse: eine PDF-URL pro Zeile, optional URL|Titel */
  floorPlanUrlsText: string;
  standDisplay: string;
  videoUrl: string;
};

export const defaultDemoForm: DemoPersisted = {
  title: "Landhaus mit Hanglage",
  address: "Beispielhausen, Region Zürich",
  matterportInput: "",
  nasBaseOrManifestUrl: "",
  imageUrlsText: "",
  heroUrlsText: "",
  floorPlanUrlsText: "",
  standDisplay: "31.03.2026",
  videoUrl: "",
};

/** JSON vom NAS (flexibel) */
export type NasManifestJson = {
  title?: string;
  address?: string;
  matterport?: string;
  matterportModelId?: string;
  m?: string;
  images?: string[];
  gallery?: Array<{ src?: string; url?: string; label?: string; wide?: boolean }>;
  heroImages?: string[];
  standDate?: string;
  standDisplay?: string;
  videoUrl?: string;
  /** PDF-Grundrisse: URLs oder Objekte mit url/src + title/label */
  floorPlans?:
    | string[]
    | Array<{ url?: string; src?: string; title?: string; label?: string }>;
  grundrisse?:
    | string[]
    | Array<{ url?: string; src?: string; title?: string; label?: string }>;
};

export function manifestToGalleryItems(data: NasManifestJson): GalleryItem[] {
  if (Array.isArray(data.gallery) && data.gallery.length > 0) {
    const out: GalleryItem[] = [];
    data.gallery.forEach((g, i) => {
      const src = (g.src || g.url || "").trim();
      if (!src) return;
      const label = (g.label || `Bild ${i + 1}`).trim();
      const item: GalleryItem = { src, label };
      if (g.wide) item.wide = true;
      out.push(item);
    });
    return out;
  }
  if (Array.isArray(data.images) && data.images.length > 0) {
    return data.images.map((src, i) => ({
      src: String(src).trim(),
      label: `Bild ${i + 1}`,
    }));
  }
  return [];
}

function isPdfUrl(u: string): boolean {
  const s = u.split("?")[0]?.toLowerCase() ?? "";
  return s.endsWith(".pdf");
}

export function manifestToFloorPlanItems(data: NasManifestJson): FloorPlanItem[] {
  const raw = data.floorPlans ?? data.grundrisse;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const out: FloorPlanItem[] = [];
  if (typeof raw[0] === "string") {
    (raw as string[]).forEach((line, i) => {
      const url = String(line).trim();
      if (!/^https?:\/\//i.test(url) || !isPdfUrl(url)) return;
      out.push({ url, title: `Grundriss ${i + 1}` });
    });
    return out;
  }

  (raw as Array<{ url?: string; src?: string; title?: string; label?: string }>).forEach((fp, i) => {
    const url = String(fp.url || fp.src || "").trim();
    if (!/^https?:\/\//i.test(url) || !isPdfUrl(url)) return;
    const title = String(fp.title || fp.label || `Grundriss ${i + 1}`).trim() || `Grundriss ${i + 1}`;
    out.push({ url, title });
  });
  return out;
}
