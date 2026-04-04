import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjsLib from "pdfjs-dist";
import { canLoadRemotePdfWithPdfJs, pdfJsDocumentUrl } from "./utils/pdfJsRemote";
import { pdfLightboxEmbedUrl } from "./utils/pdfPreviewUrl";

// Next.js/webpack-kompatibel: kein Vite-?url-Import, stattdessen CDN-URL
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

type Props = {
  remotePdfUrl: string;
  label: string;
};

export function LightboxFloorPlanCanvas({ remotePdfUrl, label }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(!canLoadRemotePdfWithPdfJs());

  useEffect(() => {
    if (!canLoadRemotePdfWithPdfJs()) return;

    const el = hostRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    let cancelled = false;
    let lastW = 0;
    let lastH = 0;

    const measureBox = () => {
      const rect = el.getBoundingClientRect();
      const cw = Math.max(1, rect.width);
      const ch = Math.max(1, (76 / 100) * window.innerHeight);
      return { cw, ch };
    };

    const paintPage = async () => {
      const pdf = pdfRef.current;
      if (!pdf || cancelled) return;
      const page = await pdf.getPage(1);
      if (cancelled) return;

      const { cw, ch } = measureBox();
      if (cw < 12) return;
      if (Math.abs(cw - lastW) < 1 && Math.abs(ch - lastH) < 1 && canvas.width > 0) return;
      lastW = cw;
      lastH = ch;

      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(cw / base.width, ch / base.height, 6);
      const viewport = page.getViewport({ scale: Math.max(scale, 0.05) });

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

      await page.render({ canvas: null, canvasContext: ctx, viewport }).promise;
    };

    const boot = async () => {
      try {
        pdfRef.current?.destroy();
        pdfRef.current = null;
        setUseIframeFallback(false);

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
        if (!cancelled) setUseIframeFallback(true);
      }
    };

    void boot();

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        void paintPage();
      });
    });
    ro.observe(el);
    const onWin = () => {
      requestAnimationFrame(() => {
        void paintPage();
      });
    };
    window.addEventListener("resize", onWin);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onWin);
      ro.disconnect();
      pdfRef.current?.destroy().catch(() => {});
      pdfRef.current = null;
    };
  }, [remotePdfUrl]);

  if (useIframeFallback) {
    return (
      <div className="lightbox__pdf-shell lightbox__pdf-shell--fallback">
        <iframe className="lightbox__pdf-frame" title={label} src={pdfLightboxEmbedUrl(remotePdfUrl)} />
      </div>
    );
  }

  return (
    <div ref={hostRef} className="lightbox__floor-plan-host" role="presentation">
      <canvas ref={canvasRef} className="lightbox__floor-canvas" role="img" aria-label={label} />
    </div>
  );
}
