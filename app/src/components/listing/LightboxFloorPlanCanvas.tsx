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
  /**
   * Server-rendered JPG-Thumbnail (Endpoint `/floorplans/:index/thumb?w=…`).
   * Wenn gesetzt, wird in der Lightbox die hochaufloesende Variante (`w=1200`)
   * angezeigt — pdf.js-Canvas + iframe sind nur Fallbacks fuer Ladefehler.
   */
  thumbUrl?: string | null;
};

function highResThumbUrl(thumbUrl: string): string {
  const isAbsolute = /^https?:\/\//i.test(thumbUrl);
  try {
    const u = new URL(thumbUrl, isAbsolute ? undefined : "http://x");
    u.searchParams.set("w", "1200");
    return isAbsolute ? u.toString() : `${u.pathname}${u.search}`;
  } catch {
    return thumbUrl;
  }
}

export function LightboxFloorPlanCanvas({ remotePdfUrl, label, thumbUrl }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const useImg = Boolean(thumbUrl) && !imgFailed;
  const [useIframeFallback, setUseIframeFallback] = useState(!useImg && !canLoadRemotePdfWithPdfJs());

  useEffect(() => {
    // Canvas-Render nur, wenn weder <img> noch <iframe>-Fallback aktiv ist.
    if (useImg) return;
    if (!canLoadRemotePdfWithPdfJs()) {
      setUseIframeFallback(true);
      return;
    }

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
  }, [remotePdfUrl, useImg]);

  if (useImg && thumbUrl) {
    return (
      <div className="lightbox__floor-plan-host" role="presentation">
        <img
          src={highResThumbUrl(thumbUrl)}
          alt={label}
          loading="eager"
          decoding="async"
          onError={() => {
            if (typeof console !== "undefined" && console.warn) {
              console.warn("[LightboxFloorPlanCanvas] thumb img failed, falling back to canvas");
            }
            setImgFailed(true);
          }}
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: "76vh",
            width: "auto",
            height: "auto",
            margin: "0 auto",
            background: "#ffffff",
          }}
        />
      </div>
    );
  }

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
