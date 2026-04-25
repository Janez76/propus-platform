import { notFound } from 'next/navigation';
import { FolderOpen, Upload, ExternalLink, Files, HardDrive, FolderTree } from 'lucide-react';
import { queryOne, query } from '@/lib/db';
import { Section, Empty, KpiGrid, Kpi, formatBytes, formatTS } from '../_shared';
import { LinkFolderDialog } from './link-folder-dialog';
import { FolderArchiveButton } from './folder-row-actions';

const FOLDER_TYPE_LABEL: Record<string, string> = {
  raw_material: 'Rohmaterial',
  customer_folder: 'Kundenmaterial',
};

const BATCH_STATUS_CLASS: Record<string, string> = {
  pending:    'bg-[#FBEED4] text-[#8A5710] border border-[#B87514]/30',
  uploading:  'bg-[#DFEBF5] text-[#244865] border border-[#2E5A7A]/30',
  completed:  'bg-[#E6F2E3] text-[#1F5C20] border border-[#2A7A2A]/30',
  failed:     'bg-[#F8E0DB] text-[#8A2515] border border-[#B4311B]/30',
  cancelled:  'bg-[#EFEDE6] text-[#3C3B38] border border-[#6B6962]/30',
};

const BATCH_STATUS_LABEL: Record<string, string> = {
  pending:   'Wartend',
  uploading: 'Läuft',
  completed: 'Abgeschlossen',
  failed:    'Fehlgeschlagen',
  cancelled: 'Abgebrochen',
};

type SP = { folderType?: string; batchStatus?: string };

export default async function DateienPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SP>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : ({} as SP);

  const orderCheck = await queryOne<{ order_no: number }>(`
    SELECT order_no FROM booking.orders WHERE order_no = $1
  `, [id]);
  if (!orderCheck) notFound();

  const [folders, batches] = await Promise.all([
    query<{
      id: number;
      folder_type: string;
      display_name: string | null;
      absolute_path: string | null;
      nextcloud_share_url: string | null;
      status: string | null;
      created_at: string;
    }>(`
      SELECT id, folder_type, display_name, absolute_path, nextcloud_share_url, status, created_at
      FROM booking.order_folder_links
      WHERE order_no = $1
        AND archived_at IS NULL
      ORDER BY created_at ASC
    `, [id]),

    query<{
      id: number;
      folder_type: string | null;
      status: string;
      file_count: number | null;
      total_bytes: number | null;
      comment: string | null;
      uploaded_by: string | null;
      completed_at: string | null;
      created_at: string;
    }>(`
      SELECT id, folder_type, status, file_count, total_bytes, comment, uploaded_by, completed_at, created_at
      FROM booking.upload_batches
      WHERE order_no = $1
      ORDER BY created_at DESC
    `, [id]),
  ]);

  const totalFiles = batches.reduce((acc, b) => acc + (b.file_count ?? 0), 0);
  const totalBytes = batches.reduce((acc, b) => acc + (b.total_bytes ?? 0), 0);
  const sharedFolders = folders.filter((f) => f.nextcloud_share_url).length;

  const folderType = sp.folderType ?? '';
  const batchStatus = sp.batchStatus ?? '';

  const filteredFolders = folderType
    ? folders.filter((f) => f.folder_type === folderType)
    : folders;
  const filteredBatches = batchStatus
    ? batches.filter((b) => b.status === batchStatus)
    : batches;

  return (
    <div className="space-y-6">
      <KpiGrid>
        <Kpi
          icon={<FolderTree />}
          label="Ordner"
          value={folders.length}
          sub={folders.length === 0 ? 'keine verknüpft' : `${sharedFolders} geteilt`}
        />
        <Kpi
          icon={<Upload />}
          label="Upload-Batches"
          value={batches.length}
          sub={batches.length === 0 ? 'keine Uploads' : undefined}
        />
        <Kpi
          icon={<Files />}
          label="Dateien gesamt"
          value={totalFiles.toLocaleString('de-CH')}
          accent="info"
        />
        <Kpi
          icon={<HardDrive />}
          label="Volumen"
          value={formatBytes(totalBytes)}
          accent="gold"
        />
      </KpiGrid>

      <form action={`/orders/${id}/dateien`} method="get" className="bd-filterbar">
        <label>
          Ordner-Typ
          <select name="folderType" defaultValue={folderType}>
            <option value="">Alle Typen</option>
            <option value="raw_material">Rohmaterial</option>
            <option value="customer_folder">Kundenmaterial</option>
          </select>
        </label>
        <label>
          Batch-Status
          <select name="batchStatus" defaultValue={batchStatus}>
            <option value="">Alle Status</option>
            <option value="pending">Wartend</option>
            <option value="uploading">Läuft</option>
            <option value="completed">Abgeschlossen</option>
            <option value="failed">Fehlgeschlagen</option>
            <option value="cancelled">Abgebrochen</option>
          </select>
        </label>
        <button type="submit" className="bd-btn-outline-gold">Anwenden</button>
        {(folderType || batchStatus) && (
          <a href={`/orders/${id}/dateien`} className="bd-btn-ghost">
            Zurücksetzen
          </a>
        )}
      </form>

      <Section
        title="Ordner & Links"
        icon={<FolderOpen className="h-4 w-4" />}
        right={<LinkFolderDialog orderNo={orderCheck.order_no} />}
      >
        {filteredFolders.length > 0 ? (
          <div className="space-y-2">
            {filteredFolders.map((folder) => (
              <div key={folder.id} className="bd-row">
                <div className="min-w-0">
                  <p className="bd-row-title">
                    {folder.display_name ?? FOLDER_TYPE_LABEL[folder.folder_type] ?? folder.folder_type}
                  </p>
                  {folder.absolute_path && (
                    <p className="mt-0.5 truncate bd-row-meta is-mono">
                      {folder.absolute_path}
                    </p>
                  )}
                  {folder.status && folder.status !== 'active' && (
                    <p className="mt-0.5 bd-row-meta">{folder.status}</p>
                  )}
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-2">
                  {folder.nextcloud_share_url && (
                    <a
                      href={folder.nextcloud_share_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bd-btn-outline-gold"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Nextcloud
                    </a>
                  )}
                  <FolderArchiveButton id={folder.id} orderNo={orderCheck.order_no} />
                </div>
              </div>
            ))}
          </div>
        ) : folders.length === 0 ? (
          <Empty>Keine Ordner verknüpft</Empty>
        ) : (
          <Empty>Keine Ordner für diesen Filter</Empty>
        )}
      </Section>

      <Section title="Upload-Batches" icon={<Upload className="h-4 w-4" />}>
        {filteredBatches.length > 0 ? (
          <div className="space-y-2">
            {filteredBatches.map((batch) => {
              const statusClass = BATCH_STATUS_CLASS[batch.status]
                ?? 'bg-[var(--paper-strip)] text-[var(--ink-3)] border border-[var(--border)]';
              const statusLabel = BATCH_STATUS_LABEL[batch.status] ?? batch.status;
              return (
                <div
                  key={batch.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
                        {statusLabel}
                      </span>
                      {batch.folder_type && (
                        <span className="text-xs text-[var(--ink-3)]">
                          {FOLDER_TYPE_LABEL[batch.folder_type] ?? batch.folder_type}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--ink-3)] tabular-nums font-mono">
                      {formatTS(batch.created_at)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    {batch.file_count != null && (
                      <span className="text-xs text-[var(--ink-2)]">
                        {batch.file_count} Datei{batch.file_count !== 1 ? 'en' : ''}
                      </span>
                    )}
                    {batch.total_bytes != null && (
                      <span className="text-xs text-[var(--ink-2)] font-mono tabular-nums">
                        {formatBytes(batch.total_bytes)}
                      </span>
                    )}
                    {batch.uploaded_by && (
                      <span className="text-xs text-[var(--ink-3)]">von {batch.uploaded_by}</span>
                    )}
                    {batch.completed_at && (
                      <span className="text-xs text-[var(--ink-3)]">
                        abgeschlossen {formatTS(batch.completed_at)}
                      </span>
                    )}
                  </div>
                  {batch.comment && (
                    <p className="mt-2 text-xs text-[var(--ink-3)]">{batch.comment}</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : batches.length === 0 ? (
          <Empty>Keine Uploads vorhanden</Empty>
        ) : (
          <Empty>Keine Batches für diesen Filter</Empty>
        )}
      </Section>
    </div>
  );
}
