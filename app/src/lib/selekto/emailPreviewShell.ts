/**
 * System-UI-Stack für iframe-Vorschau (kein CDN-Request). Stimmt grob mit Inter/Manrope-Umgebung überein.
 * E-Mail-Fragmente können weiterhin eigene font-family setzen.
 */
const PREVIEW_FONT_CSS = `body,html{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}`;

/**
 * Vollständiges HTML-Dokument für die iframe-Vorschau (Schriften + neutraler Mail-Client-Hintergrund).
 * Der übergebene `bodyHtml` ist der gerenderte E-Mail-Fragment (inkl. eigener Hintergrund-Tabelle).
 */
export function buildEmailPreviewSrcDoc(bodyHtml: string): string {
  const safe = bodyHtml.replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${PREVIEW_FONT_CSS}</style><style>html,body{margin:0;padding:0;min-height:100%;background:#d4d8de;-webkit-font-smoothing:antialiased;}</style></head><body>${safe}</body></html>`;
}
