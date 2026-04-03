import { useEffect, useState } from "react";
import { toursAdminPost } from "../../../../api/toursAdmin";
import type { ToursAdminTourRow } from "../../../../types/toursAdmin";

type Props = {
  tourId: string;
  tour: ToursAdminTourRow;
  onSuccess: () => void;
  onOpenCustomerLink?: () => void;
};

export function TourActionsPanel({ tourId, tour, onSuccess, onOpenCustomerLink }: Props) {
  const [tourUrl, setTourUrl] = useState(String(tour.tour_url ?? ""));
  const [name, setName] = useState(
    String(tour.canonical_object_label ?? tour.object_label ?? tour.bezeichnung ?? "")
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setTourUrl(String(tour.tour_url ?? ""));
    setName(String(tour.canonical_object_label ?? tour.object_label ?? tour.bezeichnung ?? ""));
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
          <label className="text-sm font-medium text-[var(--text-subtle)]">Tour-URL (my.matterport.com)</label>
          <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
            Vollständige Adresse der Matterport-Tour aus dem Browser kopieren (meist{" "}
            <code className="rounded bg-[var(--surface)] px-1 font-mono text-[11px]">my.matterport.com/show/?m=…</code>
            ). Die Space-ID im Parameter <code className="rounded bg-[var(--surface)] px-1 font-mono text-[11px]">m=</code>{" "}
            verknüpft diese Tour in Propus mit dem richtigen Modell. Nach Änderung{" "}
            <strong className="font-medium text-[var(--text-main)]">URL speichern</strong> nicht vergessen.
          </p>
          <input
            value={tourUrl}
            onChange={(e) => setTourUrl(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
            placeholder="https://my.matterport.com/show/?m=…"
          />
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              run("url", () => toursAdminPost(`/tours/${tourId}/set-tour-url`, { tour_url: tourUrl.trim() || null }))
            }
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "url" ? "…" : "URL speichern"}
          </button>
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
