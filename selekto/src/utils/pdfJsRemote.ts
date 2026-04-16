import { pdfPreviewEmbedUrl } from "./pdfPreviewUrl";

/** Absolute URL für pdfjs getDocument (Worker-Fetch). */
export function pdfJsDocumentUrl(remotePdfUrl: string): string {
  const pathOrUrl = pdfPreviewEmbedUrl(remotePdfUrl);
  if (pathOrUrl.startsWith("/")) {
    return `${window.location.origin}${pathOrUrl}`;
  }
  return pathOrUrl;
}

/** Dev-Proxy oder VITE_PDF_INLINE_PROXY – sonst CORS auf Remote-PDFs. */
export function canLoadRemotePdfWithPdfJs(): boolean {
  if (import.meta.env.DEV) return true;
  return Boolean((import.meta.env.VITE_PDF_INLINE_PROXY as string | undefined)?.trim());
}
