import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { X, UploadCloud, RefreshCw, AlertTriangle, CheckCircle2, Send, Trash2 } from "lucide-react";
import {
  clearOrderUploadFolder,
  confirmUploadBatch,
  deleteOrderUploadFile,
  getUploadBatch,
  getOrderUploadFileUrl,
  getOrderUploads,
  getChunkedUploadStatus,
  initChunkedUpload,
  completeChunkedUpload,
  finalizeChunkedUpload,
  uploadChunkPart,
  retryUploadBatch,
  uploadOrderFiles,
  type OrderFolderType,
  type OrderUploadBatch,
  type OrderUploadCategory,
  type OrderUploadTreeNode,
} from "../../api/orders";
import { t, type Lang } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
type Props = {
  token: string;
  orderNo: string;
  folderType: OrderFolderType;
  onClose?: () => void;
  onChanged?: () => Promise<void> | void;
  embedded?: boolean;
};

const categoryAccept: Array<{ key: OrderUploadCategory; labelKey: string; accept: string; folderTypes?: string[] }> = [
  { key: "raw_bilder",      labelKey: "upload.category.rawImages",        accept: "image/*,.tif,.tiff,.heic,.dng,.raw,.cr2,.cr3,.nef,.arw,.orf,.rw2,.psd,.psb", folderTypes: ["raw_material"] },
  { key: "raw_grundrisse",  labelKey: "upload.category.rawFloorplans",    accept: ".pdf,.jpg,.jpeg,.png,.svg,.tif,.tiff,.dwg,.dxf",                              folderTypes: ["raw_material"] },
  { key: "raw_video",       labelKey: "upload.category.rawVideo",         accept: "video/*,.mp4,.mov,.avi,.mxf,.mts,.m2ts,.mkv,.wmv,.webm,.r3d,.braw,.dng",      folderTypes: ["raw_material"] },
  { key: "raw_sonstiges",   labelKey: "upload.category.rawOther",         accept: "*",                                                                           folderTypes: ["raw_material"] },
  { key: "final_fullsize",  labelKey: "upload.category.finalFullsize",    accept: ".jpg,.jpeg,.png,.tif,.tiff,.heic,.heif,.psd,.psb",                            folderTypes: ["customer_folder"] },
  { key: "final_websize",   labelKey: "upload.category.finalWebsize",     accept: ".jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif",                               folderTypes: ["customer_folder"] },
  { key: "final_grundrisse",labelKey: "upload.category.finalFloorplans",  accept: ".pdf,.jpg,.jpeg,.png,.svg,.tif,.tiff",                                        folderTypes: ["customer_folder"] },
  { key: "final_video",     labelKey: "upload.category.finalVideo",       accept: ".mp4,.mov,.mkv,.webm,.m4v",                                                   folderTypes: ["customer_folder"] },
  { key: "zur_auswahl",     labelKey: "upload.category.selection",        accept: ".jpg,.jpeg",                                                                  folderTypes: ["customer_folder"] },
];

function getCategoryOptions(lang: Lang, folderType: string) {
  return categoryAccept
    .filter((c) => !c.folderTypes || c.folderTypes.includes(folderType))
    .map((c) => ({ key: c.key, label: t(lang, c.labelKey), accept: c.accept }));
}

function formatBytes(bytes?: number) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function hasAnyFile(nodes: OrderUploadTreeNode[]): boolean {
  for (const node of nodes) {
    if (node.type === "file") return true;
    if (node.type === "dir" && hasAnyFile(node.children || [])) return true;
  }
  return false;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|tiff?|heic|bmp|svg)$/i;
const BROWSER_PREVIEW_EXT = /\.(jpe?g|png|gif|webp|bmp|svg)$/i;
const RAW_EXT = /\.(raw|cr2|cr3|nef|arw|orf|rw2|dng|tif|tiff|heic|psd|psb)$/i;
const VIDEO_EXT = /\.(mp4|mov|avi|mxf|mts|m2ts|mkv|wmv|webm|r3d|braw|m4v)$/i;
const PDF_EXT = /\.pdf$/i;
// 4 MB chunks stay safely under Cloudflare's proxy body limits and reduce
// the blast radius of a single failed chunk on slow/unstable connections.
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
const LIBRAW_WASM_URL = "/libraw/index.js";

type FileTypeFilter = "all" | "raw" | "jpg" | "mp4" | "pdf";

const rawPreviewUrlCache = new Map<string, string>();
const rawPreviewPromiseCache = new Map<string, Promise<string | null>>();

function getPreviewCacheKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

async function loadLibRawModule(): Promise<new () => {
  open: (bytes: Uint8Array, settings?: Record<string, unknown>) => Promise<unknown>;
  metadata: (fullOutput?: boolean) => Promise<Record<string, unknown>>;
  imageData: () => Promise<unknown>;
}> {
  const mod = await import(/* @vite-ignore */ LIBRAW_WASM_URL);
  return mod.default;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// Reads only the first N bytes of the file – embedded JPEG previews in RAW files
// are always stored near the beginning (in the IFD), so 25 MB is more than enough.
// Reading the full file (potentially 50-100 MB for modern cameras) would exceed the 4s timeout.
const RAW_PREVIEW_READ_BYTES = 25 * 1024 * 1024;

function extractLargestEmbeddedJpeg(bytes: Uint8Array): Uint8Array | null {
  let bestStart = -1;
  let bestEnd = -1;

  for (let i = 0; i < bytes.length - 3; i += 1) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;

    const soi = i;
    // Scan backwards from end of slice for EOI – faster than scanning forward
    let eoi = -1;
    for (let j = bytes.length - 2; j > soi + 1000; j--) {
      if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
        eoi = j + 2;
        break;
      }
    }
    if (eoi <= soi + 1000) {
      i += 1;
      continue;
    }

    const len = eoi - soi;
    if (len > bestEnd - bestStart) {
      bestStart = soi;
      bestEnd = eoi;
    }
    // Skip past this JPEG – the largest embedded preview is usually the first big one
    i = eoi - 1;
  }

  if (bestStart < 0 || bestEnd <= bestStart) return null;
  if (bestEnd - bestStart < 8 * 1024) return null;
  return bytes.slice(bestStart, bestEnd);
}

async function extractEmbeddedRawPreviewUrl(file: File): Promise<string | null> {
  const readSize = Math.min(file.size, RAW_PREVIEW_READ_BYTES);
  const bytes = new Uint8Array(await file.slice(0, readSize).arrayBuffer());
  const jpegBytes = extractLargestEmbeddedJpeg(bytes);
  if (!jpegBytes) return null;
  const buffer = jpegBytes.buffer.slice(
    jpegBytes.byteOffset,
    jpegBytes.byteOffset + jpegBytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buffer], { type: "image/jpeg" });
  return URL.createObjectURL(blob);
}

function pickPositiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function resolveRawPreviewDimensions(meta: Record<string, unknown>, pixelLength: number): { width: number; height: number } | null {
  const sizes = (meta.sizes && typeof meta.sizes === "object") ? meta.sizes as Record<string, unknown> : {};
  const candidates: Array<[number | null, number | null]> = [
    [pickPositiveNumber(meta.width), pickPositiveNumber(meta.height)],
    [pickPositiveNumber(meta.iwidth), pickPositiveNumber(meta.iheight)],
    [pickPositiveNumber(meta.raw_width), pickPositiveNumber(meta.raw_height)],
    [pickPositiveNumber(meta.thumb_width), pickPositiveNumber(meta.thumb_height)],
    [pickPositiveNumber(sizes.width), pickPositiveNumber(sizes.height)],
    [pickPositiveNumber(sizes.iwidth), pickPositiveNumber(sizes.iheight)],
    [pickPositiveNumber(sizes.raw_width), pickPositiveNumber(sizes.raw_height)],
    [pickPositiveNumber(sizes.flip_width), pickPositiveNumber(sizes.flip_height)],
  ];

  for (const [width, height] of candidates) {
    if (!width || !height) continue;
    const rgbMatches = width * height * 3 === pixelLength;
    const rgbaMatches = width * height * 4 === pixelLength;
    if (rgbMatches || rgbaMatches) return { width, height };
  }

  for (const [width, height] of candidates) {
    if (width && height) return { width, height };
  }

  return null;
}

function buildCanvasPreviewUrl(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  maxEdge = 420,
): string | null {
  if (!width || !height || width < 1 || height < 1) return null;
  const sourceIsRgba = pixels.length === width * height * 4;
  const sourceIsRgb = pixels.length === width * height * 3;
  if (!sourceIsRgb && !sourceIsRgba) return null;

  const rgba = sourceIsRgba
    ? new Uint8ClampedArray(pixels)
    : new Uint8ClampedArray(width * height * 4);

  if (sourceIsRgb) {
    for (let src = 0, dst = 0; src < pixels.length; src += 3, dst += 4) {
      rgba[dst] = pixels[src] ?? 0;
      rgba[dst + 1] = pixels[src + 1] ?? 0;
      rgba[dst + 2] = pixels[src + 2] ?? 0;
      rgba[dst + 3] = 255;
    }
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) return null;
  sourceCtx.putImageData(new ImageData(rgba, width, height), 0, 0);

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = Math.max(1, Math.round(width * scale));
  targetCanvas.height = Math.max(1, Math.round(height * scale));
  const targetCtx = targetCanvas.getContext("2d");
  if (!targetCtx) return null;
  targetCtx.imageSmoothingEnabled = true;
  targetCtx.imageSmoothingQuality = "high";
  targetCtx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
  return targetCanvas.toDataURL("image/jpeg", 0.82);
}

async function generateRawPreviewUrl(file: File): Promise<string | null> {
  const cacheKey = getPreviewCacheKey(file);
  if (rawPreviewUrlCache.has(cacheKey)) {
    return rawPreviewUrlCache.get(cacheKey) ?? null;
  }
  if (rawPreviewPromiseCache.has(cacheKey)) {
    return rawPreviewPromiseCache.get(cacheKey) ?? null;
  }

  const task = (async () => {
    try {
      const embeddedPreview = await withTimeout(extractEmbeddedRawPreviewUrl(file), 8000, "embedded-preview");
      if (embeddedPreview) {
        rawPreviewUrlCache.set(cacheKey, embeddedPreview);
        return embeddedPreview;
      }

      const LibRaw = await loadLibRawModule();
      const raw = new LibRaw();
      const fileBuffer = new Uint8Array(await file.arrayBuffer());
      await withTimeout(
        raw.open(fileBuffer, {
          halfSize: true,
          outputColor: 1,
          outputBps: 8,
          userQual: 0,
          useCameraWb: true,
        }),
        12000,
        "libraw-open",
      );

      const meta = await withTimeout(raw.metadata(false), 5000, "libraw-metadata");
      const rawImage = await withTimeout(raw.imageData(), 12000, "libraw-imageData");
      let pixels: Uint8Array | Uint8ClampedArray | null = null;
      let width: number | null = null;
      let height: number | null = null;

      if (rawImage instanceof Uint8Array || rawImage instanceof Uint8ClampedArray) {
        pixels = rawImage;
      } else if (rawImage && typeof rawImage === "object") {
        const img = rawImage as Record<string, unknown>;
        const imgData = img.data;
        if (imgData instanceof Uint8Array || imgData instanceof Uint8ClampedArray) {
          pixels = imgData;
        }
        width = pickPositiveNumber(img.width, img.imageWidth, img.cols, img.w);
        height = pickPositiveNumber(img.height, img.imageHeight, img.rows, img.h);
      }

      if (!pixels) return null;
      const dims = (width && height)
        ? { width, height }
        : resolveRawPreviewDimensions(meta || {}, pixels.length);
      if (!dims) return null;

      const previewUrl = buildCanvasPreviewUrl(pixels, dims.width, dims.height);
      if (previewUrl) rawPreviewUrlCache.set(cacheKey, previewUrl);
      return previewUrl;
    } catch (error) {
      console.warn("[upload-preview] RAW preview failed", {
        file: file.name,
        error: error instanceof Error ? error.message : String(error || "unknown"),
      });
      return null;
    } finally {
      rawPreviewPromiseCache.delete(cacheKey);
    }
  })();

  rawPreviewPromiseCache.set(cacheKey, task);
  return task;
}

function getFileTypeTag(file: File): FileTypeFilter {
  const name = file.name.toLowerCase();
  if (RAW_EXT.test(name)) return "raw";
  if (VIDEO_EXT.test(name)) return "mp4";
  if (PDF_EXT.test(name)) return "pdf";
  if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(name)) return "jpg";
  return "raw"; // fallback für sonstige
}

function canPreviewImage(file: File): boolean {
  return BROWSER_PREVIEW_EXT.test(file.name);
}

function getFileIcon(tag: FileTypeFilter): string {
  if (tag === "mp4") return "🎬";
  if (tag === "pdf") return "📋";
  if (tag === "jpg") return "🖼";
  return "📷"; // raw / sonstiges
}

function FilePreviewCard({
  file,
  onRemove,
  progress,
  lang,
}: {
  file: File;
  onRemove: () => void;
  progress: number;
  lang: Lang;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState(false);
  const [rawPreviewBusy, setRawPreviewBusy] = useState(false);
  const showThumb = canPreviewImage(file) && !thumbError;
  const isRawPreviewCandidate = RAW_EXT.test(file.name);

  useEffect(() => {
    if (!showThumb) return;
    const url = URL.createObjectURL(file);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, showThumb]);

  useEffect(() => {
    let cancelled = false;
    if (showThumb || !isRawPreviewCandidate) return;
    const cacheKey = getPreviewCacheKey(file);
    const cached = rawPreviewUrlCache.get(cacheKey);
    if (cached) {
      setThumbUrl(cached);
      return;
    }
    setRawPreviewBusy(true);
    generateRawPreviewUrl(file)
      .then((url) => {
        if (cancelled || !url) return;
        setThumbUrl(url);
        setThumbError(false);
      })
      .finally(() => {
        if (!cancelled) setRawPreviewBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, isRawPreviewCandidate, showThumb]);

  const tag = getFileTypeTag(file);
  const tagLabel = tag === "raw" ? "RAW" : tag.toUpperCase();
  const ext = file.name.includes(".") ? file.name.split(".").pop()?.toUpperCase() ?? tagLabel : tagLabel;
  const nameParts = file.name.replace(/\.[^.]+$/, "");
  const displayName = nameParts.length > 16 ? `${nameParts.slice(0, 14)}…` : nameParts;
  const previewHint =
    tag === "raw"
      ? "Originaldatei"
      : tag === "pdf"
        ? "Dokument"
        : tag === "mp4"
          ? "Video"
          : "Bild";
  const isUploading = progress > 0 && progress < 100;

  return (
    <div className="group relative flex flex-col rounded-xl border border-zinc-700 bg-zinc-800/80 overflow-hidden transition hover:border-zinc-600">
      <div className="relative aspect-square w-full bg-zinc-900 flex flex-col items-center justify-center gap-1 overflow-hidden">
        {thumbUrl && !thumbError ? (
          <img
            src={thumbUrl}
            alt={file.name}
            className="h-full w-full object-cover"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-3 text-left">
            <div className="flex items-start justify-between gap-2">
              <span className="rounded-full border border-zinc-600 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-bold tracking-widest text-zinc-200">
                {ext}
              </span>
              <span className="text-xl leading-none" aria-hidden="true">{getFileIcon(tag)}</span>
            </div>
            <div className="space-y-1">
              <div className="line-clamp-3 break-words text-xs font-semibold leading-tight text-zinc-100">
                {nameParts || file.name}
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                {previewHint}
              </div>
              <div className="text-[10px] text-zinc-500">
                {formatBytes(file.size)}
              </div>
            </div>
          </div>
        )}
        {rawPreviewBusy && !thumbUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <div className="flex items-center gap-2 rounded-full border border-zinc-600 bg-zinc-900/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-200">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Preview
            </div>
          </div>
        )}
        {/* Fortschrittsoverlay während Upload */}
        {isUploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-sm font-bold text-white">{progress}%</span>
          </div>
        )}
        {progress >= 100 && (
          <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          </div>
        )}
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            title={t(lang, "upload.title.deleteFile")}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="rounded p-1.5 bg-black/50 text-zinc-300 hover:bg-red-500/80 hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/* Fortschrittsbalken */}
      {(isUploading || progress >= 100) && (
        <div className="absolute bottom-[44px] left-0 right-0 h-1 bg-zinc-700">
          <div
            className={`h-full transition-all ${progress >= 100 ? "bg-emerald-500" : "bg-[var(--accent)]"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <div className="p-2 space-y-0.5">
        <p className="text-[10px] font-medium text-zinc-300 truncate leading-tight" title={file.name}>
          {displayName}
        </p>
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex rounded-full bg-zinc-700 px-1.5 py-0.5 text-[9px] font-bold text-zinc-300">
            {ext}
          </span>
          <span className="text-[9px] text-zinc-500">{formatBytes(file.size)}</span>
        </div>
      </div>
    </div>
  );
}

const CHUNK_RETRY_ATTEMPTS = 5;
const BATCH_STATUS_POLL_MS = 500;
const UPLOAD_CONCURRENCY = 2;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildChunkSessionId(orderNo: string) {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `chs_${String(orderNo)}_${Date.now()}_${randomPart}`;
}

function FileTreeNode({
  node,
  token,
  orderNo,
  folderType,
  depth,
  onDelete,
  onClear,
  onLightbox,
  busy,
  lang,
}: {
  node: OrderUploadTreeNode;
  token: string;
  orderNo: string;
  folderType: string;
  depth: number;
  onDelete: (path: string) => void;
  onClear: (path: string) => void;
  onLightbox: (url: string) => void;
  busy: boolean;
  lang: Lang;
}) {
  const [open, setOpen] = useState(true);

  if (node.type === "dir") {
    const childFiles = hasAnyFile(node.children || []);
    return (
      <li className="my-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setOpen((v) => {
                return !v;
              })
            }
            className="flex items-center gap-1.5 font-semibold text-zinc-200 hover:text-[var(--accent)]"
          >
            <span className="text-sm">{open ? "📂" : "📁"}</span>
            <span className="text-sm">{node.name || t(lang, "upload.label.folder")}</span>
          </button>
          {childFiles && (
            <button
              type="button"
              title={t(lang, "upload.button.clearFolder")}
              disabled={busy}
              onClick={() => onClear(node.relativePath)}
              className="ml-1 rounded px-1 py-0.5 text-xs text-amber-500 hover:bg-amber-500/10 disabled:opacity-40"
            >
              🗑 {t(lang, "upload.button.clear")}
            </button>
          )}
        </div>
        {open && (node.children?.length ?? 0) > 0 && (
          <ul className="ml-4 border-l border-zinc-700 pl-3">
            {(node.children || []).map((child) => (
              <FileTreeNode
                key={child.relativePath}
                node={child}
                token={token}
                orderNo={orderNo}
                folderType={folderType}
                depth={depth + 1}
                onDelete={onDelete}
                onClear={onClear}
                onLightbox={onLightbox}
                busy={busy}
                lang={lang}
              />
            ))}
          </ul>
        )}
        {open && (node.children?.length ?? 0) === 0 && (
          <p className="ml-4 text-xs text-zinc-400 italic">{t(lang, "upload.label.empty")}</p>
        )}
      </li>
    );
  }

  const url = getOrderUploadFileUrl(token, orderNo, node.relativePath, folderType);
  const isImage = IMAGE_EXT.test(node.name || "");
  const meta = [
    formatBytes(node.size),
    node.modifiedAt ? new Date(node.modifiedAt).toLocaleString("de-CH") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="my-0.5 flex items-center gap-2 justify-between group">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isImage ? (
          <button
            type="button"
            onClick={() => onLightbox(url)}
            className="h-7 w-7 shrink-0 overflow-hidden rounded border border-zinc-700 bg-zinc-800 hover:border-[var(--accent)]"
            title={t(lang, "upload.label.preview")}
          >
            <img
              src={url}
              alt={node.name}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </button>
        ) : (
          <span className="text-sm shrink-0">📄</span>
        )}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent)] hover:underline text-xs truncate min-w-0 flex-1"
          title={node.name}
        >
          {node.name || t(lang, "upload.label.file")}
        </a>
        <span className="text-xs text-zinc-400 whitespace-nowrap shrink-0">{meta}</span>
      </div>
      <button
        type="button"
        title={t(lang, "upload.title.deleteFile")}
        disabled={busy}
        onClick={() => onDelete(node.relativePath)}
        className="shrink-0 rounded px-1 py-0.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        🗑
      </button>
    </li>
  );
}

export function UploadTool({ token, orderNo, folderType, onClose, onChanged, embedded = false }: Props) {
  const lang = useAuthStore((s) => s.language);
  const categoryOptions = getCategoryOptions(lang, folderType);
  const defaultCategory = (categoryOptions[0]?.key ?? "raw_bilder") as OrderUploadCategory;
  const [category, setCategory] = useState<OrderUploadCategory>(defaultCategory);
  const [uploadMode, setUploadMode] = useState<"existing" | "new_batch">("existing");
  const [batchFolderName, setBatchFolderName] = useState("");
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [currentBatch, setCurrentBatch] = useState<OrderUploadBatch | null>(null);
  const [fileTree, setFileTree] = useState<OrderUploadTreeNode[]>([]);
  const [folderName, setFolderName] = useState("");
  const [folderExists, setFolderExists] = useState(false);
  const [busy, setBusy] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>("all");
  const [fileProgress, setFileProgress] = useState<Record<string, number>>({});
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [sequenceUploadActive, setSequenceUploadActive] = useState(false);
  const [uploadPaused, setUploadPaused] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [uploadSpeed, setUploadSpeed] = useState<string | null>(null);
  const pausedRef = useRef(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmComment, setConfirmComment] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  useEffect(() => {
    const handleOffline = () => { setIsOffline(true); };
    const handleOnline = () => { setIsOffline(false); };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  function addFiles(newFiles: File[]) {
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      const unique = newFiles.filter((f) => !existing.has(f.name + f.size));
      return [...prev, ...unique];
    });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) addFiles(dropped);
  }

  const accept = categoryOptions.find((c) => c.key === category)?.accept || "*";
  const anyFile = hasAnyFile(fileTree);

  const loadTree = useCallback(async () => {
    const data = await getOrderUploads(token, orderNo, folderType);
    const normalizedTree = Array.isArray(data.tree) ? data.tree : [];
    setFileTree(normalizedTree);
    setFolderName(data.folderName || "");
    setFolderExists(Boolean(data.exists));
  }, [token, orderNo, folderType]);

  useEffect(() => {
    loadTree().catch((e) =>
      setStatus(e instanceof Error ? e.message : t(lang, "upload.error.loadFailed")),
    );
  }, [loadTree]);

  // Wenn keine Dateien vorhanden → Modus zurück auf "existing"
  useEffect(() => {
    if (!anyFile) {
      setUploadMode("existing");
    }
  }, [anyFile]);

  useEffect(() => {
    if (sequenceUploadActive) return;
    if (!currentBatch?.id) return;
    if (!["staged", "transferring", "retrying"].includes(currentBatch.status)) return;
    const intervalId = window.setInterval(() => {
      getUploadBatch(token, orderNo, currentBatch.id)
        .then(async (response) => {
          setCurrentBatch(response.batch);
          if (response.batch.status === "completed") {
            setBusy("");
            setUploadSuccess(true);
            setUploadError(false);
            setStatus(t(lang, "upload.success.completed"));
            await loadTree();
            await onChanged?.();
          }
          if (response.batch.status === "failed") {
            setBusy("");
            setUploadSuccess(false);
            setUploadError(true);
            setStatus(response.batch.errorMessage || t(lang, "upload.error.uploadFailed"));
          }
        })
        .catch((error) => {
          setBusy("");
          setUploadError(true);
          setStatus(error instanceof Error ? error.message : t(lang, "upload.error.uploadFailed"));
        });
    }, BATCH_STATUS_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [currentBatch?.id, currentBatch?.status, lang, loadTree, onChanged, orderNo, sequenceUploadActive, token]);

  async function waitForBatchCompletion(batchId: string) {
    const deadline = Date.now() + 10 * 60_000;
    while (true) {
      if (Date.now() > deadline) {
        throw new Error("Transfer-Timeout: Der Server hat den Batch nicht rechtzeitig abgeschlossen. Bitte Seite neu laden und Status prüfen.");
      }
      const response = await getUploadBatch(token, orderNo, batchId);
      setCurrentBatch(response.batch);
      if (response.batch.status === "completed") return response.batch;
      if (response.batch.status === "failed") {
        throw new Error(response.batch.errorMessage || t(lang, "upload.error.uploadFailed"));
      }
      await sleep(BATCH_STATUS_POLL_MS);
    }
  }

  async function waitWhilePaused() {
    while (pausedRef.current) {
      await sleep(300);
    }
  }

  async function uploadSingleFileChunked(
    file: File,
    sessionId: string,
    onFileProgressBytes: (uploadedBytes: number, speedBytesPerSec?: number) => void,
  ) {
    const init = await initChunkedUpload(token, orderNo, {
      sessionId,
      filename: file.name,
      size: Number(file.size || 0),
      type: file.type || "application/octet-stream",
      lastModified: Number(file.lastModified || 0),
    });
    const uploadId = init.uploadId;
    const totalChunks = Math.max(1, Math.ceil(Number(file.size || 0) / CHUNK_SIZE_BYTES));
    const chunkStatus = await getChunkedUploadStatus(token, orderNo, uploadId);
    const completed = chunkStatus.completed || {};

    let uploadedBytes = 0;
    for (let idx = 0; idx < totalChunks; idx += 1) {
      if (completed[idx]) {
        const start = idx * CHUNK_SIZE_BYTES;
        const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
        uploadedBytes += Math.max(0, end - start);
      }
    }
    onFileProgressBytes(uploadedBytes);

    let speedWindowBytes = 0;
    let speedWindowStart = Date.now();

    for (let idx = 0; idx < totalChunks; idx += 1) {
      await waitWhilePaused();
      if (completed[idx]) continue;
      const start = idx * CHUNK_SIZE_BYTES;
      const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
      const chunkBlob = file.slice(start, end);
      let attempt = 0;
      let chunkDone = false;

      while (!chunkDone) {
        await waitWhilePaused();
        let lastLoaded = 0;
        try {
          await uploadChunkPart(
            token,
            orderNo,
            {
              uploadId,
              index: idx,
              chunk: chunkBlob,
              filename: `${file.name}.part${idx}`,
            },
            (loaded) => {
              const delta = Math.max(0, Number(loaded || 0) - lastLoaded);
              lastLoaded += delta;
              speedWindowBytes += delta;
              const elapsed = Date.now() - speedWindowStart;
              const speed = elapsed > 500 ? Math.round((speedWindowBytes / elapsed) * 1000) : undefined;
              if (elapsed > 2000) {
                speedWindowBytes = 0;
                speedWindowStart = Date.now();
              }
              onFileProgressBytes(Math.min(file.size, uploadedBytes + lastLoaded), speed);
            },
          );
          uploadedBytes += Math.max(0, end - start);
          onFileProgressBytes(uploadedBytes);
          chunkDone = true;
        } catch (err) {
          attempt += 1;
          if (attempt >= CHUNK_RETRY_ATTEMPTS) throw err;
          const waitMs = Math.min(16000, 1000 * (2 ** (attempt - 1)));
          await sleep(waitMs);
        }
      }
    }

    await completeChunkedUpload(token, orderNo, uploadId);
  }

  function openConfirmDialog() {
    if (!files.length && !comment.trim()) {
      setStatus(t(lang, "upload.error.noFileOrComment"));
      return;
    }
    setConfirmComment(comment);
    setConfirmDone(false);
    setConfirmError("");
    setShowConfirmDialog(true);
  }

  async function doActualUploadAndConfirm() {
    const uploadComment = confirmComment.trim() || comment.trim();
    if (!files.length && !uploadComment) {
      setConfirmError(t(lang, "upload.error.noFileOrComment"));
      return;
    }
    setConfirmBusy(true);
    setConfirmError("");
    setBusy("upload");
    setProgress(0);
    setUploadedCount(0);
    setStatus("");
    setCurrentBatch(null);
    setUploadSuccess(false);
    setUploadError(false);
    setUploadSpeed(null);
    pausedRef.current = false;
    setUploadPaused(false);
    const total = files.length || 1;
    const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const sessionId = buildChunkSessionId(orderNo);

    try {
      setSequenceUploadActive(true);

      const completedBytesPerFile = new Array(files.length).fill(0) as number[];

      const uploadOneFile = async (file: File, index: number) => {
        const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
        setStatus(`Datei wird hochgeladen (${index + 1}/${files.length}): ${file.name}`);
        await uploadSingleFileChunked(file, sessionId, (bytes, speedBps) => {
          const clamped = Math.max(0, Math.min(Number(file.size || 0), bytes));
          completedBytesPerFile[index] = clamped;
          const filePct = file.size ? Math.round((clamped / Number(file.size)) * 100) : 0;
          setFileProgress((p) => ({ ...p, [fileKey]: Math.min(100, filePct) }));
          const absoluteBytes = completedBytesPerFile.reduce((s, b) => s + b, 0);
          const pct = totalBytes > 0
            ? Math.round((absoluteBytes / totalBytes) * 100)
            : Math.round(((index + (clamped > 0 ? 0.5 : 0)) / Math.max(1, files.length)) * 100);
          setProgress(Math.min(99, pct));
          const doneCount = completedBytesPerFile.filter((b, i) => b >= Number(files[i]?.size || 0)).length;
          setUploadedCount(Math.min(total, doneCount));
          if (speedBps !== undefined && speedBps > 0) {
            if (speedBps >= 1024 * 1024) {
              setUploadSpeed(`${(speedBps / (1024 * 1024)).toFixed(1)} MB/s`);
            } else if (speedBps >= 1024) {
              setUploadSpeed(`${Math.round(speedBps / 1024)} KB/s`);
            } else {
              setUploadSpeed(`${speedBps} B/s`);
            }
          }
        });
        completedBytesPerFile[index] = Number(file.size || 0);
        setFileProgress((p) => ({ ...p, [fileKey]: 100 }));
        setUploadedCount((c) => Math.min(total, c + 1));
      };

      const queue = files.map((file, index) => ({ file, index }));
      const running: Promise<void>[] = [];
      const errors: Error[] = [];

      const runNext = async (): Promise<void> => {
        const item = queue.shift();
        if (!item) return;
        try {
          await uploadOneFile(item.file, item.index);
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
        await runNext();
      };

      const slots = Math.min(UPLOAD_CONCURRENCY, files.length);
      for (let i = 0; i < slots; i += 1) {
        running.push(runNext());
      }
      await Promise.all(running);

      if (errors.length > 0) throw errors[0];

      setBusy("transfer");
      setStatus(t(lang, "upload.status.transferring"));
      setUploadSpeed(null);
      const finalizePayload = {
        sessionId,
        category,
        uploadMode,
        folderType,
        batchFolderName: uploadMode === "new_batch" ? batchFolderName.trim() || undefined : undefined,
        comment: uploadComment || undefined,
      };
      const result =
        files.length > 0
          ? await finalizeChunkedUpload(token, orderNo, finalizePayload)
          : await uploadOrderFiles(token, orderNo, {
              category,
              uploadMode,
              folderType,
              batchFolderName: uploadMode === "new_batch" ? batchFolderName.trim() || undefined : undefined,
              comment: uploadComment || undefined,
              files: [],
            });
      const finished = await waitForBatchCompletion(result.batch.id);
      setCurrentBatch(finished);
      setUploadedCount(total);
      setUploadSuccess(false);
      setUploadError(false);
      setStatus("");
      await loadTree();
      await onChanged?.();
      setFiles([]);
      setFileProgress({});
      setComment("");

      await confirmUploadBatch(token, orderNo, finished.id, uploadComment || undefined);
      setConfirmDone(true);
      setUploadSuccess(true);
      setStatus(t(lang, "upload.confirm.sent"));
    } catch (e) {
      setUploadError(true);
      setConfirmError(e instanceof Error ? e.message : t(lang, "upload.error.uploadFailed"));
      setStatus(e instanceof Error ? e.message : t(lang, "upload.error.uploadFailed"));
    } finally {
      setSequenceUploadActive(false);
      setConfirmBusy(false);
      setBusy("");
      pausedRef.current = false;
      setUploadPaused(false);
      setUploadSpeed(null);
    }
  }

  function handlePauseResume() {
    if (uploadPaused) {
      pausedRef.current = false;
      setUploadPaused(false);
      setStatus("");
    } else {
      pausedRef.current = true;
      setUploadPaused(true);
      setStatus("Upload pausiert – klicke Fortsetzen um weiterzumachen");
    }
  }

  function handleDialogClose() {
    setShowConfirmDialog(false);
    if (!confirmDone) {
      setConfirmComment("");
      setConfirmError("");
    }
  }

  async function handleDelete(path: string) {
    if (!confirm(`${t(lang, "upload.confirm.deleteFile")}\n${path}`)) return;
    setBusy("delete");
    setStatus("");
    try {
      await deleteOrderUploadFile(token, orderNo, path, folderType);
      await loadTree();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t(lang, "upload.error.deleteFailed"));
    } finally {
      setBusy("");
    }
  }

  async function handleClear(path: string) {
    if (!confirm(`${t(lang, "upload.confirm.clearFolder")}\n${path}`)) return;
    setBusy("clear");
    setStatus("");
    try {
      const res = await clearOrderUploadFolder(token, orderNo, path, folderType);
      setStatus(
        res.deleted > 0 ? `${res.deleted} ${t(lang, "upload.success.filesDeleted")}` : t(lang, "upload.info.folderAlreadyEmpty"),
      );
      await loadTree();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t(lang, "upload.error.clearFailed"));
    } finally {
      setBusy("");
    }
  }

  async function handleRetryTransfer() {
    if (!currentBatch) return;
    setBusy("retry");
    setUploadError(false);
    setStatus(t(lang, "upload.status.transferring"));
    try {
      const response = await retryUploadBatch(token, orderNo, currentBatch.id);
      setCurrentBatch(response.batch);
    } catch (e) {
      setUploadError(true);
      setStatus(e instanceof Error ? e.message : t(lang, "upload.error.uploadFailed"));
      setBusy("");
    }
  }


  const duplicateNames = files.reduce<Set<string>>((acc, f, idx) => {
    if (files.findIndex((g, j) => j !== idx && g.name === f.name) !== -1) acc.add(f.name);
    return acc;
  }, new Set<string>());
  const hasDuplicates = duplicateNames.size > 0;
  const isBusy = Boolean(busy);

  const filterCounts = useMemo(() => {
    const counts: Record<FileTypeFilter, number> = { all: files.length, raw: 0, jpg: 0, mp4: 0, pdf: 0 };
    for (const f of files) {
      const tag = getFileTypeTag(f);
      counts[tag] += 1;
    }
    return counts;
  }, [files]);

  const filteredFiles = useMemo(() => {
    if (fileTypeFilter === "all") return files;
    return files.filter((f) => getFileTypeTag(f) === fileTypeFilter);
  }, [files, fileTypeFilter]);
  const transferActive = Boolean(currentBatch && ["staged", "transferring", "retrying"].includes(currentBatch.status));
  const uploadedEntries = useMemo(() => currentBatch?.files || [], [currentBatch]);

  const containerClassName = embedded
    ? "rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6 shadow-xl"
    : "max-h-[92vh] w-full max-w-full sm:max-w-4xl overflow-auto rounded-2xl bg-zinc-900 border border-zinc-800 p-4 sm:p-6 shadow-2xl my-auto";
  const wrapperClassName = embedded
    ? ""
    : "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-2 sm:p-4";

  return (
    <div className={wrapperClassName}>
      <div className={containerClassName}>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-zinc-100">
              ☁ {t(lang, "upload.title").replace("{{orderNo}}", orderNo)}
            </h3>
            <span className="text-sm text-[var(--accent)] font-medium">
              {folderType === "raw_material" ? t(lang, "upload.folderType.rawMaterial") : t(lang, "upload.folderType.customerFolder")}
            </span>
          </div>
          {onClose ? (
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              {t(lang, "common.close")}
            </button>
          ) : null}
        </div>

        {/* Upload-Formular */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="uploadCategory" className="mb-1 block text-sm font-semibold text-zinc-400">
              {t(lang, "upload.label.targetFolder")}
            </label>
            <select
              id="uploadCategory"
              name="uploadCategory"
              className="ui-input"
              value={category}
              onChange={(e) => setCategory(e.target.value as OrderUploadCategory)}
            >
              {categoryOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="uploadMode" className="mb-1 block text-sm font-semibold text-zinc-400">
              {t(lang, "upload.label.deliveryMode")}
            </label>
            <select
              id="uploadMode"
              name="uploadMode"
              className="ui-input"
              value={uploadMode}
              onChange={(e) => setUploadMode(e.target.value as "existing" | "new_batch")}
            >
              <option value="existing">{t(lang, "upload.select.addToExisting")}</option>
              <option value="new_batch">{t(lang, "upload.select.newSubfolder")}</option>
            </select>
          </div>
          {uploadMode === "new_batch" && (
            <div className="sm:col-span-2">
              <label htmlFor="batchFolderName" className="mb-1 block text-sm font-semibold text-zinc-400">
                {t(lang, "upload.label.newFolderName")}
              </label>
              <input
                id="batchFolderName"
                type="text"
                className="ui-input"
                maxLength={80}
                value={batchFolderName}
                onChange={(e) => setBatchFolderName(e.target.value)}
                placeholder={t(lang, "upload.placeholder.newFolderName")}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label htmlFor="uploadComment" className="mb-1 block text-sm font-semibold text-zinc-400">
              {t(lang, "upload.label.comment")}
            </label>
            <textarea
              id="uploadComment"
              name="uploadComment"
              rows={2}
              className="ui-input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t(lang, "upload.placeholder.comment")}
            />
          </div>
          <div className="sm:col-span-2 space-y-3">
            <label className="mb-1 block text-sm font-semibold text-zinc-400">
              {t(lang, "upload.label.selectOrDrop")}
            </label>
            <div
              className={`relative rounded-xl border-2 border-dashed p-5 text-center transition-colors cursor-pointer ${
                isDragging
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/30"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("uploadFileHidden")?.click()}
            >
              <input
                id="uploadFileHidden"
                type="file"
                multiple
                accept={accept}
                className="sr-only"
                onChange={(e) => addFiles(Array.from(e.target.files || []))}
              />
              <UploadCloud className="mx-auto mb-2 h-8 w-8 text-zinc-500" />
              <p className="text-sm text-zinc-400">
                {t(lang, "upload.hint.dragDropPrepend")}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                {t(lang, "upload.hint.clickOrTap")}
              </p>
              {accept !== "*" ? <p className="mt-0.5 text-[10px] text-zinc-600">{accept}</p> : null}
            </div>

            {files.length > 0 && (
              <>
                <div className="flex flex-wrap gap-1">
                  {(["all", "raw", "jpg", "mp4", "pdf"] as const).map((filt) => (
                    <button
                      key={filt}
                      type="button"
                      onClick={() => setFileTypeFilter(filt)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        fileTypeFilter === filt
                          ? "bg-[var(--accent)] text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {filt === "all" ? `ALLE (${filterCounts.all})` : `${filt.toUpperCase()} (${filterCounts[filt]})`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-200">
                      {filteredFiles.length} {t(lang, "upload.label.filesSelected")}
                    </span>
                    {hasDuplicates && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        {t(lang, "upload.label.duplicates")}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                    onClick={() => setFiles([])}
                  >
                    {t(lang, "upload.button.removeAll")}
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[320px] overflow-y-auto pr-1">
                  {filteredFiles.map((f) => {
                    const globalIdx = files.indexOf(f);
                    const fileKey = `${f.name}-${f.size}-${f.lastModified}`;
                    const prog = busy === "upload" ? (fileProgress[fileKey] ?? 0) : 0;
                    return (
                      <FilePreviewCard
                        key={fileKey}
                        file={f}
                        progress={prog}
                        lang={lang}
                        onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== globalIdx))}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {isOffline && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Keine Internetverbindung – Upload pausiert
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={openConfirmDialog}
            disabled={isBusy || isOffline}
          >
            {busy === "upload"
              ? <><RefreshCw className="h-4 w-4 animate-spin" />{t(lang, "upload.status.uploading")}</>
              : <><UploadCloud className="h-4 w-4" />{t(lang, "upload.button.start")}</>}
          </button>
          {busy === "upload" && (
            <button
              className="btn-secondary inline-flex items-center gap-1.5"
              onClick={handlePauseResume}
              type="button"
            >
              {uploadPaused
                ? <><RefreshCw className="h-4 w-4" />Fortsetzen</>
                : <><AlertTriangle className="h-4 w-4" />Pause</>}
            </button>
          )}
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={() => loadTree()}
            disabled={isBusy}
          >
            <RefreshCw className="h-4 w-4" />
            {t(lang, "common.refresh")}
          </button>
          {currentBatch?.status === "failed" ? (
            <button
              className="btn-secondary inline-flex items-center gap-1.5"
              onClick={handleRetryTransfer}
              disabled={isBusy}
            >
              <RefreshCw className="h-4 w-4" />
              {t(lang, "upload.button.retryTransfer")}
            </button>
          ) : null}
        </div>

        {/* Fortschrittsbalken */}
        {(busy === "upload" || transferActive) && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-2">
                {busy === "upload"
                  ? `${uploadedCount} von ${files.length > 0 ? files.length : "?"} Datei${files.length !== 1 ? "en" : ""}`
                  : t(lang, "upload.label.transferStatus")}
                {uploadPaused && <span className="text-amber-400 font-semibold">– Pausiert</span>}
                {uploadSpeed && busy === "upload" && !uploadPaused && (
                  <span className="text-zinc-500">{uploadSpeed}</span>
                )}
              </span>
              <span>{busy === "upload" ? `${progress}%` : currentBatch?.status || "-"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-zinc-800">
              <div
                className={`h-full transition-all ${transferActive ? "animate-pulse bg-[var(--accent)]" : uploadPaused ? "bg-amber-500" : "bg-[var(--accent)]"}`}
                style={{ width: `${busy === "upload" ? progress : transferActive ? 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Upload-Ergebnis */}
        {currentBatch && (
          <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 text-sm">
            <div className="mb-2 font-semibold text-zinc-100">{t(lang, "upload.label.result")}</div>
            <div className="mb-2 text-xs text-zinc-400">
              {t(lang, "upload.label.targetPath")}{currentBatch.targetRelativePath || "-"}
            </div>
            <div className="space-y-1">
              {uploadedEntries.map((f, idx) => {
                if (f.status === "stored")
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs text-green-700">
                      <span>✓</span>
                      <span>{t(lang, "upload.result.stored")}{f.storedName || f.fileName || f.originalName}</span>
                    </div>
                  );
                if (f.status === "skipped_invalid_type")
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs text-red-600">
                      <span>✗</span>
                      <span>
                        {t(lang, "upload.result.invalidType")}{f.storedName || f.fileName || f.originalName} — {f.errorMessage || f.reason}
                      </span>
                    </div>
                  );
                if (f.status === "failed") {
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs text-red-600">
                      <span>✗</span>
                      <span>{f.originalName} — {f.errorMessage || t(lang, "upload.error.uploadFailed")}</span>
                    </div>
                  );
                }
                if (f.status === "staged") {
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs text-zinc-400">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>{f.originalName}</span>
                    </div>
                  );
                }
                return (
                  <div key={idx} className="flex items-center gap-2 text-xs text-amber-600">
                    <span>–</span>
                    <span>{t(lang, "upload.result.skippedDuplicate")}{f.storedName || f.fileName || f.originalName}</span>
                  </div>
                );
              })}
              {!uploadedEntries.length && (
                <div className="text-xs text-zinc-400">{t(lang, "upload.result.noEntries")}</div>
              )}
            </div>
          </div>
        )}

        {/* Dateibaum */}
        {(anyFile || folderExists) && (
          <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
            <div className="mb-2 font-semibold text-sm text-zinc-100">{t(lang, "upload.label.alreadyUploaded")}</div>
            {folderName && (
              <div className="mb-2 text-xs text-zinc-400">{folderName}</div>
            )}
            <ul className="list-none p-0 m-0">
              {fileTree.map((node) => (
                <FileTreeNode
                  key={node.relativePath}
                  node={node}
                  token={token}
                  orderNo={orderNo}
                  folderType={folderType}
                  depth={0}
                  onDelete={handleDelete}
                  onClear={handleClear}
                  onLightbox={setLightbox}
                  busy={isBusy}
                  lang={lang}
                />
              ))}
            </ul>
          </div>
        )}

        {status && (
          <div className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            uploadSuccess
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
              : uploadError
              ? "border-red-500/20 bg-red-500/10 text-red-500"
              : "border-zinc-700 bg-zinc-800/50 text-zinc-300"
          }`}>
            {uploadSuccess
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              : <AlertTriangle className={`h-4 w-4 shrink-0 ${uploadError ? "text-red-500" : "text-zinc-500"}`} />}
            <span>{status}</span>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/85 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/40"
          >
            ✕ {t(lang, "common.close")}
          </button>
          <img
            src={lightbox}
            alt={t(lang, "upload.label.preview")}
            className="max-h-[90vh] max-w-[90vw] rounded shadow-2xl object-contain my-auto"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Bestätigungs-Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
            {/* Dialog Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <h3 className="text-lg font-bold text-zinc-100">
                {confirmDone ? (
                  <span className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                    {t(lang, "upload.confirm.sent")}
                  </span>
                ) : (
                  t(lang, "upload.confirm.title")
                )}
              </h3>
              <button
                type="button"
                onClick={handleDialogClose}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!confirmDone ? (
                <>
                  {/* Während des Uploads: Fortschrittsanzeige */}
                  {confirmBusy ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <RefreshCw className={`h-5 w-5 shrink-0 text-[var(--accent)] ${uploadPaused ? "" : "animate-spin"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-zinc-100">
                            {uploadPaused
                              ? <span className="text-amber-400">Upload pausiert</span>
                              : busy === "transfer"
                              ? t(lang, "upload.status.transferring")
                              : `${t(lang, "upload.status.uploading")} ${uploadedCount > 0 ? `${uploadedCount} / ${files.length}` : ""}`}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5">
                            {status && !uploadPaused && (
                              <p className="text-xs text-zinc-400 truncate">{status}</p>
                            )}
                            {uploadSpeed && busy === "upload" && !uploadPaused && (
                              <span className="text-xs text-zinc-500 shrink-0">{uploadSpeed}</span>
                            )}
                          </div>
                        </div>
                        {busy === "upload" && (
                          <button
                            type="button"
                            onClick={handlePauseResume}
                            className="shrink-0 btn-secondary text-xs px-2 py-1"
                          >
                            {uploadPaused ? "Fortsetzen" : "Pause"}
                          </button>
                        )}
                      </div>
                      {/* Gesamtfortschritt */}
                      <div>
                        <div className="flex justify-between text-xs text-zinc-400 mb-1">
                          <span>
                            {busy === "transfer"
                              ? t(lang, "upload.label.transferStatus")
                              : `${Math.min(uploadedCount + 1, files.length)} von ${files.length} Datei${files.length !== 1 ? "en" : ""}`}
                          </span>
                          <span>{busy === "upload" ? `${progress}%` : ""}</span>
                        </div>
                        <div className="h-2 w-full rounded bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${busy === "transfer" ? "animate-pulse bg-[var(--accent)]" : uploadPaused ? "bg-amber-500" : "bg-[var(--accent)]"}`}
                            style={{ width: `${busy === "transfer" ? 100 : progress}%` }}
                          />
                        </div>
                      </div>
                      {/* Dateiliste mit individuellem Fortschritt */}
                      {files.length > 0 && (
                        <div className="max-h-36 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800/50 p-2 space-y-1">
                          {files.map((f) => {
                            const fKey = `${f.name}-${f.size}-${f.lastModified}`;
                            const fProg = fileProgress[fKey] ?? 0;
                            const done = fProg >= 100;
                            const active = fProg > 0 && fProg < 100;
                            return (
                              <div key={fKey} className="flex items-center gap-2 text-xs">
                                <span className="h-5 w-5 shrink-0 flex items-center justify-center">
                                  {done
                                    ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                    : active
                                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
                                    : <span className="h-4 w-4 rounded-full border border-zinc-600" />}
                                </span>
                                <span className={`truncate flex-1 ${done ? "text-zinc-400" : active ? "text-zinc-100" : "text-zinc-500"}`}>{f.name}</span>
                                <span className="shrink-0 text-zinc-500 tabular-nums w-8 text-right">{active ? `${fProg}%` : done ? "✓" : ""}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Vor dem Upload: Bestätigungsdialog */
                    <>
                      <p className="text-sm font-semibold text-zinc-100">{t(lang, "upload.confirm.question")}</p>
                      <p className="text-xs text-zinc-400">{t(lang, "upload.confirm.hint")}</p>

                      {/* Datei-Vorschau */}
                      {files.length > 0 && (
                        <div>
                          <div className="mb-2 text-xs font-semibold text-zinc-400">{t(lang, "upload.label.filesToUpload")}</div>
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800/50 p-2 space-y-1">
                            {files.map((f, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <span className="h-7 w-7 shrink-0 flex items-center justify-center rounded border border-zinc-600 bg-zinc-800 text-zinc-400 text-sm">
                                  {getFileIcon(getFileTypeTag(f))}
                                </span>
                                <span className="truncate text-zinc-300 flex-1">{f.name}</span>
                                <span className="shrink-0 text-zinc-500">{formatBytes(f.size)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Abschluss-Kommentar */}
                      <div>
                        <label htmlFor="confirmComment" className="mb-1 block text-xs font-semibold text-zinc-400">
                          {t(lang, "upload.confirm.finalComment")}
                        </label>
                        <textarea
                          id="confirmComment"
                          rows={3}
                          className="ui-input text-sm"
                          value={confirmComment}
                          onChange={(e) => setConfirmComment(e.target.value)}
                          placeholder={t(lang, "upload.confirm.finalCommentPlaceholder")}
                          disabled={confirmBusy}
                        />
                        <p className="mt-1 text-xs text-zinc-500">{t(lang, "upload.confirm.finalCommentHint")}</p>
                      </div>

                      {confirmError && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {confirmError}
                        </div>
                      )}

                      <div className="flex flex-col gap-2 pt-1">
                        <button
                          type="button"
                          onClick={doActualUploadAndConfirm}
                          disabled={confirmBusy}
                          className="btn-primary inline-flex w-full items-center justify-center gap-2"
                        >
                          <Send className="h-4 w-4" />
                          {t(lang, "upload.confirm.buttonConfirm")}
                        </button>
                        <button
                          type="button"
                          onClick={handleDialogClose}
                          disabled={confirmBusy}
                          className="btn-secondary inline-flex w-full items-center justify-center gap-2"
                        >
                          <UploadCloud className="h-4 w-4" />
                          {t(lang, "upload.confirm.buttonContinue")}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {t(lang, "upload.confirm.sent")}
                  </div>
                  <button
                    type="button"
                    onClick={handleDialogClose}
                    className="btn-secondary w-full"
                  >
                    {t(lang, "common.close")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

