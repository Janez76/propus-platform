import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, Copy, Check, RefreshCw, X } from "lucide-react";
import {
  getPortalTourDetail,
  getPortalMatterportModel,
  editPortalTour,
  extendPortalTour,
  changePortalTourVisibility,
  archivePortalTour,
  setPortalTourAssignee,
  payPortalInvoice,
  setPortalMatterportOptions,
  setPortalStartSweep,
  type PortalTourDetail,
} from "../../api/portalTours";
import type { MatterportModelMeta, MatterportModelOptions, MatterportOptionsPatch, MatterportSettingOverride } from "../../api/toursAdmin";
import { usePortalNav } from "../../hooks/usePortalNav";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoney(v: unknown): string {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  return `CHF ${n.toFixed(2)}`;
}

function fmtRestzeit(days: unknown): string {
  const n = typeof days === "number" ? days : parseInt(String(days ?? ""), 10);
  if (!Number.isFinite(n)) return "—";
  if (n < 0) return `Seit ${Math.abs(n)} ${Math.abs(n) === 1 ? "Tag" : "Tagen"} abgelaufen`;
  if (n === 0) return "Läuft heute ab";
  return `${n} ${n === 1 ? "Tag" : "Tage"}`;
}

function latestRenewalDate(rows: PortalTourDetail["invoices"]): unknown {
  const candidates = rows
    .map((r) => r.paid_at ?? r.sent_at ?? r.created_at ?? null)
    .filter((v): v is string => v != null)
    .map((v) => ({ raw: v, ts: new Date(v).getTime() }))
    .filter((v) => Number.isFinite(v.ts))
    .sort((a, b) => b.ts - a.ts);
  return candidates[0]?.raw ?? null;
}

// ─── Visibility Panel (portal-version) ───────────────────────────────────────

const VISIBILITY_OPTIONS = ["PRIVATE", "LINK_ONLY", "PUBLIC", "PASSWORD"] as const;
const VISIBILITY_META: Record<string, { icon: string; label: string }> = {
  LINK_ONLY: { icon: "🔗", label: "Nur Link" },
  PUBLIC:    { icon: "🌐", label: "Öffentlich" },
  PASSWORD:  { icon: "🔑", label: "Passwort" },
  PRIVATE:   { icon: "🔒", label: "Privat" },
};
const VISIBILITY_HINTS: Record<(typeof VISIBILITY_OPTIONS)[number], string> = {
  PRIVATE:   "Nur für berechtigte Nutzer im Matterport-Konto sichtbar — nicht öffentlich auffindbar und kein freies Teilen.",
  LINK_ONLY: "Wer den direkten Link zur Tour hat, kann sie öffnen; sie erscheint nicht in öffentlichen Listen oder der Suche.",
  PUBLIC:    "Tour ist öffentlich zugänglich — gut für breites Teilen und Einbindung auf Websites.",
  PASSWORD:  "Zusätzlicher Schutz: Zugang erst nach Eingabe des hier gesetzten Passworts.",
};

function normalizeVisibility(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "UNLISTED") return "LINK_ONLY";
  if (VISIBILITY_OPTIONS.includes(raw as (typeof VISIBILITY_OPTIONS)[number])) return raw;
  return null;
}

function PortalVisibilityPanel({
  tourId,
  mpVisibility,
  onSuccess,
}: {
  tourId: number;
  mpVisibility: string | null;
  onSuccess: () => void;
}) {
  const normalizedMpVisibility = normalizeVisibility(mpVisibility);
  const [visibility, setVisibility] = useState<string>(normalizedMpVisibility ?? "LINK_ONLY");
  const [visPassword, setVisPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (normalizedMpVisibility) setVisibility(normalizedMpVisibility);
  }, [normalizedMpVisibility]);

  async function apply() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await changePortalTourVisibility(tourId, visibility, visibility === "PASSWORD" ? visPassword : undefined);
      setMsg("Gespeichert.");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  const selectedKey = (VISIBILITY_OPTIONS.includes(visibility as (typeof VISIBILITY_OPTIONS)[number])
    ? visibility
    : "LINK_ONLY") as (typeof VISIBILITY_OPTIONS)[number];

  return (
    <div className="border-b border-[var(--border-soft)] pb-4 space-y-2">
      <h3 className="text-sm font-medium text-[var(--text-main)]">Matterport-Sichtbarkeit</h3>
      <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
        Legt fest, wer die Tour im Matterport-Viewer erreichen kann. Option wählen und auf{" "}
        <strong className="font-medium text-[var(--text-main)]">Anwenden</strong> klicken — die Änderung wird an Matterport übermittelt.
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {VISIBILITY_OPTIONS.map((value) => {
          const { icon, label } = VISIBILITY_META[value];
          return (
            <button
              key={value}
              type="button"
              onClick={() => setVisibility(value)}
              className={[
                "flex w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors",
                visibility === value
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/50",
              ].join(" ")}
            >
              <span className="shrink-0">{icon}</span>
              <span className="min-w-0 truncate">{label}</span>
              {value === "LINK_ONLY" ? (
                <span className="ml-auto shrink-0 rounded-full border border-current px-1 py-0 text-[9px] font-semibold uppercase tracking-wide opacity-70">
                  Standard
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-[var(--text-subtle)] leading-relaxed rounded-lg border border-[var(--border-soft)]/80 bg-[var(--surface)] px-2.5 py-2">
        <span className="font-medium text-[var(--text-main)]">{VISIBILITY_META[selectedKey]?.label}: </span>
        {VISIBILITY_HINTS[selectedKey]}
      </p>
      {visibility === "PASSWORD" && (
        <input
          type="password"
          value={visPassword}
          onChange={(e) => setVisPassword(e.target.value)}
          placeholder="Passwort eingeben"
          className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-main)]"
        />
      )}
      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void apply()}
        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "…" : "Anwenden"}
      </button>
    </div>
  );
}

// ─── Matterport Meta Panel (portal-version, ohne Admin-Aktionen) ──────────────

const STATE_META: Record<string, { label: string; color: string }> = {
  active:     { label: "Aktiv",          color: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900" },
  inactive:   { label: "Archiviert",     color: "text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-950/40 dark:border-orange-900" },
  processing: { label: "In Bearbeitung", color: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-900" },
  staging:    { label: "Staging",        color: "text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-900" },
  failed:     { label: "Fehler",         color: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-900" },
  pending:    { label: "Ausstehend",     color: "text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-300 dark:bg-yellow-950/40 dark:border-yellow-900" },
};
const VIS_META: Record<string, { icon: string; label: string }> = {
  PUBLIC:    { icon: "🌐", label: "Öffentlich" },
  UNLISTED:  { icon: "🔗", label: "Nur Link" },
  LINK_ONLY: { icon: "🔗", label: "Nur Link" },
  PRIVATE:   { icon: "🔒", label: "Privat" },
  PASSWORD:  { icon: "🔑", label: "Passwort" },
};

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
  { key: "defurnishViewEnabled",  label: "Mobiliar entfernen",   hint: "Zeigt den Raum möbellos – ideal für leere Übergaben.",           icon: "🛋️", overrideKey: "defurnishViewOverride" },
  { key: "dollhouseEnabled",      label: "Dollhouse-Modus",      hint: "3D-Gesamtansicht des Gebäudes von aussen.",                      icon: "🏠", overrideKey: "dollhouseOverride" },
  { key: "floorplanEnabled",      label: "Grundriss",            hint: "Zeigt den 2D-Grundriss des Stockwerks an.",                      icon: "📐", overrideKey: "floorplanOverride" },
  { key: "socialSharingEnabled",  label: "Social Sharing",       hint: "Schaltfläche zum Teilen auf sozialen Netzwerken einblenden.",     icon: "🔗", overrideKey: "socialSharingOverride" },
  { key: "vrEnabled",             label: "VR-Modus",             hint: "Ermöglicht den Besuch mit VR-Brille.",                           icon: "🥽", overrideKey: "vrOverride" },
  { key: "highlightReelEnabled",  label: "Highlight Reel",       hint: "Automatische Kurzpräsentation der Highlights beim Start.",        icon: "🎬", overrideKey: "highlightReelOverride" },
  { key: "labelsEnabled",         label: "Raumbeschriftungen",   hint: "Blendet die Raumnamen direkt im 3D-Rundgang ein.",               icon: "🏷️", overrideKey: "labelsOverride" },
  { key: "tourAutoplayEnabled",   label: "Tour Autoplay",        hint: "Startet die Tour automatisch ohne Nutzeraktion.",                icon: "▶️", overrideKey: "tourAutoplayOverride" },
  { key: "roomBoundsEnabled",     label: "Raumgrenzen",          hint: "Zeigt die Raumgrenzen als transparente Flächen.",                icon: "📦", overrideKey: "roomBoundsOverride" },
];

function PortalOverrideToggle({
  icon, label, hint, overrideKey, enabled, override, tourId, onSuccess, disabled: disabledProp = false,
}: {
  icon: string; label: string; hint: string;
  overrideKey: keyof MatterportOptionsPatch;
  enabled: boolean | null; override: string | null;
  tourId: number; onSuccess: () => void; disabled?: boolean;
}) {
  const [busy, setBusy] = useState<MatterportSettingOverride | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const currentOverride = (String(override ?? "default").toLowerCase()) as MatterportSettingOverride | "default";
  const isOverrideSet = currentOverride !== "default";

  async function handleClick(value: "enabled" | "disabled") {
    if (busy || disabledProp) return;
    const next: MatterportSettingOverride = (isOverrideSet && currentOverride === value) ? "default" : value;
    setBusy(next);
    setErr(null);
    try {
      await setPortalMatterportOptions(tourId, { [overrideKey]: next });
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
              disabled={!!busy || disabledProp}
              onClick={() => void handleClick(btn.value)}
              title={
                disabledProp
                  ? "Nur bei aktivem Space änderbar"
                  : isActiveOverride
                    ? "Klicken zum Zurücksetzen auf Matterport-Standard"
                    : undefined
              }
              className={[
                "rounded border px-2 py-0.5 text-xs leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-40",
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

function extractSweepFromInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const fromParam = t.match(/[?&#]sid=([^&\s#]+)/i);
  if (fromParam) {
    try { return decodeURIComponent(fromParam[1]); } catch { return fromParam[1]; }
  }
  try {
    const u = new URL(t);
    const sid = u.searchParams.get("sid");
    if (sid) return sid.trim();
  } catch { /* kein URL */ }
  return t;
}

function PortalSweepIdTile({
  tourId, matterportStartSweep, onSaved,
}: {
  tourId: number; matterportStartSweep: string; onSaved: () => void;
}) {
  const [draft, setDraft] = useState(matterportStartSweep);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setDraft(matterportStartSweep); }, [matterportStartSweep]);

  async function save() {
    setSaving(true); setOk(false); setErr(null);
    const resolved = extractSweepFromInput(draft);
    try {
      await setPortalStartSweep(tourId, resolved || null);
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
        <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium text-[var(--text-main)]">
            <span>Startpunkt setzen</span>
            {err ? <span className="text-xs font-normal text-red-500">{err}</span> : null}
          </div>
          <p className="mt-0.5 text-xs leading-snug text-[var(--text-subtle)]">
            In Matterport auf den gewünschten Standort navigieren, dann{" "}
            <kbd className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-1 font-mono text-[10px]">Strg</kbd>
            +
            <kbd className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-1 font-mono text-[10px]">Shift</kbd>
            +
            <kbd className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-1 font-mono text-[10px]">L</kbd>{" "}
            drücken — es öffnet sich das Fenster <em>„Link to location"</em> mit der URL inkl.{" "}
            <code className="rounded bg-[var(--surface)] px-1 font-mono text-[10px]">sid=</code>. Dort „Copy to clipboard"
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

function PortalMatterportMetaPanel({
  meta,
  onRefresh,
  loading,
  tourId,
  tourShowUrl,
  mpVisibility,
  onVisibilitySaved,
  matterportStartSweep,
}: {
  meta: MatterportModelMeta;
  onRefresh: () => void;
  loading: boolean;
  tourId: number;
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
    } catch { /* ignore */ }
  }

  const stateKey = String(meta.state ?? "").toLowerCase();
  const stateMeta = STATE_META[stateKey];
  const isSpaceInactive = stateKey === "inactive";
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

      <PortalVisibilityPanel tourId={tourId} mpVisibility={mpVisibility} onSuccess={onVisibilitySaved} />

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
          <MetaRow
            label="Externe URL"
            value={
              <a href={meta.publication.externalUrl} target="_blank" rel="noopener noreferrer"
                className="text-[var(--accent)] underline hover:no-underline break-all">
                {meta.publication.externalUrl}
              </a>
            }
          />
        ) : null}
      </dl>

      {meta.options ? (
        <div className="border-t border-[var(--border-soft)] pt-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">
            Einstellungen anzeigen
          </p>
          <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
            Steuert, welche Viewer-Funktionen Besucher in der Matterport-Tour sehen (Grundriss, VR, Teilen usw.). Änderungen
            werden direkt am Modell gespeichert — kurz warten und bei Bedarf{" "}
            <strong className="font-medium text-[var(--text-main)]">Aktualisieren</strong> nutzen.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0 sm:grid-cols-3 lg:grid-cols-4 divide-y-0 [&>*]:border-b [&>*]:border-[var(--border-soft)]">
            {OPTIONS_CONFIG.map(({ key, label, hint, icon, overrideKey }) => (
              <PortalOverrideToggle
                key={key}
                icon={icon}
                label={label}
                hint={hint}
                overrideKey={overrideKey as keyof MatterportOptionsPatch}
                enabled={meta.options![key] as boolean | null}
                override={meta.options![overrideKey] as string | null}
                tourId={tourId}
                onSuccess={onRefresh}
                disabled={isSpaceInactive}
              />
            ))}
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <PortalSweepIdTile
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PortalTourDetailPage() {
  const { tourId: id } = useParams<{ tourId: string }>();
  const navigate = useNavigate();
  const { portalPath } = usePortalNav();

  const tourId = Number(id);

  const [data, setData] = useState<PortalTourDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Stammdaten edit
  const [tourUrl, setTourUrl] = useState("");
  const [name, setName] = useState("");
  const [urlCopied, setUrlCopied] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);

  // Matterport Meta
  const [meta, setMeta] = useState<MatterportModelMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [metaInactive, setMetaInactive] = useState(false);

  // Modals
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [extendMethod, setExtendMethod] = useState<"payrexx" | "qr_invoice">("payrexx");
  const [extendErr, setExtendErr] = useState<string | null>(null);
  const [archiveErr, setArchiveErr] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getPortalTourDetail(tourId);
      setData(res);
      setTourUrl(String(res.tour.tour_url ?? "").trim());
      setName(String(res.tour.canonical_object_label ?? res.tour.object_label ?? res.tour.bezeichnung ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  const loadMeta = useCallback(async (spaceId: string) => {
    setMetaLoading(true);
    setMetaErr(null);
    setMetaInactive(false);
    try {
      const r = await getPortalMatterportModel(tourId);
      setMeta(r.model);
      setMetaInactive(r.inactiveWarning === true);
    } catch (e) {
      setMetaErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setMetaLoading(false);
    }
    void spaceId; // used only for call site clarity
  }, [tourId]);

  useEffect(() => {
    if (id) void loadData();
  }, [id, loadData]);

  useEffect(() => {
    const spaceId = data?.tour.canonical_matterport_space_id;
    if (spaceId) void loadMeta(spaceId);
  }, [data?.tour.canonical_matterport_space_id, loadMeta]);

  const refetch = useCallback(() => {
    void loadData();
  }, [loadData]);

  async function saveName() {
    setSaving("name");
    setNameErr(null);
    setNameMsg(null);
    try {
      await editPortalTour(tourId, { object_label: name });
      setNameMsg("Gespeichert.");
      refetch();
    } catch (e) {
      setNameErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(null);
    }
  }

  async function handleExtend() {
    setSaving("extend");
    setExtendErr(null);
    try {
      const res = await extendPortalTour(tourId, extendMethod);
      if (res.redirectUrl) { window.location.href = res.redirectUrl; return; }
      setShowExtendModal(false);
      refetch();
    } catch (e) {
      setExtendErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(null);
    }
  }

  async function handleArchive() {
    setSaving("archive");
    setArchiveErr(null);
    try {
      await archivePortalTour(tourId);
      setShowArchiveModal(false);
      refetch();
    } catch (e) {
      setArchiveErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(null);
    }
  }

  async function handleAssignee(email: string) {
    setSaving("assignee");
    try {
      await setPortalTourAssignee(tourId, email);
      refetch();
    } catch { /* ignore */ } finally {
      setSaving(null);
    }
  }

  async function handlePay(invoiceId: number) {
    setSaving(`pay-${invoiceId}`);
    try {
      const res = await payPortalInvoice(tourId, invoiceId);
      if (res.paymentUrl) window.location.href = res.paymentUrl;
    } catch { /* ignore */ } finally {
      setSaving(null);
    }
  }

  const tour = data?.tour;
  const invoices = data?.invoices ?? [];
  const pricing = data?.pricing;
  const assigneeBundle = data?.assigneeBundle;
  const paymentSummary = data?.paymentSummary;
  const paymentTimeline = data?.paymentTimeline ?? [];
  const displayedTourStatus = data?.displayedTourStatus;
  const canManage = assigneeBundle?.canManageByTourId?.[String(tourId)] ?? false;
  const currentAssignee = assigneeBundle?.assigneeByTourId?.[String(tourId)] ?? "";
  const candidates = Object.values(assigneeBundle?.candidatesByWorkspace ?? {}).flat();
  const spaceId = tour?.canonical_matterport_space_id ?? (tour?.matterport_model_id as string | undefined);
  const mpUrl = spaceId ? `https://my.matterport.com/show/?m=${encodeURIComponent(spaceId)}` : null;
  const isArchived = tour?.archiv || String(tour?.status ?? "").toUpperCase() === "ARCHIVED";
  const lastRenewalAt = latestRenewalDate(invoices);
  const ps = paymentSummary as Record<string, unknown> | null | undefined;

  const tourTitle =
    tour?.canonical_object_label || tour?.object_label || tour?.bezeichnung || `Tour #${tourId}`;

  if (!loading && error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => navigate(portalPath("tours"))}
            className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Liste
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button type="button" onClick={() => void loadData()} className="text-sm underline font-medium">
            Erneut laden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate(portalPath("tours"))}
            className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Liste
          </button>
          {loading && !data ? (
            <div className="skeleton-line h-8 w-64 max-w-full" />
          ) : data ? (
            <>
              <h1 className="text-2xl font-bold text-[var(--text-main)]">{tourTitle}</h1>
              <p className="text-sm text-[var(--text-subtle)] mt-1">
                #{tourId}
                {displayedTourStatus ? ` · ${displayedTourStatus.label}` : ""}
                {displayedTourStatus?.note ? ` · ${displayedTourStatus.note}` : ""}
              </p>
            </>
          ) : (
            <h1 className="text-2xl font-bold text-[var(--text-main)]">Tour #{tourId}</h1>
          )}
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button type="button" onClick={() => void loadData()} className="text-sm underline font-medium">
            Erneut laden
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : null}

      {data && tour ? (
        <>
          {/* ── Stammdaten & Matterport (= TourActionsPanel + TourMatterportSection) ── */}
          <section className="surface-card-strong p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-[var(--text-main)]">Stammdaten &amp; Matterport</h2>
            </div>

            {nameMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{nameMsg}</p> : null}
            {nameErr ? <p className="text-sm text-red-600 dark:text-red-400">{nameErr}</p> : null}

            <div className="grid gap-4 md:grid-cols-2">
              {/* Tour-URL (readonly + copy) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-subtle)]">Tour-URL (Matterport Show)</label>
                <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
                  HTTPS-Link zu{" "}
                  <code className="rounded bg-[var(--surface)] px-1 font-mono text-[11px]">my.matterport.com</code>.
                  Das Feld ist nur zur Anzeige da; über den Button unten wird die aktuell gespeicherte URL kopiert.
                </p>
                <input
                  value={tourUrl}
                  readOnly
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                  placeholder="https://my.matterport.com/show/?m=…"
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!tourUrl.trim()}
                    onClick={() => {
                      const t = tourUrl.trim();
                      if (!t) return;
                      void navigator.clipboard.writeText(t).then(() => {
                        setUrlCopied(true);
                        window.setTimeout(() => setUrlCopied(false), 2000);
                      });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
                  >
                    {urlCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {urlCopied ? "Kopiert" : "URL kopieren"}
                  </button>
                </div>
              </div>

              {/* Objektbezeichnung (editierbar) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-subtle)]">Objektbezeichnung</label>
                <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
                  Anzeigename der Immobilie in Propus (Listen, Tour-Detail, E-Mails). Beim Speichern wird der Name
                  zusätzlich ins verknüpfte Matterport-Modell übernommen (sofern technisch möglich).
                </p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                />
                <button
                  type="button"
                  disabled={saving === "name"}
                  onClick={() => void saveName()}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving === "name" ? "…" : "Name speichern"}
                </button>
              </div>
            </div>

            {/* Matterport-Sektion */}
            <div className="border-t border-[var(--border-soft)] pt-4 space-y-3">
              <h2 className="text-base font-semibold text-[var(--text-main)]">Matterport</h2>

              {spaceId ? (
                <div className="border-t border-[var(--border-soft)] pt-3 space-y-2">
                  {metaLoading && !meta ? (
                    <p className="text-sm text-[var(--text-subtle)]">Wird geladen…</p>
                  ) : metaErr ? (
                    <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
                      <p className="text-sm text-red-700 dark:text-red-300">{metaErr}</p>
                      <button
                        type="button"
                        onClick={() => void loadMeta(spaceId)}
                        className="ml-2 shrink-0 text-sm text-red-600 underline hover:no-underline dark:text-red-400"
                      >
                        Erneut laden
                      </button>
                    </div>
                  ) : meta && metaInactive ? (
                    <>
                      <p className="text-xs text-[var(--text-subtle)] rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2">
                        Archivierter Space – Publikationsdetails bei Matterport nicht verfügbar.
                      </p>
                      <PortalMatterportMetaPanel
                        meta={meta}
                        onRefresh={() => void loadMeta(spaceId)}
                        loading={metaLoading}
                        tourId={tourId}
                        tourShowUrl={mpUrl}
                        mpVisibility={data.mpVisibility}
                        onVisibilitySaved={() => {
                          refetch();
                          void loadMeta(spaceId);
                        }}
                        matterportStartSweep={String(tour.matterport_start_sweep ?? "")}
                      />
                    </>
                  ) : meta ? (
                    <PortalMatterportMetaPanel
                      meta={meta}
                      onRefresh={() => void loadMeta(spaceId)}
                      loading={metaLoading}
                      tourId={tourId}
                      tourShowUrl={mpUrl}
                      mpVisibility={data.mpVisibility}
                      onVisibilitySaved={() => {
                        refetch();
                        void loadMeta(spaceId);
                      }}
                      matterportStartSweep={String(tour.matterport_start_sweep ?? "")}
                    />
                  ) : null}
                </div>
              ) : null}

              {/* Portal-Aktionen: Verlängern, Archivieren, Zuständigkeit */}
              <div className="flex flex-wrap gap-2">
                {!isArchived && pricing ? (
                  <button
                    type="button"
                    disabled={saving === "extend"}
                    onClick={() => { setExtendErr(null); setShowExtendModal(true); }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-main)] shadow-sm transition-colors duration-150 hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] disabled:pointer-events-none disabled:opacity-50"
                  >
                    {pricing.isReactivation ? "Tour reaktivieren" : "Tour verlängern"}
                  </button>
                ) : null}
                {!isArchived ? (
                  <button
                    type="button"
                    disabled={saving === "archive"}
                    onClick={() => { setArchiveErr(null); setShowArchiveModal(true); }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-main)] shadow-sm transition-colors duration-150 hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] disabled:pointer-events-none disabled:opacity-50"
                  >
                    Tour archivieren
                  </button>
                ) : null}
                {canManage && candidates.length > 0 ? (
                  <select
                    className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] shadow-sm"
                    value={currentAssignee}
                    onChange={(e) => void handleAssignee(e.target.value)}
                    disabled={saving === "assignee"}
                  >
                    <option value="">– Zuständigkeit –</option>
                    {candidates.map((c) => (
                      <option key={c.email} value={c.email}>{c.name || c.email}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>
          </section>

          {/* ── Rechnungen & Zahlungen (= TourInvoicesSection) ── */}
          <section className="surface-card-strong p-5 space-y-4">
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Rechnungen &amp; Zahlungen</h2>

            {/* 4er-Grid Datumsinfos */}
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--border-soft)] p-3">
                <div className="text-[var(--text-subtle)] text-xs">Tour erstellt am</div>
                <div className="mt-1 font-semibold text-[var(--text-main)]">
                  {fmtDate(tour.matterport_created_at ?? tour.created_at)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-soft)] p-3">
                <div className="text-[var(--text-subtle)] text-xs">Tour läuft am ab</div>
                <div className="mt-1 font-semibold text-[var(--text-main)]">
                  {fmtDate(tour.canonical_term_end_date ?? tour.term_end_date ?? tour.ablaufdatum)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-soft)] p-3">
                <div className="text-[var(--text-subtle)] text-xs">Letzte Verlängerung</div>
                <div className="mt-1 font-semibold text-[var(--text-main)]">{fmtDate(lastRenewalAt)}</div>
              </div>
              <div className="rounded-lg border border-[var(--border-soft)] p-3">
                <div className="text-[var(--text-subtle)] text-xs">Restzeit</div>
                <div className="mt-1 font-semibold text-[var(--text-main)]">
                  {fmtRestzeit(
                    (() => {
                      const end = tour.canonical_term_end_date ?? tour.term_end_date ?? tour.ablaufdatum;
                      if (!end) return null;
                      return Math.ceil((new Date(String(end)).getTime() - Date.now()) / 86_400_000);
                    })()
                  )}
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            {ps ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border border-[var(--border-soft)] p-3">
                  <div className="text-[var(--text-subtle)] text-xs">Bezahlt</div>
                  <div className="font-semibold text-[var(--text-main)]">{String(ps.paidCount ?? "0")}</div>
                  <div className="text-xs text-[var(--text-subtle)]">{fmtMoney(ps.paidAmount)}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-soft)] p-3">
                  <div className="text-[var(--text-subtle)] text-xs">Offen</div>
                  <div className="font-semibold text-[var(--text-main)]">{String(ps.openCount ?? "0")}</div>
                  <div className="text-xs text-[var(--text-subtle)]">{fmtMoney(ps.openAmount)}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-soft)] p-3 sm:col-span-2">
                  <div className="text-[var(--text-subtle)] text-xs">Letzte Zahlung</div>
                  {ps.lastPayment && typeof ps.lastPayment === "object" ? (
                    <div className="text-sm text-[var(--text-main)] mt-1">
                      {String((ps.lastPayment as Record<string, unknown>).label ?? "")}{" "}
                      <span className="text-[var(--text-subtle)]">
                        {fmtDate((ps.lastPayment as Record<string, unknown>).at)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--text-subtle)]">—</div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Payment Timeline */}
            {paymentTimeline.length > 0 ? (
              <div>
                <h3 className="text-sm font-medium text-[var(--text-main)] mb-2">Zeitleiste</h3>
                <ul className="space-y-2 text-sm">
                  {paymentTimeline.slice(0, 8).map((row, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-[var(--border-soft)]/50 pb-2">
                      <span className="text-[var(--text-main)]">{row.title}</span>
                      <span className="text-[var(--text-subtle)]">{row.statusLabel}</span>
                      <span className="text-[var(--text-subtle)]">{fmtDate(row.primaryDate)}</span>
                      <span>{fmtMoney(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Rechnungstabelle */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-medium text-[var(--text-main)]">Verlängerungsrechnungen</h3>
              </div>
              {invoices.length === 0 ? (
                <p className="text-sm text-[var(--text-subtle)]">Keine Einträge.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                        <th className="py-2 pr-2">Nr.</th>
                        <th className="py-2 pr-2">Status</th>
                        <th className="py-2 pr-2">Betrag</th>
                        <th className="py-2 pr-2">Fällig</th>
                        <th className="py-2">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-[var(--border-soft)]/40">
                          <td className="py-2 pr-2">{String(inv.invoice_number ?? inv.exxas_document_id ?? inv.id)}</td>
                          <td className="py-2 pr-2">{String(inv.invoice_status ?? "")}</td>
                          <td className="py-2 pr-2">{fmtMoney(inv.amount_chf ?? inv.betrag)}</td>
                          <td className="py-2 pr-2">{fmtDate(inv.due_at)}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <a
                                href={portalPath(`tours/${tourId}/invoices/${inv.id}/print`)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--accent)] hover:underline text-xs"
                              >
                                Drucken
                              </a>
                              <a
                                href={`/tour-manager/portal/tours/${tourId}/invoices/${inv.id}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--accent)] hover:underline text-xs"
                              >
                                PDF
                              </a>
                              {inv.invoice_status !== "paid" && inv.invoice_status !== "cancelled" ? (
                                <button
                                  type="button"
                                  disabled={saving === `pay-${inv.id}`}
                                  onClick={() => void handlePay(inv.id)}
                                  className="rounded-lg bg-[var(--accent)] px-2.5 py-0.5 text-xs font-medium text-white disabled:opacity-50"
                                >
                                  Bezahlen
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}

      {/* ── Verlängerungs-Modal ── */}
      {showExtendModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => saving !== "extend" && setShowExtendModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-[var(--text-main)]">
                {pricing?.isReactivation ? "Tour reaktivieren" : "Tour verlängern"}
              </h3>
              <button
                type="button"
                onClick={() => setShowExtendModal(false)}
                className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                aria-label="Schliessen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-subtle)]">
              Wählen Sie die gewünschte Zahlungsart.
              {pricing ? (
                <> Kosten:{" "}
                  <strong className="text-[var(--text-main)]">
                    CHF {(pricing.isExtension ? pricing.extensionPriceCHF : pricing.reactivationPriceCHF).toFixed(2)}
                  </strong>
                </>
              ) : null}
            </p>
            <div className="flex flex-col gap-2">
              {data?.payrexxConfigured ? (
                <label className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                  <input
                    type="radio"
                    name="extendMethod"
                    value="payrexx"
                    checked={extendMethod === "payrexx"}
                    onChange={() => setExtendMethod("payrexx")}
                    className="accent-[var(--accent)] w-4 h-4"
                  />
                  Online bezahlen (Payrexx)
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                <input
                  type="radio"
                  name="extendMethod"
                  value="qr_invoice"
                  checked={extendMethod === "qr_invoice"}
                  onChange={() => setExtendMethod("qr_invoice")}
                  className="accent-[var(--accent)] w-4 h-4"
                />
                QR-Rechnung per E-Mail
              </label>
            </div>
            {extendErr ? <p className="text-sm text-red-600 dark:text-red-400">{extendErr}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowExtendModal(false)}
                disabled={saving === "extend"}
                className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void handleExtend()}
                disabled={saving === "extend"}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving === "extend" ? "Wird verarbeitet…" : "Bestätigen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Archivierungs-Modal ── */}
      {showArchiveModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => saving !== "archive" && setShowArchiveModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[var(--bg-card)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-[var(--text-main)]">Tour archivieren?</h3>
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                aria-label="Schliessen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-subtle)]">
              Sind Sie sicher, dass Sie diese Tour archivieren möchten? Die Tour wird deaktiviert und ist nicht mehr öffentlich zugänglich.
            </p>
            {archiveErr ? <p className="text-sm text-red-600 dark:text-red-400">{archiveErr}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                disabled={saving === "archive"}
                className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void handleArchive()}
                disabled={saving === "archive"}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving === "archive" ? "Wird archiviert…" : "Ja, archivieren"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
