import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Link2 } from "lucide-react";
import { toursAdminPost } from "../../../../api/toursAdmin";
import type { ToursAdminTourRow } from "../../../../types/toursAdmin";

type Props = {
  tourId: string;
  tour: ToursAdminTourRow;
  onSuccess: () => void;
};

export function TourMatterportSection({ tourId, tour, onSuccess }: Props) {
  const persistedMpId = String(tour.matterport_space_id ?? "").trim() || null;
  const canonicalMpId = String(tour.canonical_matterport_space_id ?? "").trim() || null;
  const spaceId = canonicalMpId || persistedMpId;
  const mpUrl = spaceId ? `https://my.matterport.com/show/?m=${encodeURIComponent(spaceId)}` : null;
  const linkMatterportOpenHref =
    canonicalMpId && !persistedMpId
      ? `/admin/tours/link-matterport?openSpaceId=${encodeURIComponent(canonicalMpId)}`
      : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function archive() {
    if (!window.confirm("Matterport-Space wirklich archivieren und Tour als archiviert markieren?")) return;
    setBusy(true);
    setErr(null);
    try {
      await toursAdminPost(`/tours/${tourId}/archive-matterport`);
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-card-strong p-5 space-y-3">
      <h2 className="text-lg font-semibold text-[var(--text-main)]">Matterport</h2>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-[var(--text-subtle)] text-xs">Space-ID</dt>
          <dd className="text-[var(--text-main)] font-mono text-xs break-all">
            {spaceId || "—"}
            {linkMatterportOpenHref ? (
              <span className="block mt-1 font-sans text-[11px] text-amber-800 dark:text-amber-300">
                Nur aus Tour-URL erkannt – noch nicht als DB-Verknüpfung gespeichert.
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-subtle)] text-xs">State (DB)</dt>
          <dd className="text-[var(--text-main)]">{String(tour.matterport_state ?? "—")}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {mpUrl ? (
          <a
            href={mpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-3 py-2 text-xs font-medium text-[var(--accent)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Matterport öffnen
          </a>
        ) : null}
        {linkMatterportOpenHref ? (
          <Link
            to={linkMatterportOpenHref}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"
          >
            <Link2 className="h-3.5 w-3.5" />
            Space verknüpfen
          </Link>
        ) : null}
        {spaceId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void archive()}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 disabled:opacity-50"
          >
            {busy ? "…" : "Space archivieren"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
