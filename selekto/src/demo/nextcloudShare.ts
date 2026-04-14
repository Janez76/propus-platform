import type { GalleryItem } from "../data";
import type { FloorPlanItem } from "./demoTypes";

const WEBDAV_PREFIX = "/public.php/webdav";

function normalizeDavHrefPath(href: string): string {
  const t = href.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      return new URL(t).pathname;
    } catch {
      return t;
    }
  }
  return t.startsWith("/") ? t : `/${t}`;
}

function pathBelongsToShareListing(hrefPath: string, token: string): boolean {
  return (
    hrefPath.includes(`${WEBDAV_PREFIX}/`) ||
    hrefPath.includes(`/public.php/dav/files/${token}/`) ||
    hrefPath.endsWith(`/public.php/dav/files/${token}`)
  );
}

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

/** Basis-URL für WebDAV-Requests (Vite-Proxy in Dev, optional gleicher Ursprung in Prod). */
function requestOriginForWebdav(): string {
  if (import.meta.env.DEV) {
    return "/__propus-nextcloud";
  }
  const proxy = (import.meta.env.VITE_NEXTCLOUD_PROXY as string | undefined)?.trim();
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
 * Installations-Pfad vor `/s/TOKEN` bzw. `/index.php/s/TOKEN` — `""` oder z. B. `/nextcloud`.
 */
export function nextcloudShareInstallPathPrefix(sharePageUrl: string): string {
  try {
    const path = new URL(sharePageUrl.trim()).pathname.replace(/\/+$/, "");
    if (/\/index\.php\/s\/[A-Za-z0-9]+$/i.test(path)) {
      return path.replace(/\/index\.php\/s\/[A-Za-z0-9]+$/i, "") || "";
    }
    if (/\/s\/[A-Za-z0-9]+$/i.test(path)) {
      return path.replace(/\/s\/[A-Za-z0-9]+$/i, "") || "";
    }
    return "";
  } catch {
    return "";
  }
}

/** Nextcloud 29+: PROPFIND-Wurzel `/…/public.php/dav/files/{token}/` */
function publicDavFilesRootDir(sharePageUrl: string, token: string): string {
  const install = nextcloudShareInstallPathPrefix(sharePageUrl);
  return `${install}/public.php/dav/files/${token}/`.replace(/\/{2,}/g, "/");
}

function webdavLegacyRootDir(sharePageUrl: string): string {
  const install = nextcloudShareInstallPathPrefix(sharePageUrl);
  return `${install}${WEBDAV_PREFIX}/`.replace(/\/{2,}/g, "/");
}

function publicShareDownloadBase(sharePageUrl: string, token: string): string {
  const u = new URL(sharePageUrl.trim());
  const prefix = nextcloudShareInstallPathPrefix(sharePageUrl);
  const origin = `${u.protocol}//${u.host}`;
  const raw = sharePageUrl.trim();
  if (/\/index\.php\/s\//i.test(raw)) {
    return `${origin}${prefix}/index.php/s/${token}/download`;
  }
  return `${origin}${prefix}/s/${token}/download`;
}

/**
 * Öffentliche Datei-URL für Browser (`<img>`, `<video>`, PDF-iframe).
 * `public.php/dav/files/…` erwartet WebDAV-Basic-Auth — ohne Credentials liefert der Server kein Bild.
 * Stattdessen: klassische Freigabe-Download-URL mit `path=`.
 *
 * href z. B. /public.php/webdav/Bilder/Websize/x.jpg
 */
export function nextcloudHrefToPublicFileUrl(href: string, sharePageUrl: string, token: string): string | null {
  try {
    const p = normalizeDavHrefPath(href);
    let segments: string[];

    const wv = p.indexOf(WEBDAV_PREFIX);
    if (wv >= 0) {
      const rel = p.slice(wv + WEBDAV_PREFIX.length).replace(/^\/+/, "");
      segments = rel.split("/").filter(Boolean);
    } else {
      const needle = `/public.php/dav/files/${token}/`;
      const i = p.indexOf(needle);
      if (i >= 0) {
        segments = p.slice(i + needle.length).split("/").filter(Boolean);
      } else {
        const rootOnly = `/public.php/dav/files/${token}`;
        const j = p.indexOf(rootOnly);
        if (j >= 0 && p.length > rootOnly.length && p[j + rootOnly.length] === "/") {
          segments = p.slice(j + rootOnly.length + 1).split("/").filter(Boolean);
        } else {
          return null;
        }
      }
    }

    if (segments.length === 0) return null;
    /** Relativ zur Freigabe-Wurzel, ohne führenden Slash — sonst schlägt Nextcloud `Folder::get($path)` fehl. */
    const pathInShare = segments
      .map((seg) => {
        try {
          return decodeURIComponent(seg);
        } catch {
          return seg;
        }
      })
      .join("/");
    const base = publicShareDownloadBase(sharePageUrl, token);
    const out = new URL(base);
    out.searchParams.set("path", pathInShare);
    return out.toString();
  } catch {
    return null;
  }
}

/**
 * Bereits gespeicherte `remote_src`: `…/public.php/dav/files/{token}/rel/path` → `/s/{token}/download?path=/…`
 * (damit Thumbnails nach Reload wieder laden).
 */
function parseNextcloudDavPublicFilesUrl(remote: string): {
  origin: string;
  basePath: string;
  token: string;
  relPathDecoded: string;
} | null {
  try {
    const u = new URL(remote.trim());
    const p = u.pathname;
    const marker = "/public.php/dav/files/";
    const idx = p.indexOf(marker);
    if (idx < 0) return null;
    const basePath = idx === 0 ? "" : p.slice(0, idx);
    const after = p.slice(idx + marker.length);
    const slash = after.indexOf("/");
    if (slash <= 0) return null;
    const token = after.slice(0, slash);
    const relPath = after.slice(slash + 1);
    if (!token || !relPath) return null;
    const relPathDecoded = relPath
      .split("/")
      .filter(Boolean)
      .map((seg) => {
        try {
          return decodeURIComponent(seg);
        } catch {
          return seg;
        }
      })
      .join("/");
    return {
      origin: `${u.protocol}//${u.host}`,
      basePath,
      token,
      relPathDecoded,
    };
  } catch {
    return null;
  }
}

function encodePathSegmentNc(seg: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(seg));
  } catch {
    return encodeURIComponent(seg);
  }
}

function publicDavFileUrl(origin: string, basePath: string, token: string, relPathDecoded: string): string {
  const enc = relPathDecoded.split("/").filter(Boolean).map(encodePathSegmentNc).join("/");
  return `${origin}${basePath}/public.php/dav/files/${token}/${enc}`;
}

function parsePublicShareDownloadUrl(remote: string): {
  origin: string;
  basePath: string;
  token: string;
  relPathDecoded: string;
} | null {
  try {
    const u = new URL(remote.trim());
    const p = u.pathname.replace(/\/+$/, "");
    const m = p.match(/^(.*?)(?:\/index\.php)?\/s\/([A-Za-z0-9]+)\/download$/i);
    if (!m) return null;
    const basePath = m[1] || "";
    const token = m[2];
    const rawPath = (u.searchParams.get("path") ?? "").trim();
    const rawFiles = (u.searchParams.get("files") ?? "").trim();

    let relPathDecoded = "";
    const clean = (s: string) => {
      try {
        return decodeURIComponent(s).replace(/^\/+|\/+$/g, "");
      } catch {
        return s.replace(/^\/+|\/+$/g, "");
      }
    };
    const dir = clean(rawPath);
    const file = clean(rawFiles);
    if (file) {
      relPathDecoded = dir ? `${dir}/${file}` : file;
    } else if (dir) {
      relPathDecoded = dir;
    } else {
      return null;
    }

    return {
      origin: `${u.protocol}//${u.host}`,
      basePath,
      token,
      relPathDecoded,
    };
  } catch {
    return null;
  }
}

/**
 * Nur `npm run dev` / `vite preview`: Bild-URL über lokalen Proxy mit WebDAV-Basic-Auth (Token:),
 * weil `<img>` keine Authorization-Header setzen kann.
 */
export function devPublicDavProxyUrl(originalRemote: string): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    const trimmed = originalRemote.trim();
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    const raw = import.meta.env.VITE_NEXTCLOUD_PROXY_ALLOW_HOSTS as string | undefined;
    const allowed = raw
      ? raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
      : ["cloud.propus.ch"];
    if (!allowed.includes(parsed.hostname.toLowerCase())) return null;
    if (!/\/public\.php\/dav\/files\//i.test(parsed.pathname)) return null;
    return `/__propus-nc-thumb?${new URLSearchParams({ u: trimmed }).toString()}`;
  } catch {
    return null;
  }
}

/**
 * Reihenfolge: zuerst Download-URLs (ohne führendes `/` im path), dann `path`+`files`, zuletzt die rohe DAV-URL.
 */
export function nextcloudThumbUrlCandidates(
  sharePageUrl: string | null | undefined,
  remoteSrc: string,
): string[] {
  const t = remoteSrc.trim();
  if (!t) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    const s = u.trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  const dav = parseNextcloudDavPublicFilesUrl(t);
  if (dav) {
    const proxied = devPublicDavProxyUrl(t);
    if (proxied) push(proxied);

    const { origin, basePath, token, relPathDecoded } = dav;
    const rel = relPathDecoded.replace(/^\/+/, "");

    let dlBase: string;
    if (sharePageUrl) {
      try {
        const su = new URL(sharePageUrl.trim());
        if (su.host === new URL(t).host && parseNextcloudPublicShareUrl(sharePageUrl.trim())) {
          dlBase = publicShareDownloadBase(sharePageUrl.trim(), token);
        } else {
          dlBase = `${origin}${basePath}/s/${token}/download`;
        }
      } catch {
        dlBase = `${origin}${basePath}/s/${token}/download`;
      }
    } else {
      dlBase = `${origin}${basePath}/s/${token}/download`;
    }

    const u1 = new URL(dlBase);
    u1.searchParams.set("path", rel);
    push(u1.toString());

    if (rel.includes("/")) {
      const dir = rel.slice(0, rel.lastIndexOf("/"));
      const file = rel.slice(rel.lastIndexOf("/") + 1);
      if (dir && file) {
        const u2 = new URL(dlBase);
        u2.searchParams.set("path", dir);
        u2.searchParams.set("files", file);
        push(u2.toString());
      }
    }

    push(t);
    return out;
  }

  const dl = parsePublicShareDownloadUrl(t);
  if (dl) {
    const davUrl = publicDavFileUrl(dl.origin, dl.basePath, dl.token, dl.relPathDecoded);
    const proxied = devPublicDavProxyUrl(davUrl);
    if (proxied) push(proxied);
  }

  try {
    const u = new URL(t);
    if (/\/s\/[^/]+\/download$/i.test(u.pathname) || /\/index\.php\/s\/[^/]+\/download$/i.test(u.pathname)) {
      const p = u.searchParams.get("path");
      if (p != null && p.startsWith("/")) {
        const u2 = new URL(u.toString());
        u2.searchParams.set("path", p.replace(/^\/+/, ""));
        push(u2.toString());
      }
    }
  } catch {
    /* ignore */
  }

  push(t);
  return out;
}

export function rewriteNextcloudDavToPublicDownloadUrl(remote: string): string {
  const t = remote.trim();
  if (!t) return t;
  const cands = nextcloudThumbUrlCandidates(null, t);
  return cands[0] ?? t;
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
    /**
     * Nextcloud public.php DAV: PROPFIND ist nur erlaubt, wenn dieser Header gesetzt ist
     * (oder Server-zu-Server-Sharing aktiv ist) — sonst wirkt die Freigabe «nicht gefunden».
     * @see nextcloud/server apps/dav/appinfo/v2/publicremote.php
     */
    "X-Requested-With": "XMLHttpRequest",
  };
  if (import.meta.env.DEV) {
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

  const folderQueue: string[] = [];
  const rootsToTry = [publicDavFilesRootDir(sharePageUrl, token), webdavLegacyRootDir(sharePageUrl)];
  for (const root of rootsToTry) {
    try {
      await propfind(root, token, host);
      folderQueue.push(root);
      break;
    } catch (e) {
      if (e instanceof Error && e.message === "WebDAV 404") continue;
      throw e;
    }
  }
  if (folderQueue.length === 0) {
    return {
      ok: false,
      code: "network",
      message:
        "WebDAV 404: Freigabe nicht gefunden. Link/Token prüfen. (Nextcloud 29+ wird automatisch unterstützt.)",
    };
  }

  const seenFolders = new Set<string>();
  const imageHrefs: string[] = [];
  const pdfHrefs: string[] = [];
  const mp4Hrefs: string[] = [];
  let newestFileMs = 0;

  try {
    while (folderQueue.length > 0 && seenFolders.size < MAX_FOLDERS) {
      const hrefRaw = folderQueue.shift()!;
      const hrefNorm = normalizeDavHrefPath(hrefRaw);
      const hrefKey = hrefNorm.endsWith("/") ? hrefNorm : `${hrefNorm}/`;
      if (seenFolders.has(hrefKey)) continue;
      seenFolders.add(hrefKey);

      const xml = await propfind(hrefKey, token, host);
      const entries = parsePropfind(xml);

      for (const e of entries) {
        const child = normalizeDavHrefPath(e.href);
        if (child === hrefNorm || child === hrefKey) continue;
        if (!pathBelongsToShareListing(child, token)) continue;

        if (e.isCollection) {
          const mtimeCol = lastModifiedToMs(e.lastModified);
          if (mtimeCol > newestFileMs) {
            newestFileMs = mtimeCol;
          }
          const h = child.endsWith("/") ? child : `${child}/`;
          if (!seenFolders.has(h)) folderQueue.push(h);
          continue;
        }

        const mtime = lastModifiedToMs(e.lastModified);
        if (mtime > newestFileMs) {
          newestFileMs = mtime;
        }

        const isImg =
          IMG_EXT.test(child) || e.contentType.startsWith("image/") || e.contentType === "image/jpeg";
        if (isImg && imageHrefs.length < MAX_IMAGE_HREFS) {
          imageHrefs.push(child);
        }

        const isPdf =
          PDF_EXT.test(child) || e.contentType === "application/pdf" || e.contentType.includes("pdf");
        if (isPdf && pdfHrefs.length < MAX_PDF_HREFS) {
          pdfHrefs.push(child);
        }

        const isMp4 =
          MP4_EXT.test(child) || e.contentType === "video/mp4" || e.contentType.includes("video/mp4");
        if (isMp4 && mp4Hrefs.length < MAX_MP4_HREFS) {
          mp4Hrefs.push(child);
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
          import.meta.env.DEV
            ? "WebDAV konnte nicht erreicht werden (Netzwerk). Prüfen Sie den Vite-Proxy."
            : "Der Browser blockiert WebDAV (CORS). Nutzen Sie lokal «npm run dev», setzen Sie VITE_NEXTCLOUD_PROXY auf einen gleichlautenden Reverse-Proxy, oder legen Sie eine gallery.json auf die Freigabe.",
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
    const publicUrl = nextcloudHrefToPublicFileUrl(h, sharePageUrl, token);
    if (!publicUrl) continue;
    const file = h.split("/").filter(Boolean).pop() || "Bild";
    const label = decodeURIComponent(file.replace(IMG_EXT, ""));
    items.push({ src: publicUrl, label });
  }

  const sortedPdfHrefs = [...new Set(pdfHrefs)].sort();
  const floorPlans: FloorPlanItem[] = [];
  for (const h of sortedPdfHrefs) {
    const publicUrl = nextcloudHrefToPublicFileUrl(h, sharePageUrl, token);
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
    const pub = nextcloudHrefToPublicFileUrl(h, sharePageUrl, token);
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
