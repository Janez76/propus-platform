import { pdfPreviewEmbedUrl } from "./pdfPreviewUrl";

/** Absolute URL für pdfjs getDocument (Worker-Fetch). */
export function pdfJsDocumentUrl(remotePdfUrl: string): string {
  const pathOrUrl = pdfPreviewEmbedUrl(remotePdfUrl);
  if (pathOrUrl.startsWith("/")) {
    return `${window.location.origin}${pathOrUrl}`;
  }
  return pathOrUrl;
}

/** Dev-Proxy oder NEXT_PUBLIC_PDF_INLINE_PROXY – sonst CORS auf Remote-PDFs. */
export function canLoadRemotePdfWithPdfJs(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return Boolean((process.env.NEXT_PUBLIC_PDF_INLINE_PROXY as string | undefined)?.trim());
}
