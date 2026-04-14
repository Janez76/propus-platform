const INTER_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";

/**
 * Vollständiges HTML-Dokument für die iframe-Vorschau (Schriften + neutraler Mail-Client-Hintergrund).
 * Der übergebene `bodyHtml` ist der gerenderte E-Mail-Fragment (inkl. eigener Hintergrund-Tabelle).
 */
export function buildEmailPreviewSrcDoc(bodyHtml: string): string {
  const safe = bodyHtml.replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="stylesheet" href="${INTER_STYLESHEET}"/><style>html,body{margin:0;padding:0;min-height:100%;background:#d4d8de;-webkit-font-smoothing:antialiased;}</style></head><body>${safe}</body></html>`;
}
