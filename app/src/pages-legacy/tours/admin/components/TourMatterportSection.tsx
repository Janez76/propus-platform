import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Link2, ArchiveRestore, Trash2, Send, RefreshCw, X, SlidersHorizontal, Copy, Check } from "lucide-react";
import { toursAdminPost, deleteToursAdminTour, postUnarchiveMatterportTour, postReactivateTour, postTransferMatterportSpace, getToursAdminMatterportModel, postToursAdminMatterportOptions } from "../../../../api/toursAdmin";
import type { MatterportModelMeta, MatterportModelOptions, MatterportSettingOverride, MatterportOptionsPatch } from "../../../../api/toursAdmin";
import type { ToursAdminTourRow } from "../../../../types/toursAdmin";
import { TicketCreateDialog } from "./TicketCreateDialog";
import { MatterportVisibilityPanel } from "./MatterportVisibilityPanel";

type Props = {
  tourId: string;
  tour: ToursAdminTourRow;
  /** API-Sichtbarkeit (Tour-Detail), für Matterport-Sichtbarkeit-Editor */
  mpVisibility: string | null;
  onSuccess: () => void;
};

const STATE_META: Record<string, { label: string; color: string }> = {
  active:     { label: "Aktiv",         color: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900" },
  inactive:   { label: "Archiviert",    color: "text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-950/40 dark:border-orange-900" },
  processing: { label: "In Bearbeitung",color: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-900" },
  staging:    { label: "Staging",       color: "text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-900" },
  failed:     { label: "Fehler",        color: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-900" },
  pending:    { label: "Ausstehend",    color: "text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-300 dark:bg-yellow-950/40 dark:border-yellow-900" },
};

const VIS_META: Record<string, { icon: string; label: string }> = {
  PUBLIC:    { icon: "🌐", label: "Öffentlich" },
  UNLISTED:  { icon: "🔗", label: "Nur Link" },
  LINK_ONLY: { icon: "🔗", label: "Nur Link" },
  PRIVATE:   { icon: "🔒", label: "Privat" },
  PASSWORD:  { icon: "🔑", label: "Passwort" },
};

/** Einheitliche Matterport-Aktionsbuttons (Farbe + Hover) */
const MP_ACTION_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-main)] shadow-sm " +
  "transition-colors duration-150 " +
  "hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 " +
  "disabled:pointer-events-none disabled:opacity-50";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-36 shrink-0 text-[var(--text-subtle)]">{label}</dt>
      <dd className="text-[var(--text-main)] break-all">{value || "—"}</dd>
    </div>
  );
}

const OPTIONS_CONFIG: Array<{
  key: keyof MatterportModelOptions;
  label: string;
  hint: string;
  icon: string;
  overrideKey: keyof MatterportModelOptions;
}> = [
  { key: "defurnishViewEnabled",  label: "Mobiliar entfernen",    hint: "Zeigt den Raum möbellos – ideal für leere Übergaben.",           icon: "🛋️", overrideKey: "defurnishViewOverride" },
  { key: "dollhouseEnabled",      label: "Dollhouse-Modus",       hint: "3D-Gesamtansicht des Gebäudes von aussen.",                      icon: "🏠", overrideKey: "dollhouseOverride" },
  { key: "floorplanEnabled",      label: "Grundriss",             hint: "Zeigt den 2D-Grundriss des Stockwerks an.",                      icon: "📐", overrideKey: "floorplanOverride" },
  { key: "socialSharingEnabled",  label: "Social Sharing",        hint: "Schaltfläche zum Teilen auf sozialen Netzwerken einblenden.",     icon: "🔗", overrideKey: "socialSharingOverride" },
  { key: "vrEnabled",             label: "VR-Modus",              hint: "Ermöglicht den Besuch mit VR-Brille.",                           icon: "🥽", overrideKey: "vrOverride" },
  { key: "highlightReelEnabled",  label: "Highlight Reel",        hint: "Automatische Kurzpräsentation der Highlights beim Start.",        icon: "🎬", overrideKey: "highlightReelOverride" },
  { key: "labelsEnabled",         label: "Raumbeschriftungen",    hint: "Blendet die Raumnamen direkt im 3D-Rundgang ein.",                icon: "🏷️", overrideKey: "labelsOverride" },
  { key: "tourAutoplayEnabled",   label: "Tour Autoplay",         hint: "Startet die Tour automatisch ohne Nutzeraktion.",                 icon: "▶️", overrideKey: "tourAutoplayOverride" },
  { key: "roomBoundsEnabled",     label: "Raumgrenzen",           hint: "Zeigt die Raumgrenzen als transparente Flächen.",                 icon: "📦", overrideKey: "roomBoundsOverride" },
];

function OverrideToggle({
  icon,
  label,
  hint,
  overrideKey,
  enabled,
  override,
  tourId,
  onSuccess,
}: {
  icon: string;
  label: string;
  hint: string;
  overrideKey: keyof MatterportOptionsPatch;
  enabled: boolean | null;
  override: string | null;
  tourId: string;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState<MatterportSettingOverride | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const currentOverride = (String(override ?? "default").toLowerCase()) as MatterportSettingOverride | "default";
  const isOverrideSet = currentOverride !== "default";

  async function handleClick(value: "enabled" | "disabled") {
    if (busy) return;
    // Bereits aktiven Override anklicken → zurück auf Standard (default)
    const next: MatterportSettingOverride = (isOverrideSet && currentOverride === value) ? "default" : value;
    setBusy(next);
    setErr(null);
    try {
      await postToursAdminMatterportOptions(tourId, { [overrideKey]: next });
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(null);
    }
  }

  const BTNS: {
    value: "enabled" | "disabled";
    label: string;
    activeOverride: string;
    activeDefault: string;
    inactive: string;
  }[] = [
    {
      value: "enabled",
      label: "An",
      activeOverride: "border-emerald-400/70 bg-emerald-500/10 text-emerald-600 dark:border-emerald-600 dark:text-emerald-400",
      activeDefault:  "border-emerald-300/40 bg-emerald-500/5 text-emerald-600/60 dark:border-emerald-800 dark:text-emerald-500/60",
      inactive:       "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-emerald-400/40 hover:text-emerald-600 dark:hover:text-emerald-400",
    },
    {
      value: "disabled",
      label: "Aus",
      activeOverride: "border-red-400/70 bg-red-500/10 text-red-600 dark:border-red-600 dark:text-red-400",
      activeDefault:  "border-red-300/40 bg-red-500/5 text-red-600/60 dark:border-red-800 dark:text-red-500/60",
      inactive:       "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-red-400/40 hover:text-red-600 dark:hover:text-red-400",
    },
  ];

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-main)]">
          <span className="text-sm leading-none">{icon}</span>
          <span>{label}</span>
          {err ? <span className="ml-1 text-xs text-red-500 font-normal">{err}</span> : null}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-[var(--text-subtle)]">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {BTNS.map((btn) => {
          const isBusy = busy === btn.value || (busy === "default" && isOverrideSet && currentOverride === btn.value);
          // Ist dieser Knopf der effektiv aktive?
          const isActiveOverride = isOverrideSet && currentOverride === btn.value;
          const isActiveDefault  = !isOverrideSet && enabled !== null && (btn.value === "enabled" ? enabled === true : enabled === false);
          const btnClass = isActiveOverride
            ? btn.activeOverride
            : isActiveDefault
              ? btn.activeDefault
              : btn.inactive;
          return (
            <button
              key={btn.value}
              type="button"
              disabled={!!busy}
              onClick={() => void handleClick(btn.value)}
              title={isActiveOverride ? "Klicken zum Zurücksetzen auf Matterport-Standard" : undefined}
              className={[
                "rounded border px-2 py-0.5 text-xs leading-none transition-colors disabled:cursor-wait",
                btnClass,
                isBusy ? "opacity-50" : "",
              ].join(" ")}
            >
              {isBusy ? "…" : btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Aus eingefügter Show-URL den Startpunkt (sid=…) lesen; sonst den Text als Sweep-ID übernehmen. */
function extractMatterportSweepFromInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const fromParam = t.match(/[?&#]sid=([^&\s#]+)/i);
  if (fromParam) {
    try {
      return decodeURIComponent(fromParam[1]);
    } catch {
      return fromParam[1];
    }
  }
  try {
    const u = new URL(t);
    const sid = u.searchParams.get("sid");
    if (sid) return sid.trim();
  } catch {
    /* kein vollständiger URL-String */
  }
  return t;
}

function SweepIdTile({
  tourId,
  matterportStartSweep,
  onSaved,
}: {
  tourId: string;
  matterportStartSweep: string;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(matterportStartSweep);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(matterportStartSweep);
  }, [matterportStartSweep]);

  async function save() {
    setSaving(true);
    setOk(false);
    setErr(null);
    const resolved = extractMatterportSweepFromInput(draft);
    try {
      await toursAdminPost(`/tours/${tourId}/set-start-sweep`, {
        start_sweep: resolved || null,
      });
      setDraft(resolved);
      setOk(true);
      window.setTimeout(() => setOk(false), 2500);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-1.5 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium text-[var(--text-main)]">
            <span>Startpunkt setzen</span>
            {err ? <span className="text-xs font-normal text-red-500">{err}</span> : null}
          </div>
          <p className="mt-0.5 text-xs leading-snug text-[var(--text-subtle)]">
            In Matterport auf den gewünschten Standort navigieren, dann{" "}
            <kbd className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-1 font-mono text-[10px]">
              Strg
            </kbd>
            +
            <kbd className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-1 font-mono text-[10px]">
              Shift
            </kbd>
            +
            <kbd className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-1 font-mono text-[10px]">
              L
            </kbd>{" "}
            drücken — es öffnet sich das Fenster <em>„Link to location“</em> mit der URL inkl.{" "}
            <code className="rounded bg-[var(--surface)] px-1 font-mono text-[10px]">sid=</code>. Dort „Copy to clipboard“
            klicken und die URL hier einfügen —{" "}
            <code className="rounded bg-[var(--surface)] px-1 font-mono text-[10px]">sid=</code> wird beim Speichern
            automatisch übernommen. Alternativ nur die Sweep-ID direkt eintragen.
          </p>
        </div>
      </div>
      <div className="flex min-w-0 w-full shrink-0 flex-col gap-1.5 sm:w-auto sm:max-w-xl sm:flex-row sm:items-center">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Show-URL oder Sweep-ID einfügen…"
          spellCheck={false}
          className="min-w-0 w-full rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/40 sm:min-w-[14rem]"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="shrink-0 rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-main)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] disabled:opacity-50"
        >
          {saving ? "…" : ok ? "✓" : "Setzen"}
        </button>
      </div>
    </div>
  );
}

function MatterportMetaPanel({ meta, onRefresh, loading, spaceId, tourId, tourShowUrl, mpVisibility, onVisibilitySaved, matterportStartSweep }: {
  meta: MatterportModelMeta;
  onRefresh: () => void;
  loading: boolean;
  spaceId: string;
  tourId: string;
  /** my.matterport.com/show/?m=… zum Kopieren */
  tourShowUrl: string | null;
  mpVisibility: string | null;
  onVisibilitySaved: () => void;
  matterportStartSweep: string;
}) {
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyTourLink() {
    if (!tourShowUrl) return;
    try {
      await navigator.clipboard.writeText(tourShowUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* Clipboard nicht verfügbar */
    }
  }

  const stateKey = String(meta.state ?? "").toLowerCase();
  const stateMeta = STATE_META[stateKey];
  const visKey = String(meta.accessVisibility ?? meta.visibility ?? "").toUpperCase();
  const visMeta = VIS_META[visKey];

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--text-main)] uppercase tracking-wide">
          Matterport Model
        </h4>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-[var(--text-subtle)] hover:text-[var(--text-main)] disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      <MatterportVisibilityPanel tourId={tourId} mpVisibility={mpVisibility} onSuccess={onVisibilitySaved} />

      <div className="flex flex-wrap gap-2">
        {stateMeta ? (
          <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-sm font-medium ${stateMeta.color}`}>
            {stateMeta.label}
          </span>
        ) : meta.state ? (
          <span className="inline-flex items-center rounded-lg border border-[var(--border-soft)] px-2.5 py-0.5 text-sm font-medium text-[var(--text-subtle)]">
            {meta.state}
          </span>
        ) : null}
        {visMeta ? (
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2.5 py-0.5 text-sm font-medium text-[var(--text-main)]">
            <span>{visMeta.icon}</span>
            {visMeta.label}
          </span>
        ) : null}
        {tourShowUrl ? (
          <button
            type="button"
            onClick={() => void copyTourLink()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2.5 py-0.5 text-sm font-medium text-[var(--text-main)] transition-colors duration-150 hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
            title={tourShowUrl}
          >
            {linkCopied ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 shrink-0" />
            )}
            {linkCopied ? "Kopiert" : "Link kopieren"}
          </button>
        ) : null}
      </div>

      <dl className="grid gap-1.5 text-sm">
        <MetaRow label="Objektbezeichnung" value={meta.name} />
        <MetaRow label="Erstellt" value={fmtDate(meta.created)} />
        {meta.publication?.address ? <MetaRow label="Adresse" value={meta.publication.address} /> : null}
        {meta.description ? <MetaRow label="Beschreibung" value={meta.description} /> : null}
        {meta.publication?.summary ? <MetaRow label="Zusammenfassung" value={meta.publication.summary} /> : null}
        {meta.publication?.externalUrl ? (
          <MetaRow label="Externe URL" value={
            <a href={meta.publication.externalUrl} target="_blank" rel="noopener noreferrer"
              className="text-[var(--accent)] underline hover:no-underline break-all">
              {meta.publication.externalUrl}
            </a>
          } />
        ) : null}
      </dl>

      {/* Showcase-Einstellungen — klickbare Toggles via API */}
      {meta.options ? (
        <div className="border-t border-[var(--border-soft)] pt-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">
            Einstellungen anzeigen
          </p>
          <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
            Steuert, welche Viewer-Funktionen Besucher in der Matterport-Tour sehen (Grundriss, VR, Teilen usw.). Änderungen
            werden direkt am Modell gespeichert — kurz warten und bei Bedarf <strong className="font-medium text-[var(--text-main)]">Aktualisieren</strong> nutzen.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0 sm:grid-cols-3 lg:grid-cols-4 divide-y-0 [&>*]:border-b [&>*]:border-[var(--border-soft)]">
            {OPTIONS_CONFIG.map(({ key, label, hint, icon, overrideKey }) => (
              <OverrideToggle
                key={key}
                icon={icon}
                label={label}
                hint={hint}
                overrideKey={overrideKey as keyof MatterportOptionsPatch}
                enabled={meta.options![key] as boolean | null}
                override={meta.options![overrideKey] as string | null}
                tourId={tourId}
                onSuccess={onRefresh}
              />
            ))}
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <SweepIdTile
                tourId={tourId}
                matterportStartSweep={matterportStartSweep}
                onSaved={onRefresh}
              />
            </div>
          </div>
          <p className="text-xs text-[var(--text-subtle)] leading-relaxed pt-1">
            <strong className="text-[var(--text-main)]">Kräftig hervorgehoben</strong> = manuell für diese Tour gesetzt.{" "}
            <strong className="text-[var(--text-main)]">Gedimmt hervorgehoben</strong> = Matterport-Standard (kein Override).{" "}
            Aktiven Override erneut anklicken, um ihn zurückzusetzen.
          </p>
        </div>
      ) : null}

    </div>
  );
}

export function TourMatterportSection({ tourId, tour, mpVisibility, onSuccess }: Props) {
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

  // Matterport-Metadaten
  const [meta, setMeta] = useState<MatterportModelMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [metaInactive, setMetaInactive] = useState(false);

  async function loadMeta() {
    setMetaLoading(true);
    setMetaErr(null);
    setMetaInactive(false);
    try {
      const r = await getToursAdminMatterportModel(tourId);
      setMeta(r.model);
      setMetaInactive(r.inactiveWarning === true);
    } catch (e) {
      setMetaErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setMetaLoading(false);
    }
  }

  useEffect(() => {
    if (spaceId) void loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  // Ticket-Dialog
  const [ticketOpen, setTicketOpen] = useState(false);

  // Reaktivierungs-Dialog
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [reactivateMethod, setReactivateMethod] = useState<"payrexx" | "qr_invoice">("payrexx");

  // Löschen-Dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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
    setBusy(true);
    setErr(null);
    setReactivateOpen(false);
    try {
      await postUnarchiveMatterportTour(tourId);
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate() {
    setBusy(true);
    setErr(null);
    setReactivateOpen(false);
    try {
      const r = await postReactivateTour(tourId, reactivateMethod);
      if (r.redirectUrl) {
        window.location.href = r.redirectUrl;
        return;
      }
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTour() {
    setBusy(true);
    setErr(null);
    setDeleteOpen(false);
    setDeleteConfirmText("");
    try {
      await deleteToursAdminTour(tourId);
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
      <div className="border-t border-[var(--border-soft)] pt-4 space-y-3">
        <h2 className="text-base font-semibold text-[var(--text-main)]">Matterport</h2>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {linkMatterportOpenHref ? (
          <p className="text-xs text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200/60 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/25 px-3 py-2">
            Matterport-Space nur aus Tour-URL erkannt – noch nicht als DB-Verknüpfung gespeichert.
          </p>
        ) : null}

        {/* Matterport-Metadaten (immer sichtbar) */}
        {spaceId ? (
          <div className="border-t border-[var(--border-soft)] pt-3 space-y-2">
            {metaLoading && !meta ? (
              <p className="text-sm text-[var(--text-subtle)]">Wird geladen…</p>
            ) : metaErr ? (
              <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
                <p className="text-sm text-red-700 dark:text-red-300">{metaErr}</p>
                <button
                  type="button"
                  onClick={() => void loadMeta()}
                  className="ml-2 shrink-0 text-sm text-red-600 underline hover:no-underline dark:text-red-400"
                >
                  Erneut laden
                </button>
              </div>
            ) : meta && metaInactive ? (
              <>
                <p className="text-xs text-[var(--text-subtle)] rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2">
                  Archivierter Space – Publikationsdetails bei Matterport nicht verfügbar (State: inactive).
                </p>
                <MatterportMetaPanel
                  meta={meta}
                  onRefresh={() => void loadMeta()}
                  loading={metaLoading}
                  spaceId={spaceId}
                  tourId={tourId}
                  tourShowUrl={mpUrl}
                  mpVisibility={mpVisibility}
                  onVisibilitySaved={() => {
                    onSuccess();
                    void loadMeta();
                  }}
                  matterportStartSweep={String(tour.matterport_start_sweep ?? "")}
                />
              </>
            ) : meta ? (
              <MatterportMetaPanel
                meta={meta}
                onRefresh={() => void loadMeta()}
                loading={metaLoading}
                spaceId={spaceId}
                tourId={tourId}
                tourShowUrl={mpUrl}
                mpVisibility={mpVisibility}
                onVisibilitySaved={() => {
                  onSuccess();
                  void loadMeta();
                }}
                matterportStartSweep={String(tour.matterport_start_sweep ?? "")}
              />
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {linkMatterportOpenHref ? (
            <Link
              to={linkMatterportOpenHref}
              className={MP_ACTION_BTN}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              Space verknüpfen
            </Link>
          ) : null}
          {spaceId && !isArchived ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void archive()}
              className={MP_ACTION_BTN}
            >
              {busy ? "…" : "Space archivieren"}
            </button>
          ) : null}
          {spaceId && isArchived ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setReactivateOpen(true)}
              className={MP_ACTION_BTN}
            >
              <ArchiveRestore className="h-3.5 w-3.5 shrink-0" />
              {busy ? "…" : "Space reaktivieren"}
            </button>
          ) : null}
          {spaceId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => { setTransferErr(null); setTransferOpen(true); }}
              className={MP_ACTION_BTN}
            >
              <Send className="h-3.5 w-3.5 shrink-0" />
              Space übertragen
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setTicketOpen(true)}
            className={MP_ACTION_BTN}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
            Änderung anfragen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setDeleteConfirmText(""); setDeleteOpen(true); }}
            className={MP_ACTION_BTN}
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            {busy ? "…" : "Tour löschen"}
          </button>
        </div>
      </div>

      {ticketOpen ? (
        <TicketCreateDialog
          tourId={tourId}
          tourLabel={String(tour.canonical_object_label ?? tour.bezeichnung ?? `Tour #${tourId}`)}
          onClose={() => setTicketOpen(false)}
        />
      ) : null}

      {/* Löschen-Bestätigung */}
      {deleteOpen ? (() => {
        const label = String(tour.canonical_object_label ?? tour.bezeichnung ?? `Tour #${tourId}`);
        const confirmWord = "LÖSCHEN";
        const canDelete = deleteConfirmText.trim().toUpperCase() === confirmWord;
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] space-y-4 relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
                  <h3 className="text-base font-semibold text-[var(--text-main)]">Tour unwiderruflich löschen?</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(false)}
                  className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
                  aria-label="Schließen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <dl className="grid gap-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-[var(--text-subtle)] shrink-0">Tour:</dt>
                  <dd className="font-medium text-[var(--text-main)] break-all">{label}</dd>
                </div>
                {spaceId ? (
                  <div className="flex gap-2">
                    <dt className="text-[var(--text-subtle)] shrink-0">Matterport-Space:</dt>
                    <dd className="font-mono text-xs text-[var(--text-main)] break-all self-center">{spaceId}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-1 dark:border-red-900 dark:bg-red-950/30">
                <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                  ⚠️ Diese Aktion kann nicht rückgängig gemacht werden!
                </p>
                <p className="text-xs text-red-700 dark:text-red-400">
                  Der Matterport-Space wird <strong>NICHT</strong> gelöscht – er bleibt in Matterport erhalten.
                  Nur der Tour-Eintrag in der Datenbank wird entfernt.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-subtle)]">
                  Zur Bestätigung bitte <strong className="text-[var(--text-main)]">LÖSCHEN</strong> eingeben:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="LÖSCHEN"
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input,var(--bg-card))] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:ring-2 focus:ring-red-400/40"
                  onKeyDown={(e) => { if (e.key === "Enter" && canDelete) void deleteTour(); }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteOpen(false)}
                  disabled={busy}
                  className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => void deleteTour()}
                  disabled={busy || !canDelete}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  {busy ? "Wird gelöscht…" : "Endgültig löschen"}
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}

      {/* Reaktivierungs-Dialog mit Zahlungsart-Auswahl */}
      {reactivateOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-card)] ring-1 ring-[var(--border-strong)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] space-y-4 relative">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <ArchiveRestore className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h3 className="text-base font-semibold text-[var(--text-main)]">Space reaktivieren</h3>
              </div>
              <button
                type="button"
                onClick={() => setReactivateOpen(false)}
                className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-[var(--text-subtle)]">
              Wählen Sie die Zahlungsart für die Reaktivierungsrechnung.
              Kosten: <strong className="text-[var(--text-main)]">CHF 74.–</strong>{" "}
              (CHF 59.– Abo + CHF 15.– Reaktivierungsgebühr) für 6 Monate.
            </p>

            {/* Zahlungsart-Auswahl */}
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                <input
                  type="radio"
                  name="reactivateMethod"
                  value="payrexx"
                  checked={reactivateMethod === "payrexx"}
                  onChange={() => setReactivateMethod("payrexx")}
                  className="accent-[var(--accent)] w-4 h-4"
                />
                Online bezahlen (Payrexx)
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                <input
                  type="radio"
                  name="reactivateMethod"
                  value="qr_invoice"
                  checked={reactivateMethod === "qr_invoice"}
                  onChange={() => setReactivateMethod("qr_invoice")}
                  className="accent-[var(--accent)] w-4 h-4"
                />
                QR-Rechnung per E-Mail
              </label>
            </div>

            {/* Kontextueller Hinweis je nach Methode */}
            {reactivateMethod === "qr_invoice" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">⚠️ Hinweis</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Der Matterport-Space wird <strong>sofort aktiviert</strong>. Die QR-Rechnung
                  wird per E-Mail an den Kunden gesendet und ist{" "}
                  <strong>innerhalb von 14 Tagen</strong> zu bezahlen.
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Diese Aktion kann <strong>nicht rückgängig</strong> gemacht werden.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/30">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Der Space wird sofort aktiviert. Anschließend werden Sie zur Payrexx-Zahlungsseite weitergeleitet.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReactivateOpen(false)}
                disabled={busy}
                className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void handleReactivate()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <ArchiveRestore className="h-4 w-4" />
                {busy ? "Wird reaktiviert…" : "Jetzt reaktivieren"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Transfer-Dialog – z-[80] damit er über allem anderen liegt */}
      {transferOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-card)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] space-y-4 relative">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-[var(--text-main)]">
                Diesen Space übertragen?
              </h3>
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
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
