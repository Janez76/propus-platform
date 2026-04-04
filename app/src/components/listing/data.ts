export const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&q=85",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=85",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1920&q=85",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1920&q=85",
] as const;

export type GalleryItem = {
  src: string;
  label: string;
  wide?: boolean;
  /** Nur Magic-Link-Galerien: stabile Bild-ID für Kunden-Feedback */
  imageId?: string;
};

export const GALLERY: GalleryItem[] = [
  { src: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80", label: "Ansicht" },
  { src: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80", label: "Eingang" },
  { src: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&q=80", label: "Wohnen" },
  { src: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1200&q=80", label: "Küche" },
  { src: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=80", label: "Schlafzimmer" },
  { src: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80", label: "Bad" },
  { src: "https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=1200&q=80", label: "Garten" },
  { src: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&q=80", label: "Terrasse" },
  { src: "https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=1200&q=80", label: "Detail" },
  { src: "https://images.unsplash.com/photo-1600585154084-4e5fe7c39198?w=1200&q=80", label: "Abendlicht" },
  { src: "https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1200&q=80", label: "Innen" },
  { src: "https://images.unsplash.com/photo-1600585154363-67eb59e1e8c9?w=1200&q=80", label: "Studio" },
  { src: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=80", label: "Panorama", wide: true },
  { src: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&q=80", label: "Aussen" },
  { src: "https://images.unsplash.com/photo-1600047509358-9dc75507daeb?w=1200&q=80", label: "Pool" },
  { src: "https://images.unsplash.com/photo-1600585154363-67eb59e1e8c9?w=1200&q=80", label: "Arbeitszimmer" },
  { src: "https://images.unsplash.com/photo-1600210491892-03d3c3144a57?w=1200&q=80", label: "Lounge" },
  { src: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&q=80", label: "Winter" },
];

export const THEME_KEY = "propus-preview-theme";

export function lightboxSrcFromGallery(src: string): string {
  return src.replace("w=1200", "w=2000").replace("w=1600", "w=2000");
}
