import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { toursAdminPost } from "../../../../api/toursAdmin";
import type { ToursAdminTourRow } from "../../../../types/toursAdmin";

type Props = {
  tourId: string;
  tour: ToursAdminTourRow;
  onSuccess: () => void;
  onOpenCustomerLink?: () => void;
};

function matterportSpaceIdFromTour(t: ToursAdminTourRow): string | null {
  const a = t.canonical_matterport_space_id ?? t.matterport_space_id;
  if (a === undefined || a === null) return null;
  const s = String(a).trim();
  return s || null;
}

/** Gängige Showcase-URL-Parameter (Matterport Show / Embed). */
function mergeShowcaseParam(url: string, key: string, value: string): string | null {
  try {
    const u = new URL(url.trim());
    u.searchParams.set(key, value);
    return u.toString();
  } catch {
    return null;
  }
}

const SHOWCASE_QUICK_PARAMS: { key: string; value: string; label: string; title: string }[] = [
  { key: "play", value: "1", label: "Autoplay", title: "play=1 — Tour startet automatisch" },
  { key: "help", value: "0", label: "Hilfe aus", title: "help=0 — Hilfe-Overlay ausblenden" },
  { key: "brand", value: "0", label: "Branding reduz.", title: "brand=0 — Matterport-Branding reduzieren (sofern erlaubt)" },
  { key: "qs", value: "1", label: "Quickstart", title: "qs=1 — Schnellstart-Modus" },
  { key: "lang", value: "de", label: "DE", title: "lang=de — Oberfläche Deutsch" },
];

export function TourActionsPanel({ tourId, tour, onSuccess, onOpenCustomerLink }: Props) {
  const [tourUrl, setTourUrl] = useState(String(tour.tour_url ?? "").trim());
  const [name, setName] = useState(
    String(tour.canonical_object_label ?? tour.object_label ?? tour.bezeichnung ?? "")
  );
  const [startSweep, setStartSweep] = useState(String(tour.matterport_start_sweep ?? ""));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  const mpSpaceId = matterportSpaceIdFromTour(tour);
  const defaultShowUrl = mpSpaceId ? `https://my.matterport.com/show/?m=${mpSpaceId}` : null;

  useEffect(() => {
    setTourUrl(String(tour.tour_url ?? "").trim());
    setName(String(tour.canonical_object_label ?? tour.object_label ?? tour.bezeichnung ?? ""));
    setStartSweep(String(tour.matterport_start_sweep ?? ""));
  }, [tour]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg("Gespeichert.");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(null);
    }
  }

  function applyQuickParam(key: string, value: string) {
    if (!tourUrl.trim()) return;
    const next = mergeShowcaseParam(tourUrl, key, value);
    if (next) setTourUrl(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--text-main)]">Stammdaten &amp; Matterport</h2>
        {onOpenCustomerLink ? (
          <button
            type="button"
            onClick={onOpenCustomerLink}
            className="text-sm font-medium text-[var(--accent)] hover:underline shrink-0"
          >
            Kunde anpassen
          </button>
        ) : null}
      </div>
      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--text-subtle)]">Tour-URL (Matterport Show)</label>
          <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
            HTTPS-Link zu <code className="rounded bg-[var(--surface)] px-1 font-mono text-[11px]">my.matterport.com</code>{" "}
            oder anderer{" "}
            <code className="rounded bg-[var(--surface)] px-1 font-mono text-[11px]">*.matterport.com</code>
            -Show-Domain mit Modell-ID (<code className="rounded bg-[var(--surface)] px-1 font-mono text-[11px]">?m=…</code>{" "}
            oder Pfad{" "}
            <code className="rounded bg-[var(--surface)] px-1 font-mono text-[11px]">/models/…</code>
            ). Zusätzliche Query-Parameter entsprechen der Matterport-Showcase-/Embed-Dokumentation (z. B. Autoplay,
            Sprache). Feld leeren und speichern entfernt die gespeicherte URL.
          </p>
          <input
            value={tourUrl}
            onChange={(e) => setTourUrl(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
            placeholder="https://my.matterport.com/show/?m=…"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() =>
                run("url", () =>
                  toursAdminPost(`/tours/${tourId}/set-tour-url`, {
                    tour_url: tourUrl.trim() || null,
                  })
                )
              }
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "url" ? "…" : "URL speichern"}
            </button>
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
            {defaultShowUrl ? (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setTourUrl(defaultShowUrl)}
                className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
                title="Setzt den Standard-Show-Link aus der verknüpften Space-ID"
              >
                Standard-Link
              </button>
            ) : null}
          </div>
          <div className="rounded-lg border border-[var(--border-soft)] border-dashed bg-[var(--surface)]/50 px-3 py-2">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
              Showcase-Parameter einfügen
            </p>
            <p className="mb-2 text-xs text-[var(--text-subtle)]">
              Fügt bzw. überschreibt Parameter im aktuellen Link (lokal im Feld — danach{" "}
              <strong className="font-medium text-[var(--text-main)]">URL speichern</strong>).
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SHOWCASE_QUICK_PARAMS.map((p) => (
                <button
                  key={`${p.key}=${p.value}`}
                  type="button"
                  disabled={!tourUrl.trim()}
                  title={p.title}
                  onClick={() => applyQuickParam(p.key, p.value)}
                  className="rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 text-xs font-medium text-[var(--text-main)] disabled:opacity-40"
                >
                  + {p.label}
                </button>
              ))}
            </div>
          </div>

          <div id="admin-stammdaten-startpunkt" className="border-t border-[var(--border-soft)] pt-3 space-y-2 scroll-mt-24">
            <label className="text-sm font-medium text-[var(--text-subtle)]">Startpunkt setzen (Matterport Sweep-ID)</label>
            <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
              Entspricht dem <code className="rounded bg-[var(--surface)] px-1 font-mono text-[11px]">sid=</code>-Wert in der Show-URL oder einer Zeile aus der{" "}
              <a
                href="#matterport-sweep-ids"
                className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Sweep-Liste (Model API)
              </a>{" "}
              im Abschnitt Matterport unten — dort per <strong className="font-medium text-[var(--text-main)]">Als Startpunkt</strong>{" "}
              direkt speichern. Feld leeren und speichern entfernt den Startpunkt.
            </p>
            <input
              value={startSweep}
              onChange={(e) => setStartSweep(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] font-mono"
              placeholder="z. B. aus sid=… in der Browser-URL"
              spellCheck={false}
            />
            <button
              type="button"
              disabled={!!busy}
              onClick={() =>
                run("sweep", () =>
                  toursAdminPost(`/tours/${tourId}/set-start-sweep`, {
                    start_sweep: startSweep.trim() || null,
                  })
                )
              }
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "sweep" ? "…" : "Startpunkt speichern"}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--text-subtle)]">Objektbezeichnung</label>
          <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
            Anzeigename der Immobilie in Propus (Listen, Tour-Detail, E-Mails). Beim Speichern wird der Name zusätzlich
            ins verknüpfte Matterport-Modell übernommen (sofern technisch möglich).
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
          />
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              run("name", () =>
                toursAdminPost(`/tours/${tourId}/set-name`, { name: name.trim(), syncMatterport: "1" })
              )
            }
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "name" ? "…" : "Name speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
