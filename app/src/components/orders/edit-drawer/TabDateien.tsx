import { useEffect, useState } from "react";
import { ExternalLink, FileIcon, Folder, ImageIcon, Loader2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getOrderStorageSummary,
  getOrderUploadFileUrl,
  type OrderStorageSummaryResponse,
  type OrderUploadBatch,
  type OrderUploadResultFile,
} from "../../../api/orders";
import { useAuthStore } from "../../../store/authStore";
import { useT } from "../../../hooks/useT";

type Props = {
  orderNo: string;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isImageMime(name: string): boolean {
  return /\.(jpe?g|png|webp|gif|tif?f|heic|avif)$/i.test(name);
}

function FileTile({
  file,
  url,
  t,
}: {
  file: OrderUploadResultFile;
  url: string | null;
  t: (key: string) => string;
}) {
  const name = file.originalName || file.fileName || file.storedName || "—";
  const size = file.sizeBytes ?? file.bytes ?? 0;
  const isImage = isImageMime(name);
  return (
    <a
      href={url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      title={`${name} · ${formatBytes(size)}`}
      className="group flex flex-col gap-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 p-2 transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--surface-raised)]"
    >
      <div className="flex aspect-square items-center justify-center rounded bg-[var(--surface)] text-[var(--text-subtle)]">
        {isImage && url ? (
          <img
            src={url}
            alt={name}
            loading="lazy"
            className="h-full w-full rounded object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : isImage ? (
          <ImageIcon className="h-8 w-8 opacity-50" />
        ) : (
          <FileIcon className="h-8 w-8 opacity-50" />
        )}
      </div>
      <div className="min-w-0 truncate text-xs font-medium text-[var(--text-main)]">{name}</div>
      <div className="flex items-center justify-between text-[10px] text-[var(--text-subtle)]">
        <span>{formatBytes(size)}</span>
        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
        <span className="sr-only">{t("ordersDrawer.dateien.openInNewTab")}</span>
      </div>
    </a>
  );
}

function BatchSection({
  batch,
  token,
  orderNo,
  t,
}: {
  batch: OrderUploadBatch;
  token: string;
  orderNo: string;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-lg border border-[var(--border-soft)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 text-sm">
          <Folder className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-medium text-[var(--text-main)]">{batch.batchFolder || batch.id.slice(0, 8)}</span>
          <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
            {batch.status}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--text-subtle)]">
          <span>{t("ordersDrawer.dateien.uploader")}: {batch.uploadedBy || "—"}</span>
          <span>{batch.fileCount} · {formatBytes(batch.totalBytes)}</span>
          <time>{formatDate(batch.completedAt || batch.createdAt)}</time>
        </div>
      </button>
      {open && batch.files && batch.files.length > 0 && (
        <div className="grid grid-cols-2 gap-2 border-t border-[var(--border-soft)] p-3 sm:grid-cols-3 md:grid-cols-4">
          {batch.files.map((file, idx) => {
            const rel = file.stagingPath || file.storedName || file.fileName || "";
            const url = rel
              ? getOrderUploadFileUrl(token, orderNo, rel, batch.folderType)
              : null;
            return (
              <FileTile key={file.id ?? `${batch.id}-${idx}`} file={file} url={url} t={t} />
            );
          })}
        </div>
      )}
      {open && (!batch.files || batch.files.length === 0) && (
        <div className="border-t border-[var(--border-soft)] px-3 py-4 text-center text-xs text-[var(--text-subtle)]">
          {t("ordersDrawer.dateien.noFiles")}
        </div>
      )}
    </section>
  );
}

export function TabDateien({ orderNo }: Props) {
  const t = useT();
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const [data, setData] = useState<OrderStorageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !orderNo) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrderStorageSummary(token, orderNo)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, orderNo]);

  const batches = data?.batches || [];
  const totalFiles = batches.reduce((sum, b) => sum + (b.fileCount || 0), 0);
  const nextcloud = data?.folders?.find((f) => f.nextcloudShareUrl)?.nextcloudShareUrl;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-3 text-[var(--text-subtle)]">
          <span>
            {t("ordersDrawer.dateien.filesCount").replace("{{count}}", String(totalFiles))}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t("ordersDrawer.dateien.batchesCount").replace("{{count}}", String(batches.length))}
          </span>
          {nextcloud && (
            <a
              href={nextcloud}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> {t("ordersDrawer.dateien.nextcloudShare")}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate(`/upload?orderNo=${encodeURIComponent(orderNo)}`)}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
        >
          <Upload className="h-4 w-4" /> {t("ordersDrawer.dateien.uploadFiles")}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-[var(--text-subtle)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("ordersDrawer.loading")}
        </div>
      )}
      {error && !loading && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {!loading && !error && batches.length === 0 && (
        <div className="py-12 text-center text-sm text-[var(--text-subtle)]">
          {t("ordersDrawer.dateien.noFiles")}
        </div>
      )}
      {!loading && !error && batches.length > 0 && (
        <div className="space-y-3">
          {batches.map((batch) => (
            <BatchSection
              key={batch.id}
              batch={batch}
              token={token || ""}
              orderNo={orderNo}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
