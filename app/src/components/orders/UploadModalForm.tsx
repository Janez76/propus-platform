/**
 * Kompaktes Upload-Formular fuer den Popup-Dialog auf /upload.
 * Eigene Komponente statt UploadTool, damit das Layout des Modal-Designs
 * (Title-Block, Toggle-Slider, Files-Preview-Box, History-Footer) 1:1
 * umgesetzt werden kann. Verwendet dieselbe Chunked-Upload-Pipeline wie
 * UploadTool (4 MB Chunks, Retry mit Backoff, Resume, finalize), damit
 * auch grosse Rohmaterial-Uploads (>>500 MB, viele NEFs) zuverlaessig
 * durchgehen — der direkte Multipart-Endpoint /upload wird bewusst nicht
 * mehr genutzt, weil dort Cloudflare und Server-Limits (max 120 Files /
 * 10 GB pro Datei) bei groesseren Liefermengen abbrechen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CloudUpload, X, Image as ImageIcon, Check } from "lucide-react";
import {
  completeChunkedUpload,
  confirmUploadBatch,
  finalizeChunkedUpload,
  getChunkedUploadStatus,
  initChunkedUpload,
  uploadChunkPart,
  type OrderFolderType,
  type OrderUploadBatch,
  type OrderUploadCategory,
  type OrderUploadMode,
} from "../../api/orders";

type Category = {
  key: OrderUploadCategory;
  label: string;
  accept: string;
  folderTypes: OrderFolderType[];
};

/** Identisch zur Logik in UploadTool — pro folderType passende Kategorien. */
const CATEGORIES: Category[] = [
  { key: "raw_bilder",      label: "Rohbilder",                accept: "image/*,.tif,.tiff,.heic,.dng,.raw,.cr2,.cr3,.nef,.arw,.orf,.rw2,.psd,.psb", folderTypes: ["raw_material"] },
  { key: "raw_grundrisse",  label: "Roh-Grundrisse",           accept: ".pdf,.jpg,.jpeg,.png,.svg,.tif,.tiff,.dwg,.dxf",                            folderTypes: ["raw_material"] },
  { key: "raw_video",       label: "Roh-Video",                accept: "video/*,.mp4,.mov,.avi,.mxf,.mts,.m2ts,.mkv,.wmv,.webm,.r3d,.braw,.dng",    folderTypes: ["raw_material"] },
  { key: "raw_sonstiges",   label: "Roh-Sonstiges",            accept: "*",                                                                         folderTypes: ["raw_material"] },
  { key: "final_fullsize",  label: "Finale Bilder (Fullsize)", accept: ".jpg,.jpeg,.png,.tif,.tiff,.heic,.heif,.psd,.psb",                          folderTypes: ["customer_folder"] },
  { key: "final_websize",   label: "Finale Bilder (Websize)",  accept: ".jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif",                              folderTypes: ["customer_folder"] },
  { key: "final_grundrisse",label: "Finale Grundrisse",        accept: ".pdf,.jpg,.jpeg,.png,.svg,.tif,.tiff",                                       folderTypes: ["customer_folder"] },
  { key: "final_video",     label: "Finales Video",            accept: ".mp4,.mov,.mkv,.webm,.m4v",                                                  folderTypes: ["customer_folder"] },
  { key: "zur_auswahl",     label: "Zur Auswahl (JPG)",        accept: ".jpg,.jpeg",                                                                 folderTypes: ["customer_folder"] },
  { key: "selection",       label: "Zur Auswahl",              accept: ".jpg,.jpeg,.png,.webp",                                                      folderTypes: ["selection"] },
];

const MODE_OPTIONS: Array<{ value: OrderUploadMode; label: string }> = [
  { value: "existing",  label: "Zum bestehenden Ordner hinzufuegen" },
  { value: "new_batch", label: "Neuer Unterordner mit Zeitstempel" },
];

// Chunked-Upload-Konstanten — identisch zu UploadTool, damit das Modal
// dieselbe Pipeline wie das vollwertige Tool nutzt.
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
const CHUNK_RETRY_ATTEMPTS = 5;
const UPLOAD_CONCURRENCY = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildChunkSessionId(orderNo: string): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `chs_${String(orderNo)}_${Date.now()}_${randomPart}`;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return iso;
  }
}

function folderTypeLabel(ft: OrderFolderType): string {
  if (ft === "raw_material") return "Rohmaterial";
  if (ft === "selection") return "Zur Auswahl";
  return "Kundenordner";
}

export type UploadModalFormProps = {
  token: string;
  orderNo: string;
  folderType: OrderFolderType;
  address?: string | null;
  batches: OrderUploadBatch[];
  onChanged?: () => Promise<void> | void;
  onClose: () => void;
};

export function UploadModalForm({
  token,
  orderNo,
  folderType,
  address,
  batches,
  onChanged,
  onClose,
}: UploadModalFormProps) {
  // Kategorie-Optionen passend zum aktiven folderType
  const categoryOptions = useMemo(
    () => CATEGORIES.filter((c) => c.folderTypes.includes(folderType)),
    [folderType],
  );
  const [category, setCategory] = useState<OrderUploadCategory>(
    () => categoryOptions[0]?.key ?? "raw_bilder",
  );
  const acceptStr = categoryOptions.find((c) => c.key === category)?.accept ?? "*";

  const [mode, setMode] = useState<OrderUploadMode>("existing");
  const [addSuffix, setAddSuffix] = useState(true);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ count: number; bytes: number } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);

  // Wenn folderType wechselt, Default-Kategorie zuruecksetzen.
  useEffect(() => {
    setCategory(categoryOptions[0]?.key ?? "raw_bilder");
  }, [categoryOptions]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + (f.size || 0), 0), [files]);

  const addFiles = useCallback((incoming: File[]) => {
    if (!incoming.length) return;
    setFiles((prev) => {
      const next = prev.slice();
      const seen = new Set(prev.map((f) => `${f.name}::${f.size}::${f.lastModified}`));
      for (const f of incoming) {
        const key = `${f.name}::${f.size}::${f.lastModified}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(f);
      }
      return next;
    });
    setError("");
    setSuccess(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const list = Array.from(e.dataTransfer?.files ?? []);
    if (list.length) addFiles(list);
  }, [addFiles]);

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    if (list.length) addFiles(list);
    e.target.value = "";
  }, [addFiles]);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setError("");
  }, []);

  const onSubmit = useCallback(async () => {
    if (busy) return;
    if (files.length === 0) {
      setError("Bitte mindestens eine Datei waehlen.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess(null);
    setProgress(0);

    const sessionId = buildChunkSessionId(orderNo);
    const completedBytesPerFile = new Array(files.length).fill(0) as number[];

    const reportProgress = () => {
      if (totalBytes <= 0) return;
      const absoluteBytes = completedBytesPerFile.reduce((s, b) => s + b, 0);
      const pct = Math.min(99, Math.round((absoluteBytes / totalBytes) * 100));
      setProgress(pct);
    };

    const uploadOneFile = async (file: File, index: number) => {
      const init = await initChunkedUpload(token, orderNo, {
        sessionId,
        filename: file.name,
        size: Number(file.size || 0),
        type: file.type || "application/octet-stream",
        lastModified: Number(file.lastModified || 0),
      });
      const uploadId = init.uploadId;
      const fileSize = Number(file.size || 0);
      const totalChunks = Math.max(1, Math.ceil(fileSize / CHUNK_SIZE_BYTES));

      // Status fragen, damit nach einem Verbindungsabbruch nur fehlende Chunks neu hochgeladen werden.
      const chunkStatus = await getChunkedUploadStatus(token, orderNo, uploadId);
      const completed = chunkStatus.completed || {};

      let uploadedBytes = 0;
      for (let idx = 0; idx < totalChunks; idx += 1) {
        if (completed[idx]) {
          const start = idx * CHUNK_SIZE_BYTES;
          const end = Math.min(start + CHUNK_SIZE_BYTES, fileSize);
          uploadedBytes += Math.max(0, end - start);
        }
      }
      completedBytesPerFile[index] = uploadedBytes;
      reportProgress();

      for (let idx = 0; idx < totalChunks; idx += 1) {
        if (completed[idx]) continue;
        const start = idx * CHUNK_SIZE_BYTES;
        const end = Math.min(start + CHUNK_SIZE_BYTES, fileSize);
        const chunkBlob = file.slice(start, end);
        const chunkBytes = end - start;

        let attempt = 0;
        while (true) {
          try {
            await uploadChunkPart(
              token,
              orderNo,
              { uploadId, index: idx, chunk: chunkBlob, filename: `${file.name}.part${idx}` },
              (loaded) => {
                const chunkLoaded = Math.min(chunkBytes, Number(loaded || 0));
                completedBytesPerFile[index] = uploadedBytes + chunkLoaded;
                reportProgress();
              },
            );
            uploadedBytes += chunkBytes;
            completedBytesPerFile[index] = uploadedBytes;
            reportProgress();
            break;
          } catch (err) {
            attempt += 1;
            if (attempt >= CHUNK_RETRY_ATTEMPTS) throw err;
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s
            await sleep(Math.min(16000, 1000 * (2 ** (attempt - 1))));
          }
        }
      }

      await completeChunkedUpload(token, orderNo, uploadId);
      completedBytesPerFile[index] = fileSize;
      reportProgress();
    };

    try {
      // Bounded-Concurrency Queue (zwei parallele Datei-Uploads).
      const queue = files.map((file, index) => ({ file, index }));
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
      await Promise.all(Array.from({ length: slots }, () => runNext()));
      if (errors.length > 0) throw errors[0];

      // Finalize: Staging-Batch in DB anlegen, NAS-Transfer laeuft im Hintergrund.
      const finalizeResult = await finalizeChunkedUpload(token, orderNo, {
        sessionId,
        category,
        uploadMode: mode,
        folderType,
        comment: comment.trim() || undefined,
        ...(addSuffix ? { addOrderSuffix: true } : {}),
      });

      // Server-seitige Bestaetigung — verschiebt das Batch ins NAS-Staging und versendet ggf. Mail.
      try {
        await confirmUploadBatch(token, orderNo, finalizeResult.batch.id, comment.trim() || undefined);
      } catch {
        /* Confirm-Fehler ignorieren, der Upload selbst war erfolgreich */
      }

      setProgress(100);
      setSuccess({ count: files.length, bytes: totalBytes });
      setFiles([]);
      setComment("");
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }, [busy, files, totalBytes, category, mode, folderType, comment, addSuffix, token, orderNo, onChanged]);

  // Bereits-hochgeladen-History: nur die fertigen Batches anzeigen, neueste oben.
  const completedHistory = useMemo(
    () =>
      (batches || [])
        .filter((b) => b.status === "completed")
        .slice(0, 25),
    [batches],
  );

  return (
    <div className="umf">
      {/* Form-Body */}
      <div className="umf-body">

        <div className="umf-fields">
          <label className="umf-field">
            <span className="umf-label">Zielordner <span className="umf-req">*</span></span>
            <div className="umf-select-wrap">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as OrderUploadCategory)}
                disabled={busy}
              >
                {categoryOptions.length === 0 ? (
                  <option value="">— keine Kategorien —</option>
                ) : (
                  categoryOptions.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))
                )}
              </select>
              <ChevronDown className="umf-select-chev h-3 w-3" aria-hidden />
            </div>
          </label>

          <label className="umf-field">
            <span className="umf-label">Nachlieferung</span>
            <div className="umf-select-wrap">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as OrderUploadMode)}
                disabled={busy}
              >
                {MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown className="umf-select-chev h-3 w-3" aria-hidden />
            </div>
          </label>
        </div>

        <button
          type="button"
          className={`umf-toggle${addSuffix ? " is-on" : ""}`}
          onClick={() => setAddSuffix((v) => !v)}
          disabled={busy}
          aria-pressed={addSuffix}
        >
          <span className="umf-toggle-switch"><span className="umf-toggle-knob" /></span>
          <span className="umf-toggle-text">
            Auftragsnr. an Dateinamen anhaengen <strong>#{orderNo}</strong>
          </span>
          <span className="umf-toggle-hint">_{orderNo}_*.jpg</span>
        </button>

        <label className="umf-field">
          <span className="umf-label">
            Kommentar <span className="umf-label-aside">(optional)</span>
          </span>
          <textarea
            className="umf-textarea"
            placeholder="Hinweis fuer das Bearbeitungs-Team &hellip;"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            disabled={busy}
          />
          <p className="umf-help">
            <i className="fa-solid fa-circle-info" aria-hidden />
            Wird als <code>_kommentar.txt</code> im Zielordner abgelegt.
          </p>
        </label>

        <div className="umf-dropzone-wrap">
          <span className="umf-label">Dateien <span className="umf-req">*</span></span>
          <div
            className={`umf-dropzone${dragging ? " is-drag" : ""}${files.length > 0 ? " has-files" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
          >
            <div className="umf-dropzone-icon"><CloudUpload className="h-5 w-5" aria-hidden /></div>
            <div className="umf-dropzone-title">Dateien oder ganze Ordner hierher ziehen</div>
            <div className="umf-dropzone-sub">oder <strong>klicken zum Auswählen</strong></div>
            <div className="umf-dropzone-types">{acceptStr.replace(/\./g, "").toUpperCase()}</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptStr === "*" ? undefined : acceptStr}
            onChange={onPick}
            style={{ display: "none" }}
          />

          {/* Files-Preview: scrollbare Box, kein Überlappen */}
          {files.length > 0 ? (
            <div className="umf-files-preview">
              <div className="umf-files-preview-head">
                <div className="umf-files-preview-sum">
                  <strong>{files.length}</strong> Dateien gewählt · <strong>{formatBytes(totalBytes)}</strong>
                </div>
                <button
                  type="button"
                  className="umf-files-clear"
                  onClick={clearFiles}
                  disabled={busy}
                >
                  <X className="h-3.5 w-3.5" aria-hidden /> Leeren
                </button>
              </div>
              <div className="umf-files-list" role="list">
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="umf-file-chip" role="listitem">
                    <ImageIcon className="h-3 w-3" aria-hidden />
                    <span className="umf-file-chip-name" title={f.name}>{f.name}</span>
                    <span className="umf-file-chip-size">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      className="umf-file-chip-x"
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      aria-label={`${f.name} entfernen`}
                      disabled={busy}
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className="umf-error">{error}</div> : null}
        {success ? (
          <div className="umf-success">
            <Check className="h-4 w-4" aria-hidden />
            <span>
              {success.count} {success.count === 1 ? "Datei" : "Dateien"} ({formatBytes(success.bytes)})
              {" "}erfolgreich hochgeladen.
            </span>
          </div>
        ) : null}

        {busy && progress > 0 && progress < 100 ? (
          <div className="umf-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="umf-progress-bar" style={{ width: `${progress}%` }} />
            <span className="umf-progress-label">{progress}%</span>
          </div>
        ) : null}

        <div className="umf-submit-row">
          <button
            type="button"
            className="umf-submit"
            onClick={onSubmit}
            disabled={busy || files.length === 0 || categoryOptions.length === 0}
          >
            <CloudUpload className="h-4 w-4" aria-hidden />
            {busy ? "Wird hochgeladen …" : "Upload starten"}
          </button>
          <button
            type="button"
            className="umf-cancel"
            onClick={onClose}
            disabled={busy}
          >
            Abbrechen
          </button>
          <span className="umf-meta">
            {files.length > 0 ? (
              <>
                <strong>{files.length}</strong> Dateien · <strong>{formatBytes(totalBytes)}</strong>
                {" "}→ <strong>{folderTypeLabel(folderType)}</strong>
              </>
            ) : (
              "Keine Dateien gewählt"
            )}
          </span>
        </div>
      </div>

      {/* History-Footer (Collapsible) */}
      <div className={`umf-history${historyOpen ? " is-open" : ""}`}>
        <button
          type="button"
          className="umf-history-head"
          onClick={() => setHistoryOpen((v) => !v)}
        >
          <span className="umf-history-title">
            <ChevronDown className="umf-history-chev h-3 w-3" aria-hidden />
            Bereits hochgeladen für diesen Auftrag
          </span>
          <span className="umf-history-count">
            {completedHistory.length} {completedHistory.length === 1 ? "Lieferung" : "Lieferungen"}
          </span>
        </button>
        {historyOpen ? (
          <div className="umf-history-body">
            {completedHistory.length === 0 ? (
              <div className="umf-history-empty">Noch keine erfolgreichen Lieferungen.</div>
            ) : (
              completedHistory.map((b) => (
                <div key={b.id} className="umf-history-item">
                  <Check className="umf-history-item-dot h-3 w-3" aria-hidden />
                  <span className="umf-history-item-name">
                    {folderTypeLabel(b.folderType)} · {b.fileCount} {b.fileCount === 1 ? "Datei" : "Dateien"}
                  </span>
                  <span className="umf-history-item-meta">{formatBytes(b.totalBytes)}</span>
                  <span className="umf-history-item-meta">{formatDateShort(b.completedAt || b.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
