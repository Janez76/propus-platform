import { useEffect, useState } from "react";
import { toursAdminPost } from "../../../../api/toursAdmin";

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

  return (
    <div className="border-b border-[var(--border-soft)] pb-4 space-y-2">
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
