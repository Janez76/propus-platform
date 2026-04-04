/**
 * URL für PDF-Einbettung in iframe/object.
 * Nextcloud u. a. senden oft Content-Disposition: attachment → Download statt Vorschau.
 * Lokal/Preview: gleicher Ursprung-Proxy setzt inline.
 */
export function pdfPreviewEmbedUrl(remotePdfUrl: string): string {
  const u = remotePdfUrl.trim();
  if (!u) return u;

  if (process.env.NODE_ENV === "development") {
    return `/__propus-pdf-inline?url=${encodeURIComponent(u)}`;
  }

  const proxy = (process.env.NEXT_PUBLIC_PDF_INLINE_PROXY ?? "").trim() || undefined;
  if (proxy) {
    const base = proxy.replace(/\/$/, "");
    return `${base}?url=${encodeURIComponent(u)}`;
  }

  return `https://docs.google.com/viewer?url=${encodeURIComponent(u)}&embedded=true`;
}

/**
 * Lightbox: möglichst grosse Darstellung im eingebetteten PDF-Viewer (Chromium/Edge).
 * Hash = PDF Open Parameters; Browser ignorieren unbekannte Fragmente.
 */
export function pdfLightboxEmbedUrl(remotePdfUrl: string): string {
  const base = pdfPreviewEmbedUrl(remotePdfUrl);
  if (!base) return base;
  if (base.includes("docs.google.com")) return base;
  const [path] = base.split("#");
  return `${path}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
}
