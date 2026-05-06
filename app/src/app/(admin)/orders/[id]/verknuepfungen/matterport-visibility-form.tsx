"use client";

import { useState } from "react";
import { Lock, Link2, Globe, KeyRound } from "lucide-react";

type VisibilityKey = "PRIVATE" | "LINK_ONLY" | "PUBLIC" | "PASSWORD";

const OPTIONS: {
  key: VisibilityKey;
  label: string;
  hint: string;
  Icon: typeof Lock;
  isDefault?: boolean;
}[] = [
  { key: "PRIVATE", label: "Privat", hint: "Nur für berechtigte Nutzer im Matterport-Konto sichtbar — nicht öffentlich auffindbar und kein freies Teilen wie bei einem öffentlichen Link.", Icon: Lock },
  { key: "LINK_ONLY", label: "Nur Link", hint: "Jede:r mit dem Link kann die Tour öffnen, sie wird aber nicht öffentlich gelistet.", Icon: Link2, isDefault: true },
  { key: "PUBLIC", label: "Öffentlich", hint: "Öffentlich auffindbar (Matterport-Suche, Suchmaschinen).", Icon: Globe },
  { key: "PASSWORD", label: "Passwort", hint: "Nur mit Passwort zugänglich — beim Anwenden zusätzlich Passwort eintragen.", Icon: KeyRound },
];

export function MatterportVisibilityForm({
  mutateAction,
  current,
  errorHint,
}: {
  mutateAction: string;
  current: VisibilityKey | null;
  errorHint: string | null;
}) {
  const [selected, setSelected] = useState<VisibilityKey>(current ?? "LINK_ONLY");
  const activeOption = OPTIONS.find((o) => o.key === selected) ?? OPTIONS[1];

  return (
    <form action={mutateAction} method="post" className="space-y-3">
      <input type="hidden" name="_action" value="set-matterport-visibility" />
      <p className="text-sm text-[var(--ink-2)]">
        Legt fest, wer die Tour im Matterport-Viewer erreichen kann. Option wählen und auf{" "}
        <strong>Anwenden</strong> klicken — die Änderung wird an Matterport übermittelt.
      </p>
      {errorHint && (
        <p className="text-xs text-[var(--ink-3)]">
          Aktueller Status nicht abrufbar: {errorHint}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {OPTIONS.map((opt) => {
          const isActive = selected === opt.key;
          const Icon = opt.Icon;
          return (
            <label
              key={opt.key}
              className={
                "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition " +
                (isActive
                  ? "border-[var(--gold-500)] bg-[var(--gold-50,_#fff8e6)] text-[var(--ink)] ring-1 ring-[var(--gold-500)]/30"
                  : "border-[var(--border)] bg-white text-[var(--ink-2)] hover:border-[var(--ink-3)]")
              }
            >
              <input
                type="radio"
                name="visibility"
                value={opt.key}
                checked={isActive}
                onChange={() => setSelected(opt.key)}
                className="sr-only"
              />
              <Icon className="h-4 w-4 shrink-0" />
              <span className="font-medium">{opt.label}</span>
              {opt.isDefault && (
                <span className="ml-auto rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                  Standard
                </span>
              )}
            </label>
          );
        })}
      </div>
      <div className="rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2 text-sm text-[var(--ink-2)]">
        <strong>{activeOption.label}:</strong> {activeOption.hint}
      </div>
      {selected === "PASSWORD" && (
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          Passwort
          <input
            type="text"
            name="password"
            required
            placeholder="Wird an Matterport übermittelt"
            className="mt-1 w-full max-w-sm rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
          />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="bd-btn-outline-gold">
          Anwenden
        </button>
        {current && (
          <span className="text-xs text-[var(--ink-3)]">
            Aktuell:{" "}
            <strong className="text-[var(--ink-2)]">
              {OPTIONS.find((o) => o.key === current)?.label ?? current}
            </strong>
          </span>
        )}
      </div>
    </form>
  );
}
