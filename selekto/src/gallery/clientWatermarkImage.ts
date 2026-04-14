/**
 * Erzeugt eine Blob-URL mit eingezeichnetem «PROPUS»-Wasserzeichen (für Kunden-Galerie).
 * Schlägt fehl (null), wenn das Bild wegen CORS nicht in ein Canvas gezeichnet werden darf.
 */
export async function tryCreateWatermarkedBlobUrl(
  imageUrl: string,
  opts?: { maxWidth?: number; jpegQuality?: number },
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const maxW = opts?.maxWidth ?? 1680;
  const jpegQuality = opts?.jpegQuality ?? 0.85;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const done = (v: string | null) => resolve(v);
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w <= 0 || h <= 0) {
          done(null);
          return;
        }
        let tw = w;
        let th = h;
        if (tw > maxW) {
          th = Math.round((th * maxW) / tw);
          tw = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          done(null);
          return;
        }
        ctx.drawImage(img, 0, 0, tw, th);

        const fontMain = `700 ${Math.max(16, Math.round(tw / 12))}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.save();
        ctx.translate(tw / 2, th / 2);
        ctx.rotate(-Math.PI / 7);
        ctx.font = fontMain;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.26)";
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = Math.max(1, Math.round(tw / 400));
        ctx.strokeText("PROPUS", 0, 0);
        ctx.fillText("PROPUS", 0, 0);
        ctx.restore();

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              done(null);
              return;
            }
            done(URL.createObjectURL(blob));
          },
          "image/jpeg",
          jpegQuality,
        );
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = imageUrl;
  });
}
