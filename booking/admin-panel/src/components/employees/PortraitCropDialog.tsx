import { useState, useCallback, useEffect, type ImgHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { X } from "lucide-react";
import { t, type Lang } from "../../i18n";
import { getCroppedPortraitBlob } from "../../lib/cropImage";

function mediaPropsForCrop(imageSrc: string): ImgHTMLAttributes<HTMLImageElement> {
  if (imageSrc.startsWith("blob:") || imageSrc.startsWith("data:")) return {};
  if (typeof window === "undefined") return { crossOrigin: "anonymous" };
  try {
    const u = new URL(imageSrc, window.location.origin);
    if (u.origin === window.location.origin) return {};
    return { crossOrigin: "anonymous" };
  } catch {
    return { crossOrigin: "anonymous" };
  }
}

type Props = {
  open: boolean;
  imageSrc: string;
  lang: Lang;
  onClose: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
};

export function PortraitCropDialog({ open, imageSrc, lang, onClose, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [localError, setLocalError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) {
      setPixels(null);
      return;
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setLocalError("");
  }, [open, imageSrc]);

  const syncPixels = useCallback((_area: Area, croppedAreaPixels: Area) => {
    setPixels(croppedAreaPixels);
  }, []);

  async function handleApply() {
    if (!pixels || working) return;
    setLocalError("");
    setWorking(true);
    try {
      const blob = await getCroppedPortraitBlob(imageSrc, pixels);
      await onConfirm(blob);
      onClose();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setWorking(false);
    }
  }

  if (!open || !imageSrc) return null;

  const body = typeof document !== "undefined" ? document.body : null;
  if (!body) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portrait-crop-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !working) onClose();
      }}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3">
          <h3 id="portrait-crop-title" className="font-semibold text-[var(--text-main)]">
            {t(lang, "employeeModal.photo.cropTitle")}
          </h3>
          <button
            type="button"
            disabled={working}
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text-main)] disabled:opacity-50"
            aria-label={t(lang, "common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="px-4 pt-3 text-xs text-[var(--text-muted)]">{t(lang, "employeeModal.photo.cropHint")}</p>

        <div
          className="portrait-crop-stage relative mx-4 mt-3 h-72 w-full max-w-full min-h-[288px] min-w-0 shrink-0 overflow-hidden rounded-lg bg-zinc-900"
          style={{ touchAction: "none" }}
        >
          <Cropper
            key={imageSrc}
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={0}
            minZoom={1}
            maxZoom={3}
            aspect={1}
            cropShape="round"
            showGrid={false}
            restrictPosition
            objectFit="contain"
            zoomWithScroll={false}
            disableAutomaticStylesInjection
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={syncPixels}
            onCropAreaChange={syncPixels}
            mediaProps={mediaPropsForCrop(imageSrc)}
            style={{}}
            classes={{}}
            cropperProps={{}}
          />
        </div>

        <div className="px-4 py-3">
          <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]" htmlFor="portrait-crop-zoom">
            {t(lang, "employeeModal.photo.cropZoom")}
          </label>
          <input
            id="portrait-crop-zoom"
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            disabled={working}
            className="w-full accent-[var(--accent)]"
          />
        </div>

        {localError ? <p className="px-4 pb-2 text-sm text-red-600">{localError}</p> : null}

        <div className="flex justify-end gap-2 border-t border-[var(--border-soft)] px-4 py-3">
          <button type="button" disabled={working} onClick={onClose} className="btn-secondary">
            {t(lang, "employeeModal.photo.cropCancel")}
          </button>
          <button
            type="button"
            disabled={working || !pixels}
            onClick={() => void handleApply()}
            className="btn-primary"
          >
            {working ? t(lang, "employeeModal.photo.uploading") : t(lang, "employeeModal.photo.cropApply")}
          </button>
        </div>
      </div>
    </div>,
    body,
  );
}
