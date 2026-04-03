import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Link2, ArchiveRestore, Trash2, Send } from "lucide-react";
import { toursAdminPost, deleteToursAdminTour, postUnarchiveMatterportTour, postTransferMatterportSpace } from "../../../../api/toursAdmin";
import type { ToursAdminTourRow } from "../../../../types/toursAdmin";

type Props = {
  tourId: string;
  tour: ToursAdminTourRow;
  onSuccess: () => void;
  onOpenBookingLink?: () => void;
};

export function TourMatterportSection({ tourId, tour, onSuccess, onOpenBookingLink }: Props) {
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

  // Transfer-Dialog
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferErr, setTransferErr] = useState<string | null>(null);

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

  async function unarchive() {
    if (!window.confirm("Matterport-Space reaktivieren und Tour wieder auf ACTIVE setzen?")) return;
    setBusy(true);
    setErr(null);
    try {
      await postUnarchiveMatterportTour(tourId);
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTour() {
    const label = String(tour.canonical_object_label ?? tour.bezeichnung ?? `Tour #${tourId}`);
    const confirmed = window.confirm(
      `⚠️ Tour unwiderruflich löschen?\n\n` +
      `Tour: ${label}\n` +
      (spaceId ? `Matterport-Space: ${spaceId}\n\n` : "\n") +
      `Der Matterport-Space wird NICHT gelöscht – er bleibt in Matterport erhalten.\n` +
      `Nur der Tour-Eintrag in der Datenbank wird entfernt.\n\n` +
      `Diese Aktion kann nicht rückgängig gemacht werden!`
    );
    if (!confirmed) return;
    const doubleCheck = window.confirm(`Wirklich? Der Eintrag für „${label}" wird endgültig gelöscht.`);
    if (!doubleCheck) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteToursAdminTour(tourId);
      // Nach dem Löschen zur Tour-Liste navigieren
      window.location.href = "/admin/tours";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
      setBusy(false);
    }
  }

  async function submitTransfer() {
    if (!transferEmail.trim()) return;
    setTransferBusy(true);
    setTransferErr(null);
    try {
      await postTransferMatterportSpace(tourId, transferEmail.trim());
      setTransferOpen(false);
      setTransferEmail("");
      onSuccess();
    } catch (e) {
      setTransferErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setTransferBusy(false);
    }
  }

  const isArchived =
    String(tour.matterport_state ?? "").toLowerCase() === "inactive" ||
    String(tour.status ?? "").toUpperCase() === "ARCHIVED";

  return (
    <>
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
          {onOpenBookingLink ? (
            <button
              type="button"
              onClick={onOpenBookingLink}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-3 py-2 text-xs font-medium text-[var(--accent)]"
            >
              <Link2 className="h-3.5 w-3.5" />
              Bestellung verknüpfen
            </button>
          ) : null}
          {spaceId && !isArchived ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void archive()}
              className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300 disabled:opacity-50"
            >
              {busy ? "…" : "Space archivieren"}
            </button>
          ) : null}
          {spaceId && isArchived ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void unarchive()}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 disabled:opacity-50"
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              {busy ? "…" : "Space reaktivieren"}
            </button>
          ) : null}
          {spaceId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => { setTransferErr(null); setTransferOpen(true); }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-3 py-2 text-xs font-medium text-[var(--text-main)] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Space übertragen
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void deleteTour()}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {busy ? "…" : "Tour löschen"}
          </button>
        </div>
      </section>

      {/* Transfer-Dialog */}
      {transferOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-[var(--text-main)]">
                Diesen Space übertragen?
              </h3>
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-[var(--text-subtle)]">
              Geben Sie eine E-Mail-Adresse ein, um eine Übertragung zu starten.
            </p>
            <input
              type="email"
              value={transferEmail}
              onChange={(e) => setTransferEmail(e.target.value)}
              placeholder="E-Mail Adresse des Empfängers*"
              className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input,var(--bg-card))] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              onKeyDown={(e) => { if (e.key === "Enter") void submitTransfer(); }}
            />
            {transferErr ? (
              <p className="text-sm text-red-600">{transferErr}</p>
            ) : null}
            <p className="text-xs font-semibold text-[var(--text-main)]">
              Nach der Annahme kann dies nicht mehr rückgängig gemacht werden.
            </p>
            <p className="text-xs text-[var(--text-subtle)]">
              Der Empfänger erhält eine Einladung von Matterport und muss die Übertragung annehmen.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                disabled={transferBusy}
                className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void submitTransfer()}
                disabled={transferBusy || !transferEmail.trim()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {transferBusy ? "Wird übertragen…" : "Übertragen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
