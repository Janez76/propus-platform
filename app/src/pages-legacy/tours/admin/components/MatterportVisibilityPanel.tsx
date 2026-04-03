import { useEffect, useState } from "react";
import { toursAdminPost } from "../../../../api/toursAdmin";

const VISIBILITY_OPTIONS = ["PRIVATE", "LINK_ONLY", "PUBLIC", "PASSWORD"] as const;

const VISIBILITY_META: Record<string, { icon: string; label: string }> = {
  LINK_ONLY: { icon: "🔗", label: "Nur Link" },
  PUBLIC: { icon: "🌐", label: "Öffentlich" },
  PASSWORD: { icon: "🔑", label: "Passwort" },
  PRIVATE: { icon: "🔒", label: "Privat" },
};

/** Kurzerklärung pro Stufe (Matterport-Zugriff) */
const VISIBILITY_HINTS: Record<(typeof VISIBILITY_OPTIONS)[number], string> = {
  PRIVATE:
    "Nur für berechtigte Nutzer im Matterport-Konto sichtbar — nicht öffentlich auffindbar und kein freies Teilen wie bei einem öffentlichen Link.",
  LINK_ONLY:
    "Wer den direkten Link zur Tour hat, kann sie öffnen; sie erscheint nicht in öffentlichen Listen oder der Suche.",
  PUBLIC:
    "Tour ist öffentlich zugänglich — gut für breites Teilen und Einbindung auf Websites (sofern eure Matterport-Einstellungen das erlauben).",
  PASSWORD:
    "Zusätzlicher Schutz: Zugang erst nach Eingabe des hier gesetzten Passworts (neben der gewählten Sichtbarkeitsstufe).",
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
  mpVisibility: string | null;
  onSuccess: () => void;
};

export function MatterportVisibilityPanel({ tourId, mpVisibility, onSuccess }: Props) {
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
      await toursAdminPost(`/tours/${tourId}/visibility`, {
        visibility,
        ...(visibility === "PASSWORD" ? { password: visPassword } : {}),
      });
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
        ))}
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
