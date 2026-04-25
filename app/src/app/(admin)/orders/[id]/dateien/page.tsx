import { notFound } from 'next/navigation';
import { FolderOpen, Upload, ExternalLink } from 'lucide-react';
import { queryOne, query } from '@/lib/db';
import { Section, Empty, formatBytes, formatTS } from '../_shared';
import { LinkFolderDialog } from './link-folder-dialog';
import { FolderArchiveButton } from './folder-row-actions';

export default async function DateienPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  const FOLDER_TYPE_LABEL: Record<string, string> = {
    raw_material: 'Rohmaterial',
    customer_folder: 'Kundenmaterial',
  };

  const BATCH_STATUS_CLASS: Record<string, string> = {
    pending:    'bg-amber-500/15 text-amber-400',
    uploading:  'bg-blue-500/15 text-blue-400',
    completed:  'bg-emerald-500/15 text-emerald-400',
    failed:     'bg-rose-500/15 text-rose-400',
    cancelled:  'bg-zinc-500/15 p-text-muted',
  };

  return (
    <div className="space-y-6">
      <Section
        title="Ordner & Links"
        icon={<FolderOpen className="h-4 w-4" />}
        right={<LinkFolderDialog orderNo={orderCheck.order_no} />}
      >
        {folders.length > 0 ? (
          <div className="space-y-2">
            {folders.map((folder) => (
              <div key={folder.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {folder.display_name ?? FOLDER_TYPE_LABEL[folder.folder_type] ?? folder.folder_type}
                  </p>
                  {folder.absolute_path && (
                    <p className="mt-0.5 truncate text-xs text-white/40 font-mono">
                      {folder.absolute_path}
                    </p>
                  )}
                  {folder.status && folder.status !== 'active' && (
                    <p className="mt-0.5 text-xs text-white/30">{folder.status}</p>
                  )}
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-2">
                  {folder.nextcloud_share_url && (
                    <a
                      href={folder.nextcloud_share_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded border border-[#B68E20]/40 px-2 py-1 text-xs text-[#B68E20] transition-colors hover:bg-[#B68E20]/10"
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
        ) : (
          <Empty>Keine Ordner verknüpft</Empty>
        )}
      </Section>

      <Section title="Upload-Batches" icon={<Upload className="h-4 w-4" />}>
        {batches.length > 0 ? (
          <div className="space-y-2">
            {batches.map((batch) => {
              const statusClass = BATCH_STATUS_CLASS[batch.status] ?? 'bg-white/10 text-white/50';
              return (
                <div key={batch.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
                        {batch.status}
                      </span>
                      {batch.folder_type && (
                        <span className="text-xs text-white/40">
                          {FOLDER_TYPE_LABEL[batch.folder_type] ?? batch.folder_type}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-white/30 tabular-nums">{formatTS(batch.created_at)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    {batch.file_count != null && (
                      <span className="text-xs text-white/60">
                        {batch.file_count} Datei{batch.file_count !== 1 ? 'en' : ''}
                      </span>
                    )}
                    {batch.total_bytes != null && (
                      <span className="text-xs text-white/60">{formatBytes(batch.total_bytes)}</span>
                    )}
                    {batch.uploaded_by && (
                      <span className="text-xs text-white/40">von {batch.uploaded_by}</span>
                    )}
                    {batch.completed_at && (
                      <span className="text-xs text-white/40">
                        abgeschlossen {formatTS(batch.completed_at)}
                      </span>
                    )}
                  </div>
                  {batch.comment && (
                    <p className="mt-2 text-xs text-white/50">{batch.comment}</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>Keine Uploads vorhanden</Empty>
        )}
      </Section>
    </div>
  );
}
