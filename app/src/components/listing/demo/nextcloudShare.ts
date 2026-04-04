import type { GalleryItem } from "../data";
import type { FloorPlanItem } from "./demoTypes";

const WEBDAV_PREFIX = "/public.php/webdav";
const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;
const PDF_EXT = /\.pdf$/i;

const PROPFIND_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontenttype/><d:getlastmodified/></d:prop></d:propfind>`;

export type ParsedNextcloudShare = {
  host: string;
  token: string;
};

/** Erkennt öffentliche Nextcloud/Propus-Cloud Freigabe-URLs. */
export function parseNextcloudPublicShareUrl(input: string): ParsedNextcloudShare | null {
  try {
    const u = new URL(input.trim());
    const path = u.pathname.replace(/\/+$/, "");
    const m = path.match(/(?:^|\/)(?:index\.php\/)?s\/([A-Za-z0-9]+)$/);
    if (!m) return null;
    return { host: u.host, token: m[1] };
  } catch {
    return null;
  }
}

/**
 * Nextcloud: gesamte Ordner-Freigabe als ZIP laden (Browser öffnet Download).
 * Baut die URL aus der Freigabe-Seite; `path=/` = Wurzel der Freigabe.
 */
export function nextcloudPublicShareFolderZipUrl(sharePageUrl: string): string | null {
  const parsed = parseNextcloudPublicShareUrl(sharePageUrl);
  if (!parsed) return null;
  try {
    const u = new URL(sharePageUrl.trim());
    const path = u.pathname.replace(/\/+$/, "");
    const basePath = path.includes("/index.php/")
      ? `/index.php/s/${parsed.token}`
      : `/s/${parsed.token}`;
    const dl = new URL(`${basePath}/download`, `${u.protocol}//${u.host}`);
    dl.searchParams.set("path", "/");
    return dl.toString();
  } catch {
    return null;
  }
}

/** Basis-URL für WebDAV-Requests (Next.js-kompatibel, kein Vite-Proxy). */
function requestOriginForWebdav(): string {
  if (process.env.NODE_ENV === "development") {
    return "/__propus-nextcloud";
  }
  const proxy = (process.env.NEXT_PUBLIC_NEXTCLOUD_PROXY ?? "").trim();
  if (proxy) {
    return proxy.replace(/\/$/, "");
  }
  return "";
}

function webdavRequestOrigin(shareHost: string): string {
  const base = requestOriginForWebdav();
  if (base) return base;
  return `https://${shareHost}`;
}

function webdavUrlForHref(href: string, shareHost: string): string {
  return `${webdavRequestOrigin(shareHost)}${href}`;
}

/**
 * Öffentliche Bild-URL ohne Basic-Auth (funktioniert in img src).
 * href z. B. /public.php/webdav/Bilder/Websize/x.jpg
 */
function encodePathSegment(seg: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(seg));
  } catch {
    return encodeURIComponent(seg);
  }
}

export function nextcloudHrefToPublicFileUrl(href: string, host: string, token: string): string | null {
  if (!href.startsWith(WEBDAV_PREFIX)) return null;
  const rel = href.slice(WEBDAV_PREFIX.length).replace(/^\/+/, "");
  const path = rel.split("/").filter(Boolean).map(encodePathSegment).join("/");
  return `https://${host}/public.php/dav/files/${token}/${path}`;
}

function parsePropfind(xml: string): {
  href: string;
  isCollection: boolean;
  contentType: string;
  lastModified: string | null;
}[] {
  const out: {
    href: string;
    isCollection: boolean;
    contentType: string;
    lastModified: string | null;
  }[] = [];
  const re = /<d:response>([\s\S]*?)<\/d:response>/gi;
  let block: RegExpExecArray | null;
  while ((block = re.exec(xml)) !== null) {
    const inner = block[1];
    const hrefM = inner.match(/<d:href>([^<]*)<\/d:href>/i);
    if (!hrefM) continue;
    let href = hrefM[1].trim();
    try {
      href = decodeURIComponent(href);
    } catch {
      /* keep */
    }
    const isCollection =
      /<d:collection\s*\/>/i.test(inner) ||
      /<d:resourcetype>[\s\S]*<d:collection/i.test(inner);
    const ctM = inner.match(/<d:getcontenttype>([^<]*)<\/d:getcontenttype>/i);
    const contentType = (ctM?.[1] ?? "").trim().toLowerCase();
    const lmM = inner.match(/<d:getlastmodified>([^<]*)<\/d:getlastmodified>/i);
    const lastModified = lmM?.[1]?.trim() ? lmM[1].trim() : null;
    out.push({ href, isCollection, contentType, lastModified });
  }
  return out;
}

/** HTTP-Datum aus WebDAV (z. B. «Wed, 12 Nov 2025 08:15:32 GMT») → ms; 0 bei Fehler. */
function lastModifiedToMs(raw: string | null): number {
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Kalenderdatum für Anzeige (lokale Zeitzone), z. B. 31.03.2026 */
function formatStandDateDe(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

async function propfind(href: string, token: string, shareHost: string): Promise<string> {
  const url = webdavUrlForHref(href, shareHost);
  const auth = typeof btoa !== "undefined" ? btoa(`${token}:`) : "";
  const headers: Record<string, string> = {
    Depth: "1",
    "Content-Type": "application/xml; charset=utf-8",
    Authorization: `Basic ${auth}`,
  };
  if (process.env.NODE_ENV === "development") {
    headers["x-prop-nc-host"] = shareHost;
  }
  const res = await fetch(url, {
    method: "PROPFIND",
    headers,
    body: PROPFIND_BODY,
    credentials: "omit",
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("auth");
  }
  if (!res.ok) {
    throw new Error(`WebDAV ${res.status}`);
  }
  return res.text();
}

function pathScoreForGallery(p: string): number {
  const pl = p.toLowerCase();
  if (pl.includes("/websize/")) return 4;
  if (pl.includes("/web/")) return 3;
  if (pl.includes("/staging/")) return 2;
  if (pl.includes("/fullsize/")) return 1;
  return 2;
}

function dedupeByBasenamePreferWebsize(hrefs: string[]): string[] {
  const byBase = new Map<string, string>();
  for (const h of hrefs) {
    const base = h.split("/").filter(Boolean).pop() || h;
    const cur = byBase.get(base);
    if (!cur || pathScoreForGallery(h) > pathScoreForGallery(cur)) {
      byBase.set(base, h);
    }
  }
  return [...byBase.values()];
}

const MAX_FOLDERS = 100;
const MAX_IMAGE_HREFS = 200;
const MAX_PDF_HREFS = 40;
const MAX_MP4_HREFS = 16;
const MP4_EXT = /\.mp4$/i;

function pathScoreForVideo(p: string): number {
  const pl = p.toLowerCase();
  if (pl.includes("/video/") || pl.includes("/videos/")) return 5;
  if (pl.includes("/filme/") || pl.includes("/film/")) return 4;
  if (pl.includes("/media/")) return 3;
  return 1;
}

export type NextcloudMediaListResult =
  | {
      ok: true;
      images: GalleryItem[];
      floorPlans: FloorPlanItem[];
      videoUrl: string | null;
      /** Neuestes getlastmodified aller Dateien in der Freigabe (PROPFIND), DD.MM.JJJJ — null wenn Server nichts liefert */
      standDisplayFromShare: string | null;
    }
  | { ok: false; code: "cors" | "auth" | "empty" | "network"; message: string };

export async function listMediaFromNextcloudPublicShare(
  sharePageUrl: string,
): Promise<NextcloudMediaListResult> {
  const parsed = parseNextcloudPublicShareUrl(sharePageUrl);
  if (!parsed) {
    return { ok: false, code: "network", message: "Keine gültige Nextcloud-Freigabe-URL." };
  }
  const { host, token } = parsed;

  const folderQueue: string[] = [`${WEBDAV_PREFIX}/`];
  const seenFolders = new Set<string>();
  const imageHrefs: string[] = [];
  const pdfHrefs: string[] = [];
  const mp4Hrefs: string[] = [];
  let newestFileMs = 0;

  try {
    while (folderQueue.length > 0 && seenFolders.size < MAX_FOLDERS) {
      const href = folderQueue.shift()!;
      if (seenFolders.has(href)) continue;
      seenFolders.add(href);

      const xml = await propfind(href, token, host);
      const entries = parsePropfind(xml);

      for (const e of entries) {
        if (e.href === href || !e.href.startsWith(WEBDAV_PREFIX)) continue;

        if (e.isCollection) {
          const mtimeCol = lastModifiedToMs(e.lastModified);
          if (mtimeCol > newestFileMs) {
            newestFileMs = mtimeCol;
          }
          const h = e.href.endsWith("/") ? e.href : `${e.href}/`;
          if (!seenFolders.has(h)) folderQueue.push(h);
          continue;
        }

        const mtime = lastModifiedToMs(e.lastModified);
        if (mtime > newestFileMs) {
          newestFileMs = mtime;
        }

        const isImg =
          IMG_EXT.test(e.href) || e.contentType.startsWith("image/") || e.contentType === "image/jpeg";
        if (isImg && imageHrefs.length < MAX_IMAGE_HREFS) {
          imageHrefs.push(e.href);
        }

        const isPdf =
          PDF_EXT.test(e.href) || e.contentType === "application/pdf" || e.contentType.includes("pdf");
        if (isPdf && pdfHrefs.length < MAX_PDF_HREFS) {
          pdfHrefs.push(e.href);
        }

        const isMp4 =
          MP4_EXT.test(e.href) || e.contentType === "video/mp4" || e.contentType.includes("video/mp4");
        if (isMp4 && mp4Hrefs.length < MAX_MP4_HREFS) {
          mp4Hrefs.push(e.href);
        }
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message === "auth") {
      return {
        ok: false,
        code: "auth",
        message: "Nextcloud hat den Zugriff abgelehnt (Passwort/Freigabe oder Token prüfen).",
      };
    }
    const isTypeError = e instanceof TypeError && String(e.message).toLowerCase().includes("fetch");
    if (isTypeError || (e instanceof Error && e.message.includes("Failed to fetch"))) {
      return {
        ok: false,
        code: "cors",
        message:
          process.env.NODE_ENV === "development"
            ? "WebDAV konnte nicht erreicht werden (Netzwerk). Prüfen Sie den Dev-Proxy."
            : "Der Browser blockiert WebDAV (CORS). Nutzen Sie lokal den Dev-Server, setzen Sie NEXT_PUBLIC_NEXTCLOUD_PROXY auf einen gleichlautenden Reverse-Proxy, oder legen Sie eine gallery.json auf die Freigabe.",
      };
    }
    return {
      ok: false,
      code: "network",
      message: e instanceof Error ? e.message : "Unbekannter Fehler beim Einlesen der Freigabe.",
    };
  }

  const picked = dedupeByBasenamePreferWebsize(imageHrefs);
  const items: GalleryItem[] = [];
  for (const h of picked) {
    const publicUrl = nextcloudHrefToPublicFileUrl(h, host, token);
    if (!publicUrl) continue;
    const file = h.split("/").filter(Boolean).pop() || "Bild";
    const label = decodeURIComponent(file.replace(IMG_EXT, ""));
    items.push({ src: publicUrl, label });
  }

  const sortedPdfHrefs = [...new Set(pdfHrefs)].sort();
  const floorPlans: FloorPlanItem[] = [];
  for (const h of sortedPdfHrefs) {
    const publicUrl = nextcloudHrefToPublicFileUrl(h, host, token);
    if (!publicUrl) continue;
    const file = h.split("/").filter(Boolean).pop() || "Grundriss.pdf";
    const title = decodeURIComponent(file.replace(PDF_EXT, "")).replace(/_/g, " ");
    floorPlans.push({ url: publicUrl, title });
  }

  const sortedMp4 = [...new Set(mp4Hrefs)].sort(
    (a, b) => pathScoreForVideo(b) - pathScoreForVideo(a) || a.localeCompare(b),
  );
  let videoUrl: string | null = null;
  for (const h of sortedMp4) {
    const pub = nextcloudHrefToPublicFileUrl(h, host, token);
    if (pub) {
      videoUrl = pub;
      break;
    }
  }

  if (items.length === 0 && floorPlans.length === 0 && !videoUrl) {
    return {
      ok: false,
      code: "empty",
      message: "In der Freigabe wurden keine Bilder, PDFs oder MP4-Videos gefunden.",
    };
  }

  const standDisplayFromShare =
    newestFileMs > 0 ? formatStandDateDe(new Date(newestFileMs)) : null;

  return { ok: true, images: items, floorPlans, videoUrl, standDisplayFromShare };
}
