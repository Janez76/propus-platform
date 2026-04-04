import type { GalleryItem } from "../data";
import type { FloorPlanItem } from "./demoTypes";

function encodePathSegmentNc(seg: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(seg));
  } catch {
    return encodeURIComponent(seg);
  }
}

/**
 * Nextcloud-Freigabe-Download-Link → direkte public.php/dav-URL (für <video> / Streaming).
 * z. B. …/s/TOKEN/download?path=%2FVideo&files=film.mp4
 */
export function nextcloudDownloadLinkToDavUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    const p = u.pathname.replace(/\/+$/, "");
    const m = p.match(/(?:^|\/)(?:index\.php\/)?s\/([A-Za-z0-9]+)\/download$/);
    if (!m) return null;
    const token = m[1];
    const pathParam = u.searchParams.get("path") ?? "";
    const filesParam = u.searchParams.get("files") ?? "";
    let dir = "";
    try {
      dir = decodeURIComponent(pathParam).replace(/^\/+|\/+$/g, "");
    } catch {
      dir = pathParam.replace(/^\/+|\/+$/g, "");
    }
    let file = "";
    try {
      file = decodeURIComponent(filesParam).trim();
    } catch {
      file = filesParam.trim();
    }
    let rel = "";
    if (file && /\.mp4$/i.test(file)) {
      rel = dir ? `${dir}/${file}` : file;
    } else if (dir && /\.mp4$/i.test(dir.split("/").pop() || "")) {
      rel = dir;
    } else {
      return null;
    }
    const enc = rel.split("/").filter(Boolean).map(encodePathSegmentNc).join("/");
    return `https://${u.host}/public.php/dav/files/${token}/${enc}`;
  } catch {
    return null;
  }
}

/** Abspiel-URL: Nextcloud-Download-Links werden in direkte DAV-URLs umgewandelt. */
export function resolvePlayableMp4Url(input: string): string {
  const t = input.trim();
  if (!t) return t;
  return nextcloudDownloadLinkToDavUrl(t) || t;
}

/** True, wenn der Link eindeutig auf eine MP4 verweist (Pfad, Query files=, Nextcloud-Download, …). */
export function isMp4VideoUrl(input: string): boolean {
  const t = input.trim();
  if (!t) return false;
  if (/^\/api\/listing\/.+\/video(?:[?#]|$)/i.test(t)) return true;
  if (!/^https?:\/\//i.test(t)) return /\.mp4([?#]|$)/i.test(t);
  if (nextcloudDownloadLinkToDavUrl(t)) return true;
  try {
    const u = new URL(t);
    if (/\.mp4$/i.test(u.pathname)) return true;
    if (/\.mp4([?#]|$)/i.test(u.href)) return true;
    const files = u.searchParams.get("files") || "";
    if (/\.mp4$/i.test(files)) return true;
    const pathQ = u.searchParams.get("path") || "";
    try {
      if (/\.mp4(\/|$)/i.test(decodeURIComponent(pathQ))) return true;
    } catch {
      if (/\.mp4/i.test(pathQ)) return true;
    }
    return false;
  } catch {
    return /\.mp4/i.test(t);
  }
}

/** Matterport: volle Show-URL oder nur Model-ID. Leer = kein Einbettung (nichts anzeigen). */
export function normalizeMatterportSrc(input: string): string {
  const t = input.trim();
  if (!t) return "";
  if (t.startsWith("http://") || t.startsWith("https://")) {
    if (t.includes("my.matterport.com")) return t;
    return t;
  }
  return `https://my.matterport.com/show/?m=${encodeURIComponent(t)}`;
}

/** Textarea: eine URL pro Zeile, optional `URL|Label` */
export function parseImageUrlsText(text: string): GalleryItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: GalleryItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pipe = line.indexOf("|");
    const url = (pipe >= 0 ? line.slice(0, pipe) : line).trim();
    const label = (pipe >= 0 ? line.slice(pipe + 1) : `Bild ${i + 1}`).trim() || `Bild ${i + 1}`;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ src: url, label });
  }
  return out;
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Zufällige Auswahl aus der Galerie (nicht Reihenfolge der Liste). */
export function heroSlidesFromGallery(gallery: GalleryItem[], max = 4): string[] {
  if (gallery.length === 0) return [];
  const pick = shuffleInPlace([...gallery]).slice(0, max);
  return pick.map((g) => upsizeHeroUrl(g.src));
}

/** Eine direkte Bild-URL pro Zeile (Hero) */
export function parseHeroUrlsText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l))
    .map(upsizeHeroUrl);
}

const PDF_IN_PATH = /\.pdf(\?|$)/i;

/** Eine PDF-URL pro Zeile, optional `URL|Titel` */
export function parseFloorPlanUrlsText(text: string): FloorPlanItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: FloorPlanItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pipe = line.indexOf("|");
    const url = (pipe >= 0 ? line.slice(0, pipe) : line).trim();
    const title = (pipe >= 0 ? line.slice(pipe + 1) : "").trim();
    if (!/^https?:\/\//i.test(url) || !PDF_IN_PATH.test(url)) continue;
    const t =
      title ||
      (() => {
        try {
          const path = new URL(url).pathname.split("/").pop() || "";
          return decodeURIComponent(path.replace(/\.pdf$/i, "")).replace(/_/g, " ") || `Grundriss ${out.length + 1}`;
        } catch {
          return `Grundriss ${out.length + 1}`;
        }
      })();
    out.push({ url, title: t });
  }
  return out;
}

function upsizeHeroUrl(src: string): string {
  try {
    const u = new URL(src);
    if (u.searchParams.has("w")) u.searchParams.set("w", "1920");
    if (u.searchParams.has("width")) u.searchParams.set("width", "1920");
    return u.toString();
  } catch {
    return src;
  }
}
