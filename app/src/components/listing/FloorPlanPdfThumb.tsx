import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjsLib from "pdfjs-dist";
import { canLoadRemotePdfWithPdfJs, pdfJsDocumentUrl } from "./utils/pdfJsRemote";
import { pdfPreviewEmbedUrl } from "./utils/pdfPreviewUrl";

// Next.js/webpack-kompatibel: kein Vite-?url-Import, stattdessen CDN-URL
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

type Props = {
  remotePdfUrl: string;
  label: string;
};

export function FloorPlanPdfThumb({ remotePdfUrl, label }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [useFallback, setUseFallback] = useState(!canLoadRemotePdfWithPdfJs());

  useEffect(() => {
    if (!canLoadRemotePdfWithPdfJs()) return;

    const el = wrapRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    let cancelled = false;
    let lastW = 0;
    let lastH = 0;

    const paintPage = async () => {
      const pdf = pdfRef.current;
      if (!pdf || cancelled) return;
      const page = await pdf.getPage(1);
      if (cancelled) return;

      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw < 12 || ch < 12) return;
      if (Math.abs(cw - lastW) < 1 && Math.abs(ch - lastH) < 1 && canvas.width > 0) return;
      lastW = cw;
      lastH = ch;

      const base = page.getViewport({ scale: 1 });
      /* «Cover»: Vorschau füllen, keine weissen Innenränder durch kleinen Scale */
      const scaleW = cw / base.width;
      const scaleH = ch / base.height;
      const scale = Math.min(Math.max(scaleW, scaleH), 8);
      const viewport = page.getViewport({ scale: Math.max(scale, 0.08) });

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.max(1, Math.floor(viewport.width * dpr));
      const bh = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.width = bw;
      canvas.height = bh;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, bw, bh);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      await page.render({ canvasContext: ctx, viewport }).promise;
    };

    const boot = async () => {
      try {
        pdfRef.current?.destroy();
        pdfRef.current = null;
        setUseFallback(false);

        const loadingTask = pdfjsLib.getDocument({
          url: pdfJsDocumentUrl(remotePdfUrl),
          withCredentials: false,
        });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy().catch(() => {});
          return;
        }
        pdfRef.current = pdf;
        await paintPage();
      } catch {
        if (!cancelled) setUseFallback(true);
      }
    };

    void boot();

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        void paintPage();
      });
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect();
      pdfRef.current?.destroy().catch(() => {});
      pdfRef.current = null;
    };
  }, [remotePdfUrl]);

  if (useFallback) {
    return (
      <div className="pdf-wrap pdf-wrap--compact pdf-wrap--fallback">
        <iframe title={label} src={pdfPreviewEmbedUrl(remotePdfUrl)} loading="lazy" />
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="pdf-wrap pdf-wrap--compact pdf-wrap--canvas pdf-wrap--thumb-fill"
      role="img"
      aria-label={label}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
