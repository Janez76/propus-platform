// Server-only helpers for link construction.
// Do NOT import this into client components.
// GALLERY_BASE_URL: set in .env (see root .env.example), default https://fotos.propus.ch

const GALLERY_BASE = process.env.GALLERY_BASE_URL ?? "https://fotos.propus.ch";

export function galleryUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const base = GALLERY_BASE.replace(/\/+$/, "");
  const clean = String(slug).replace(/^\/+/, "");
  return `${base}/listing/${clean}`;
}

export function galleryDisplayHostPath(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const base = GALLERY_BASE.replace(/\/+$/, "");
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return "fotos.propus.ch";
    }
  })();
  const clean = String(slug).replace(/^\/+/, "");
  return `${host}/listing/${clean}`;
}

export function matterportShowUrl(spaceId: string | null | undefined): string | null {
  if (!spaceId) return null;
  return `https://my.matterport.com/show/?m=${encodeURIComponent(spaceId)}`;
}

/** Entweder Space-ID, oder vollständige URL my.matterport.com/...?m=… */
export function parseMatterportInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const fromQuery = s.match(/[?&]m=([A-Za-z0-9._-]+)/i);
  if (fromQuery?.[1]) return fromQuery[1];
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s);
      const m = u.searchParams.get("m");
      if (m && /^[A-Za-z0-9._-]+$/.test(m)) return m;
    } catch {
      return null;
    }
    return null;
  }
  if (/^[A-Za-z0-9._-]+$/.test(s)) {
    return s;
  }
  return null;
}
