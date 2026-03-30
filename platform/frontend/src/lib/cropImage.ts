import type { Area } from "react-easy-crop";

function shouldUseAnonymousCors(url: string): boolean {
  if (url.startsWith("blob:") || url.startsWith("data:")) return false;
  if (typeof window === "undefined") return true;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin !== window.location.origin;
  } catch {
    return true;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    if (shouldUseAnonymousCors(url)) {
      image.crossOrigin = "anonymous";
    }
    image.src = url;
  });
}

/** Quadratischer Ausschnitt als JPEG, skaliert auf `outputSize` (Wizard-Avatare). */
export async function getCroppedPortraitBlob(
  imageSrc: string,
  pixelCrop: Area,
  outputSize = 512,
  quality = 0.9,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  const { x, y, width, height } = pixelCrop;
  if (width <= 0 || height <= 0) throw new Error("Ungültiger Ausschnitt");
  canvas.width = outputSize;
  canvas.height = outputSize;
  ctx.drawImage(image, x, y, width, height, 0, 0, outputSize, outputSize);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Export fehlgeschlagen"))),
      "image/jpeg",
      quality,
    );
  });
}
