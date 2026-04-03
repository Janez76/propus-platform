import { useEffect, useState } from "react";
import { toursAdminPost } from "../../../../api/toursAdmin";
import type { ToursAdminTourRow } from "../../../../types/toursAdmin";

const VISIBILITY_OPTIONS = ["PRIVATE", "LINK_ONLY", "PUBLIC", "PASSWORD"] as const;

const VISIBILITY_META: Record<string, { icon: string; label: string }> = {
  LINK_ONLY: { icon: "🔗", label: "Nur Link" },
  PUBLIC: { icon: "🌐", label: "Öffentlich" },
  PASSWORD: { icon: "🔑", label: "Passwort" },
  PRIVATE: { icon: "🔒", label: "Privat" },
};

function normalizeVisibility(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "UNLISTED") return "LINK_ONLY";
  if (raw === "PRIVATE" || raw === "LINK_ONLY" || raw === "PUBLIC" || raw === "PASSWORD") return raw;
  return null;
}

type Props = {
  tourId: string;
  tour: ToursAdminTourRow;
  mpVisibility: string | null;
  onSuccess: () => void;
  onOpenCustomerLink?: () => void;
};

export function TourActionsPanel({ tourId, tour, mpVisibility, onSuccess, onOpenCustomerLink }: Props) {
  const normalizedMpVisibility = normalizeVisibility(mpVisibility);
  const [tourUrl, setTourUrl] = useState(String(tour.tour_url ?? ""));
  const [name, setName] = useState(
    String(tour.canonical_object_label ?? tour.object_label ?? tour.bezeichnung ?? "")
  );
  const [syncMp, setSyncMp] = useState(false);
  const [sweep, setSweep] = useState(String(tour.matterport_start_sweep ?? ""));
  const [verified, setVerified] = useState(Boolean(tour.customer_verified));
  const [visibility, setVisibility] = useState<string>(normalizedMpVisibility ?? "LINK_ONLY");
  const [visPassword, setVisPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setTourUrl(String(tour.tour_url ?? ""));
    setName(String(tour.canonical_object_label ?? tour.object_label ?? tour.bezeichnung ?? ""));
    setSweep(String(tour.matterport_start_sweep ?? ""));
    setVerified(Boolean(tour.customer_verified));
  }, [tour]);

  useEffect(() => {
    if (normalizedMpVisibility) setVisibility(normalizedMpVisibility);
  }, [normalizedMpVisibility]);

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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
          />
          <label className="flex items-center gap-2 text-sm text-[var(--text-subtle)]">
            <input type="checkbox" checked={syncMp} onChange={(e) => setSyncMp(e.target.checked)} />
            Name zu Matterport synchronisieren
          </label>
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              run("name", () =>
                toursAdminPost(`/tours/${tourId}/set-name`, { name: name.trim(), syncMatterport: syncMp ? "1" : "" })
              )
            }
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "name" ? "…" : "Name speichern"}
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--text-subtle)]">Startpunkt setzen</label>
          <input
            value={sweep}
            onChange={(e) => setSweep(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
            placeholder="Matterport Sweep ID"
          />
          <p className="text-sm text-[var(--text-subtle)]">
            Gewünschten Startpunkt in Matterport öffnen → im Browser die URL kopieren → den Wert nach <code className="rounded bg-[var(--surface)] px-1 font-mono text-xs">sid=</code> herauskopieren und hier einfügen. Alternativ: in der 3D-Ansicht auf den Sweep klicken → Sweep-ID aus den Eigenschaften ablesen.
          </p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              run("sweep", () => toursAdminPost(`/tours/${tourId}/set-start-sweep`, { start_sweep: sweep.trim() }))
            }
            className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {busy === "sweep" ? "…" : "Startpunkt setzen"}
          </button>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            Kunde verifiziert
          </label>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("ver", () => toursAdminPost(`/tours/${tourId}/set-verified`, { verified: verified }))}
            className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {busy === "ver" ? "…" : "Verifizierung speichern"}
          </button>
        </div>
      </div>

      <div className="border-t border-[var(--border-soft)] pt-4 space-y-2">
        <h3 className="text-sm font-medium text-[var(--text-main)]">Matterport-Sichtbarkeit</h3>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {(VISIBILITY_OPTIONS.map((value) => ({ value, ...VISIBILITY_META[value] })) as Array<{
            value: (typeof VISIBILITY_OPTIONS)[number];
            icon: string;
            label: string;
          }>).map(({ value, icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setVisibility(value)}
              className={[
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors",
                visibility === value
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/50",
              ].join(" ")}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>
        {visibility === "PASSWORD" && (
          <input
            type="password"
            value={visPassword}
            onChange={(e) => setVisPassword(e.target.value)}
            placeholder="Passwort eingeben"
            className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-main)]"
          />
        )}
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            run("vis", () =>
              toursAdminPost(`/tours/${tourId}/visibility`, {
                visibility,
                ...(visibility === "PASSWORD" ? { password: visPassword } : {}),
              })
            )
          }
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "vis" ? "…" : "Anwenden"}
        </button>
      </div>
    </div>
  );
}
