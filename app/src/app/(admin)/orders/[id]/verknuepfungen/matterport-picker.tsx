"use client";

import { useState } from "react";
import { linkMatterportTour } from "./actions";
import type { VerknuepfungenMatterportCandidate } from "@/lib/repos/orders/verknuepfungenTypes";

function formatCreated(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function candidateLabel(c: VerknuepfungenMatterportCandidate): string {
  const name = (c.name ?? "").trim() || "(ohne Namen)";
  const date = formatCreated(c.created);
  const tag = c.alreadyInTourManager ? "" : " · neu";
  return `${name} · ${date} · ${c.spaceId}${tag}`;
}

export function MatterportPicker({
  orderNo,
  candidates,
  candidatesError,
}: {
  orderNo: number;
  candidates: VerknuepfungenMatterportCandidate[];
  candidatesError: string | null;
}) {
  const [value, setValue] = useState("");

  return (
    <form
      action={linkMatterportTour}
      className="flex max-w-2xl flex-col gap-3"
    >
      <input type="hidden" name="order_no" value={String(orderNo)} />

      {candidates.length > 0 && (
        <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          Letzte unverknüpfte Touren aus Matterport
          <select
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">— Tour wählen oder unten manuell eingeben —</option>
            {candidates.map((c) => (
              <option key={c.spaceId} value={c.spaceId}>
                {candidateLabel(c)}
              </option>
            ))}
          </select>
        </label>
      )}

      {candidatesError && candidates.length === 0 && (
        <p className="text-xs text-[var(--ink-3)]">
          Matterport-API nicht erreichbar ({candidatesError}) — bitte manuell eingeben.
        </p>
      )}
      {!candidatesError && candidates.length === 0 && (
        <p className="text-xs text-[var(--ink-3)]">
          Keine unverknüpften Touren in Matterport gefunden — manuell eingeben.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          Matterport (Space-ID oder URL mit ?m=…)
          <input
            name="space_id_or_url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
            placeholder="z. B. abc12XYZ oder https://my.matterport.com/show/?m=…"
          />
        </label>
        <button type="submit" className="bd-btn-outline-gold shrink-0">
          Verknüpfen
        </button>
      </div>
    </form>
  );
}
