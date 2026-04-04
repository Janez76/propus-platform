/**
 * Wraps HTML body content in a minimal email-preview shell
 * for rendering inside a sandboxed iframe.
 */
export function buildEmailPreviewSrcDoc(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body { margin:0; padding:16px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-size:14px; color:#222; line-height:1.6; }
  img { max-width:100%; height:auto; }
  a { color:#2563eb; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}
