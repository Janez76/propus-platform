import { pdfPreviewEmbedUrl } from "./pdfPreviewUrl";

/** Absolute URL für pdfjs getDocument (Worker-Fetch). */
export function pdfJsDocumentUrl(remotePdfUrl: string): string {
  const pathOrUrl = pdfPreviewEmbedUrl(remotePdfUrl);
  if (pathOrUrl.startsWith("/")) {
    return `${window.location.origin}${pathOrUrl}`;
  }
  return pathOrUrl;
}

/** Next.js-kompatibel: kein Vite-import.meta.env. Remote-PDFs können via CORS geladen werden. */
export function canLoadRemotePdfWithPdfJs(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") return true;
  const proxyEnv = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_PDF_INLINE_PROXY ?? "") : "";
  return Boolean(proxyEnv.trim());
}
